#!/bin/sh
set -eu

backup_dir="${1:-./backups}"
compose_file="${COMPOSE_FILE:-infra/docker-compose.prod.yml}"
env_file="${ENV_FILE:-.env.production}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"

if [ -f "$env_file" ]; then
  set -a
  . "$env_file"
  set +a
fi

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

mkdir -p "$backup_dir"
backup_dir="$(cd "$backup_dir" && pwd)"
db_file="$backup_dir/vocreborn-$timestamp.dump"
media_file="$backup_dir/vocreborn-$timestamp-media.tar.gz"
manifest_file="$backup_dir/vocreborn-$timestamp.sha256"
db_tmp="$db_file.tmp"
media_tmp="$media_file.tmp"

cleanup() {
  rm -f "$db_tmp" "$media_tmp"
}
trap cleanup EXIT INT TERM

compose() {
  if [ -f "$env_file" ]; then
    docker compose --env-file "$env_file" -f "$compose_file" "$@"
  else
    docker compose -f "$compose_file" "$@"
  fi
}

compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$db_tmp"

if [ -n "${MEDIA_SOURCE_DIR:-}" ]; then
  mkdir -p "$MEDIA_SOURCE_DIR"
  tar -C "$MEDIA_SOURCE_DIR" -czf "$media_tmp" .
else
  compose exec -T api tar -C /app -czf - uploads storage > "$media_tmp"
fi

mv "$db_tmp" "$db_file"
mv "$media_tmp" "$media_file"
(
  cd "$backup_dir"
  sha256sum "$(basename "$db_file")" "$(basename "$media_file")" > "$(basename "$manifest_file")"
)

trap - EXIT INT TERM
echo "Database backup: $db_file"
echo "Media backup: $media_file"
echo "Checksums: $manifest_file"
