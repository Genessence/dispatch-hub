import { PoolClient } from 'pg';

/**
 * Validation result for a single invoice item
 */
export interface ValidationResult {
  invoiceItemId: string;
  status: 'valid-matched' | 'valid-unmatched' | 'error';
  errorMessage: string | null;
}

/**
 * Validation statistics
 */
export interface ValidationStats {
  matchedCount: number;
  unmatchedCount: number;
  errorCount: number;
  diagnostics?: {
    totalInvoiceItems: number;
    totalSchedulePartNumbers: number;
    sampleInvoiceItems: string[];
    sampleSchedulePartNumbers: string[];
    sampleMatches: Array<{ customerItem: string; partNumber: string }>;
    sampleUnmatched: Array<{ customerItem: string; reason: string }>;
  };
}

/**
 * Normalize a value for matching
 * - Trims leading/trailing whitespace
 * - Collapses multiple spaces to single space
 * - Converts to string if needed
 * - Handles empty/null values
 */
function normalizeForMatching(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  // Convert to string, trim, and collapse multiple spaces
  return String(value).trim().replace(/\s+/g, ' ');
}

/**
 * Validates invoice items against schedule items
 * Matches customer_item (invoice) with part_number (schedule) with normalization
 * Global matching (no customer code filtering) - schedule items no longer have customer codes
 * 
 * @param client - Database client (from transaction)
 * @returns Validation statistics with diagnostics
 */
export async function validateInvoiceItemsAgainstSchedule(client: PoolClient): Promise<ValidationStats> {
  console.log('\n🔍 ===== VALIDATION: Starting =====');
  
  // Get all invoice items
  const invoiceItemsResult = await client.query(`
    SELECT 
      ii.id,
      ii.invoice_id,
      ii.customer_item
    FROM invoice_items ii
  `);

  // Get all schedule items with part_number (no customer code filtering)
  const scheduleItemsResult = await client.query(`
    SELECT 
      part_number,
      quantity,
      customer_part
    FROM schedule_items
    WHERE part_number IS NOT NULL AND part_number != ''
    ORDER BY part_number
  `);

  console.log(`📊 Invoice items to validate: ${invoiceItemsResult.rows.length}`);
  console.log(`📊 Schedule part numbers available: ${scheduleItemsResult.rows.length}`);
  
  // Debug: Log specific part numbers from database
  const debugPartNumbers = ['73112M66T00', '73910M66T00'];
  console.log('\n🔍 DEBUG: Checking database for specific part numbers:');
  debugPartNumbers.forEach(partNum => {
    const found = scheduleItemsResult.rows.filter((row: any) => {
      const dbPartNum = String(row.part_number || '').trim();
      return dbPartNum === partNum.trim();
    });
    console.log(`  "${partNum}": Found ${found.length} row(s) in database`);
    if (found.length > 0) {
      found.forEach((row: any, idx: number) => {
        console.log(`    Row ${idx + 1}: part_number="${row.part_number}", quantity=${row.quantity}, customer_part="${row.customer_part}"`);
        console.log(`    Raw part_number type: ${typeof row.part_number}, value:`, JSON.stringify(row.part_number));
      });
    } else {
      // Check for similar values
      const similar = scheduleItemsResult.rows.filter((row: any) => {
        const dbPartNum = String(row.part_number || '').trim();
        return dbPartNum.includes(partNum.substring(0, 5)) || partNum.includes(dbPartNum.substring(0, 5));
      });
      if (similar.length > 0) {
        console.log(`    Similar values found:`, similar.map((r: any) => r.part_number));
      }
    }
  });

  // Create a mapping from normalized part_number to original value(s) for debugging
  const schedulePartNumbers = new Set<string>();
  const normalizedToOriginal = new Map<string, string[]>();
  
  scheduleItemsResult.rows.forEach((row: any) => {
    const originalPartNumber = String(row.part_number || '');
    const normalizedPartNumber = normalizeForMatching(originalPartNumber);
    
    if (normalizedPartNumber) {
      schedulePartNumbers.add(normalizedPartNumber);
      
      // Track original values for diagnostics
      if (!normalizedToOriginal.has(normalizedPartNumber)) {
        normalizedToOriginal.set(normalizedPartNumber, []);
      }
      if (!normalizedToOriginal.get(normalizedPartNumber)!.includes(originalPartNumber)) {
        normalizedToOriginal.get(normalizedPartNumber)!.push(originalPartNumber);
      }
    }
  });

  // Get unique schedule part numbers for diagnostics
  const uniqueSchedulePartNumbers = Array.from(schedulePartNumbers);
  console.log(`📊 Unique normalized schedule part numbers: ${uniqueSchedulePartNumbers.length}`);
  console.log(`📋 Sample schedule part numbers (first 10):`, uniqueSchedulePartNumbers.slice(0, 10));
  
  // Debug: Check for the specific part numbers mentioned by user (debugPartNumbers already declared above)
  debugPartNumbers.forEach(partNum => {
    const normalized = normalizeForMatching(partNum);
    const found = schedulePartNumbers.has(normalized);
    console.log(`\n🔍 DEBUG: Looking for "${partNum}" (normalized: "${normalized}")`);
    console.log(`  Found in schedule: ${found}`);
    if (!found) {
      // Check for similar values
      const similar = uniqueSchedulePartNumbers.filter(p => 
        p.includes(partNum.substring(0, 5)) || partNum.includes(p.substring(0, 5))
      );
      console.log(`  Similar values:`, similar);
    }
  });

  const stats: ValidationStats = {
    matchedCount: 0,
    unmatchedCount: 0,
    errorCount: 0,
    diagnostics: {
      totalInvoiceItems: invoiceItemsResult.rows.length,
      totalSchedulePartNumbers: uniqueSchedulePartNumbers.length,
      sampleInvoiceItems: [],
      sampleSchedulePartNumbers: uniqueSchedulePartNumbers.slice(0, 5),
      sampleMatches: [],
      sampleUnmatched: []
    }
  };

  // Collect unique invoice customer items for diagnostics
  const uniqueInvoiceItems = new Set<string>();

  // Validate each invoice item
  for (const item of invoiceItemsResult.rows) {
    const invoiceItemId = item.id;
    const originalCustomerItem = item.customer_item || '';
    const normalizedCustomerItem = normalizeForMatching(originalCustomerItem);

    // Track unique invoice items
    if (normalizedCustomerItem) {
      uniqueInvoiceItems.add(normalizedCustomerItem);
    }

    let status: 'valid-matched' | 'valid-unmatched' | 'error';
    let errorMessage: string | null = null;

    // Check if customer_item is missing (validation error per requirements)
    if (!normalizedCustomerItem) {
      status = 'error';
      errorMessage = 'Missing Customer Item';
      stats.errorCount++;
      
      // Add to unmatched samples
      if (stats.diagnostics!.sampleUnmatched.length < 5) {
        stats.diagnostics!.sampleUnmatched.push({
          customerItem: originalCustomerItem,
          reason: 'Missing/Empty'
        });
      }
    } else {
      // Global matching: Check if normalized Customer Item matches any normalized PART NUMBER
      const hasMatch = schedulePartNumbers.has(normalizedCustomerItem);
      
      // Enhanced debugging for specific part numbers
      if (normalizedCustomerItem === '73112M66T00' || normalizedCustomerItem === '73910M66T00') {
        console.log(`\n🔍 DEBUGGING MATCH for "${normalizedCustomerItem}":`);
        console.log(`  Original value: "${originalCustomerItem}"`);
        console.log(`  Normalized value: "${normalizedCustomerItem}"`);
        console.log(`  Has match: ${hasMatch}`);
        console.log(`  Schedule part numbers set size: ${schedulePartNumbers.size}`);
        console.log(`  Schedule contains this value: ${schedulePartNumbers.has(normalizedCustomerItem)}`);
        
        // Check if there are similar values
        const similarValues = Array.from(schedulePartNumbers).filter(p => 
          p.includes('73112') || p.includes('73910') || 
          normalizedCustomerItem.includes(p.substring(0, 5)) ||
          p.includes(normalizedCustomerItem.substring(0, 5))
        );
        console.log(`  Similar values in schedule:`, similarValues);
        
        // Check exact character-by-character comparison
        const exactMatch = Array.from(schedulePartNumbers).find(p => p === normalizedCustomerItem);
        console.log(`  Exact match found: ${exactMatch ? `"${exactMatch}"` : 'NONE'}`);
        
        // Check for hidden characters
        console.log(`  Customer item length: ${normalizedCustomerItem.length}`);
        console.log(`  Customer item char codes:`, Array.from(normalizedCustomerItem).map(c => c.charCodeAt(0)));
      }
      
      if (hasMatch) {
        // Match found
        status = 'valid-matched';
        errorMessage = null;
        stats.matchedCount++;
        
        // Add to matched samples (first 5)
        if (stats.diagnostics!.sampleMatches.length < 5) {
          const matchedOriginals = normalizedToOriginal.get(normalizedCustomerItem) || [];
          stats.diagnostics!.sampleMatches.push({
            customerItem: originalCustomerItem,
            partNumber: matchedOriginals[0] || normalizedCustomerItem
          });
        }
      } else {
        // Customer item exists but no matching part_number found in schedule
        status = 'valid-unmatched';
        errorMessage = null;
        stats.unmatchedCount++;
        
        // Add to unmatched samples (first 5)
        if (stats.diagnostics!.sampleUnmatched.length < 5) {
          stats.diagnostics!.sampleUnmatched.push({
            customerItem: originalCustomerItem,
            reason: 'No matching part number in schedule'
          });
        }
      }
    }

    // Update the invoice item status
    await client.query(
      `UPDATE invoice_items 
       SET status = $1, error_message = $2 
       WHERE id = $3`,
      [status, errorMessage, invoiceItemId]
    );
  }

  // Add unique invoice items to diagnostics
  stats.diagnostics!.sampleInvoiceItems = Array.from(uniqueInvoiceItems).slice(0, 5);

  // Log validation results
  console.log('\n✅ VALIDATION RESULTS:');
  console.log(`  ✓ Matched: ${stats.matchedCount}`);
  console.log(`  ⚠ Unmatched: ${stats.unmatchedCount}`);
  console.log(`  ✗ Errors: ${stats.errorCount}`);
  console.log(`\n📋 Sample Matches (first 5):`);
  stats.diagnostics!.sampleMatches.forEach(m => {
    console.log(`  "${m.customerItem}" ↔ "${m.partNumber}"`);
  });
  console.log(`\n📋 Sample Unmatched (first 5):`);
  stats.diagnostics!.sampleUnmatched.forEach(u => {
    console.log(`  "${u.customerItem}" - ${u.reason}`);
  });
  console.log('\n🔍 ===== VALIDATION: Complete =====\n');

  return stats;
}

