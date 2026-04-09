import { WebSocketServer, WebSocket } from "ws";
import { loadEnv } from "vite";
import jwt from "jsonwebtoken";
import { parse } from "cookie";
import type { ViteDevServer } from "vite";
import {
  buildMonitorCommand,
  buildGpuCommand,
  parseMonitorAll,
  parseGpuOutput,
  stripAnsi,
  type GpuInfo,
  type MonitorData,
} from "./monitor-parser";

let jwtSecret = "dev-secret-change-me";

function verifyTokenDev(token: string) {
  try {
    return jwt.verify(token, jwtSecret) as { username: string };
  } catch (e) {
    console.log("[WS] Token verification failed:", (e as Error).message);
    return null;
  }
}

function getSessions(): Map<string, any> {
  if (!globalThis.__sshSessions) globalThis.__sshSessions = new Map();
  return globalThis.__sshSessions;
}

function getSkipLogin(): boolean {
  const env = loadEnv("development", process.cwd(), "");
  return env.SKIP_LOGIN === "true";
}

function getSkipLoginUserDev(): string {
  const env = loadEnv("development", process.cwd(), "");
  return env.SSH_USER || "admin";
}

export function webSocketDevPlugin() {
  return {
    name: "websocket-dev",
    configureServer(server: ViteDevServer) {
      // Load .env vars with no prefix filter so JWT_SECRET is available
      const env = loadEnv(server.config.mode, server.config.root, "");
      jwtSecret = env.JWT_SECRET || "dev-secret-change-me";
      console.log(
        "[WS] JWT secret loaded from .env:",
        jwtSecret ? "yes" : "fallback",
      );

      const wss = new WebSocketServer({ noServer: true });

      function attachUpgradeHandler() {
        const httpServer = server.httpServer;
        if (!httpServer) {
          console.log("[WS] httpServer not available yet, retrying...");
          setTimeout(attachUpgradeHandler, 100);
          return;
        }

        console.log("[WS] Attaching WebSocket upgrade handler to httpServer");

        httpServer.on("upgrade", (req, socket, head) => {
          const url = new URL(req.url || "/", `http://${req.headers.host}`);
          const pathname = url.pathname;

          // Only handle our custom WS paths
          if (pathname !== "/ws/terminal" && pathname !== "/ws/monitor") return;

          console.log(
            `[WS] Upgrade request: ${pathname}, cookies present: ${!!req.headers.cookie}`,
          );

          // Auth: skip or verify token
          let username: string;
          if (getSkipLogin()) {
            username = getSkipLoginUserDev();
          } else {
            const cookies = parse(req.headers.cookie || "");
            const token = cookies["neuronshell_token"];
            if (!token) {
              console.log(
                "[WS] No neuronshell_token cookie found. Available cookies:",
                Object.keys(cookies).join(", ") || "none",
              );
              socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
              socket.destroy();
              return;
            }

            const user = verifyTokenDev(token);
            if (!user) {
              console.log("[WS] Token invalid");
              socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
              socket.destroy();
              return;
            }
            username = user.username;
          }

          console.log(
            `[WS] Authenticated user: ${username}, upgrading to ${pathname}`,
          );

          wss.handleUpgrade(req, socket, head, (ws) => {
            if (pathname === "/ws/terminal") handleTerminalDev(ws, username);
            else handleMonitorDev(ws, username);
          });
        });
      }

      // Attach immediately or wait for httpServer
      attachUpgradeHandler();
    },
  };
}

function handleTerminalDev(ws: WebSocket, userId: string) {
  const sessions = getSessions();
  console.log(
    `[WS] Terminal: user=${userId}, pool keys=[${[...sessions.keys()]}], size=${sessions.size}`,
  );

  const session = sessions.get(userId);
  if (!session) {
    console.log(
      "[WS] Terminal: No SSH session found! User needs to connect via SSH modal first.",
    );
    ws.send(
      JSON.stringify({
        type: "error",
        message: "SSH not connected. Connect first via the SSH modal.",
      }),
    );
    ws.close();
    return;
  }

  console.log("[WS] Terminal: SSH session found, opening shell...");

  session.client.shell(
    { term: "xterm-256color", cols: 120, rows: 30 },
    (err: Error | undefined, stream: any) => {
      if (err) {
        ws.send(JSON.stringify({ type: "error", message: err.message }));
        ws.close();
        return;
      }

      stream.on("data", (data: Buffer) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      });
      stream.stderr?.on("data", (data: Buffer) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      });
      stream.on("close", () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "shell-closed" }));
          ws.close();
        }
      });

      ws.on("message", (msg: Buffer | string) => {
        const data = typeof msg === "string" ? msg : msg.toString();
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "resize") {
            stream.setWindow(parsed.rows, parsed.cols, 0, 0);
            return;
          }
        } catch {}
        stream.write(data);
      });

      ws.on("close", () => stream.close());
    },
  );
}

// Track active monitor connections per user (only one allowed at a time)
const activeMonitors = new Map<string, WebSocket>();

function handleMonitorDev(ws: WebSocket, userId: string) {
  // Close any existing monitor connection for this user
  const existing = activeMonitors.get(userId);
  if (existing && existing.readyState === WebSocket.OPEN) {
    existing.close(4000, "Replaced by new monitor connection");
  }
  activeMonitors.set(userId, ws);

  let lastGpus: GpuInfo[] = [];
  let gpuInFlight = false;
  let monitorStream: any = null;
  let buffer = "";
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const session = getSessions().get(userId);
  if (!session) {
    ws.send(JSON.stringify({ type: "error", message: "SSH not connected" }));
    ws.close();
    return;
  }

  // Start persistent monitor process (runs once, streams continuously)
  const cmd = buildMonitorCommand();
  console.log(
    `[WS] Monitor: starting persistent stream: ${cmd.slice(0, 80)}...`,
  );

  session.client.exec(cmd, (err: Error | undefined, stream: any) => {
    if (err) {
      console.log("[WS] Monitor exec error:", err.message);
      ws.send(JSON.stringify({ type: "error", message: err.message }));
      return;
    }
    monitorStream = stream;

    stream.on("data", (d: Buffer) => {
      buffer += d.toString();
      // Debounce: wait for data to stop flowing, then parse the frame
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        processFrame();
      }, 800);
    });

    stream.stderr?.on("data", (d: Buffer) => {
      console.log("[WS] Monitor stderr:", d.toString().trim());
    });

    stream.on("close", () => {
      console.log("[WS] Monitor stream closed");
      monitorStream = null;
      // Process any remaining buffer
      if (buffer.trim()) processFrame();
    });
  });

  function processFrame() {
    if (!buffer.trim()) return;
    const cleaned = stripAnsi(buffer);
    buffer = "";

    // Take the last complete frame (split by cursor-home or clear-screen)
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
    } catch (e) {
      console.log("[WS] Monitor parse error:", (e as Error).message);
    }
  }

  // GPU poll every 30s (srun is slow, separate channel)
  const gpuPoll = setInterval(() => {
    const s = getSessions().get(userId);
    if (ws.readyState !== WebSocket.OPEN || !s) {
      clearInterval(gpuPoll);
      return;
    }
    if (gpuInFlight) return;

    gpuInFlight = true;
    const gpuCmd = buildGpuCommand();

    s.client.exec(gpuCmd, (err: Error | undefined, stream: any) => {
      if (err) {
        gpuInFlight = false;
        return;
      }
      let output = "";
      stream.on("data", (d: Buffer) => {
        output += d.toString();
      });
      stream.on("close", () => {
        gpuInFlight = false;
        lastGpus = parseGpuOutput(output);
      });
    });
  }, 30000);

  ws.on("close", () => {
    if (monitorStream) {
      monitorStream.signal?.("SIGTERM");
      monitorStream.close();
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    clearInterval(gpuPoll);
    if (activeMonitors.get(userId) === ws) {
      activeMonitors.delete(userId);
    }
  });
}
