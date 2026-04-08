import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { exec } from "$lib/server/ssh";

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const { command } = await request.json();
  if (!command || typeof command !== "string") {
    return json({ error: "Command is required" }, { status: 400 });
  }

  // Basic command sanitization — block very dangerous patterns
  const forbidden = [/;\s*rm\s+-rf\s+\/(?!\S)/, /mkfs/, /dd\s+if=.*of=\/dev/];
  if (forbidden.some((re) => re.test(command))) {
    return json({ error: "Command blocked for safety" }, { status: 403 });
  }

  try {
    const result = await exec(locals.user.username, command);
    return json(result);
  } catch (err) {
    return json({ error: (err as Error).message }, { status: 500 });
  }
};
