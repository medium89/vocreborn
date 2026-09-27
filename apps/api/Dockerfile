FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npm run db:generate
COPY tsconfig.json nest-cli.json ./
COPY src ./src
COPY assets ./assets
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/assets ./assets
RUN mkdir -p /app/uploads/avatars /app/storage/attachments && chown -R node:node /app
USER node
EXPOSE 3001
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && npm run db:seed && node dist/main.js"]
