# syntax=docker/dockerfile:1

FROM oven/bun:1.3.13-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .
RUN bun install --frozen-lockfile

FROM base AS builder
RUN bunx turbo build --filter=web

FROM base AS migrate
CMD ["bun", "run", "--cwd", "packages/database", "db:migrate"]

FROM node:22-alpine AS runner
WORKDIR /app
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static

USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
