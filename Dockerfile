# The server is stateless and holds no document state, so this image is one
# process behind a load balancer and nothing else. Scale it horizontally, or do
# not scale it at all.

FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock bunfig.toml .npmrc ./
RUN bun install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json ./
COPY scripts ./scripts
COPY src ./src
# `bun run build` emits the widget's hashed JS/CSS and the engine's
# harfbuzz.wasm into public/assets/. None of it is committed: the wasm loader
# verifies the binary against the engine it was built with, so the copy has to
# come from this install.
RUN bun run build

FROM oven/bun:1-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/bun.lock /app/bunfig.toml /app/.npmrc ./
RUN bun install --frozen-lockfile --production

COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public

# PUBLIC_ORIGIN is not optional here. It is the one domain the widget's CSP
# allowlist names; unset, it defaults to localhost, which the host's browser
# cannot reach.
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s \
  CMD bun --eval "await fetch('http://localhost:'+(process.env.PORT??3000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["bun", "dist/server/server/index.js"]
