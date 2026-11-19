import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { createRenderServer } from "../dist/app/server.js";
import { Renderer } from "../dist/render/renderer.js";
import { fixture } from "./fixtures/site.mjs";

const { site, hits } = fixture();
const timeout = 8000;
let browser;
let failLaunch = true;
let siteUrl;
let serviceUrl;
const renderer = new Renderer(timeout, 3, async () => {
  if (failLaunch) {
    failLaunch = false;
    throw new Error("Controlled browser start failure");
  }
  browser = await chromium.launch({
    chromiumSandbox: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
  });
  return browser;
});
const service = createRenderServer(renderer, timeout);

async function listen(server) {
  server.listen(0);
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}

before(async () => {
  [siteUrl, serviceUrl] = await Promise.all([listen(site), listen(service)]);
});
after(async () => {
  await renderer.close();
  for (const server of [site, service]) {
    server.closeAllConnections();
    server.close();
    await once(server, "close");
  }
});

function render(path = "/inspect", options = {}, signal) {
  return fetch(serviceUrl + "/render.html", {
    method: "POST",
    body: JSON.stringify({ url: siteUrl + path, ...options }),
    signal,
  });
}

test("reports browser errors and recovers on the next render", async () => {
  assert.equal((await fetch(serviceUrl + "/health")).status, 200);
  const first = await render();
  assert.equal(first.status, 503);
  assert.deepEqual(await first.json(), { error: "browser_unavailable" });
  const recovered = await render();
  assert.equal(recovered.status, 200);
  assert.match(await recovered.text(), /<main>GET\|\|\|<\/main>/);
  assert.equal(browser.contexts().length, 0);
});

test("renders POST, request headers, page JavaScript and an explicit script", async () => {
  const response = await render("/redirect-post", {
    http_method: "POST",
    body: "book=next",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Test": "header-value" },
    js_source: "document.body.dataset.script = (Number(document.body.dataset.script) || 0) + 1",
    wait_ms: 140,
  });
  assert.equal(response.status, 200);
  assert.equal(decodeURIComponent(response.headers.get("x-webview-final-url")), siteUrl + "/post");
  const html = await response.text();
  assert.match(html, /<main>POST\|book=next\|header-value\|<\/main>/);
  assert.match(html, /data-script="1"/);
  assert.match(html, /data-ready="timer-finished"/);
  assert.equal(browser.contexts().length, 0);
});

test("keeps the redirect URL and resolves relative resources there", async () => {
  const response = await render("/redirect", { wait_ms: 200 });
  assert.equal(response.status, 200);
  assert.equal(decodeURIComponent(response.headers.get("x-webview-final-url")), siteUrl + "/nested/page?redirected=yes");
  assert.equal(response.headers.get("x-webview-status"), "200");
  assert.match(await response.text(), /<p>relative content<\/p>/);
});

test("distinguishes site status from service errors", async () => {
  const missing = await render("/missing");
  assert.equal(missing.status, 200);
  assert.equal(missing.headers.get("x-webview-status"), "404");
  assert.match(await missing.text(), /<main>GET/);

  const invalid = await render("/", { url: "file:///etc/passwd" });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: "invalid_url" });

  const script = await render("/", { js_source: 'throw new Error("fixture")' });
  assert.equal(script.status, 502);
  assert.deepEqual(await script.json(), { error: "script_failed" });
});

test("isolates concurrent cookies and scopes custom headers to the initial origin", async () => {
  const values = await Promise.all(["alpha", "beta", ""].map(async value => {
    const response = await render("/inspect", { headers: { cookie: value ? "reader=" + value : "" } });
    assert.equal(response.status, 200);
    return (await response.text()).match(/<main>GET\|\|\|(.*?)<\/main>/)?.[1];
  }));
  assert.deepEqual(values, ["reader=alpha", "reader=beta", ""]);
  const cross = await render("/cross-origin", {
    headers: { cookie: "reader=alpha", "x-test": "local-only" },
  });
  assert.match(await cross.text(), /<main>GET\|\|\|<\/main>/);
  assert.equal(browser.contexts().length, 0);
});

test("times out, closes contexts after cancellation and accepts new work", async () => {
  const stalled = await render("/slow");
  assert.equal(stalled.status, 504);
  assert.deepEqual(await stalled.json(), { error: "render_timeout" });
  assert.equal(browser.contexts().length, 0);

  const client = new AbortController();
  const previousHits = hits.length;
  const running = render("/slow", {}, client.signal);
  const aborted = assert.rejects(running, { name: "AbortError" });
  try {
    for (let i = 0; i < 100 && hits.length === previousHits; i++) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.ok(hits.length > previousHits);
  } finally {
    client.abort();
  }
  await aborted;
  for (let i = 0; i < 100 && browser.contexts().length; i++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(browser.contexts().length, 0);
  assert.equal((await render()).status, 200);
});
