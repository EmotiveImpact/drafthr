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
      // Listen on all network interfaces so devices on the same Wi-Fi
      // (e.g. iPhone/iPad for mobile testing) can reach the dev server.
      host: true,
    },
    build: {
      // Raise the warning ceiling — our largest legitimate chunk is the
      // export pipeline (html-to-docx + html2pdf), which is genuinely big.
      // Anything over this is worth investigating.
      // Raise to 1300 because export-docx (html-to-docx) is genuinely
      // ~1.2 MB and is only loaded at export time — it doesn't affect
      // first-paint. We can't split it further without forking the lib.
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
            // Markdown rendering — used by the AI panel.
            markdown: ["marked", "dompurify"],
            // Export libraries — only needed at export time.
            "export-pdf": ["html2pdf.js", "html2canvas"],
            "export-docx": ["html-to-docx"],
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
