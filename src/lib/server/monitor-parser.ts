export interface JobInfo {
  id: string;
  name: string;
  state: string;
  group: string;
}

export interface ActiveJobInfo {
  name: string;
  id: string;
  step: number;
  totalSteps: number;
  percent: number;
  elapsed: string;
  eta: string;
}

export interface ResultInfo {
  model: string;
  reward: number | null;
  baseline: number | null;
  stage1: number | null;
}

export interface RewardBreakdown {
  [key: string]: number;
}

export interface LastCompletion {
  difficulty: string;
  prompt: string;
  completion: string;
  rewards: RewardBreakdown;
  total: number;
  schema: Record<string, string>;
}

export interface MonitorData {
  jobs: JobInfo[];
  watcher: { active: boolean; pid: string | null };
  pipeline: { done: number; total: number };
  activeJob: ActiveJobInfo | null;
  results: ResultInfo[];
  lastCompletion: LastCompletion | null;
  timestamp: number;
}

// Strip ANSI escape codes
function stripAnsi(s: string): string {
  return s.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
}

export function parseMonitorAll(raw: string): {
  jobs: JobInfo[];
  watcher: { active: boolean; pid: string | null };
  pipeline: { done: number; total: number };
  activeJob: ActiveJobInfo | null;
  results: ResultInfo[];
  lastCompletion: LastCompletion | null;
} {
  const clean = stripAnsi(raw);
  const lines = clean.split("\n");

  const jobs: JobInfo[] = [];
  const results: ResultInfo[] = [];
  let watcher = { active: false, pid: null as string | null };
  let pipeline = { done: 0, total: 0 };
  let activeJob: ActiveJobInfo | null = null;
  let lastCompletion: LastCompletion | null = null;
  let currentGroup = "";
  let inResultsTable = false;

  // Find and parse "Last completion" block separately
  const completionIdx = lines.findIndex((l) => l.match(/Last completion\s*\[/));
  if (completionIdx >= 0) {
    lastCompletion = parseLastCompletion(lines, completionIdx);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Stop parsing job/result lines once we hit the completion section
    if (i >= completionIdx && completionIdx >= 0) break;

    // Pipeline progress: "8/40 done"
    const pipelineMatch = line.match(/(\d+)\/(\d+)\s+done/);
    if (pipelineMatch) {
      pipeline = {
        done: parseInt(pipelineMatch[1]),
        total: parseInt(pipelineMatch[2]),
      };
      continue;
    }

    // Watcher: "Watcher: ON (PID 1544554)" or "Watcher: OFF"
    const watcherMatch = line.match(
      /Watcher:\s*(ON|OFF)(?:\s*\(PID\s*(\d+)\))?/,
    );
    if (watcherMatch) {
      watcher = {
        active: watcherMatch[1] === "ON",
        pid: watcherMatch[2] || null,
      };
      continue;
    }

    // Model group: "  ▸ smollm2-135m"
    const groupMatch = line.match(/▸\s+(.+)/);
    if (groupMatch) {
      currentGroup = groupMatch[1].trim();
      inResultsTable = false;
      continue;
    }

    // Job line: " ✓  train-smollm2-135m             [3993]       COMPLETED"
    const jobMatch = line.match(
      /[✓▶·✗]\s+(\S+)\s+(?:\[(\d+)\])?\s*(COMPLETED|RUNNING|PENDING|FAILED|CANCELLED|TIMEOUT)/,
    );
    if (jobMatch) {
      jobs.push({
        id: jobMatch[2] || "",
        name: jobMatch[1],
        state: jobMatch[3],
        group: currentGroup,
      });
      inResultsTable = false;
      continue;
    }

    // Active job: "▶ Active: train-gemma2-2b [4007] — step 1283/2500"
    const activeMatch = line.match(
      /Active:\s+(\S+)\s+\[(\d+)\]\s*[—-]\s*step\s+(\d+)\/(\d+)/,
    );
    if (activeMatch) {
      activeJob = {
        name: activeMatch[1],
        id: activeMatch[2],
        step: parseInt(activeMatch[3]),
        totalSteps: parseInt(activeMatch[4]),
        percent: 0,
        elapsed: "",
        eta: "",
      };
      // Next line has progress bar: "██████████░░░░░░░░░░ 51% ⏰ 5:22:01 ⏳ ~5:31:40"
      if (i + 1 < lines.length) {
        const progressLine = lines[i + 1];
        const percentMatch = progressLine.match(/(\d+)%/);
        const elapsedMatch = progressLine.match(/⏰\s*([\d:]+)/);
        const etaMatch = progressLine.match(/⏳\s*~?([\d:]+)/);
        if (percentMatch) activeJob.percent = parseInt(percentMatch[1]);
        if (elapsedMatch) activeJob.elapsed = elapsedMatch[1];
        if (etaMatch) activeJob.eta = etaMatch[1];
      }
      inResultsTable = false;
      continue;
    }

    // Results table header detection
    if (line.match(/Model\s+Reward\s+Baseline/)) {
      inResultsTable = true;
      continue;
    }

    // Skip separator lines
    if (line.match(/^\s*[─═]+\s*$/) || line.match(/^\s*$/)) {
      continue;
    }

    // Results table row: "  smollm2-135m             0.7104     0.3933    0.8967"
    if (inResultsTable) {
      const resultMatch = line.match(
        /^\s+([\w][\w.-]+)\s+([\d.]+|-)\s+([\d.]+|-)\s+([\d.]+|-)/,
      );
      if (resultMatch) {
        results.push({
          model: resultMatch[1],
          reward: resultMatch[2] === "-" ? null : parseFloat(resultMatch[2]),
          baseline: resultMatch[3] === "-" ? null : parseFloat(resultMatch[3]),
          stage1: resultMatch[4] === "-" ? null : parseFloat(resultMatch[4]),
        });
      } else {
        // End of results table
        inResultsTable = false;
      }
    }
  }

  return { jobs, watcher, pipeline, activeJob, results, lastCompletion };
}

function parseLastCompletion(
  lines: string[],
  startIdx: number,
): LastCompletion {
  // Header: "─── Last completion [medium] ───"
  const headerMatch = lines[startIdx].match(/Last completion\s*\[(\w+)\]/);
  const difficulty = headerMatch ? headerMatch[1] : "unknown";

  let prompt = "";
  let completion = "";
  const rewards: RewardBreakdown = {};
  let total = 0;
  const schema: Record<string, string> = {};

  let section: "none" | "prompt" | "completion" | "rewards" | "schema" = "none";
  let promptLines: string[] = [];
  let completionLines: string[] = [];
  let inCodeBlock = false;

  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detect PROMPT: start
    if (trimmed.startsWith("PROMPT:")) {
      section = "prompt";
      promptLines.push(trimmed.slice("PROMPT:".length).trim());
      continue;
    }

    // Detect code block boundaries for completion
    if (trimmed.startsWith("```")) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        section = "completion";
        continue;
      } else {
        inCodeBlock = false;
        section = "none";
        continue;
      }
    }

    // Detect REWARDS: line
    if (trimmed.startsWith("REWARDS:") || trimmed.startsWith("TOTAL:")) {
      section = "rewards";
    }

    // Detect SCHEMA: section
    if (trimmed === "SCHEMA:") {
      section = "schema";
      continue;
    }

    if (section === "prompt" && !trimmed.startsWith("```")) {
      // Prompt continues until we hit a code block
      if (inCodeBlock || trimmed.startsWith("REWARDS:")) {
        section = "none";
      } else {
        promptLines.push(trimmed);
      }
    }

    if (section === "completion" && inCodeBlock) {
      completionLines.push(line);
    }

    if (section === "rewards") {
      // Parse "format=+1.00     validity=+1.00   schema=+1.00" etc.
      const rewardPairs = trimmed.match(/([\w]+)=([+-]?[\d.]+)/g);
      if (rewardPairs) {
        for (const pair of rewardPairs) {
          const [key, val] = pair.split("=");
          rewards[key] = parseFloat(val);
        }
      }
      // Parse "TOTAL:   +0.8000"
      const totalMatch = trimmed.match(/TOTAL:\s*([+-]?[\d.]+)/);
      if (totalMatch) {
        total = parseFloat(totalMatch[1]);
        section = "none";
      }
    }

    if (section === "schema") {
      // Parse "toplevel: object" / "count: 6" etc.
      const kvMatch = trimmed.match(/^([\w_]+):\s*(.+)$/);
      if (kvMatch) {
        schema[kvMatch[1]] = kvMatch[2];
      }
    }
  }

  prompt = promptLines.join(" ").trim();
  // Clean up prompt: remove special tokens
  prompt = prompt
    .replace(/<bos>/g, "")
    .replace(/<start_of_turn>\w+/g, "")
    .replace(/<end_of_turn>/g, "")
    .trim();

  completion = completionLines.join("\n").trim();

  return { difficulty, prompt, completion, rewards, total, schema };
}

export function buildMonitorCommand(): string {
  const monitorCmd = `source ~/GRPO-strict-generation/cluster/aliases.sh && monitor --all 2>/dev/null || echo "NO_MONITOR"`;
  return `echo "===MONITOR==="; ${monitorCmd}; echo "===END==="`;
}

export function parseFullOutput(raw: string): MonitorData {
  const sections: Record<string, string> = {};
  const parts = raw.split(/===(\w+)===/);
  for (let i = 1; i < parts.length - 1; i += 2) {
    sections[parts[i]] = parts[i + 1].trim();
  }

  const monitorRaw = sections.MONITOR || "";
  const { jobs, watcher, pipeline, activeJob, results, lastCompletion } =
    monitorRaw && monitorRaw !== "NO_MONITOR"
      ? parseMonitorAll(monitorRaw)
      : {
          jobs: [],
          watcher: { active: false, pid: null },
          pipeline: { done: 0, total: 0 },
          activeJob: null,
          results: [],
          lastCompletion: null,
        };

  return {
    jobs,
    watcher,
    pipeline,
    activeJob,
    results,
    lastCompletion,
    timestamp: Date.now(),
  };
}
