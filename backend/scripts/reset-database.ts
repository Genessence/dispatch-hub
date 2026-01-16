import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/dispatch_hub';

async function resetDatabase() {
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

    console.log('\n🗑️  Truncating all tables...');
    
    // Truncate all tables in a single atomic operation with RESTART IDENTITY
    // CASCADE handles foreign key constraints automatically
    // RESTART IDENTITY resets any sequences/auto-increment counters
    await client.query(`
      TRUNCATE TABLE 
        mismatch_alerts,
        validated_barcodes,
        invoice_items,
        invoices,
        schedule_items,
        gatepasses,
        logs,
        user_selections,
        users
      RESTART IDENTITY CASCADE;
    `);
    
    console.log('✅ All tables truncated');

    // Re-seed default users (from migration)
    console.log('\n🌱 Re-seeding default users...');
    await client.query(`
      INSERT INTO users (username, password_hash, role)
      VALUES 
        ('admin', '$2a$10$knVv/OqIGuH1aYv2btJ9eecGjSaf2bEEh4N53rgKthknL6PrTzPHW', 'admin'),
        ('user', '$2a$10$knVv/OqIGuH1aYv2btJ9eecGjSaf2bEEh4N53rgKthknL6PrTzPHW', 'user')
      ON CONFLICT (username) DO NOTHING;
    `);
    
    console.log('✅ Default users re-seeded');
    console.log('\n✅ Database reset complete!');
    console.log('📝 Default login credentials:');
    console.log('   Username: admin (or user)');
    console.log('   Password: pass123');
    
  } catch (error: any) {
    console.error('❌ Reset failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

resetDatabase();

