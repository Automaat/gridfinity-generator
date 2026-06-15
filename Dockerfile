# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files (.npmrc carries legacy-peer-deps for the npm ci below)
COPY package*.json .npmrc ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build static bundle
RUN npm run build

# Production stage — static files served by nginx
FROM nginx:1.31-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80/ > /dev/null 2>&1 || exit 1
