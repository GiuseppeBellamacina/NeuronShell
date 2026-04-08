import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { connect } from "$lib/server/ssh";

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const { host, port, username, password, privateKey } = await request.json();

  if (!host || !username) {
    return json({ error: "Host and username are required" }, { status: 400 });
  }

  if (!password && !privateKey) {
    return json({ error: "Password or private key required" }, { status: 400 });
  }

  try {
    await connect(locals.user.username, {
      host,
      port: port || 22,
      username,
      password,
      privateKey,
    });
    return json({ success: true });
  } catch (err) {
    return json({ error: (err as Error).message }, { status: 500 });
  }
};
