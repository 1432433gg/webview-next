import { setTimeout as wait } from "node:timers/promises";
import {
  chromium, errors, type APIResponse, type Browser, type BrowserContext,
} from "playwright";
import { httpUrl, RenderError, type RenderRequest } from "../api/protocol.js";

interface RenderedPage {
  html: string;
  url: string;
  status: number;
}

const redirects = new Set([301, 302, 303, 307, 308]);

async function navigateResponse(context: BrowserContext, input: RenderRequest, signal: AbortSignal) {
  let url = input.url;
  let method = input.method;
  let body = input.body;
  const originHeaders = { ...input.headers };
  delete originHeaders.cookie;

  for (let hop = 0; hop <= 10; hop++) {
    signal.throwIfAborted();
    const headers = url.origin === input.url.origin ? { ...originHeaders } : {};
    const response = await context.request.fetch(url.href, {
      method, headers, data: body, maxRedirects: 0,
    });
    const status = response.status();
    const location = response.headers().location;
    if (!redirects.has(status) || !location) {
      return { response, url };
    }
    await response.dispose();
    if (method === "POST" && [301, 302, 303].includes(status)) {
      delete originHeaders["content-type"];
      method = "GET";
      body = undefined;
    }
    try {
      url = httpUrl(location, url);
    } catch {
      throw new RenderError(502, "invalid_site_redirect");
    }
  }
  throw new RenderError(502, "too_many_site_redirects");
}

export class Renderer {
  private browser?: Promise<Browser>;
  private active = 0;

  constructor(
    private readonly timeout: number,
    private readonly capacity: number,
    private readonly launch: () => Promise<Browser> = () => chromium.launch({
      chromiumSandbox: true,
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
      timeout,
    }),
  ) {}

  private getBrowser(): Promise<Browser> {
    this.browser ??= this.launch().then(browser => {
      browser.once("disconnected", () => { this.browser = undefined; });
      return browser;
    }).catch(() => {
      this.browser = undefined;
      throw new RenderError(503, "browser_unavailable");
    });
    return this.browser;
  }

  async close(): Promise<void> {
    await this.browser?.then(browser => browser.close(), () => undefined);
  }

  async render(input: RenderRequest, clientSignal: AbortSignal): Promise<RenderedPage> {
    if (this.active >= this.capacity) {
      throw new RenderError(503, "renderer_busy");
    }
    this.active++;
    const timeout = AbortSignal.timeout(this.timeout);
    const signal = AbortSignal.any([timeout, clientSignal]);
    let context: BrowserContext | undefined;
    let stage = "browser";
    let closing: Promise<void> | undefined;
    const closeContext = () => {
      closing ??= context?.close().catch(() => undefined);
      return closing;
    };
    signal.addEventListener("abort", closeContext, { once: true });
    try {
      const browser = await this.getBrowser();
      signal.throwIfAborted();
      context = await browser.newContext({
        acceptDownloads: false,
        serviceWorkers: "block",
        userAgent: input.headers["user-agent"],
      });
      signal.throwIfAborted();
      context.setDefaultTimeout(this.timeout);
      const cookies = (input.headers.cookie ?? "").split(";").flatMap(pair => {
        const equals = pair.indexOf("=");
        return equals > 0 ? [{
          name: pair.slice(0, equals).trim(),
          value: pair.slice(equals + 1).trim(),
          url: input.url.origin,
        }] : [];
      });
      if (cookies.length) {
        await context.addCookies(cookies);
      }

      stage = "navigation";
      const { response, url } = await navigateResponse(context, input, signal);
      const page = await context.newPage();
      const actualUrl = new URL(url);
      actualUrl.hash = "";
      const firstDocument = async (route: import("playwright").Route) => {
        try {
          await route.fulfill(await documentResponse(response));
        } catch {
          await route.abort().catch(() => undefined);
        }
      };
      await page.route(candidate => candidate.href === actualUrl.href, firstDocument, { times: 1 });
      let status = response.status();
      page.on("response", next => {
        const request = next.request();
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
          status = next.status();
        }
      });
      await page.goto(url.href, { waitUntil: "domcontentloaded" });
      stage = "script";
      if (input.script?.trim()) {
        await page.evaluate(input.script);
      }
      stage = "document";
      await wait(input.wait, undefined, { signal });
      const html = await page.content();
      signal.throwIfAborted();
      return { html, url: page.url(), status };
    } catch (error) {
      if (clientSignal.aborted) {
        throw new RenderError(499, "client_cancelled");
      }
      if (timeout.aborted || error instanceof errors.TimeoutError) {
        throw new RenderError(504, "render_timeout");
      }
      if (error instanceof RenderError) {
        throw error;
      }
      throw new RenderError(502, stage === "script" ? "script_failed" : `${stage}_failed`);
    } finally {
      signal.removeEventListener("abort", closeContext);
      await closeContext();
      this.active--;
    }
  }
}

async function documentResponse(response: APIResponse) {
  const headers = response.headers();
  for (const name of ["content-encoding", "content-length", "set-cookie", "transfer-encoding"]) {
    delete headers[name];
  }
  const body = await response.body();
  await response.dispose();
  return { status: response.status(), headers, body };
}
