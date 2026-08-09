FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY pnpm-workspace.yaml package.json ./
COPY apps/api ./apps/api
COPY packages ./packages

RUN pnpm install --frozen-lockfile=false

WORKDIR /app/apps/api
RUN pnpm prisma:generate

EXPOSE 3001

CMD ["pnpm", "dev"]
