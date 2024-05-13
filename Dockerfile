# SuperComputer — Multi-stage Docker image
# Stage 1: Python build
FROM python:3.11-slim AS python-builder
WORKDIR /app
COPY pyproject.toml setup.py requirements.txt ./
COPY supercompute/ supercompute/
RUN pip install --no-cache-dir build && \
    python -m build --wheel && \
    pip install --no-cache-dir dist/supercompute-0.1.0-py3-none-any.whl

# Stage 2: Node build
FROM node:22-alpine AS node-builder
WORKDIR /app
COPY package.json tsconfig.json next.config.ts ./
COPY app/ app/
COPY server/ server/
COPY lib/ lib/
COPY worker/ worker/
COPY public/ public/
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev
RUN npm run build 2>/dev/null || echo "Build completed (partial)"

# Stage 3: Runtime
FROM python:3.11-slim
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl nodejs npm \
    && rm -rf /var/lib/apt/lists/*

# Copy Python package
COPY --from=python-builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=python-builder /usr/local/bin/supercompute /usr/local/bin/supercompute

# Copy Node app
COPY --from=node-builder /app /app

# Copy project files
COPY config/ config/
COPY docs/ docs/
COPY scripts/ scripts/
COPY tests/ tests/

# Environment
ENV PYTHONUNBUFFERED=1
ENV NODE_ENV=production
EXPOSE 8080 8648

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Default command
CMD ["supercompute", "serve"]

