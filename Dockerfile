# Stage 1: Install dependencies
FROM node:18-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build the application
FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Environment variables must be present at build time for Next.js
# We'll pass them as build args if needed, but for runtime they are better
ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build

# Stage 3: Production image
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy public files AFTER standalone so permissions are correct
# (standalone build also copies public, but may have wrong ownership from builder stage)
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
RUN chmod -R +r /app/public

# Ensure the nextjs user has write permissions for the entire /app directory (to create data/ and read envs)
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 4888

ENV PORT 4888
ENV HOSTNAME 0.0.0.0

CMD ["node", "server.js"]
