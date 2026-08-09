# Dockerfile de PRODUCCION para @valtic/web (Railway u otro host que
# construya con Docker). El docker/web.Dockerfile original es solo para
# desarrollo local via docker-compose (pnpm dev + hot reload).
FROM node:20-slim AS base

RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY apps/web ./apps/web
WORKDIR /app/apps/web

# NEXT_PUBLIC_* se hornea en el bundle en build time, no en runtime: debe
# llegar como build arg. En Railway, declarar la variable en el servicio
# (ej. apuntando al dominio publico del servicio api) hace que se inyecte
# automaticamente como --build-arg del mismo nombre.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "start"]
