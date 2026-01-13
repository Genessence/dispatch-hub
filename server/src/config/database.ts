import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Database connection configuration
// For AWS RDS, SSL is required - parse connection string and add SSL options
let connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/dispatch_hub';
const isRDS = connectionString.includes('rds.amazonaws.com');

// Remove sslmode from connection string if present (we'll handle SSL in pg config)
connectionString = connectionString.replace(/[?&]sslmode=[^&]*/, '');

const pool = new Pool({
  connectionString,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Increased timeout for RDS connections
  // SSL configuration for AWS RDS - RDS uses self-signed certificates
  ...(isRDS && {
    ssl: {
      rejectUnauthorized: false // Accept self-signed certificates from AWS RDS
    }
  })
});

// Test database connection
pool.on('connect', () => {
  console.log('📦 Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle PostgreSQL client:', err);
  process.exit(-1);
});

// Helper function to execute queries
export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Query executed:', { text: text.substring(0, 50), duration: `${duration}ms`, rows: result.rowCount });
    }
    return result;
  } catch (error) {
    console.error('❌ Database query error:', error);
    throw error;
  }
};

// Get a client from the pool for transactions
export const getClient = async (): Promise<PoolClient> => {
  const client = await pool.connect();
  return client;
};

// Transaction helper
export const transaction = async <T>(callback: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Check if database is connected
export const checkConnection = async (): Promise<boolean> => {
  try {
    await pool.query('SELECT NOW()');
    return true;
  } catch (error) {
    console.error('❌ Database connection check failed:', error);
    return false;
  }
};

// Close the pool (for graceful shutdown)
export const closePool = async (): Promise<void> => {
  await pool.end();
  console.log('📦 PostgreSQL pool closed');
};

export default pool;

