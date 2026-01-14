import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/dispatch_hub';

async function runMigration004() {
  // Parse connection string to determine if SSL is needed
  const isRemote = DATABASE_URL.includes('amazonaws.com') || 
                   DATABASE_URL.includes('rds.amazonaws.com') || 
                   (DATABASE_URL.match(/\./g) || []).length > 3; // Has multiple dots (likely remote)
  
  console.log(`🔌 Connecting to database...`);
  if (isRemote) {
    console.log(`📡 Detected remote database, using SSL...`);
  }
  
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: isRemote ? {
      rejectUnauthorized: false // For AWS RDS and remote databases
    } : false, // Disable SSL for local
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    const migrationsDir = path.join(__dirname, '../migrations');
    const migrationFile = '004_bin_quantity_tracking.sql';
    const migrationPath = path.join(migrationsDir, migrationFile);
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationFile}`);
      process.exit(1);
    }

    console.log(`\n📄 Running migration: ${migrationFile}...`);
    
    try {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      await client.query(sql);
      console.log(`✅ Successfully ran ${migrationFile}`);
      console.log('\n✅ Migration 004 completed successfully!');
    } catch (error: any) {
      // Ignore errors for columns that already exist (IF NOT EXISTS)
      if (error.message?.includes('already exists') || error.message?.includes('duplicate')) {
        console.log(`⚠️  Migration ${migrationFile} had some conflicts (columns may already exist), but continuing...`);
        console.log('✅ Migration 004 completed (some columns may already exist)');
      } else {
        console.error(`❌ Error running ${migrationFile}:`, error.message);
        throw error;
      }
    }
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration004();

