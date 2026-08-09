FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY pnpm-workspace.yaml package.json ./
COPY apps/web ./apps/web
COPY packages ./packages

RUN pnpm install --frozen-lockfile=false

WORKDIR /app/apps/web
EXPOSE 3000

CMD ["pnpm", "dev"]
