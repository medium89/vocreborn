#!/bin/sh
set -eu

base_url="${1:-}"
if [ -z "$base_url" ]; then
  : "${DOMAIN:?Pass base URL or set DOMAIN}"
  base_url="https://$DOMAIN"
fi

endpoint="${base_url%/}/api/health/ready"
if response="$(curl --fail --silent --show-error --max-time 15 "$endpoint")"; then
  echo "VOC++ ready: $response"
  exit 0
fi

message="VOC++ readiness failed: $endpoint"
echo "$message" >&2

if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
  curl --fail --silent --show-error --max-time 15     -H "Content-Type: application/json"     --data "{"text":"$message"}"     "$ALERT_WEBHOOK_URL" >/dev/null
fi
exit 1
