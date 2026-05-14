import type { Plugin } from "vite";
import { handleAgentRequest, handleDraftRequest } from "../server/proxy";

/**
 * Vite dev-server plugin that mounts /api/draft (custom SSE for the
 * section generator) and /api/agent (AI SDK data-stream protocol for
 * the useChat-based right-rail agent).
 *
 * Production mounts the same handlers on Vercel serverless functions.
 */
const MAX_DEV_PROXY_BODY_BYTES = 4_000_000;

export const qwenProxyPlugin = (): Plugin => ({
  name: "qwen-proxy",
  configureServer(server) {
    server.middlewares.use("/api/draft", async (req, res) => {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end("Method Not Allowed");
        return;
      }
      if (!isJsonRequest(req)) {
        res.statusCode = 415;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Content-Type must be application/json" }));
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
        res.statusCode = err instanceof PayloadTooLargeError ? 413 : 500;
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
      if (!isJsonRequest(req)) {
        res.statusCode = 415;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Content-Type must be application/json" }));
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
        res.statusCode = err instanceof PayloadTooLargeError ? 413 : 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: msg }));
      }
    });
  },
});

class PayloadTooLargeError extends Error {
  constructor() {
    super("Request body too large");
  }
}

type BodyRequest = {
  headers?: Record<string, string | string[] | undefined>;
  destroy?: (error?: Error) => void;
  on: {
    (event: "data", cb: (chunk: Buffer) => void): void;
    (event: "end", cb: () => void): void;
    (event: "error", cb: (err: Error) => void): void;
  };
};

function isJsonRequest(req: BodyRequest): boolean {
  const value = req.headers?.["content-type"];
  const contentType = Array.isArray(value) ? value.join(",") : value ?? "";
  return contentType.toLowerCase().includes("application/json");
}

function readBody(req: BodyRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let bytes = 0;
    const chunks: Buffer[] = [];
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
      req.destroy?.(err);
    };
    req.on("data", (chunk: Buffer) => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > MAX_DEV_PROXY_BODY_BYTES) {
        fail(new PayloadTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}
