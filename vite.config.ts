import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { qwenProxyPlugin } from "./dev/qwen-proxy-plugin";

export default defineConfig(({ mode }) => {
  // Load .env, .env.local, .env.{mode}, .env.{mode}.local — including non-VITE_ vars.
  // The empty prefix ('') means "all keys", so QWEN_API_KEY is included.
  const env = loadEnv(mode, process.cwd(), "");
  // Surface them on process.env for our server-side proxy plugin (which runs in the
  // Vite dev-server's Node.js context and therefore reads process.env).
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }

  return {
    plugins: [react(), tailwindcss(), qwenProxyPlugin()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 5273,
    },
  };
});
