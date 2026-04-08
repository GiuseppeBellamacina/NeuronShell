import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { validateCredentials, createToken } from "$lib/server/auth";

export const POST: RequestHandler = async ({ request, cookies }) => {
  const { username, password } = await request.json();

  if (!username || !password) {
    return json({ error: "Username and password required" }, { status: 400 });
  }

  const valid = await validateCredentials(username, password);
  if (!valid) {
    return json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = createToken(username);

  const isProduction = process.env.NODE_ENV === "production";
  cookies.set("neuronshell_token", token, {
    path: "/",
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    maxAge: 60 * 60 * 24, // 24h
  });

  return json({ success: true, username });
};
