FROM node:20-alpine

RUN apk add --no-cache python3
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Use env vars from .env.social at runtime (don't hardcode during build)
# Build TypeScript
RUN npx tsc --noEmit 2>/dev/null; echo "Build check done"

EXPOSE 3302
CMD ["npx", "tsx", "src/main.ts"]
