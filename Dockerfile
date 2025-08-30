# =============================================================================
# UNTHREAD DISCORD BOT - DOCKERFILE
# =============================================================================
# Simple Docker build for the Unthread Discord Bot
# 
# This Dockerfile creates a production-ready container for the Discord bot
# by copying pre-built application files and dependencies.
#
# Usage:
#   yarn build  # Build the application first
#   docker build -t unthread-discord-bot .
#   docker run --env-file .env -p 3000:3000 unthread-discord-bot
# =============================================================================

# Use Node.js 18.17 LTS Alpine for compatibility and stability
FROM node:18.17-alpine

# Set production environment
ENV NODE_ENV=production \
    NODE_OPTIONS="--enable-source-maps --max-old-space-size=512"

# Set working directory
WORKDIR /usr/src/app

# Install wget for health checks
RUN apk add --no-cache wget

# Create a dedicated user for the application
RUN addgroup -g 1001 -S nodejs && \
    adduser -S discordbot -u 1001 -G nodejs

# Copy application files (assuming build has been run locally)
COPY --chown=discordbot:nodejs package.json ./
COPY --chown=discordbot:nodejs node_modules ./node_modules
COPY --chown=discordbot:nodejs dist ./dist

# Switch to non-root user
USER discordbot

# Expose webhook port
EXPOSE 3000

# Health check endpoint - simplified using wget
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]