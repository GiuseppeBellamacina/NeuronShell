import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";
import { isLoginSkipped } from "$lib/server/auth";

export const load: PageServerLoad = async ({ locals }) => {
  if (isLoginSkipped() || locals.user) {
    throw redirect(302, "/");
  }
  return {};
};
