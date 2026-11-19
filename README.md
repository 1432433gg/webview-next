# WebView Next

Reader Next 的独立动态网页渲染服务。Chromium 加载页面并运行页面 JavaScript，服务将渲染后的 DOM 作为 HTML 返回。服务无需 Reader 的数据库或数据目录。

## 本地开发

需要 Node.js 24 和 npm。

```sh
npm ci
npx playwright install chromium --only-shell
npm test
npm run build
npm start
```

Linux 可加 `--with-deps` 安装浏览器系统依赖。默认访问 `http://localhost:8050/health`。环境变量见 [.env.example](.env.example)。

## 容器

```sh
docker compose -f docker/compose.yml up --build -d --wait
docker compose -f docker/compose.yml down
```

Compose 示例通过容器内部健康检查验证启动。与 Reader 共用 Compose 网络时，可用 `http://webview:8050` 访问。服务和 Chromium 在容器内以普通用户运行，且启用 Chromium 沙盒。仅将此服务接入可信调用者所在的私有网络，因为调用者可以要求浏览器访问目标 HTTP(S) URL 和执行页内脚本。

[接口说明](docs/api.md)提供请求字段、站点状态和错误约定。

## 来源和许可

`/render.html` 接口参考 [hectorqin/remote-webview](https://hub.docker.com/r/hectorqin/remote-webview) 的机制及其 [Reader Pro 调用端](https://github.com/warpdotsys/reader-pro/blob/v3.2.14/recovered-source/jadx/sources/com/htmake/reader/utils/RemoteWebview.java)。服务及适配代码独立编写。使用 [Playwright](https://github.com/microsoft/playwright/blob/main/LICENSE)（Apache-2.0）及其管理的 Chromium，第三方组件保留各自许可和声明。

容器使用 [Playwright v1.65.1 沙盒配置](https://github.com/microsoft/playwright/blob/v1.65.1/utils/docker/seccomp_profile.json)，按 Apache-2.0 保留上游文件和许可。

## 致谢

- [Maple0517/reader-next](https://github.com/Maple0517/reader-next)
- [givenge/reader-rust](https://github.com/givenge/reader-rust)
- [hectorqin/reader](https://github.com/hectorqin/reader)
