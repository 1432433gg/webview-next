import { createRenderServer } from "./server.js";
import { Renderer } from "../render/renderer.js";

function envNumber(name: string, fallback: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0 || value > max) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}

const port = envNumber("PORT", 8050, 65535);
const timeout = envNumber("RENDER_TIMEOUT_MS", 15000, 120000);
const renderer = new Renderer(timeout, envNumber("RENDER_MAX_CONCURRENT", 4, 32));
const server = createRenderServer(renderer, timeout);
server.listen(port, "0.0.0.0");
function shutdown() {
  server.close();
  void renderer.close();
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
