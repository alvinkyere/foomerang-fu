# One container for Render (render.yaml): the TV page (apps/console), the phone page (apps/controller) and the game server
# (apps/server), all on one address. Caddy serves the two pages and passes /socket.io to the server; Render terminates TLS.
# Images pinned to aged releases (docs/DEPENDENCIES.md, "Deployment images").

FROM node:24.22.0-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
# the phone page lives under /controller/ (deploy/Caddyfile); both pages find the server at their own address (no port)
RUN VITE_BASE_URL=/controller/ pnpm --filter @foomerang/controller build \
 && pnpm --filter @foomerang/console build

FROM caddy:2.11.7-alpine AS caddy

FROM node:24.22.0-bookworm-slim
COPY --from=caddy /usr/bin/caddy /usr/local/bin/caddy
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production
EXPOSE 10000
CMD ["bash", "/app/deploy/start.sh"]
