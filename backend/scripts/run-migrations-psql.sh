#!/bin/bash
# Run migrations using psql directly
# Usage: ./run-migrations-psql.sh

# Get DATABASE_URL from .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL not found in .env file"
    exit 1
fi

echo "📄 Running migrations..."
echo "Database: $DATABASE_URL"

# Run each migration
psql "$DATABASE_URL" -f migrations/002_enhance_validated_barcodes.sql
psql "$DATABASE_URL" -f migrations/003_enhance_gatepass_invoices.sql

echo "✅ Migrations completed!"

