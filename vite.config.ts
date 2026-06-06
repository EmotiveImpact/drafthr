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
      // Keep the dev server local by default. Set DRAFTHR_DEV_HOST=0.0.0.0
      // when intentionally testing from another device on the same network.
      host: process.env.DRAFTHR_DEV_HOST || "127.0.0.1",
    },
    build: {
      // Raise the warning ceiling: export and editor chunks are intentionally
      // lazy-loaded and larger than the first-paint app shell.
      // Anything over this is worth investigating.
      chunkSizeWarningLimit: 1300,
      rollupOptions: {
        output: {
          // Split heavy deps into their own chunks so the first-paint bundle
          // (index.js) stays small and the export libraries are only fetched
          // when the user actually exports. Without this, vite jams everything
          // into a single 1.4 MB chunk.
          manualChunks: {
            // Tiptap stack — only needed in the editor route. Lists the
            // packages we actually import; transitive deps (@tiptap/core,
            // @tiptap/pm) get pulled into the same chunk automatically.
            tiptap: [
              "@tiptap/react",
              "@tiptap/starter-kit",
              "@tiptap/extension-placeholder",
              "@tiptap/extension-link",
              "@tiptap/extension-underline",
              "@tiptap/extension-table",
              "@tiptap/extension-table-row",
              "@tiptap/extension-table-cell",
              "@tiptap/extension-table-header",
            ],
            // AI SDK — only needed when the user opens the AI panel.
            "ai-sdk": ["ai", "@ai-sdk/react"],
            // Split marked (editor/AI-panel only) from dompurify (on the
            // first-paint path — sanitize.ts runs on every render). Bundling
            // them dragged marked into the critical path. (Senior sweep I-PERF-3.)
            marked: ["marked"],
            dompurify: ["dompurify"],
            // Export libraries — only needed at export time.
            "export-pdf": ["html2canvas", "jspdf"],
            // Radix Themes — the heaviest UI dependency.
            "radix-themes": ["@radix-ui/themes"],
            // Icons used everywhere — give them their own chunk so a refresh
            // of any non-icon code doesn't bust the icon cache.
            icons: ["lucide-react"],
            // Forms.
            forms: ["react-hook-form", "@hookform/resolvers"],
          },
        },
      },
    },
  };
});
