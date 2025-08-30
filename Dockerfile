# =============================================================================
# UNTHREAD DISCORD BOT - DOCKERFILE
# =============================================================================
# Production-ready Docker build for the Unthread Discord Bot with Yarn PnP support
# 
# This Dockerfile requires Yarn Plug'n'Play configuration to work properly.
# Before building, ensure your .yarnrc.yml uses PnP and run yarn install to
# generate the required .pnp.cjs and .yarn artifacts.
#
# Prerequisites:
#   1. Configure .yarnrc.yml with: nodeLinker: pnp
#   2. Run: yarn install (generates .pnp.cjs and .yarn artifacts)
#   3. Run: yarn build (builds the application)
#
# Usage:
#   docker build -t unthread-discord-bot .
#   docker run --env-file .env -p 3000:3000 unthread-discord-bot
# =============================================================================

# Use Node.js 22.16 LTS Alpine with security patches
ARG NODE_VERSION=22.16-alpine3.21
FROM node:${NODE_VERSION}

# Install security updates for Alpine packages
RUN apk update && apk upgrade && \
    apk add --no-cache wget dumb-init && \
    rm -rf /var/cache/apk/*

# Enable Corepack to make yarn and pnpm available
RUN corepack enable

# Set production environment
ENV NODE_ENV=production \
    NODE_OPTIONS="--enable-source-maps --max-old-space-size=512"

# Set working directory
WORKDIR /usr/src/app

# Create a dedicated user for the application
RUN addgroup -g 1001 -S nodejs && \
    adduser -S discordbot -u 1001 -G nodejs

# Copy application files and Yarn PnP artifacts (requires PnP configuration)
COPY --chown=discordbot:nodejs package.json ./
COPY --chown=discordbot:nodejs yarn.lock ./
COPY --chown=discordbot:nodejs .pnp.cjs ./
COPY --chown=discordbot:nodejs .yarn ./.yarn
COPY --chown=discordbot:nodejs dist ./dist

# Switch to non-root user
USER discordbot

# Expose webhook port
EXPOSE 3000

# Health check endpoint - simplified using wget
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Use dumb-init for proper signal handling and start the application
ENTRYPOINT ["dumb-init", "--"]
CMD ["yarn", "node", "dist/index.js"]