# Debian slim rather than Alpine: Prisma's query engine needs glibc + openssl,
# and musl builds are a common source of "engine not found" errors.
FROM node:20-slim

# Prisma requires openssl at runtime to talk to Postgres over TLS
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy manifests first so `npm ci` is cached until dependencies actually change
COPY package.json package-lock.json ./
RUN npm ci

# Generate the client against the schema before the app code is copied
COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

EXPOSE 5000

# Apply migrations, seed the starting accounts (idempotent), then serve.
# Runs on every start so a fresh volume is set up automatically.
CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed.js && npm start"]
