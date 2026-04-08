import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import { verifyToken } from "./auth";
import { openShell, resizeShell, isConnected, getSession } from "./ssh";
import { parse } from "cookie";
import { buildMonitorCommand, parseFullOutput } from "./monitor-parser";

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

      const cmd = buildMonitorCommand();

      session.client.exec(cmd, (err: any, stream: any) => {
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
                data: parseFullOutput(output),
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
