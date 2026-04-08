import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { isConnected, getConnectionInfo } from "$lib/server/ssh";

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const connected = isConnected(locals.user.username);
  const info = connected ? getConnectionInfo(locals.user.username) : null;

  return json({ connected, info });
};
