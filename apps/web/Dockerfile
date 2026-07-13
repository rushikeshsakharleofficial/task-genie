FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN rm -f package-lock.json && npm install --legacy-peer-deps

FROM dependencies AS builder
WORKDIR /app
ARG API_INTERNAL_URL=http://api:4000
ARG NEXT_PUBLIC_WS_URL=
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
COPY apps/web ./apps/web
RUN npm run build --workspace @taskgenie/web

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN addgroup -S taskgenie && adduser -S taskgenie -G taskgenie
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
USER taskgenie
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
