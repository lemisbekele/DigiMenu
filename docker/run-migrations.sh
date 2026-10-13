#!/usr/bin/env bash
set -euo pipefail

echo "=============================================="
echo " DigiMenu Self-Hosted Migration Runner"
echo "=============================================="

DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-postgres}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/migrations}"
SEED_FILE="${SEED_FILE:-/supabase/seed.sql}"
SEED_DEMO_DATA="${SEED_DEMO_DATA:-false}"

echo "Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT}..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"; do
  sleep 1
done
echo "PostgreSQL is ready!"

# Create migrations tracking table if not present
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<-EOSQL
  CREATE TABLE IF NOT EXISTS public._digimenu_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz DEFAULT now()
  );
EOSQL

# Run all migration files in alphabetical/timestamp order
for f in $(ls -1 "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
  filename=$(basename "$f")
  already_run=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -c "SELECT count(*) FROM public._digimenu_migrations WHERE version = '$filename';")

  if [ "$already_run" -eq 0 ]; then
    echo "--> Applying migration: $filename"
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$f"
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "INSERT INTO public._digimenu_migrations (version) VALUES ('$filename');"
    echo "    ✓ Completed: $filename"
  else
    echo "    (already applied: $filename)"
  fi
done

# Optionally apply seed data if requested
if [ "$SEED_DEMO_DATA" = "true" ] && [ -f "$SEED_FILE" ]; then
  seed_run=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -c "SELECT count(*) FROM public._digimenu_migrations WHERE version = 'seed.sql';")
  if [ "$seed_run" -eq 0 ]; then
    echo "--> Seeding local demo accounts..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SEED_FILE" || echo "Warning: Seed reported conflicts, continuing."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "INSERT INTO public._digimenu_migrations (version) VALUES ('seed.sql');"
    echo "    ✓ Demo seed applied"
  fi
fi

echo "=============================================="
echo " All migrations are up to date! System ready."
echo "=============================================="
