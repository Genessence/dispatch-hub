# Dispatch Hub Backend Server

Node.js/Express backend with PostgreSQL database and WebSocket support for real-time updates across multiple devices.

## Prerequisites

1. **Node.js 18+**
2. **PostgreSQL 14+** - Install via Homebrew: `brew install postgresql@16`

## Quick Setup

### 1. Start PostgreSQL

```bash
# Start PostgreSQL service
brew services start postgresql@16

# Create the database
createdb dispatch_hub
```

### 2. Run Database Migration

```bash
cd server

# Run the migration to create tables and seed users
psql -d dispatch_hub -f migrations/001_initial.sql
```

### 3. Configure Environment

Copy `.env.example` to `.env` and update if needed:

```bash
cp .env.example .env
```

Default values work for local development:
- **PORT**: 3001
- **DATABASE_URL**: postgresql://postgres:postgres@localhost:5432/dispatch_hub
- **JWT_SECRET**: Change in production!
- **FRONTEND_URL**: http://localhost:8080

### 4. Install Dependencies & Start

```bash
# Install dependencies
npm install

# Start development server with hot-reload
npm run dev
```

The server will start on `http://localhost:3001`

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with username/password
- `GET /api/auth/verify` - Verify JWT token
- `GET /api/auth/me` - Get current user info
- `PUT /api/auth/selections` - Save user selections

### Invoices
- `GET /api/invoices` - Get all invoices
- `GET /api/invoices/:id` - Get invoice by ID
- `POST /api/invoices/upload` - Upload invoice Excel file
- `DELETE /api/invoices/:id` - Delete invoice

### Schedule
- `GET /api/schedule` - Get schedule items
- `POST /api/schedule/upload` - Upload schedule Excel file
- `DELETE /api/schedule` - Clear all schedule

### Audit
- `PUT /api/audit/:invoiceId` - Update audit status
- `POST /api/audit/:invoiceId/scan` - Record barcode scan
- `GET /api/audit/:invoiceId/scans` - Get scans for invoice
- `POST /api/audit/mismatch` - Report mismatch alert

### Dispatch
- `GET /api/dispatch/ready` - Get invoices ready for dispatch
- `POST /api/dispatch` - Dispatch invoices
- `GET /api/dispatch/gatepasses` - Get all gatepasses
- `GET /api/dispatch/gatepass/:number` - Get gatepass by number

### Logs
- `GET /api/logs` - Get all logs
- `GET /api/logs/upload` - Get upload logs
- `GET /api/logs/audit` - Get audit logs
- `GET /api/logs/dispatch` - Get dispatch logs

### Admin (Admin role only)
- `GET /api/admin/analytics` - Get analytics data
- `GET /api/admin/exceptions` - Get mismatch alerts
- `PUT /api/admin/exceptions/:id` - Approve/reject alert
- `GET /api/admin/master-data` - Get master data
- `GET /api/admin/users` - Get all users

### Health
- `GET /api/health` - Server health check

## WebSocket Events

### Client → Server
- `join:room` - Join customer/site room
- `leave:room` - Leave room
- `audit:scan` - Report scan (for real-time updates)
- `dispatch:loading` - Report loading progress

### Server → Client
- `invoices:updated` - Invoice data changed
- `schedule:updated` - Schedule data changed
- `audit:progress` - Audit progress update
- `audit:scan` - New scan recorded
- `dispatch:completed` - Dispatch completed
- `alert:new` - New mismatch alert
- `alert:resolved` - Alert resolved

## Default Users

| Username | Password | Role  |
|----------|----------|-------|
| admin    | pass123  | admin |
| user     | pass123  | user  |

## Role-Based Access

- **Admin**: Full access to all features including analytics, exceptions, and master data
- **User**: Access to doc audit, dispatch, and upload (limited to their assigned features)

## Folder Structure

```
backend/
├── migrations/           # SQL migration files
├── src/
│   ├── config/          # Database configuration
│   ├── controllers/     # Request handlers
│   ├── middleware/      # Auth & role guards
│   ├── models/          # Data models
│   ├── routes/          # API routes
│   ├── websocket/       # Socket.io handlers
│   └── index.ts         # Server entry point
├── package.json
├── tsconfig.json
└── nodemon.json
```

## Production Deployment

1. Build TypeScript: `npm run build`
2. Set production environment variables
3. Run: `npm start`

For cloud deployment, consider:
- **Database**: Railway PostgreSQL, Supabase, or AWS RDS
- **Server**: Railway, Render, or AWS EC2
- **Update FRONTEND_URL** for CORS in production

