import { Router, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { query, transaction } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { Server as SocketIOServer } from 'socket.io';
import { validateInvoiceItemsAgainstSchedule } from '../utils/validation';

const router = Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Helper function to convert Excel date serial to JS Date
const excelDateToJSDate = (serial: number): Date => {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate());
};

// Helper to parse date from various formats
const parseDate = (dateStr: any): Date | null => {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  if (typeof dateStr === 'number') {
    return excelDateToJSDate(dateStr);
  }
  if (typeof dateStr === 'string') {
    const trimmed = dateStr.trim();
    if (!trimmed) return null;
    
    const dateFormats = [
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
      /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})/,
      /^(\d{1,2})-(\d{1,2})-(\d{4})/,
    ];
    
    for (const format of dateFormats) {
      const match = trimmed.match(format);
      if (match) {
        if (format === dateFormats[0] || format === dateFormats[1]) {
          const [, year, month, day] = match;
          const parsed = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          if (!isNaN(parsed.getTime())) return parsed;
        } else {
          const [, part1, part2, year] = match;
          let parsed = new Date(parseInt(year), parseInt(part1) - 1, parseInt(part2));
          if (!isNaN(parsed.getTime())) return parsed;
          parsed = new Date(parseInt(year), parseInt(part2) - 1, parseInt(part1));
          if (!isNaN(parsed.getTime())) return parsed;
        }
      }
    }
    
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  
  return null;
};

// Helper for case-insensitive column lookup
const getColumnValue = (row: any, variations: string[]): string => {
  for (const variation of variations) {
    if (row[variation] !== undefined && row[variation] !== '') {
      return row[variation];
    }
    const rowKeys = Object.keys(row);
    const matchedKey = rowKeys.find(key => 
      key.toLowerCase().trim() === variation.toLowerCase().trim()
    );
    if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== '') {
      return row[matchedKey];
    }
  }
  return '';
};

// Helper to parse numeric value from quantity columns
const parseQuantity = (value: any): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    return isNaN(value) ? null : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = parseFloat(trimmed);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
};

/**
 * GET /api/schedule
 * Get all schedule items
 */
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { customerCode, deliveryDate } = req.query;
    
    let queryText = 'SELECT * FROM schedule_items WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (customerCode) {
      queryText += ` AND customer_code = $${paramIndex++}`;
      params.push(customerCode);
    }

    if (deliveryDate) {
      queryText += ` AND delivery_date = $${paramIndex++}`;
      params.push(deliveryDate);
    }

    queryText += ' ORDER BY delivery_date, delivery_time';

    const result = await query(queryText, params);

    // Get upload metadata
    const metaResult = await query(
      'SELECT uploaded_by, uploaded_at FROM schedule_items ORDER BY uploaded_at DESC LIMIT 1'
    );
    const metadata = metaResult.rows[0] || {};

    res.json({
      success: true,
      scheduleData: {
        items: result.rows.map((item: any) => ({
          id: item.id,
          customerCode: item.customer_code,
          customerPart: item.customer_part,
          partNumber: item.part_number,
          qadPart: item.qad_part,
          description: item.description,
          snp: item.snp,
          bin: item.bin,
          sheetName: item.sheet_name,
          deliveryDate: item.delivery_date,
          deliveryTime: item.delivery_time,
          plant: item.plant,
          unloadingLoc: item.unloading_loc,
          quantity: item.quantity
        })),
        uploadedAt: metadata.uploaded_at,
        uploadedBy: metadata.uploaded_by
      }
    });
  } catch (error) {
    console.error('Get schedule error:', error);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

/**
 * POST /api/schedule/upload
 * Upload schedule from Excel file
 */
router.post('/upload', authenticateToken, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get customer code from request body (FormData)
    const expectedCustomerCode = req.body.customerCode as string | undefined;

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false, raw: false });
    
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({ error: 'No sheets found in file' });
    }

    const allScheduleItems: any[] = [];
    const isSingleSheet = workbook.SheetNames.length === 1;
    
    // Track filtering statistics
    let totalRowsProcessed = 0;
    let rowsFilteredOut = 0; // Rows where quantity === quantityDispatched
    let rowsExcludedMissingColumns = 0; // Rows with both columns missing

    // Parse each sheet
    workbook.SheetNames.forEach((sheetName: string) => {
      // Skip generic sheet names only if there are multiple sheets
      // If it's a single sheet, process it regardless of name
      if (!isSingleSheet && (sheetName.toLowerCase() === 'sheet1' || sheetName.toLowerCase() === 'sheet2')) {
        return;
      }

      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return;

      try {
        const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
        
        if (!jsonData || jsonData.length === 0) return;

        jsonData.forEach((row: any) => {
          totalRowsProcessed++;
          
          const customerCode = getColumnValue(row, ['Customer Code', 'CustomerCode', 'customer code']) || '';
          const customerPart = getColumnValue(row, ['Custmer Part', 'Customer Part', 'CustomerPart', 'customer part']) || '';
          const partNumber = getColumnValue(row, ['PART NUMBER', 'Part Number', 'PartNumber', 'part number', 'Part_Number']) || '';
          const qadPart = getColumnValue(row, ['QAD part', 'QAD Part', 'QADPart', 'qad part']) || '';
          const description = getColumnValue(row, ['Description', 'description']) || '';
          const snp = parseInt(getColumnValue(row, ['SNP', 'snp']) || '0') || 0;
          const bin = parseInt(getColumnValue(row, ['Bin', 'bin']) || '0') || 0;
          
          // Extract Quantity and Quantity Dispatched columns
          const quantityStr = getColumnValue(row, ['Quantity', 'quantity', 'Qty', 'qty', 'QUANTITY']);
          const quantityDispatchedStr = getColumnValue(row, [
            'Quantity Dispatched', 'QuantityDispatched', 'quantity dispatched', 
            'Qty Dispatched', 'QtyDispatched', 'QUANTITY DISPATCHED'
          ]);
          
          // Parse numeric values
          const quantity = parseQuantity(quantityStr);
          const quantityDispatched = parseQuantity(quantityDispatchedStr);
          
          // Filtering logic:
          // - If BOTH columns are missing: Exclude row (treat as invalid)
          // - If either column is missing: Include row (assume not fully dispatched)
          // - If both present and equal: Exclude row
          // - If both present and not equal: Include row
          
          if (quantity === null && quantityDispatched === null) {
            // Both columns missing - exclude row
            rowsExcludedMissingColumns++;
            console.warn(`Row excluded: Both Quantity and Quantity Dispatched columns missing for part ${partNumber || customerPart}`);
            return; // Skip this row
          }
          
          if (quantity !== null && quantityDispatched !== null) {
            // Both present - compare numeric values
            if (quantity === quantityDispatched) {
              // Quantities match - exclude row
              rowsFilteredOut++;
              console.log(`Row filtered out: Quantity (${quantity}) equals Quantity Dispatched (${quantityDispatched}) for part ${partNumber || customerPart}`);
              return; // Skip this row
            }
            // Quantities don't match - include row (continue processing)
          }
          // If either column is missing, include row (assume not fully dispatched)
          
          const deliveryDateTime = getColumnValue(row, [
            'SUPPLY DATE', 'Supply Date', 'SupplyDate', 'supply date',
            'Delivery Date & Time', 'Delivery Date and Time', 'DeliveryDateTime', 
            'Delivery Date', 'delivery date'
          ]);
          
          const supplyTime = getColumnValue(row, [
            'Supply Time', 'SupplyTime', 'SUPPLY TIME', 'supply time',
            'Delivery Time', 'DeliveryTime', 'delivery time'
          ]);
          
          const deliveryDate = parseDate(deliveryDateTime);
          
          let timeStr: string | null = null;
          if (supplyTime) {
            timeStr = supplyTime.toString();
          } else if (deliveryDateTime && typeof deliveryDateTime === 'string') {
            const timeMatch = deliveryDateTime.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/);
            if (timeMatch) {
              timeStr = timeMatch[1];
            }
          }
          
          const plant = getColumnValue(row, [
            'Plant', 'plant', 'PLANT', 'Plant Code', 'PlantCode',
            'Delivery Location', 'DeliveryLocation', 'delivery location'
          ]);
          
          const unloadingLoc = getColumnValue(row, [
            'UNLOADING LOC', 'UnloadingLoc', 'Unloading Location', 'UnloadingLocation',
            'Unload Location', 'UnloadLocation', 'Location', 'unloading loc',
            'unloading location', 'unload location', 'location', 'LOCATION'
          ]);
          
          // Schedule files no longer contain customer code - include all items with part number
          // Only require part number to be present for the item to be valid
          if (partNumber) {
            allScheduleItems.push({
              customerCode: customerCode ? customerCode.toString() : null, // Nullable now - migration 007 has been applied
              customerPart: customerPart.toString(),
              partNumber: partNumber.toString(),
              qadPart: qadPart.toString(),
              description: description.toString(),
              snp,
              bin,
              sheetName,
              deliveryDate,
              deliveryTime: timeStr,
              plant: plant ? plant.toString() : null,
              unloadingLoc: unloadingLoc ? unloadingLoc.toString() : null,
              quantity: quantity !== null ? Math.round(quantity) : null // Store as integer
            });
          }
        });
      } catch (sheetError) {
        console.error(`Error parsing sheet ${sheetName}:`, sheetError);
      }
    });

    // Customer code validation removed - schedule files no longer contain customer codes
    // Schedule items are matched globally by PART NUMBER only
    // No need to validate customer codes since they don't exist in schedule files

    // Insert into database using transaction
    let validationStats;
    await transaction(async (client) => {
      // Clear existing schedule
      await client.query('DELETE FROM schedule_items');

      // Insert new items
      console.log(`Inserting ${allScheduleItems.length} schedule items into database...`);
      for (let i = 0; i < allScheduleItems.length; i++) {
        const item = allScheduleItems[i];
        try {
        await client.query(
          `INSERT INTO schedule_items 
           (customer_code, customer_part, part_number, qad_part, description, snp, bin, sheet_name, delivery_date, delivery_time, plant, unloading_loc, uploaded_by, quantity)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
              item.customerCode || null, // Nullable - migration 007 applied
              item.customerPart || '',
              item.partNumber || null,
              item.qadPart || '',
              item.description || '',
              item.snp || 0,
              item.bin || 0,
              item.sheetName || '',
              item.deliveryDate || null,
              item.deliveryTime || null,
              item.plant || null,
              item.unloadingLoc || null,
              req.user?.username || 'unknown',
              item.quantity || null
          ]
        );
        } catch (insertError: any) {
          console.error(`Error inserting item ${i + 1}:`, insertError);
          console.error('Item data:', {
            customerCode: item.customerCode,
            partNumber: item.partNumber,
            customerPart: item.customerPart
          });
          throw insertError;
        }
      }
      console.log(`✅ Successfully inserted ${allScheduleItems.length} schedule items`);

      // Re-validate all existing invoice items against the newly uploaded schedule
      validationStats = await validateInvoiceItemsAgainstSchedule(client);

      // Log the upload with filtering statistics
      const logDetails = [
        `Total rows processed: ${totalRowsProcessed}`,
        `Rows imported: ${allScheduleItems.length}`,
        `Rows filtered out (quantity matched): ${rowsFilteredOut}`,
        `Rows excluded (missing columns): ${rowsExcludedMissingColumns}`,
        `Validation: ${validationStats.matchedCount} matched, ${validationStats.unmatchedCount} unmatched, ${validationStats.errorCount} errors`
      ].join(' | ');

      await client.query(
        `INSERT INTO logs (user_name, action, details, log_type)
         VALUES ($1, $2, $3, 'upload')`,
        [
          req.user?.username,
          `Uploaded schedule with ${allScheduleItems.length} item(s)`,
          logDetails
        ]
      );
    });

    // Broadcast update via WebSocket
    const io: SocketIOServer = req.app.get('io');
    io.emit('schedule:updated', { 
      action: 'upload',
      count: allScheduleItems.length,
      uploadedBy: req.user?.username 
    });

    res.json({
      success: true,
      message: `Uploaded ${allScheduleItems.length} schedule items`,
      itemCount: allScheduleItems.length,
      filteringStats: {
        totalRowsProcessed,
        rowsImported: allScheduleItems.length,
        rowsFilteredOut,
        rowsExcludedMissingColumns
      },
      validationStats: validationStats || {
        matchedCount: 0,
        unmatchedCount: 0,
        errorCount: 0
      }
    });
  } catch (error: any) {
    console.error('Upload schedule error:', error);
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
      constraint: error?.constraint,
      detail: error?.detail
    });
    
    // Provide more specific error message
    let errorMessage = 'Failed to upload schedule';
    if (error?.code === '23502') {
      errorMessage = 'Database constraint violation: customer_code cannot be null. Please run migration 007_make_schedule_customer_code_nullable.sql';
    } else if (error?.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error?.detail : undefined
    });
  }
});

/**
 * DELETE /api/schedule
 * Clear all schedule data (admin only)
 */
router.delete('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    await query('DELETE FROM schedule_items');

    // Broadcast update
    const io: SocketIOServer = req.app.get('io');
    io.emit('schedule:updated', { action: 'clear' });

    res.json({ success: true, message: 'Schedule cleared' });
  } catch (error) {
    console.error('Clear schedule error:', error);
    res.status(500).json({ error: 'Failed to clear schedule' });
  }
});

export default router;

