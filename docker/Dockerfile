ARG DHI_NODE_VERSION=26.3.0

################# Monolith Builder ##############
FROM dhi.io/rust:1.96.0-debian13-dev AS monolith_builder

RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        libssl-dev \
        pkg-config \
    && rm -rf /var/lib/apt/lists/* \
    && cargo install monolith

################# Base Builder ##############
FROM dhi.io/node:${DHI_NODE_VERSION}-debian13-dev AS base

WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# https://github.com/karakeep-app/karakeep/issues/967
RUN npm install -g corepack@0.31.0 && corepack enable

RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        make \
        g++ \
        python3 \
        python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/cli/package.json ./apps/cli/
COPY apps/mcp/package.json ./apps/mcp/
COPY apps/web/package.json ./apps/web/
COPY apps/workers/package.json ./apps/workers/
COPY packages/api/package.json ./packages/api/
COPY packages/db/package.json ./packages/db/
COPY packages/open-api/package.json ./packages/open-api/
COPY packages/plugins/package.json ./packages/plugins/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/shared-react/package.json ./packages/shared-react/
COPY packages/shared-server/package.json ./packages/shared-server/
COPY packages/shared/package.json ./packages/shared/
COPY packages/trpc/package.json ./packages/trpc/
COPY tooling/github/package.json ./tooling/github/
COPY tooling/oxlint/package.json ./tooling/oxlint/
COPY tooling/prettier/package.json ./tooling/prettier/
COPY tooling/tailwind/package.json ./tooling/tailwind/
COPY tooling/typescript/package.json ./tooling/typescript/
COPY ./patches ./patches

ENV NEXT_TELEMETRY_DISABLED=1
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# Avoid pnpm hardlink collisions in Docker while preserving the repo's hoisted workspace layout.
RUN DEVELOPMENT_SKIP_GETTING_ASSET=1 pnpm install --frozen-lockfile --config.package-import-method=copy --config.allow-unused-patches=true

COPY . .

# Build the db migration script
RUN cd packages/db && \
    /app/node_modules/.bin/ncc build migrate.ts -o /db_migrations && \
    cp -R drizzle drizzle-pg /db_migrations


# Compile the web app. Next derives its worker count from CIRCLE_NODE_TOTAL;
# cap it here to keep local and CI Docker builds inside modest memory limits.
RUN (cd apps/web && CIRCLE_NODE_TOTAL=2 /app/node_modules/.bin/next build --webpack --experimental-build-mode compile)

# Build the worker code
RUN (cd apps/workers && /app/node_modules/.bin/tsdown)

# Build the cli
RUN (cd apps/cli && /app/node_modules/.bin/vite build && chmod +x dist/index.mjs)

# Build the mcp server
RUN (cd apps/mcp && /app/node_modules/.bin/vite build && /app/node_modules/.bin/shx chmod +x dist/index.js)

RUN DEVELOPMENT_SKIP_GETTING_ASSET=1 pnpm --prefer-offline deploy --legacy --node-linker=isolated --filter @karakeep/workers --prod /prod/workers --config.allow-unused-patches=true

################# Postgres-only Base Builder ##############
FROM dhi.io/node:${DHI_NODE_VERSION}-debian13-dev AS base_postgres

WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# https://github.com/karakeep-app/karakeep/issues/967
RUN npm install -g corepack@0.31.0 && corepack enable

RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        make \
        g++ \
        python3 \
        python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/cli/package.json ./apps/cli/
COPY apps/mcp/package.json ./apps/mcp/
COPY apps/web/package.json ./apps/web/
COPY apps/workers/package.json ./apps/workers/
COPY packages/api/package.json ./packages/api/
COPY packages/db/package.json ./packages/db/
COPY packages/open-api/package.json ./packages/open-api/
COPY packages/plugins/package.json ./packages/plugins/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/shared-react/package.json ./packages/shared-react/
COPY packages/shared-server/package.json ./packages/shared-server/
COPY packages/shared/package.json ./packages/shared/
COPY packages/trpc/package.json ./packages/trpc/
COPY tooling/github/package.json ./tooling/github/
COPY tooling/oxlint/package.json ./tooling/oxlint/
COPY tooling/prettier/package.json ./tooling/prettier/
COPY tooling/tailwind/package.json ./tooling/tailwind/
COPY tooling/typescript/package.json ./tooling/typescript/
COPY ./patches ./patches

RUN node -e "const fs=require('node:fs'); const edits=[['packages/db/package.json','better-sqlite3'],['packages/plugins/package.json','liteque']]; for (const [file, dep] of edits) { const pkg=JSON.parse(fs.readFileSync(file,'utf8')); if (pkg.optionalDependencies) { delete pkg.optionalDependencies[dep]; if (Object.keys(pkg.optionalDependencies).length === 0) delete pkg.optionalDependencies; } fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n'); }"

ENV DB_DRIVER=postgres
ENV NEXT_TELEMETRY_DISABLED=1
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# Postgres-only images must not install native SQLite dependencies.
RUN DEVELOPMENT_SKIP_GETTING_ASSET=1 pnpm install --no-frozen-lockfile --config.package-import-method=copy --config.allow-unused-patches=true
RUN rm -rf node_modules/better-sqlite3 node_modules/.pnpm/better-sqlite3@*
RUN node -e "try { require.resolve('better-sqlite3'); process.exit(1); } catch { process.exit(0); }"

COPY . .
RUN node -e "const fs=require('node:fs'); const edits=[['packages/db/package.json','better-sqlite3'],['packages/plugins/package.json','liteque']]; for (const [file, dep] of edits) { const pkg=JSON.parse(fs.readFileSync(file,'utf8')); if (pkg.optionalDependencies) { delete pkg.optionalDependencies[dep]; if (Object.keys(pkg.optionalDependencies).length === 0) delete pkg.optionalDependencies; } fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n'); }"

# Build a migration script that cannot import the SQLite runtime.
RUN cd packages/db && \
    /app/node_modules/.bin/ncc build migrate-postgres.ts -o /db_migrations && \
    cp -R drizzle-pg /db_migrations

RUN (cd apps/web && CIRCLE_NODE_TOTAL=2 /app/node_modules/.bin/next build --webpack --experimental-build-mode compile)
RUN (cd apps/workers && /app/node_modules/.bin/tsdown)
RUN DEVELOPMENT_SKIP_GETTING_ASSET=1 pnpm --prefer-offline deploy --legacy --node-linker=isolated --filter @karakeep/workers --prod /prod/workers --config.allow-unused-patches=true

################# The All-in-one builder ##############

FROM dhi.io/node:${DHI_NODE_VERSION}-debian13-dev AS aio_runtime
LABEL org.opencontainers.image.source="https://github.com/karakeep-app/karakeep"
WORKDIR /app

ARG SERVER_VERSION=nightly
ENV SERVER_VERSION=${SERVER_VERSION}

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"
EXPOSE 3000

######################
# Prepare s6-overlay
######################
ARG S6_OVERLAY_VERSION=3.2.1.0
ARG TARGETARCH

# Install wget and xz-utils needed for s6-overlay
RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        ca-certificates \
        wget \
        xz-utils \
    && rm -rf /var/lib/apt/lists/*

ADD https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz /tmp
RUN tar -C / -Jxpf /tmp/s6-overlay-noarch.tar.xz \
    && case ${TARGETARCH} in \
            "amd64")  S6_ARCH=x86_64   ;; \
            "arm64")  S6_ARCH=aarch64  ;; \
        esac \
    && echo https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-${S6_ARCH}.tar.xz -O /tmp/s6-overlay-${S6_ARCH}.tar.xz \
    && wget https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-${S6_ARCH}.tar.xz -O /tmp/s6-overlay-${S6_ARCH}.tar.xz \
    && tar -C / -Jxpf /tmp/s6-overlay-${S6_ARCH}.tar.xz \
    && rm -f /tmp/s6-overlay-${S6_ARCH}.tar.xz

# Copy the s6-overlay config
COPY --chmod=755 ./docker/root/etc/s6-overlay /etc/s6-overlay

######################
# Install runtime deps
######################
RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        curl \
        graphicsmagick \
        ghostscript \
        init-system-helpers \
        libjemalloc2 \
        ffmpeg \
    && rm -rf /var/lib/apt/lists/*

ARG TARGETARCH
RUN case ${TARGETARCH} in \
        "amd64")  YTDLP_FILE=yt-dlp_linux ;; \
        "arm64")  YTDLP_FILE=yt-dlp_linux_aarch64 ;; \
        *) echo "Unsupported arch: ${TARGETARCH}" && exit 1 ;; \
    esac \
    && curl --fail --show-error --location --retry 5 --retry-all-errors --retry-delay 3 \
        --connect-timeout 20 --max-time 180 --speed-time 30 --speed-limit 1024 \
        https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YTDLP_FILE} \
        -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp

# Copy monolith binary from builder
COPY --from=monolith_builder /usr/local/cargo/bin/monolith /usr/local/bin/monolith

######################
# Prepare the web app
######################

FROM aio_runtime AS aio_builder

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXTAUTH_URL_INTERNAL=http://localhost:${PORT}

# Create symlink for jemalloc based on architecture
ARG TARGETARCH
RUN mkdir -p /usr/local/lib \
    && if [ "$TARGETARCH" = "arm64" ]; then \
        ln -s /usr/lib/aarch64-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so; \
    else \
        ln -s /usr/lib/x86_64-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so; \
    fi

COPY --from=base --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=base /app/apps/web/public ./apps/web/public
COPY --from=base /db_migrations /db_migrations

# Set the correct permission for prerender cache
RUN mkdir -p ./apps/web/.next && chown node:node ./apps/web/.next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=base --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static

######################
# Prepare the workers app
######################
COPY --from=base --chown=node:node /prod/workers /app/apps/workers

# The root cluster enforces restricted PodSecurity. s6-overlay can run as a
# non-root UID, but its preinit checks require /run to be owned by that UID.
RUN mkdir -p /run /data \
    && chown node:node /run /data

ENTRYPOINT ["/init"]

################# The Postgres-only all-in-one builder ##############

FROM aio_runtime AS aio_postgres_builder

ENV DB_DRIVER=postgres
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXTAUTH_URL_INTERNAL=http://localhost:${PORT}

ARG TARGETARCH
RUN mkdir -p /usr/local/lib \
    && if [ "$TARGETARCH" = "arm64" ]; then \
        ln -s /usr/lib/aarch64-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so; \
    else \
        ln -s /usr/lib/x86_64-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so; \
    fi

COPY --from=base_postgres --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=base_postgres /app/apps/web/public ./apps/web/public
COPY --from=base_postgres /db_migrations /db_migrations
RUN test ! -d /db_migrations/drizzle

RUN mkdir -p ./apps/web/.next && chown node:node ./apps/web/.next

COPY --from=base_postgres --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=base_postgres --chown=node:node /prod/workers /app/apps/workers

RUN node -e "try { require.resolve('better-sqlite3'); process.exit(1); } catch { process.exit(0); }"

RUN mkdir -p /run /data \
    && chown node:node /run /data

ENTRYPOINT ["/init"]

################# The AIO ##############

FROM aio_builder AS aio

RUN touch /etc/s6-overlay/s6-rc.d/user/contents.d/init-db-migration \
    /etc/s6-overlay/s6-rc.d/user/contents.d/svc-web \
    /etc/s6-overlay/s6-rc.d/user/contents.d/svc-workers

USER node

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

################# The Postgres-only AIO ##############

FROM aio_postgres_builder AS aio-postgres

RUN touch /etc/s6-overlay/s6-rc.d/user/contents.d/init-db-migration \
    /etc/s6-overlay/s6-rc.d/user/contents.d/svc-web \
    /etc/s6-overlay/s6-rc.d/user/contents.d/svc-workers

USER node

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

################# The web container ##############

FROM aio_builder AS web

RUN touch /etc/s6-overlay/s6-rc.d/user/contents.d/init-db-migration \
    /etc/s6-overlay/s6-rc.d/user/contents.d/svc-web
ENV USING_LEGACY_SEPARATE_CONTAINERS=true
USER node

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

################# The workers container ##############

FROM aio_builder AS workers

# In the current implemtation, the workers assume the migration
# is done for them.
RUN rm /etc/s6-overlay/s6-rc.d/svc-workers/dependencies.d/init-db-migration \
    && touch /etc/s6-overlay/s6-rc.d/user/contents.d/svc-workers
ENV USING_LEGACY_SEPARATE_CONTAINERS=true
USER node

################# The cli ##############

FROM dhi.io/node:${DHI_NODE_VERSION}-debian13 AS cli
LABEL org.opencontainers.image.source="https://github.com/karakeep-app/karakeep"
WORKDIR /app

COPY --from=base /app/apps/cli/dist/index.mjs apps/cli/index.mjs

WORKDIR /app/apps/cli

ARG SERVER_VERSION=nightly
ENV SERVER_VERSION=${SERVER_VERSION}

ENTRYPOINT ["node", "index.mjs"]

################# MCP server ##############

FROM dhi.io/node:${DHI_NODE_VERSION}-debian13 AS mcp
LABEL org.opencontainers.image.source="https://github.com/karakeep-app/karakeep"
WORKDIR /app

COPY --from=base /app/apps/mcp/dist/index.js apps/mcp/index.js

WORKDIR /app/apps/mcp

ENTRYPOINT ["node", "index.js"]
