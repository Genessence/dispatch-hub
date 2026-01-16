import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/dispatch_hub';

async function runMigrations() {
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
    const migrationFiles = [
      '001_initial.sql',
      '002_enhance_validated_barcodes.sql',
      '003_enhance_gatepass_invoices.sql',
      '004_bin_quantity_tracking.sql',
      '005_add_schedule_quantity.sql',
      '006_add_schedule_customer_part_index.sql',
      '007_make_schedule_customer_code_nullable.sql',
      '008_add_validation_step_to_mismatch_alerts.sql',
      '009_add_scanner_preferences.sql'
    ];

    for (const migrationFile of migrationFiles) {
      const migrationPath = path.join(migrationsDir, migrationFile);
      
      if (!fs.existsSync(migrationPath)) {
        console.log(`⚠️  Migration file not found: ${migrationFile}, skipping...`);
        continue;
      }

      console.log(`\n📄 Running migration: ${migrationFile}...`);
      
      try {
        const sql = fs.readFileSync(migrationPath, 'utf8');
        
        // Execute the entire SQL file as-is (PostgreSQL can handle multi-statement files)
        // Split by semicolon only for complex multi-statement scenarios
        await client.query(sql);
        
        console.log(`✅ Successfully ran ${migrationFile}`);
      } catch (error: any) {
        // Ignore errors for columns that already exist (IF NOT EXISTS)
        if (error.message?.includes('already exists') || error.message?.includes('duplicate')) {
          console.log(`⚠️  Migration ${migrationFile} had some conflicts (columns may already exist), continuing...`);
        } else {
          console.error(`❌ Error running ${migrationFile}:`, error.message);
          console.error(`   Full error:`, error);
          throw error;
        }
      }
    }

    // Verify tables were created
    console.log('\n🔍 Verifying tables...');
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
      console.log('⚠️  No tables found - migrations may have failed');
    }
    
    // Verify users table exists and has default users
    console.log('\n🔍 Verifying users table...');
    try {
      const usersResult = await client.query('SELECT COUNT(*) as count FROM users');
      const userCount = parseInt(usersResult.rows[0].count);
      console.log(`✅ Users table exists with ${userCount} user(s)`);
      
      if (userCount === 0) {
        console.log('⚠️  No users found - default users may need to be created');
      } else {
        const userList = await client.query('SELECT username, role FROM users');
        console.log('   Users:');
        userList.rows.forEach((user: any) => {
          console.log(`     - ${user.username} (${user.role})`);
        });
      }
    } catch (userError: any) {
      console.error('❌ Error checking users table:', userError.message);
    }
    
    console.log('\n✅ All migrations completed successfully!');
    console.log('💡 Your database is ready! You can now start the backend server.');
    console.log('💡 Default login credentials:');
    console.log('   Username: admin, Password: pass123');
    console.log('   Username: user, Password: pass123');
  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('   Error Code:', error.code || 'N/A');
    console.error('   Full error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();

