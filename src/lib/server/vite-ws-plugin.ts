import { WebSocketServer, WebSocket } from "ws";
import { loadEnv } from "vite";
import jwt from "jsonwebtoken";
import { parse } from "cookie";
import type { ViteDevServer } from "vite";
import { buildMonitorCommand, parseFullOutput } from "./monitor-parser";

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

    const cmd = buildMonitorCommand();

    session.client.exec(cmd, (err: Error | undefined, stream: any) => {
      if (err) return;
      let output = "";
      stream.on("data", (d: Buffer) => {
        output += d.toString();
      });
      stream.on("close", () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "monitor",
              data: parseFullOutput(output),
            }),
          );
        }
      });
    });
  }, 5000);

  ws.on("close", () => clearInterval(poll));
}
