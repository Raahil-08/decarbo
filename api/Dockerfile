FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

# Install system packages for WeasyPrint rendering (Pango, HarfBuzz, Fontconfig) and Indian font fallbacks
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libharfbuzz0b \
    libfontconfig1 \
    fonts-deva \
    fonts-gujr \
    fonts-freefont-ttf \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install uv from official binary image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copy dependency definitions
COPY pyproject.toml uv.lock ./

# Install python dependencies without the root project to cache dependencies
RUN uv sync --frozen --no-dev --no-install-project

# Copy application source, readme and seed/template assets
COPY README.md ./
COPY app ./app
COPY data ./data

# Final sync to install the root project
RUN uv sync --frozen --no-dev

# Put virtual environment on PATH
ENV PATH="/app/.venv/bin:$PATH"

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/health || exit 1

# Start uvicorn directly with exec and dynamic port binding
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
