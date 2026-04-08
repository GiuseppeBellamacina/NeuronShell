import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { parse } from "cookie";
import type { ViteDevServer } from "vite";

function verifyTokenDev(token: string) {
  try {
    const secret = process.env.JWT_SECRET || "dev-secret-change-me";
    return jwt.verify(token, secret) as { username: string };
  } catch (e) {
    console.log("[WS] Token verification failed:", (e as Error).message);
    return null;
  }
}

function getSessions(): Map<string, any> {
  if (!globalThis.__sshSessions) globalThis.__sshSessions = new Map();
  return globalThis.__sshSessions;
}

export function webSocketDevPlugin() {
  return {
    name: "websocket-dev",
    configureServer(server: ViteDevServer) {
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

          console.log(
            `[WS] Authenticated user: ${user.username}, upgrading to ${pathname}`,
          );

          wss.handleUpgrade(req, socket, head, (ws) => {
            if (pathname === "/ws/terminal")
              handleTerminalDev(ws, user.username);
            else handleMonitorDev(ws, user.username);
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

function handleMonitorDev(ws: WebSocket, userId: string) {
  const poll = setInterval(() => {
    const session = getSessions().get(userId);
    if (ws.readyState !== WebSocket.OPEN || !session) {
      clearInterval(poll);
      return;
    }
    session.lastActivity = Date.now();

    const gpuCmd = `nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw --format=csv,noheader,nounits 2>/dev/null || echo "NO_GPU"`;
    const jobCmd = `squeue --me --noheader --format="%i|%j|%T|%M|%D|%R|%b" 2>/dev/null || echo "NO_SLURM"`;
    const watcherCmd = `[ -f ~/GRPO-strict-generation/.chain_pid ] && pid=$(cat ~/GRPO-strict-generation/.chain_pid) && ps -p $pid > /dev/null 2>&1 && echo "ACTIVE:$pid" || echo "INACTIVE"`;
    const chainCmd = `[ -f ~/GRPO-strict-generation/.job_chain ] && wc -l < ~/GRPO-strict-generation/.job_chain || echo "0"`;
    const cmd = `echo "===GPU==="; ${gpuCmd}; echo "===JOBS==="; ${jobCmd}; echo "===WATCHER==="; ${watcherCmd}; echo "===CHAIN==="; ${chainCmd}; echo "===END==="`;

    session.client.exec(cmd, (err: Error | undefined, stream: any) => {
      if (err) return;
      let output = "";
      stream.on("data", (d: Buffer) => {
        output += d.toString();
      });
      stream.on("close", () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({ type: "monitor", data: parseOutput(output) }),
          );
        }
      });
    });
  }, 5000);

  ws.on("close", () => clearInterval(poll));
}

function parseOutput(raw: string) {
  const sections: Record<string, string> = {};
  const parts = raw.split(/===(\w+)===/);
  for (let i = 1; i < parts.length - 1; i += 2) {
    sections[parts[i]] = parts[i + 1].trim();
  }

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

  const watcherRaw = sections.WATCHER || "INACTIVE";
  return {
    gpus,
    jobs,
    watcher: {
      active: watcherRaw.startsWith("ACTIVE"),
      pid: watcherRaw.startsWith("ACTIVE") ? watcherRaw.split(":")[1] : null,
    },
    chainJobs: parseInt(sections.CHAIN || "0", 10),
    timestamp: Date.now(),
  };
}
