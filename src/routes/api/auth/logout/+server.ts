import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ cookies }) => {
  cookies.delete("neuronshell_token", { path: "/" });
  return json({ success: true });
};
