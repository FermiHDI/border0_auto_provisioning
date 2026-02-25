# Build Stage
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc

# Production Stage
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

# Set environment variables
ENV BORDER0_ADMIN_TOKEN=""
ENV BORDER0_CONNECTOR_ID=""
ENV MGMT_EMAILS=""
ENV PORT=8000

EXPOSE 8000

CMD ["node", "dist/index.js"]
