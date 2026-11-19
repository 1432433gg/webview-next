import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";

const fixture = createServer((_req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end('<main></main><script>document.querySelector("main").textContent = "rendered"</script>');
});
fixture.listen(0, "127.0.0.1");
await once(fixture, "listening");

try {
  const url = `http://127.0.0.1:${fixture.address().port}/`;
  const res = await fetch("http://127.0.0.1:8050/render.html", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
  const html = await res.text();
  assert.equal(res.status, 200, html);
  assert.equal(res.headers.get("x-webview-status"), "200");
  assert.match(html, /<main>rendered<\/main>/);
  console.log(`Chromium render passed on ${process.platform}/${process.arch}`);
} finally {
  fixture.close();
}
