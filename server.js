import { handler } from "./build/handler.js";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { parse } from "cookie";

const server = createServer(handler);

// Dynamically import the server-side modules after build
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", async (req, socket, head) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname !== "/ws/terminal" && pathname !== "/ws/monitor") {
    socket.destroy();
    return;
  }

  // Forward to SvelteKit's built WebSocket handler
  // We dynamically import from the build output
  try {
    const wsModule = await import("./build/server/lib/server/ws.js").catch(
      () => null,
    );
    if (wsModule?.handleUpgrade) {
      wsModule.handleUpgrade(req, socket, head);
    } else {
      // Fallback: use inline handler
      socket.destroy();
    }
  } catch {
    socket.destroy();
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`NeuronShell running on port ${port}`);
});
