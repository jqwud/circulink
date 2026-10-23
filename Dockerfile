# syntax=docker/dockerfile:1
# Hiraman in one image: the API, which also serves the built LGU portal from the same address.
# The phone app is built separately (docs/SETUP.md). See docs/CONTAINERS.md for how to run it.

# 1) Build the portal into static files.
FROM node:22-bookworm-slim AS portal
WORKDIR /src/portal
COPY portal/package.json portal/package-lock.json ./
RUN npm ci
COPY portal/ ./
RUN npm run build

# 2) The API. The MySQL command-line tools are for the automatic backup before each database update.
FROM node:22-bookworm-slim
ENV NODE_ENV=production
RUN apt-get update \
 && apt-get install -y --no-install-recommends default-mysql-client \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY database/ /app/database/
COPY --from=portal /src/portal/dist /app/portal/dist
COPY docker/entrypoint.sh /usr/local/bin/hiraman-entrypoint
# Strip Windows line endings in case the file was checked out with them, then hand the app to the "node" user.
RUN sed -i 's/\r$//' /usr/local/bin/hiraman-entrypoint \
 && chmod +x /usr/local/bin/hiraman-entrypoint \
 && mkdir -p uploads backups \
 && chown -R node:node /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
ENTRYPOINT ["hiraman-entrypoint"]
CMD ["node", "src/index.js"]
