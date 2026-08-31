FROM node:20-slim AS frontend-build

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build


FROM python:3.11-slim

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Install cloudflared
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        grep && \
    ARCH="$(dpkg --print-architecture)" && \
    if [ "$ARCH" = "amd64" ]; then \
        CF_ARCH="amd64"; \
    elif [ "$ARCH" = "arm64" ]; then \
        CF_ARCH="arm64"; \
    else \
        echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    curl -fsSL \
        "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}" \
        -o /usr/local/bin/cloudflared && \
    chmod +x /usr/local/bin/cloudflared && \
    rm -rf /var/lib/apt/lists/*

# Copy backend and built frontend
COPY backend/ ./backend/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Copy startup script
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

ENV PORT=5000

EXPOSE 5000

CMD ["/app/start.sh"]
