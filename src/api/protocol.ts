import { validateHeaderName, validateHeaderValue, type IncomingMessage } from "node:http";

export class RenderError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

export interface RenderRequest {
  url: URL;
  headers: Record<string, string>;
  method: "GET" | "POST";
  body?: string;
  script?: string;
  wait: number;
}

const bodyLimit = 1024 * 1024;
const excludedHeaders = new Set([
  "accept-encoding", "connection", "content-length", "expect", "host", "keep-alive",
  "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade",
]);

export function httpUrl(value: unknown, base?: URL): URL {
  if (typeof value !== "string" || !value.trim()) {
    throw new RenderError(400, "invalid_url");
  }
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    throw new RenderError(400, "invalid_url");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new RenderError(400, "invalid_url");
  }
  return url;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export async function readRenderRequest(req: IncomingMessage, timeout: number): Promise<RenderRequest> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > bodyLimit) {
      req.resume();
      throw new RenderError(413, "request_too_large");
    }
    chunks.push(chunk);
  }
  let data: unknown;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RenderError(400, "invalid_json");
  }
  if (!isRecord(data)) {
    throw new RenderError(400, "invalid_request");
  }
  const url = httpUrl(data.url);
  const method = data.http_method ?? "GET";
  const body = data.body ?? undefined;
  const script = data.js_source ?? undefined;
  const wait = data.wait_ms ?? 0;
  if ((method !== "GET" && method !== "POST") ||
      (body !== undefined && (method !== "POST" || typeof body !== "string")) ||
      (script !== undefined && typeof script !== "string") ||
      typeof wait !== "number" || !Number.isSafeInteger(wait) || wait < 0 || wait >= timeout) {
    throw new RenderError(400, "invalid_request");
  }
  const headers: Record<string, string> = Object.create(null);
  if (data.headers != null) {
    if (!isRecord(data.headers)) {
      throw new RenderError(400, "invalid_headers");
    }
    for (const [name, value] of Object.entries(data.headers)) {
      if (typeof value !== "string") {
        throw new RenderError(400, "invalid_headers");
      }
      try {
        validateHeaderName(name);
        validateHeaderValue(name, value);
      } catch {
        throw new RenderError(400, "invalid_headers");
      }
      const key = name.toLowerCase();
      if (!excludedHeaders.has(key)) {
        headers[key] = value;
      }
    }
  }
  return { url, headers, method, body, script, wait };
}
