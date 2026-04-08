import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import { verifyToken } from "./auth";
import { openShell, resizeShell, isConnected, getSession } from "./ssh";
import { parse } from "cookie";

const wss = new WebSocketServer({ noServer: true });

interface WsClient {
  ws: WebSocket;
  userId: string;
  type: "terminal" | "monitor";
}

const clients = new Set<WsClient>();

export function handleUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
) {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname !== "/ws/terminal" && pathname !== "/ws/monitor") {
    socket.destroy();
    return;
  }

  // Auth from cookie
  const cookies = parse(req.headers.cookie || "");
  const token = cookies["neuronshell_token"];
  if (!token) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  const user = verifyToken(token);
  if (!user) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    const type = pathname === "/ws/terminal" ? "terminal" : "monitor";
    handleConnection(ws, user.username, type);
  });
}

async function handleConnection(
  ws: WebSocket,
  userId: string,
  type: "terminal" | "monitor",
) {
  const client: WsClient = { ws, userId, type };
  clients.add(client);

  if (type === "terminal") {
    await handleTerminal(ws, userId);
  } else {
    handleMonitor(ws, userId);
  }

  ws.on("close", () => {
    clients.delete(client);
  });
}

async function handleTerminal(ws: WebSocket, userId: string) {
  if (!isConnected(userId)) {
    ws.send(JSON.stringify({ type: "error", message: "SSH not connected" }));
    ws.close();
    return;
  }

  try {
    const stream = await openShell(userId);

    // SSH → Browser
    stream.on("data", (data: Buffer) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    stream.on("close", () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "shell-closed" }));
        ws.close();
      }
    });

    // Browser → SSH
    ws.on("message", (msg: Buffer | string) => {
      const data = typeof msg === "string" ? msg : msg.toString();

      // Handle resize messages
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === "resize" && parsed.cols && parsed.rows) {
          resizeShell(userId, parsed.cols, parsed.rows);
          return;
        }
      } catch {
        // Not JSON, treat as terminal input
      }

      stream.write(data);
    });

    ws.on("close", () => {
      stream.close();
    });
  } catch (err) {
    ws.send(JSON.stringify({ type: "error", message: (err as Error).message }));
    ws.close();
  }
}

function handleMonitor(ws: WebSocket, userId: string) {
  if (!isConnected(userId)) {
    ws.send(JSON.stringify({ type: "error", message: "SSH not connected" }));
    ws.close();
    return;
  }

  const interval = setInterval(async () => {
    if (ws.readyState !== WebSocket.OPEN || !isConnected(userId)) {
      clearInterval(interval);
      return;
    }

    try {
      const session = getSession(userId);
      if (!session) return;

      // Get GPU info
      const gpuCmd = `nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw --format=csv,noheader,nounits 2>/dev/null || echo "NO_GPU"`;
      const jobCmd = `squeue --me --noheader --format="%i|%j|%T|%M|%D|%R|%b" 2>/dev/null || echo "NO_SLURM"`;
      const watcherCmd = `[ -f ~/GRPO-strict-generation/.chain_pid ] && pid=$(cat ~/GRPO-strict-generation/.chain_pid) && ps -p $pid > /dev/null 2>&1 && echo "ACTIVE:$pid" || echo "INACTIVE"`;
      const chainCmd = `[ -f ~/GRPO-strict-generation/.job_chain ] && wc -l < ~/GRPO-strict-generation/.job_chain || echo "0"`;

      const combinedCmd = `echo "===GPU==="; ${gpuCmd}; echo "===JOBS==="; ${jobCmd}; echo "===WATCHER==="; ${watcherCmd}; echo "===CHAIN==="; ${chainCmd}; echo "===END==="`;

      session.client.exec(combinedCmd, (err, stream) => {
        if (err) return;
        let output = "";
        stream.on("data", (data: Buffer) => {
          output += data.toString();
        });
        stream.on("close", () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "monitor",
                data: parseMonitorOutput(output),
              }),
            );
          }
        });
      });
    } catch {
      // ignore monitoring errors
    }
  }, 5000);

  ws.on("close", () => {
    clearInterval(interval);
  });
}

function parseMonitorOutput(raw: string) {
  const sections: Record<string, string> = {};
  const parts = raw.split(/===(\w+)===/);
  for (let i = 1; i < parts.length - 1; i += 2) {
    sections[parts[i]] = parts[i + 1].trim();
  }

  // Parse GPU
  const gpus =
    sections.GPU && sections.GPU !== "NO_GPU"
      ? sections.GPU.split("\n")
          .filter(Boolean)
          .map((line) => {
            const [index, name, utilization, memUsed, memTotal, temp, power] =
              line.split(",").map((s) => s.trim());
            return {
              index: +index,
              name,
              utilization: +utilization,
              memUsed: +memUsed,
              memTotal: +memTotal,
              temp: +temp,
              power: +power,
            };
          })
      : [];

  // Parse Jobs
  const jobs =
    sections.JOBS && sections.JOBS !== "NO_SLURM"
      ? sections.JOBS.split("\n")
          .filter(Boolean)
          .map((line) => {
            const [id, name, state, time, nodes, reason, gpu] = line.split("|");
            return {
              id: id?.trim(),
              name: name?.trim(),
              state: state?.trim(),
              time: time?.trim(),
              nodes: nodes?.trim(),
              reason: reason?.trim(),
              gpu: gpu?.trim(),
            };
          })
      : [];

  // Watcher status
  const watcherRaw = sections.WATCHER || "INACTIVE";
  const watcherActive = watcherRaw.startsWith("ACTIVE");
  const watcherPid = watcherActive ? watcherRaw.split(":")[1] : null;

  // Chain count
  const chainCount = parseInt(sections.CHAIN || "0", 10);

  return {
    gpus,
    jobs,
    watcher: { active: watcherActive, pid: watcherPid },
    chainJobs: chainCount,
    timestamp: Date.now(),
  };
}
