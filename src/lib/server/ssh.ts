import { Client, type ConnectConfig, type ClientChannel } from "ssh2";

export interface SshCredentials {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

interface SshSession {
  client: Client;
  credentials: SshCredentials;
  connectedAt: number;
  lastActivity: number;
  shellStream?: ClientChannel;
}

// Use global pool so server.js WebSocket handler and SvelteKit API routes share state
declare global {
  var __sshSessions: Map<string, SshSession> | undefined;
}

function getSessions(): Map<string, SshSession> {
  if (!globalThis.__sshSessions) {
    globalThis.__sshSessions = new Map();
  }
  return globalThis.__sshSessions;
}

const IDLE_TIMEOUT = 30 * 60 * 1000;

// Periodic cleanup of idle sessions
setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of getSessions()) {
    if (now - session.lastActivity > IDLE_TIMEOUT) {
      disconnect(userId);
    }
  }
}, 60_000);

export function connect(userId: string, creds: SshCredentials): Promise<void> {
  return new Promise((resolve, reject) => {
    // Close existing session if any
    if (getSessions().has(userId)) {
      disconnect(userId);
    }

    const client = new Client();
    const config: ConnectConfig = {
      host: creds.host,
      port: creds.port || 22,
      username: creds.username,
      readyTimeout: 15_000,
      keepaliveInterval: 10_000,
      keepaliveCountMax: 3,
    };

    if (creds.privateKey) {
      config.privateKey = creds.privateKey;
    } else if (creds.password) {
      config.password = creds.password;
    }

    client.on("ready", () => {
      getSessions().set(userId, {
        client,
        credentials: creds,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });
      console.log(
        `[SSH] Connected: user=${userId}, host=${creds.host}, pool size=${getSessions().size}, globalThis id=${(globalThis as any).__poolId || "unset"}`,
      );
      if (!(globalThis as any).__poolId)
        (globalThis as any).__poolId = Math.random().toString(36).slice(2, 8);
      resolve();
    });

    client.on("error", (err) => {
      reject(err);
    });

    client.connect(config);
  });
}

export function disconnect(userId: string): void {
  const session = getSessions().get(userId);
  if (session) {
    try {
      if (session.shellStream) {
        session.shellStream.close();
      }
      session.client.end();
    } catch {
      // ignore cleanup errors
    }
    getSessions().delete(userId);
  }
}

export function isConnected(userId: string): boolean {
  return getSessions().has(userId);
}

export function getSession(userId: string): SshSession | undefined {
  const session = getSessions().get(userId);
  if (session) {
    session.lastActivity = Date.now();
  }
  return session;
}

export function exec(
  userId: string,
  command: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const session = getSession(userId);
    if (!session) {
      reject(new Error("Not connected"));
      return;
    }

    session.client.exec(command, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }

      let stdout = "";
      let stderr = "";

      stream.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      stream.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      stream.on("close", (code: number) => {
        resolve({ stdout, stderr, code: code || 0 });
      });
    });
  });
}

export function openShell(userId: string): Promise<ClientChannel> {
  return new Promise((resolve, reject) => {
    const session = getSession(userId);
    if (!session) {
      reject(new Error("Not connected"));
      return;
    }

    session.client.shell(
      { term: "xterm-256color", cols: 120, rows: 30 },
      (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        session.shellStream = stream;
        resolve(stream);
      },
    );
  });
}

export function resizeShell(userId: string, cols: number, rows: number): void {
  const session = getSession(userId);
  if (session?.shellStream) {
    session.shellStream.setWindow(rows, cols, 0, 0);
  }
}

export function getConnectionInfo(userId: string) {
  const session = getSessions().get(userId);
  if (!session) return null;
  return {
    host: session.credentials.host,
    username: session.credentials.username,
    connectedAt: session.connectedAt,
    lastActivity: session.lastActivity,
  };
}
