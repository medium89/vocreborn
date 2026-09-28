FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY apps/radio/worker.mjs ./worker.mjs
USER node
EXPOSE 8090
CMD ["node", "worker.mjs"]
