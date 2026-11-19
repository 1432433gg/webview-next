# 渲染 API

`GET /health` 返回 `200` 和 `{"status":"ok"}`。健康检查反映服务进程可接收请求，Chromium 按需启动。

`POST /render.html` 接收 UTF-8 JSON。

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `url` | string | 必填，绝对 HTTP(S) URL |
| `headers` | object | 可选，HTTP 请求头，值必须是字符串 |
| `http_method` | string | `GET` 或 `POST`，默认 `GET` |
| `body` | string | `POST` 请求体 |
| `js_source` | string | DOMContentLoaded 后执行一次的页内 JavaScript |
| `wait_ms` | integer | 脚本执行后额外等待毫秒数，默认 0，须小于服务超时 |

显式请求头只传给目标同源导航。Cookie 会加入本次请求的独立浏览器上下文，按浏览器作用域传递。User-Agent 也用于同一上下文。脚本和页面收到的 Cookie 生命周期限于此次渲染，调用端应自行维护持久 Cookie。

成功返回服务端 HTTP `200` 和 UTF-8 DOM HTML。 `X-WebView-Final-URL` 是通过 `encodeURIComponent` 编码的最终页面 URL，`X-WebView-Status` 是最终文档的十进制站点 HTTP 状态。站点状态 404 或 500 仍可携带 HTML。调用旧渲染器未收到元数据时，客户端可使用请求 URL 并将响应视作普通 HTML。

服务错误返回 `{"error":"code"}`。常见状态包括输入无效（400）、请求体过大（413）、导航或脚本失败（502）、浏览器不可用或并发已满（503）、渲染超时（504）。请求体上限为 1 MiB。容器配置项见 [.env.example](../.env.example)。

首版覆盖上述字段。旧服务的 HTML 注入、每请求代理及特殊编码扩展暂未移植。
