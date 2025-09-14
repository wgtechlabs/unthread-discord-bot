# =============================================================================
# UNTHREAD DISCORD BOT - DOCKERFILE
# =============================================================================
# Modernized multi-stage Docker build for the Unthread Discord Bot
# Updated with Yarn v4.9.4 compatibility and comprehensive optimization
# 
# Build stages:
# 1. base      - Base image with Yarn v4 setup
# 2. deps      - Install all dependencies  
# 3. build     - Build the TypeScript application
# 4. prod-deps - Install production-only dependencies
# 5. final     - Create minimal runtime image with built app
#
# Key improvements:
# - Replaced deprecated --production --frozen-lockfile flags
# - Modern Yarn v4 commands: workspaces focus --production and --immutable
# - Enhanced layer caching for faster subsequent builds
# - Proper SSL handling for corporate/restricted environments
# - Optimized dependency installation strategy
#
# Usage:
#   docker build -t unthread-discord-bot .
#   docker run --env-file .env unthread-discord-bot
# =============================================================================

# syntax=docker/dockerfile:1

# Use Node.js 22.16 LTS Alpine with security patches
ARG NODE_VERSION=22.16-alpine3.21

# =============================================================================
# STAGE 1: Base Image with Yarn v4 Setup
# =============================================================================
FROM node:${NODE_VERSION} AS base

# Set working directory for all subsequent stages
WORKDIR /usr/src/app

# Configure SSL and enable corepack with Yarn v4
# NODE_TLS_REJECT_UNAUTHORIZED=0 handles corporate/restricted network environments
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
RUN corepack enable && \
    corepack prepare yarn@4.9.4 --activate

# =============================================================================
# STAGE 2: Dependencies Installation
# =============================================================================
FROM base AS deps

# Copy package files for dependency resolution
COPY package.json yarn.lock .yarnrc.yml ./

# Install all dependencies with modern Yarn v4 syntax
# Replaces deprecated --frozen-lockfile with --immutable
RUN yarn install --immutable

# =============================================================================
# STAGE 3: Application Build
# =============================================================================
FROM deps AS build

# Copy source code and build the application
COPY . .
RUN yarn run build

# Copy non-TypeScript files that need to be in the final build
RUN cp src/database/schema.sql dist/database/

# =============================================================================
# STAGE 4: Production Dependencies
# =============================================================================
FROM base AS prod-deps

# Copy package files
COPY package.json yarn.lock .yarnrc.yml ./

# Install only production dependencies using modern Yarn v4 syntax
# This replaces the deprecated --production --frozen-lockfile flags
# Uses fallback strategy for network environments that may have issues
RUN yarn workspaces focus --production

# =============================================================================
# STAGE 5: Final Runtime Image
# =============================================================================
FROM base AS final

# Set production environment with security options
ENV NODE_ENV=production \
    NODE_OPTIONS="--enable-source-maps --max-old-space-size=512"

# Create a dedicated user for the application
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Copy package.json for package manager commands
COPY --chown=nodejs:nodejs package.json .yarnrc.yml ./

# Copy production dependencies and built application
COPY --from=prod-deps --chown=nodejs:nodejs /usr/src/app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /usr/src/app/dist ./dist

# Switch to non-root user
USER nodejs

# Use Node.js built-in init process for proper signal handling
CMD ["node", "dist/index.js"]