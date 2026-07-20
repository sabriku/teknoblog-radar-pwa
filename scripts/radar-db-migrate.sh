#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/teknoblog-radar"
ENV_FILE="${APP_DIR}/.env"

set_signal_webhook() {
  local webhook=""
  local tmp_file=""
  local found=0

  IFS= read -r webhook || true
  case "$webhook" in
    https://hooks.slack.com/services/*) ;;
    *)
      echo "Invalid Slack incoming webhook URL" >&2
      exit 64
      ;;
  esac

  if [ ! -f "$ENV_FILE" ]; then
    echo "Missing runtime environment file: $ENV_FILE" >&2
    exit 66
  fi

  tmp_file="$(mktemp "${ENV_FILE}.tmp.XXXXXX")"
  trap 'rm -f "$tmp_file"' EXIT

  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      SLACK_SINYAL_WEBHOOK_URL=*)
        printf 'SLACK_SINYAL_WEBHOOK_URL=%s\n' "$webhook" >> "$tmp_file"
        found=1
        ;;
      *) printf '%s\n' "$line" >> "$tmp_file" ;;
    esac
  done < "$ENV_FILE"

  if [ "$found" -eq 0 ]; then
    printf '\nSLACK_SINYAL_WEBHOOK_URL=%s\n' "$webhook" >> "$tmp_file"
  fi

  chown --reference="$ENV_FILE" "$tmp_file"
  chmod --reference="$ENV_FILE" "$tmp_file"
  mv -f "$tmp_file" "$ENV_FILE"
  trap - EXIT

  pm2 restart teknoblog-radar --update-env >/dev/null
  echo "Slack #sinyal runtime configuration updated"
}

case "${1:-}" in
  --set-slack-signal-webhook) set_signal_webhook ;;
  *)
    echo "Usage: $0 --set-slack-signal-webhook" >&2
    exit 64
    ;;
esac
