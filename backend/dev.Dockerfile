# syntax=docker/dockerfile:1.4

########################################
# Base image: minimal Debian with Python
FROM python:3.11.4-slim-bookworm AS base

RUN : \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        net-tools \
        tini \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && :

########################################
# Builder stage: install uv, dependencies, and project code
FROM base AS builder

COPY --from=ghcr.io/astral-sh/uv:0.7.21 /uv /usr/local/bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /opt/src/app

COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project --no-dev --no-editable

COPY app/ ./
COPY docker-entry.sh ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-editable

########################################
# Runtime stage: minimal container run environment
FROM base AS runtime

RUN useradd --system --create-home --shell /bin/bash appuser

COPY --from=builder --chown=appuser:appuser /opt/src /opt/src

USER appuser
WORKDIR /opt/src/app
ENV PATH="/opt/src/app/.venv/bin:$PATH"

EXPOSE 8080

RUN chmod +x docker-entry.sh
ENTRYPOINT ["/usr/bin/tini", "--", "./docker-entry.sh"]
CMD []
