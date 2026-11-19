FROM node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
WORKDIR /app
LABEL org.opencontainers.image.version="1.0.0"
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN node node_modules/playwright/cli.js install --with-deps chromium --only-shell \
    && rm -rf /var/lib/apt/lists/* \
    && chmod -R a+rX /opt/playwright
USER node
EXPOSE 8050
CMD ["node", "dist/app/main.js"]
