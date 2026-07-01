FROM node:22-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    curl \
    git \
    unzip \
    ca-certificates \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g bun

COPY package*.json ./

RUN bun install --no-lockfile --prefer-offline

COPY . .

CMD ["bun", "src/cli.ts"]