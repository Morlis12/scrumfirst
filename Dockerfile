# ---- deps : installation complète ( Engines Prisma inclus ) ----
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# openssl requis par Prisma (moteurs) + certificats pour Postgres distant
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm ci

# ---- build : Next.js standalone ----
FROM node:24-slim AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# La DB doit être joignable au build (prerender /api/health = runtime, pas de collecte).
RUN npx prisma generate --schema prisma/schema.prisma \
  && npm run build

# ---- runner : image minimale non-root ----
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  PORT=3000 \
  HOSTNAME="0.0.0.0"
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
