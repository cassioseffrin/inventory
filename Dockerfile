# syntax=docker/dockerfile:1
# Imagem única: o Next.js serve o frontend (React) e a API REST (route handlers).

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
# dependências de produção completas (o migrator e o seed usam módulos que o standalone não rastreia)
COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app drizzle ./drizzle
COPY --chown=app:app scripts ./scripts
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO /dev/null http://127.0.0.1:3000/login || exit 1
# aplica as migrations pendentes e sobe o servidor
CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]
