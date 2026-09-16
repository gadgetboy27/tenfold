# Multi-stage build for Next.js on Railway
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# The lockfile is written by npm 11 (lockfileVersion 3 with npm 11's peer and
# platform-optional resolution). node:20-alpine ships npm 10, which builds a
# different ideal tree from the same lock and refuses it with "Missing … from
# lock file" (seen 2026-09-16 after the sharp 0.35 / vitest bump). Same major
# npm in the container as on the machine that wrote the lock, or `npm ci`
# is not reproducible.
RUN npm install -g npm@11

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build Next.js app
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# FFmpeg (+ DejaVu fonts for drawtext captions) powers the cinema composition
# pipeline: muxing music onto video and burning animated captions into one MP4.
RUN apk add --no-cache ffmpeg ttf-dejavu fontconfig

# Copy package files
COPY package.json package-lock.json ./

# Same npm major as the builder stage — see above.
RUN npm install -g npm@11

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built app from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start production server
CMD ["npm", "start"]
