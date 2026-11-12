FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:0.10.9 /uv /bin/uv
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app
# Dependencies first, so editing the code does not reinstall them.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen

COPY . .
RUN useradd --create-home synk && mkdir -p /data && chown synk /data
USER synk

EXPOSE 8000
CMD ["uvicorn", "synk_agent.api:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
