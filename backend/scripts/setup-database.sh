#!/bin/bash
# Complete database setup script
# This script creates the database and runs all migrations

set -e  # Exit on error

echo "🚀 Dispatch Hub Database Setup"
echo "================================"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "   Please create a .env file with DATABASE_URL"
    exit 1
fi

# Load .env file
export $(cat .env | grep -v '^#' | xargs)

if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL not found in .env file"
    exit 1
fi

echo "✅ Found DATABASE_URL"
echo ""

# Step 1: Create database (if needed)
echo "📦 Step 1: Creating database (if needed)..."
npm run db:create || echo "⚠️  Database may already exist, continuing..."

echo ""
echo "📦 Step 2: Running migrations..."
npm run db:migrate

echo ""
echo "📦 Step 3: Verifying setup..."
npm run db:test

echo ""
echo "✅ Database setup complete!"
echo "💡 You can now start the backend server with: npm run dev"

