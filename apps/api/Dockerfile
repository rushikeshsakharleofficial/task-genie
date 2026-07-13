FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN rm -f package-lock.json && npm install --legacy-peer-deps

FROM dependencies AS builder
COPY apps/api ./apps/api
RUN npm run build --workspace @taskgenie/api

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S taskgenie && adduser -S taskgenie -G taskgenie && mkdir -p /app/uploads && chown -R taskgenie:taskgenie /app/uploads
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/drizzle ./apps/api/drizzle
COPY apps/api/package.json ./apps/api/package.json
USER taskgenie
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
