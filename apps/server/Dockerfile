FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY apps ./apps
RUN cd apps/server && npx prisma generate && npx tsc -p tsconfig.json && cd ../web && npx vite build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production WEB_DIST_DIR=/app/web
# Share cards draw their text with this font.
RUN apk add --no-cache font-dejavu
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/prisma ./apps/server/prisma
COPY --from=build /app/apps/server/package.json ./apps/server/
COPY --from=build /app/apps/web/dist ./web
WORKDIR /app/apps/server
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3001/api/health || exit 1
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
