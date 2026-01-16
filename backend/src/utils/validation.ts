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
}

/**
 * Validates invoice items against schedule items
 * Matches customer_item (invoice) with part_number (schedule) - case-sensitive exact match
 * Global matching (no customer code filtering) - schedule items no longer have customer codes
 * 
 * @param client - Database client (from transaction)
 * @returns Validation statistics
 */
export async function validateInvoiceItemsAgainstSchedule(client: PoolClient): Promise<ValidationStats> {
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
      part_number
    FROM schedule_items
    WHERE part_number IS NOT NULL AND part_number != ''
  `);

  // Create a global Set of all part_numbers (no customer code grouping)
  const schedulePartNumbers = new Set<string>();
  scheduleItemsResult.rows.forEach((row: any) => {
    const partNumber = String(row.part_number).trim();
    if (partNumber) {
      schedulePartNumbers.add(partNumber);
    }
  });

  const stats: ValidationStats = {
    matchedCount: 0,
    unmatchedCount: 0,
    errorCount: 0
  };

  // Validate each invoice item
  for (const item of invoiceItemsResult.rows) {
    const invoiceItemId = item.id;
    const customerItem = item.customer_item ? String(item.customer_item).trim() : '';

    let status: 'valid-matched' | 'valid-unmatched' | 'error';
    let errorMessage: string | null = null;

    // Check if customer_item is missing (validation error per requirements)
    if (!customerItem) {
      status = 'error';
      errorMessage = 'Missing Customer Item';
      stats.errorCount++;
    } else {
      // Global matching: Check if Customer Item matches any PART NUMBER in schedule
      if (schedulePartNumbers.has(customerItem)) {
        // Exact case-sensitive match found
        status = 'valid-matched';
        errorMessage = null;
        stats.matchedCount++;
      } else {
        // Customer item exists but no matching part_number found in schedule
        status = 'valid-unmatched';
        errorMessage = null;
        stats.unmatchedCount++;
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

  return stats;
}

