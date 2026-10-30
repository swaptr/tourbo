# Fan-data mock (dev only). See README.md.
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim
WORKDIR /mock
COPY pyproject.toml uv.lock README.md ./
COPY src ./src
RUN uv sync --frozen --no-dev
ENV MOCK_HOST=0.0.0.0 MOCK_PORT=8790
EXPOSE 8790
CMD ["uv", "run", "--no-sync", "tourbo-mock"]
