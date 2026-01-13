# Database Connection Verification Steps

## Current Status
✅ SSL configuration is working
✅ Database connection code is properly configured
❌ Password authentication is failing

## Error Code: 28P01 - Password Authentication Failed

This means either:
- Username is incorrect
- Password is incorrect  
- Password contains special characters that need URL encoding

## Steps to Fix

### 1. Verify Your AWS RDS Credentials

Check your AWS RDS console to confirm:
- **Username**: Should match what's in `.env` file
- **Password**: Should match exactly (case-sensitive)

### 2. If Password Has Special Characters

If your password contains special characters like `@`, `#`, `$`, `%`, `&`, `+`, etc., they need to be URL encoded:

- `@` → `%40`
- `#` → `%23`
- `$` → `%24`
- `%` → `%25`
- `&` → `%26`
- `+` → `%2B`
- `/` → `%2F`
- `?` → `%3F`
- `=` → `%3D`

**Example:** If password is `my@pass#123`, it should be `my%40pass%23123` in the connection string.

### 3. Test Connection Once Credentials Are Correct

After updating the password in `.env`, test with:

```bash
cd server
npx ts-node test-db-connection.ts
```

### 4. Create Database (if it doesn't exist)

If authentication works but database doesn't exist, connect to default `postgres` database first:

```bash
# Update .env temporarily to use 'postgres' database
DATABASE_URL=postgresql://YOUR_USER:YOUR_PASS@database-1.cdo6a6sw8q9b.eu-north-1.rds.amazonaws.com:5432/postgres

# Or use psql directly:
psql "postgresql://YOUR_USER:YOUR_PASS@database-1.cdo6a6sw8q9b.eu-north-1.rds.amazonaws.com:5432/postgres" -c "CREATE DATABASE dispatch_hub;"
```

### 5. Run Migration

Once database exists and credentials work:

```bash
cd server
psql "postgresql://YOUR_USER:YOUR_PASS@database-1.cdo6a6sw8q9b.eu-north-1.rds.amazonaws.com:5432/dispatch_hub" -f migrations/001_initial.sql
```

Or use Node.js migration script (once connection works):
```bash
npm run db:migrate
```

## Current .env Configuration

Your `.env` file should have:
```bash
DATABASE_URL=postgresql://autolivdispatch:YOUR_CORRECT_PASSWORD@database-1.cdo6a6sw8q9b.eu-north-1.rds.amazonaws.com:5432/dispatch_hub
```

**Note:** SSL is handled automatically by the Node.js pg library - don't add `?sslmode=require` to the connection string.

