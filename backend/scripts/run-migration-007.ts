import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/dispatch_hub';

async function runMigration007() {
  const isRemote = DATABASE_URL.includes('amazonaws.com') || 
                   DATABASE_URL.includes('rds.amazonaws.com');
  
  console.log(`🔌 Connecting to database...`);
  
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: isRemote ? {
      rejectUnauthorized: false
    } : false,
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    const migrationPath = path.join(__dirname, '../migrations/007_make_schedule_customer_code_nullable.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }

    console.log(`\n📄 Running migration: 007_make_schedule_customer_code_nullable.sql...`);
    
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await client.query(sql);
    
    console.log(`✅ Successfully ran migration 007`);
    console.log('💡 customer_code column is now nullable in schedule_items table');
  } catch (error: any) {
    if (error.message?.includes('does not exist') || error.message?.includes('already')) {
      console.log(`⚠️  Migration may have already been applied or column doesn't exist: ${error.message}`);
    } else {
      console.error(`❌ Error running migration:`, error.message);
      throw error;
    }
  } finally {
    await client.end();
  }
}

runMigration007().catch(console.error);

