# ---- build ----
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build

# ---- runtime ----
# Imagem final não tem a CLI do Prisma nem devDependencies: migrations
# rodam como passo separado (ver README), não automaticamente no boot do
# container — o container só precisa do client já gerado.
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3333
CMD ["node", "dist/server.js"]
