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

console.log('🔍 Testing database connection...');
console.log('📍 Connection string (masked):', DATABASE_URL.replace(/:([^:@]+)@/, ':****@'));

const isRDS = DATABASE_URL.includes('rds.amazonaws.com');

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: isRDS ? {
    rejectUnauthorized: false
  } : false,
  connectionTimeoutMillis: 30000, // Increased to 30 seconds
  query_timeout: 30000,
});

async function testConnection() {
  try {
    console.log('\n📡 Attempting to connect...');
    await client.connect();
    console.log('✅ Successfully connected to database!');
    
    // Test query
    console.log('\n🔍 Testing query...');
    const result = await client.query('SELECT NOW() as current_time, current_database() as database_name, current_user as username');
    console.log('✅ Query successful!');
    console.log('   Current Time:', result.rows[0].current_time);
    console.log('   Database Name:', result.rows[0].database_name);
    console.log('   Username:', result.rows[0].username);
    
    // Test if tables exist
    console.log('\n🔍 Checking if tables exist...');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    if (tablesResult.rows.length > 0) {
      console.log(`✅ Found ${tablesResult.rows.length} table(s):`);
      tablesResult.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
    } else {
      console.log('⚠️  No tables found in database (database might be empty)');
    }
    
    await client.end();
    console.log('\n✅ Connection test completed successfully!');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Connection failed!');
    console.error('\n📋 Error Details:');
    console.error('   Error Code:', error.code || 'N/A');
    console.error('   Error Message:', error.message || 'N/A');
    
    if (error.code === '28P01') {
      console.error('\n💡 This is a password authentication error.');
      console.error('   Possible causes:');
      console.error('   1. Password is incorrect');
      console.error('   2. Username is incorrect');
      console.error('   3. Special characters in password need URL encoding (@ → %40)');
      console.error('\n   💡 Make sure your password is correctly URL-encoded in the connection string');
    } else if (error.code === '3D000') {
      console.error('\n💡 Database does not exist.');
      console.error('   You need to create the database first.');
      console.error('   Connect to the default "postgres" database and run:');
      console.error('   CREATE DATABASE dispatch_hub;');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Connection refused.');
      console.error('   Possible causes:');
      console.error('   1. Database server is not running');
      console.error('   2. Wrong host/port in connection string');
      console.error('   3. Firewall blocking the connection');
    } else if (error.code === 'ENOTFOUND') {
      console.error('\n💡 Host not found.');
      console.error('   Check if the database host name is correct');
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ETIMEOUT' || error.message?.includes('timeout')) {
      console.error('\n💡 Connection timeout.');
      console.error('   This means the database server is not responding or blocking the connection.');
      console.error('\n   Most likely cause: AWS RDS Security Group is blocking your IP address.');
      console.error('\n   🔧 How to fix:');
      console.error('   1. Go to AWS Console → RDS → Databases');
      console.error('   2. Select your database: database-1.cziwamu2kjmf.eu-north-1.rds.amazonaws.com');
      console.error('   3. Click on the "Connectivity & security" tab');
      console.error('   4. Find the "Security" section and click on the Security Group');
      console.error('   5. Click "Edit inbound rules"');
      console.error('   6. Add a new rule:');
      console.error('      - Type: PostgreSQL');
      console.error('      - Port: 5432');
      console.error('      - Source: My IP (or 0.0.0.0/0 for testing - NOT recommended for production)');
      console.error('   7. Save the rules');
      console.error('\n   ⚠️  Note: It may take a few minutes for security group changes to take effect.');
      console.error('\n   Alternative: If you cannot modify security groups, the database might be in a private subnet');
      console.error('   and requires a VPN or bastion host to access.');
    } else if (error.message && error.message.includes('SSL')) {
      console.error('\n💡 SSL/TLS connection error.');
      console.error('   The connection string might be missing SSL configuration');
    }
    
    console.error('\n📋 Full error:');
    console.error(error);
    
    process.exit(1);
  }
}

testConnection();

