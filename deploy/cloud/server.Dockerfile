FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/package.json
COPY packages/project-notes/package.json packages/project-notes/package.json
RUN npm ci --ignore-scripts --workspace @d-blog/server --include-workspace-root=false
COPY packages/server packages/server
RUN npm run build --workspace @d-blog/server

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/package.json
COPY packages/project-notes/package.json packages/project-notes/package.json
RUN npm ci --omit=dev --ignore-scripts --workspace @d-blog/server --include-workspace-root=false && npm cache clean --force
COPY --from=build /app/packages/server/dist packages/server/dist
COPY packages/server/migrations packages/server/migrations
USER node
EXPOSE 3001
CMD ["node", "packages/server/dist/main.js"]
