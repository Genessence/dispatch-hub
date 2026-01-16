import { query } from '../src/config/database';

async function checkScheduleDates() {
  try {
    console.log('🔍 Checking schedule items in database...\n');
    
    // Check for January 15, 2026 specifically
    const jan15Result = await query(`
      SELECT 
        delivery_date,
        delivery_time,
        part_number,
        unloading_loc,
        customer_code
      FROM schedule_items
      WHERE delivery_date = '2026-01-15'
      ORDER BY delivery_time
      LIMIT 10
    `);
    
    console.log(`📅 Schedule items for January 15, 2026: ${jan15Result.rows.length}\n`);
    
    if (jan15Result.rows.length > 0) {
      console.log('✅ Found January 15, 2026 in database!');
      console.log('Sample items:');
      jan15Result.rows.slice(0, 5).forEach((row: any, i: number) => {
        console.log(`  ${i + 1}. Date: ${row.delivery_date}, Time: ${row.delivery_time}, Part: ${row.part_number}, Loc: ${row.unloading_loc}, Customer Code: ${row.customer_code || 'NULL'}`);
      });
    } else {
      console.log('❌ January 15, 2026 NOT found in database');
    }
    
    // Get all unique delivery dates
    const datesResult = await query(`
      SELECT DISTINCT delivery_date
      FROM schedule_items
      WHERE delivery_date IS NOT NULL
      ORDER BY delivery_date
    `);
    
    console.log(`\n📆 All unique delivery dates in database (${datesResult.rows.length}):`);
    datesResult.rows.forEach((row: any) => {
      console.log(`  - ${row.delivery_date}`);
    });
    
    // Check total schedule items
    const totalResult = await query(`
      SELECT COUNT(*) as total
      FROM schedule_items
    `);
    
    console.log(`\n📊 Total schedule items in database: ${totalResult.rows[0].total}`);
    
    // Check customer_code values
    const customerCodeResult = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN customer_code IS NULL THEN 1 END) as null_count,
        COUNT(CASE WHEN customer_code IS NOT NULL AND customer_code != '' THEN 1 END) as has_value
      FROM schedule_items
    `);
    
    const stats = customerCodeResult.rows[0];
    console.log(`\n👤 Customer Code Stats:`);
    console.log(`  Total items: ${stats.total}`);
    console.log(`  NULL customer_code: ${stats.null_count}`);
    console.log(`  Has customer_code value: ${stats.has_value}`);
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

checkScheduleDates()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed to check schedule dates');
    process.exit(1);
  });

