#!/usr/bin/env sh
set -eu

printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -base64 36 | tr -d '\n')"
printf 'VALKEY_PASSWORD=%s\n' "$(openssl rand -base64 36 | tr -d '\n')"
printf 'BETTER_AUTH_SECRET=%s\n' "$(openssl rand -base64 48 | tr -d '\n')"
