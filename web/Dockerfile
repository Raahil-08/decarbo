# Stage 1: Build Vite React application
FROM node:22-alpine AS builder

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy dependency locks
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source tree
COPY . .

# Build production bundle (with relative API default for reverse-proxy compatibility)
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL}

RUN pnpm build

# Stage 2: Serve with lightweight Nginx
FROM nginx:alpine

# Custom nginx configuration for single page app routing
RUN echo 'server { \
    listen 3000; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    location /assets/ { \
        expires 1y; \
        add_header Cache-Control "public, immutable"; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Copy build artifacts
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
