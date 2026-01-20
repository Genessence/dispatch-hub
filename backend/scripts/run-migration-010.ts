import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/dispatch_hub';

async function runMigration010() {
  const isRemote = DATABASE_URL.includes('amazonaws.com') || 
                   DATABASE_URL.includes('rds.amazonaws.com') || 
                   (DATABASE_URL.match(/\./g) || []).length > 3;
  
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

    const migrationPath = path.join(__dirname, '../migrations/010_doc_audit_dual_counters.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: 010_doc_audit_dual_counters.sql`);
      process.exit(1);
    }

    console.log(`\n📄 Running migration: 010_doc_audit_dual_counters.sql...`);
    
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await client.query(sql);
    
    console.log(`✅ Successfully ran 010_doc_audit_dual_counters.sql`);
    console.log('\n✅ Migration completed successfully!');
  } catch (error: any) {
    if (error.message?.includes('already exists') || error.message?.includes('duplicate')) {
      console.log(`⚠️  Migration had some conflicts (columns may already exist), but continuing...`);
      console.log(`✅ Migration check completed`);
    } else {
      console.error(`❌ Error running migration:`, error.message);
      throw error;
    }
  } finally {
    await client.end();
  }
}

runMigration010().catch((error) => {
  console.error('\n❌ Migration failed:', error.message);
  process.exit(1);
});

