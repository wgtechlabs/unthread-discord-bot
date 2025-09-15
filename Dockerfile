# =============================================================================
# UNTHREAD DISCORD BOT - DOCKERFILE
# =============================================================================
# Multi-stage Docker build for the Unthread Discord Bot
# 
# Build stages:
# 1. deps    - Install production dependencies only
# 2. build   - Install dev dependencies and build the application
# 3. final   - Create minimal runtime image with built app
#
# Usage:
#   docker build -t unthread-discord-bot .
#   docker run --env-file .env unthread-discord-bot
# =============================================================================

# syntax=docker/dockerfile:1

# Use Node.js 22.16 LTS Alpine with security patches
ARG NODE_VERSION=22.16-alpine3.21

# =============================================================================
# STAGE 1: Base Image
# =============================================================================
# Alpine Linux 3.21 base for minimal image size with latest security updates
FROM node:${NODE_VERSION} AS base

# Set working directory for all subsequent stages
WORKDIR /usr/src/app

# =============================================================================
# STAGE 2: Production Dependencies
# =============================================================================
# Install only production dependencies for runtime
FROM base AS deps

# Enable corepack for proper yarn version
RUN corepack enable

# Copy package manager files first for better caching
COPY package.json yarn.lock .yarnrc.yml ./

# Install production dependencies only
RUN yarn install --production --frozen-lockfile

# =============================================================================
# STAGE 3: Build Application  
# =============================================================================
# Install dev dependencies and build the TypeScript application
FROM deps AS build

# Copy package files for dev dependencies
COPY package.json yarn.lock .yarnrc.yml ./

# Install all dependencies (including devDependencies for building)
RUN yarn install --frozen-lockfile

# Copy source code and build the application
COPY . .
RUN yarn run build

# Copy non-TypeScript files that need to be in the final build
RUN cp src/database/schema.sql dist/database/

# =============================================================================
# STAGE 4: Final Runtime Image
# =============================================================================
# Minimal production image with only necessary files
FROM base AS final

# Set production environment with security options
ENV NODE_ENV=production \
    NODE_OPTIONS="--enable-source-maps --max-old-space-size=512"

# Create a dedicated user for the application
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Enable corepack for the final image
RUN corepack enable

# Copy package.json and yarn config for package manager commands
COPY --chown=nodejs:nodejs package.json yarn.lock .yarnrc.yml ./

# Copy production dependencies and built application
COPY --from=deps --chown=nodejs:nodejs /usr/src/app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /usr/src/app/dist ./dist

# Switch to non-root user
USER nodejs

# Use Node.js built-in init process for proper signal handling
CMD ["node", "dist/index.js"]