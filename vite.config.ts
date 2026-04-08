import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { webSocketDevPlugin } from "./src/lib/server/vite-ws-plugin";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit(), webSocketDevPlugin()],
  server: {
    allowedHosts: true,
  },
});
