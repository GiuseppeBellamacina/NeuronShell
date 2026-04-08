import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { env } from "$env/dynamic/private";

const JWT_SECRET = () => env.JWT_SECRET || "dev-secret-change-me";
const SESSION_HOURS = () => parseInt(env.SESSION_HOURS || "24", 10);

export interface AppUser {
  username: string;
  passwordHash: string;
}

function getUsers(): AppUser[] {
  const raw = env.APP_USERS || "";
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => {
      const colonIdx = entry.indexOf(":");
      if (colonIdx === -1) return null;
      return {
        username: entry.slice(0, colonIdx).trim(),
        passwordHash: entry.slice(colonIdx + 1).trim(),
      };
    })
    .filter(Boolean) as AppUser[];
}

export async function validateCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  const users = getUsers();
  const user = users.find((u) => u.username === username);
  if (!user) return false;
  return bcrypt.compare(password, user.passwordHash);
}

export function createToken(username: string): string {
  return jwt.sign({ username }, JWT_SECRET(), {
    expiresIn: `${SESSION_HOURS()}h`,
  });
}

export function verifyToken(token: string): { username: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET()) as { username: string };
    return { username: payload.username };
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}
