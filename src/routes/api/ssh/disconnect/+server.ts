import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { disconnect } from "$lib/server/ssh";

export const POST: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  disconnect(locals.user.username);
  return json({ success: true });
};
