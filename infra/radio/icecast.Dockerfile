FROM debian:bookworm-slim
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends icecast2 python3 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY infra/radio/icecast-entry.py /entry.py
USER icecast2
EXPOSE 8000
CMD ["python3", "/entry.py"]
