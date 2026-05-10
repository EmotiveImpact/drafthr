import type { Plugin } from "vite";
import { handleAgentRequest, handleDraftRequest } from "../server/proxy";

/**
 * Vite dev-server plugin that mounts /api/draft (custom SSE for the
 * section generator) and /api/agent (AI SDK data-stream protocol for
 * the useChat-based right-rail agent).
 *
 * Production mounts the same handlers on Vercel serverless functions.
 */
export const qwenProxyPlugin = (): Plugin => ({
  name: "qwen-proxy",
  configureServer(server) {
    server.middlewares.use("/api/draft", async (req, res) => {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end("Method Not Allowed");
        return;
      }
      try {
        const body = await readBody(req);
        const json = JSON.parse(body);
        await handleDraftRequest(json, res);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown error";
        // eslint-disable-next-line no-console
        console.error("[qwen-proxy]", err);
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: msg }));
      }
    });

    server.middlewares.use("/api/agent", async (req, res) => {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end("Method Not Allowed");
        return;
      }
      try {
        const body = await readBody(req);
        const json = JSON.parse(body);
        await handleAgentRequest(json, res);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown error";
        // eslint-disable-next-line no-console
        console.error("[agent-proxy]", err);
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: msg }));
      }
    });
  },
});

function readBody(req: { on: (event: string, cb: (chunk: Buffer) => void) => void }): Promise<string> {
  return new Promise((resolve, reject) => {
    let s = "";
    req.on("data", (chunk: Buffer) => {
      s += chunk.toString("utf8");
    });
    req.on("end", () => resolve(s));
    req.on("error", reject);
  });
}
