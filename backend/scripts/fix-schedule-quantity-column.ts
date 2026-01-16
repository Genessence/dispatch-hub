import { query } from '../src/config/database';

async function fixScheduleQuantityColumn() {
  try {
    console.log('🔧 Adding quantity column to schedule_items table...');
    
    // Check if column exists
    const checkResult = await query(`
      SELECT 
        column_name, 
        data_type,
        is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'schedule_items' 
      AND column_name = 'quantity'
    `);
    
    if (checkResult.rows.length > 0) {
      console.log('✅ quantity column already exists');
      return;
    }
    
    // Add the column
    await query(`
      ALTER TABLE schedule_items 
      ADD COLUMN quantity INTEGER
    `);
    console.log('✅ Successfully added quantity column');
    
    // Add comment
    await query(`
      COMMENT ON COLUMN schedule_items.quantity IS 
      'Quantity required for this part number from the schedule file'
    `);
    console.log('✅ Added comment to quantity column');
    
    console.log('\n✅ Migration 005 (quantity column) completed successfully!');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.code === '42701') {
      console.log('⚠️  Column may already exist with a different name');
    }
    throw error;
  }
}

fixScheduleQuantityColumn()
  .then(() => {
    console.log('\n💡 Schedule items can now store quantity values.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed to add quantity column');
    process.exit(1);
  });

