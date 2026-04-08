import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";
import { isConnected, getConnectionInfo } from "$lib/server/ssh";

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(302, "/login");
  }

  const connected = isConnected(locals.user.username);
  const info = connected ? getConnectionInfo(locals.user.username) : null;

  return {
    username: locals.user.username,
    ssh: { connected, info },
  };
};
