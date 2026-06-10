FROM harbor.m0sh1.cc/apps/karakeep-node-ci:24.15.0-debian13-dev@sha256:ce9fe41dd8a63326e5c5894dea7f55b71919ec4b3a945d47753487c814bcc65a

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PNPM_STORE_DIR=/pnpm/store
# CI image dependency prefetch should be deterministic even during fresh upstream publishes.
ARG PNPM_MINIMUM_RELEASE_AGE=0

WORKDIR /opt/karakeep

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./

RUN pnpm config set store-dir "$PNPM_STORE_DIR" \
    && pnpm fetch --frozen-lockfile --config.minimumReleaseAge=${PNPM_MINIMUM_RELEASE_AGE}
