import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import { verifyToken, isLoginSkipped, getSkipLoginUser } from "./auth";
import { openShell, resizeShell, isConnected, getSession } from "./ssh";
import { parse } from "cookie";
import {
  buildMonitorCommand,
  buildGpuCommand,
  parseMonitorAll,
  parseGpuOutput,
  stripAnsi,
  type GpuInfo,
  type MonitorData,
} from "./monitor-parser";

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

  // Auth from cookie (or skip if SKIP_LOGIN)
  let username: string;
  if (isLoginSkipped()) {
    username = getSkipLoginUser();
  } else {
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
    username = user.username;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    const type = pathname === "/ws/terminal" ? "terminal" : "monitor";
    handleConnection(ws, username, type);
  });
}

async function handleConnection(
  ws: WebSocket,
  userId: string,
  type: "terminal" | "monitor",
) {
  // Only one monitor connection per user — close the previous one
  if (type === "monitor") {
    for (const c of clients) {
      if (
        c.userId === userId &&
        c.type === "monitor" &&
        c.ws.readyState === WebSocket.OPEN
      ) {
        c.ws.close(4000, "Replaced by new monitor connection");
      }
    }
  }

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

  let lastGpus: GpuInfo[] = [];
  let gpuInFlight = false;
  let monitorStream: any = null;
  let buffer = "";
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const session = getSession(userId);
  if (!session) return;

  // Start persistent monitor process
  const cmd = buildMonitorCommand();

  session.client.exec(cmd, (err: any, stream: any) => {
    if (err) {
      ws.send(JSON.stringify({ type: "error", message: err.message }));
      return;
    }
    monitorStream = stream;

    stream.on("data", (d: Buffer) => {
      buffer += d.toString();
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        processFrame();
      }, 800);
    });

    stream.on("close", () => {
      monitorStream = null;
      if (buffer.trim()) processFrame();
    });
  });

  function processFrame() {
    if (!buffer.trim()) return;
    const cleaned = stripAnsi(buffer);
    buffer = "";

    const frames = cleaned.split(/\x1b\[H|\x1b\[2J|\f/);
    const lastFrame = (frames[frames.length - 1] || "").trim();
    const text = lastFrame || cleaned.trim();

    if (!text) return;

    try {
      const { jobs, watcher, pipeline, activeJob, results, lastCompletion } =
        parseMonitorAll(text);
      const data: MonitorData = {
        jobs,
        watcher,
        pipeline,
        activeJob,
        results,
        lastCompletion,
        gpus: lastGpus,
        timestamp: Date.now(),
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "monitor", data }));
      }
    } catch {
      // parse error, skip frame
    }
  }

  // GPU poll every 30s (srun is slow, separate channel)
  const gpuInterval = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN || !isConnected(userId)) {
      clearInterval(gpuInterval);
      return;
    }
    if (gpuInFlight) return;

    try {
      const s = getSession(userId);
      if (!s) return;

      gpuInFlight = true;
      const gpuCmd = buildGpuCommand();

      s.client.exec(gpuCmd, (err: any, stream: any) => {
        if (err) {
          gpuInFlight = false;
          return;
        }
        let output = "";
        stream.on("data", (data: Buffer) => {
          output += data.toString();
        });
        stream.on("close", () => {
          gpuInFlight = false;
          lastGpus = parseGpuOutput(output);
        });
      });
    } catch {
      gpuInFlight = false;
    }
  }, 30000);

  ws.on("close", () => {
    if (monitorStream) {
      monitorStream.signal?.("SIGTERM");
      monitorStream.close();
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    clearInterval(gpuInterval);
  });
}
