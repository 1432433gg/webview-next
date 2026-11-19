import { createServer } from "node:http";

export function fixture() {
  const hits = [];
  const site = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const request = {
      path: pathname, method: req.method, cookie: req.headers.cookie ?? "",
      custom: req.headers["x-test"] ?? "", body: Buffer.concat(chunks).toString(),
    };
    hits.push(request);
    if (pathname === "/slow") return;
    if (pathname === "/redirect") {
      res.writeHead(302, { location: "/nested/page?redirected=yes" }).end();
      return;
    }
    if (pathname === "/redirect-post") {
      res.writeHead(307, { location: "/post" }).end();
      return;
    }
    if (pathname === "/cross-origin") {
      res.writeHead(302, { location: `http://localhost:${site.address().port}/inspect` }).end();
      return;
    }
    if (pathname === "/nested/content") {
      res.end("relative content");
      return;
    }
    const payload = JSON.stringify(request).replaceAll("<", "\\u003c");
    res.writeHead(pathname === "/missing" ? 404 : 200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><main></main><script>
      const data = ${payload};
      document.querySelector("main").textContent = [data.method, data.body, data.custom, data.cookie].join("|");
      if (location.pathname === "/nested/page") {
        fetch("./content").then(r => r.text()).then(text => {
          const p = document.createElement("p"); p.textContent = text; document.body.append(p);
        });
      }
      setTimeout(() => document.body.setAttribute("data-ready", "timer-finished"), 80);
    </script>`);
  });
  return { site, hits };
}
