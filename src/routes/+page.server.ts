import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";
import { isConnected, getConnectionInfo, connect } from "$lib/server/ssh";
import { isLoginSkipped } from "$lib/server/auth";
import { env } from "$env/dynamic/private";

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(302, "/login");
  }

  const userId = locals.user.username;

  // Auto-connect SSH if SKIP_LOGIN and SSH creds are configured
  if (
    isLoginSkipped() &&
    !isConnected(userId) &&
    env.SSH_HOST &&
    env.SSH_USER
  ) {
    try {
      await connect(userId, {
        host: env.SSH_HOST,
        port: parseInt(env.SSH_PORT || "22", 10),
        username: env.SSH_USER,
        password: env.SSH_PASSWORD,
      });
    } catch (err) {
      console.error("[SSH] Auto-connect failed:", (err as Error).message);
    }
  }

  const connected = isConnected(userId);
  const info = connected ? getConnectionInfo(userId) : null;

  return {
    username: locals.user.username,
    ssh: { connected, info },
  };
};
