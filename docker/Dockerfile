# ---------- Stage 1: Build ----------
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY prisma ./prisma
COPY vendor ./vendor

RUN npm ci

COPY src ./src

RUN npm run build

# ---------- Stage 2: Production ----------
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma
COPY vendor ./vendor
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# El cliente de Prisma ya generado en el builder (npm ci --omit=dev no instala
# la CLI de prisma, que es devDependency — se reutiliza el output generado ahi).
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/dist ./dist

RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
USER nestjs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/auth/health || exit 1

CMD ["node", "dist/main.js"]
