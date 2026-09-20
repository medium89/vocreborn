#!/bin/sh
set -eu

source_path="${1:-./backups}"
compose_file="${COMPOSE_FILE:-infra/docker-compose.prod.yml}"
env_file="${ENV_FILE:-.env.production}"

if [ -f "$env_file" ]; then
  set -a
  . "$env_file"
  set +a
fi

: "${POSTGRES_USER:?POSTGRES_USER is required}"

if [ -d "$source_path" ]; then
  dump_file="$(find "$source_path" -maxdepth 1 -type f -name 'vocreborn-*.dump' | sort | tail -n 1)"
else
  dump_file="$source_path"
fi
[ -n "$dump_file" ] && [ -f "$dump_file" ] || { echo "Backup dump not found" >&2; exit 1; }

base="${dump_file%.dump}"
media_file="$base-media.tar.gz"
manifest_file="$base.sha256"
[ -f "$media_file" ] || { echo "Media archive not found: $media_file" >&2; exit 1; }
[ -f "$manifest_file" ] || { echo "Checksum manifest not found: $manifest_file" >&2; exit 1; }

backup_dir="$(cd "$(dirname "$dump_file")" && pwd)"
dump_file="$backup_dir/$(basename "$dump_file")"
media_file="$backup_dir/$(basename "$media_file")"
manifest_file="$backup_dir/$(basename "$manifest_file")"
test_db="vocreborn_restore_$(date -u +%Y%m%d%H%M%S)_$$"

case "$test_db" in
  vocreborn_restore_[0-9]*) ;;
  *) echo "Unsafe temporary database name" >&2; exit 1 ;;
esac

compose() {
  if [ -f "$env_file" ]; then
    docker compose --env-file "$env_file" -f "$compose_file" "$@"
  else
    docker compose -f "$compose_file" "$@"
  fi
}

cleanup() {
  compose exec -T postgres dropdb -U "$POSTGRES_USER" --if-exists "$test_db" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

(cd "$backup_dir" && sha256sum -c "$(basename "$manifest_file")")
tar -tzf "$media_file" >/dev/null
compose exec -T postgres createdb -U "$POSTGRES_USER" "$test_db"
compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$test_db" --no-owner --no-privileges < "$dump_file"

table_count="$(compose exec -T postgres psql -U "$POSTGRES_USER" -d "$test_db" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")"
migration_count="$(compose exec -T postgres psql -U "$POSTGRES_USER" -d "$test_db" -Atc 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;')"

[ "$table_count" -ge 10 ] || { echo "Restored schema has too few tables: $table_count" >&2; exit 1; }
[ "$migration_count" -ge 4 ] || { echo "Restored migration history is incomplete: $migration_count" >&2; exit 1; }

cleanup
trap - EXIT INT TERM
echo "Restore test passed: $table_count tables, $migration_count migrations, media archive valid"
