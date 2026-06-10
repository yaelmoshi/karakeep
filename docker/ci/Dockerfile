ARG DHI_NODE_VERSION=26.3.0

FROM dhi.io/node:${DHI_NODE_VERSION}-debian13-dev

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PNPM_STORE_DIR=/pnpm/store
# CI image dependency prefetch should be deterministic even during fresh upstream publishes.
ARG PNPM_MINIMUM_RELEASE_AGE=0

WORKDIR /opt/karakeep

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./

RUN npm install -g corepack@0.31.0 && corepack enable

RUN pnpm config set store-dir "$PNPM_STORE_DIR" \
    && pnpm fetch --frozen-lockfile --config.minimumReleaseAge=${PNPM_MINIMUM_RELEASE_AGE}
