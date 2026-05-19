# =============================================================================
# UNTHREAD DISCORD BOT - DOCKERFILE
# =============================================================================
# Multi-stage Docker build for the Unthread Discord Bot
# 
# Build stages:
# 1. base         - Minimal Node.js + dumb-init runtime base (no Bun)
# 2. builder-base - base + Bun (used only for dependency install & build)
# 3. deps         - Install production dependencies only
# 4. build        - Install dev dependencies and build the application
# 5. final        - Create minimal runtime image with built app (no Bun)
#
# Usage:
#   docker build -t unthread-discord-bot .
#   docker run --env-file .env unthread-discord-bot
# =============================================================================

# syntax=docker/dockerfile:1

# Use a recent Node.js 24 LTS Alpine image with security patches
ARG NODE_VERSION=24-alpine3.23
# Pinned Bun version for reproducible builds
ARG BUN_VERSION=1.3.13

# =============================================================================
# STAGE 1: Base Image
# =============================================================================
# Alpine Linux 3.22 base for minimal image size with latest security updates.
# Intentionally kept minimal (no Bun) so the final runtime image stays small —
# Bun is only added on top in the `builder-base` stage used for install/build.
FROM node:${NODE_VERSION} AS base

# Install security updates for Alpine packages
RUN apk update && apk upgrade --no-cache && \
    apk add --no-cache dumb-init && \
    # Remove corepack cache and bundled manager data to reduce vulnerable surface area.
    rm -rf /root/.cache/node/corepack /usr/local/lib/node_modules/corepack && \
    rm -rf /var/cache/apk/*

# Set working directory for all subsequent stages
WORKDIR /usr/src/app

# =============================================================================
# STAGE 1b: Builder Base (base + Bun)
# =============================================================================
# Bun is installed here for dependency management and building only — the
# final runtime launches the bot with Node.js and does NOT include Bun.
FROM base AS builder-base
ARG BUN_VERSION
COPY --from=oven/bun:${BUN_VERSION}-alpine /usr/local/bin/bun /usr/local/bin/bun
RUN bun --version

# =============================================================================
# STAGE 2: Production Dependencies
# =============================================================================
# Install only production dependencies for runtime
FROM builder-base AS deps

# Use bind mounts and cache for faster builds
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=bun.lock,target=bun.lock \
    --mount=type=cache,target=/root/.bun/install/cache \
    bun install --production --frozen-lockfile

# =============================================================================
# STAGE 3: Build Application  
# =============================================================================
# Install dev dependencies and build the TypeScript application
FROM builder-base AS build

# Install all dependencies (including devDependencies for building)
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=bun.lock,target=bun.lock \
    --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# Copy source code and build the application
COPY . .
RUN bun run build

# Copy non-TypeScript files that need to be in the final build
RUN mkdir -p dist/database && cp src/database/schema.sql dist/database/schema.sql

# =============================================================================
# STAGE 4: Final Runtime Image
# =============================================================================
# Minimal production image with only necessary files
FROM base AS final

# Set production environment with security options
ENV NODE_ENV=production \
    NODE_OPTIONS="--enable-source-maps --max-old-space-size=512" \
    HOME=/tmp

# Create a dedicated user for the application
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs -s /sbin/nologin

# Copy package.json for package manager commands
COPY --chown=nodejs:nodejs package.json .

# Copy production dependencies and built application
COPY --from=deps --chown=nodejs:nodejs /usr/src/app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /usr/src/app/dist ./dist

# Switch to non-root user
USER nodejs

# Use dumb-init for proper signal handling and start the application
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "process.exit(0)"

# Use dumb-init for proper signal handling and start the application
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]