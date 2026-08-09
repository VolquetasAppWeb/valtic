# Dockerfile de PRODUCCION para @valtic/api (Railway u otro host que
# construya con Docker). El docker/api.Dockerfile original es solo para
# desarrollo local via docker-compose (pnpm dev + hot reload).
FROM node:20-slim AS base

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# Capa cacheable: solo manifiestos, para no reinstalar deps si no cambiaron.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --frozen-lockfile

# @valtic/types y @valtic/validation se consumen como JS compilado (no como
# fuente TS): a diferencia de Next.js (transpilePackages) o ts-node-dev en
# dev, el "node dist/main.js" de produccion no puede resolver su .ts fuente.
RUN pnpm --filter @valtic/types build
RUN pnpm --filter @valtic/validation build

COPY apps/api ./apps/api
WORKDIR /app/apps/api
RUN pnpm prisma:generate
RUN pnpm build

ENV NODE_ENV=production
EXPOSE 3001

# Aplica migraciones pendientes contra la base de datos de produccion antes
# de arrancar; falla el deploy si las migraciones fallan (deseado).
CMD ["sh", "-c", "pnpm prisma:deploy && node dist/main.js"]
