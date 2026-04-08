import type { Handle } from "@sveltejs/kit";
import { verifyToken } from "$lib/server/auth";

export const handle: Handle = async ({ event, resolve }) => {
  // Auth middleware
  const token = event.cookies.get("neuronshell_token");

  if (token) {
    const user = verifyToken(token);
    if (user) {
      event.locals.user = user;
    }
  }

  // Protect app routes (but not login, api/auth, or static)
  const path = event.url.pathname;
  const isProtected =
    !path.startsWith("/login") &&
    !path.startsWith("/api/auth") &&
    !path.startsWith("/_app") &&
    !path.startsWith("/favicon");

  if (isProtected && !event.locals.user) {
    if (path.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(null, {
      status: 302,
      headers: { Location: "/login" },
    });
  }

  return resolve(event);
};
