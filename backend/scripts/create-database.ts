import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set in .env file');
  process.exit(1);
}

console.log('🔍 Creating database...');

// Parse the connection string to connect to default 'postgres' database
const url = new URL(DATABASE_URL.replace('postgresql://', 'http://'));
const isRDS = DATABASE_URL.includes('rds.amazonaws.com');

// Connect to default 'postgres' database to create the new database
const adminConnectionString = `postgresql://${url.username}:${url.password}@${url.hostname}:${url.port || 5432}/postgres`;

console.log('📍 Connecting to default "postgres" database...');
console.log('📍 Connection string (masked):', adminConnectionString.replace(/:([^:@]+)@/, ':****@'));

const client = new Client({
  connectionString: adminConnectionString,
  ssl: isRDS ? {
    rejectUnauthorized: false
  } : false,
  connectionTimeoutMillis: 30000,
});

async function createDatabase() {
  try {
    await client.connect();
    console.log('✅ Connected to "postgres" database');
    
    // Extract database name from original connection string
    const dbName = url.pathname.split('/').filter(Boolean)[0] || 'dispatch_hub';
    
    console.log(`\n🔍 Checking if database "${dbName}" exists...`);
    
    // Check if database already exists
    const checkResult = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName]
    );
    
    if (checkResult.rows.length > 0) {
      console.log(`✅ Database "${dbName}" already exists!`);
      await client.end();
      process.exit(0);
    }
    
    console.log(`\n📦 Creating database "${dbName}"...`);
    
    // Create the database
    // Note: PostgreSQL doesn't allow CREATE DATABASE in a transaction, so we use a direct query
    await client.query(`CREATE DATABASE "${dbName}"`);
    
    console.log(`✅ Database "${dbName}" created successfully!`);
    
    await client.end();
    console.log('\n✅ Database creation completed!');
    console.log('💡 You can now run migrations to create tables: npm run db:migrate');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Failed to create database!');
    console.error('\n📋 Error Details:');
    console.error('   Error Code:', error.code || 'N/A');
    console.error('   Error Message:', error.message || 'N/A');
    
    if (error.code === '42P04') {
      console.error('\n💡 Database already exists!');
      console.error('   The database was created successfully.');
      process.exit(0);
    } else if (error.code === '28P01') {
      console.error('\n💡 Password authentication failed.');
      console.error('   Check your DATABASE_URL credentials in .env file');
    } else if (error.code === '42501') {
      console.error('\n💡 Permission denied.');
      console.error('   The database user does not have permission to create databases.');
      console.error('   You may need to use the master user or create the database manually in AWS RDS console.');
    }
    
    console.error('\n📋 Full error:');
    console.error(error);
    
    process.exit(1);
  }
}

createDatabase();

