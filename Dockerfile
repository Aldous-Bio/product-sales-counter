# Debian slim, not Alpine: Prisma's query engine needs a real libssl, which
# is a common source of "Building new image" failures on Alpine/musl.
FROM node:20-slim

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY extensions/product-sales-counter/package.json ./extensions/product-sales-counter/package.json

# --include=dev regardless of NODE_ENV: the Remix/Vite build tooling
# (@remix-run/dev, vite, prisma CLI) lives in devDependencies and is needed
# at build time even if NODE_ENV=production is set for the runtime stage.
RUN npm ci --include=dev

COPY . .

RUN npx prisma generate
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# `npm start` runs `prisma db push` against DATABASE_URL before starting the
# server (see package.json) — safe to run on every deploy, it's idempotent.
CMD ["npm", "start"]
