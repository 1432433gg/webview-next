import { createServer, type ServerResponse } from "node:http";
import { readRenderRequest, RenderError } from "../api/protocol.js";
import type { Renderer } from "../render/renderer.js";

function json(res: ServerResponse, status: number, payload: object) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(payload));
}

export function createRenderServer(renderer: Renderer, timeout: number) {
  return createServer({ requestTimeout: timeout, headersTimeout: timeout }, async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      json(res, 200, { status: "ok" });
      return;
    }
    if (req.url !== "/render.html") {
      json(res, 404, { error: "not_found" });
      return;
    }
    if (req.method !== "POST") {
      res.setHeader("allow", "POST");
      json(res, 405, { error: "method_not_allowed" });
      return;
    }

    const client = new AbortController();
    res.once("close", () => client.abort());
    try {
      const input = await readRenderRequest(req, timeout);
      const page = await renderer.render(input, client.signal);
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-webview-final-url": encodeURIComponent(page.url),
        "x-webview-status": String(page.status),
      });
      res.end(page.html);
    } catch (error) {
      const failure = error instanceof RenderError ? error : new RenderError(500, "internal_error");
      if (failure.status >= 500) {
        console.error(JSON.stringify({ event: "render_failed", error: failure.code }));
      }
      if (!res.destroyed) {
        json(res, failure.status, { error: failure.code });
      }
    }
  });
}
