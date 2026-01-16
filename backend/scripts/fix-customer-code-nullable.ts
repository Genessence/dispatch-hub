import { query } from '../src/config/database';

async function fixCustomerCodeNullable() {
  try {
    console.log('🔧 Making customer_code nullable in schedule_items table...');
    
    // Check if column exists and is NOT NULL
    const checkResult = await query(`
      SELECT 
        column_name, 
        is_nullable,
        data_type
      FROM information_schema.columns 
      WHERE table_name = 'schedule_items' 
      AND column_name = 'customer_code'
    `);
    
    if (checkResult.rows.length === 0) {
      console.log('⚠️  customer_code column not found in schedule_items table');
      return;
    }
    
    const column = checkResult.rows[0];
    console.log(`Current state: customer_code is ${column.is_nullable === 'NO' ? 'NOT NULL' : 'NULLABLE'}`);
    
    if (column.is_nullable === 'NO') {
      // Make it nullable
      await query('ALTER TABLE schedule_items ALTER COLUMN customer_code DROP NOT NULL');
      console.log('✅ Successfully made customer_code nullable');
    } else {
      console.log('✅ customer_code is already nullable');
    }
    
    // Add comment
    await query(`
      COMMENT ON COLUMN schedule_items.customer_code IS 
      'Customer code (optional - schedule files no longer contain customer codes, matching is done globally by PART NUMBER)'
    `);
    console.log('✅ Added comment to customer_code column');
    
    console.log('\n✅ Migration 007 completed successfully!');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.code === '42P16') {
      console.error('⚠️  This error is related to a view, not the column. The column should still be updated.');
    }
    throw error;
  }
}

fixCustomerCodeNullable()
  .then(() => {
    console.log('\n💡 You can now upload schedule files without customer codes.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed to fix customer_code column');
    process.exit(1);
  });

