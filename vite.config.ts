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
          // Group heavy vendor packages into stable, cacheable chunks. This is
          // the function form on purpose: the object form also pulls every
          // transitive dependency of the listed packages into the group,
          // which once put Vite's own preload helper into the PDF chunk and
          // made index.html modulepreload jspdf + html2canvas (595 KB) and the
          // editor (415 KB) on every page. With a function, only modules that
          // physically live in these packages are grouped, and a group is
          // only preloaded where something statically imports it.
          //
          // The editor (Tiptap/ProseMirror), the PDF libraries and marked are
          // reached through dynamic import() only (lazy routes and
          // src/lib/export/pdf.ts), so they stay off the first-paint path.
          manualChunks(id: string) {
            // Runtime helpers and React are needed by every page. Pin them to
            // one shared chunk; left unassigned, Rollup pulls them into the
            // first manual chunk that depends on them (jspdf's own dynamic
            // imports need the preload helper, so it landed in export-pdf).
            if (id.includes("vite/preload-helper") || id.includes("commonjsHelpers")) return "react-vendor";
            const m = /[\\/]node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/.exec(id);
            if (!m) return undefined;
            const pkg = m[1].replace(/\\/g, "/");
            if (pkg === "react" || pkg === "react-dom" || pkg === "scheduler") return "react-vendor";
            if (pkg.startsWith("@tiptap/") || pkg.startsWith("prosemirror-") || pkg === "linkifyjs" || pkg === "tippy.js" || pkg === "orderedmap" || pkg === "rope-sequence" || pkg === "w3c-keyname") {
              return "tiptap";
            }
            if (pkg === "html2canvas" || pkg === "jspdf") return "export-pdf";
            // AI SDK: only needed when the user opens the AI panel.
            if (pkg === "ai" || pkg === "@ai-sdk/react") return "ai-sdk";
            if (pkg === "marked") return "marked";
            if (pkg === "dompurify") return "dompurify";
            // Icons used everywhere: their own chunk so a refresh of any
            // non-icon code doesn't bust the icon cache.
            if (pkg === "lucide-react") return "icons";
            if (pkg === "react-hook-form" || pkg === "@hookform/resolvers") return "forms";
            return undefined;
          },
        },
      },
    },
  };
});
