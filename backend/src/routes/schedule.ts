import { Router, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { query, transaction } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { Server as SocketIOServer } from 'socket.io';
import { parseExcelDateValue, toIsoDateOnly } from '../utils/dateParsing';
import { invalidateScheduleCache } from '../utils/cache';

const router = Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Helper: strict schedule date parsing (DD/MM/YYYY preferred; no JS overflow; no Date(string) guessing)
const parseDate = (dateStr: any): Date | null => {
  return parseExcelDateValue(dateStr, { preferDayFirst: true });
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
    let rowsWithoutPartNumber = 0; // Rows missing PART NUMBER
    let rowsExcludedNoUsefulFields = 0; // Rows that passed qty filter but had no usable data for logging

    const sheetDiagnostics: Array<{
      sheetName: string;
      rowsInSheet: number;
      usedHeaderFallback: boolean;
      partNumberColumnExists: boolean;
      importedFromSheet: number;
      filteredOutFromSheet: number;
      excludedNoUsefulFieldsFromSheet: number;
      sampleHeaders: string[];
      headerHints: string[];
    }> = [];
    
    console.log('\n📤 ===== SCHEDULE UPLOAD: Starting =====');
    console.log(`📊 Sheets found: ${workbook.SheetNames.join(', ')}`);
    console.log(`📊 Single sheet mode: ${isSingleSheet}`);

    const expectedHeaderHints = [
      'SUPPLY DATE',
      'SUPPLY TIME',
      'DELIVERY DATE',
      'DELIVERY TIME',
      'UNLOADING LOC',
      'PLANT',
      'PART NUMBER',
      'QUANTITY',
      'QUANTITY DISPATCHED',
    ];

    const normalizeHeader = (v: any) => String(v ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

    const hasAnyHint = (headers: string[]) => {
      const normalized = headers.map(normalizeHeader);
      const hintsFound: string[] = [];
      for (const hint of expectedHeaderHints) {
        if (normalized.some((h) => h.includes(hint))) hintsFound.push(hint);
      }
      return hintsFound;
    };

    // Parse each sheet
    workbook.SheetNames.forEach((sheetName: string) => {
      // Do NOT skip "Sheet1/Sheet2" etc.
      // Many customer files keep real data in default sheet names, and skipping them causes "0 schedule items imported".

      console.log(`\n📄 Processing sheet: "${sheetName}"`);
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        console.warn(`⚠️  Sheet "${sheetName}" is empty or invalid`);
        return;
      }

      try {
        const beforeCount = allScheduleItems.length;
        let usedHeaderFallback = false;

        const processRows = (jsonData: any[], partNumberColumnExists: boolean) => {
          const sheetHeaders = jsonData.length > 0 && typeof jsonData[0] === 'object' ? Object.keys(jsonData[0] || {}) : [];
          const headerHints = hasAnyHint(sheetHeaders);

          if (sheetHeaders.length > 0) {
            console.log(`🧾 Detected headers (sample):`, sheetHeaders.slice(0, 15));
            console.log(`🔎 Header hints found:`, headerHints.length ? headerHints : 'NONE');
          }

          const firstFiveRows = jsonData.slice(0, Math.min(5, jsonData.length));
          const filteredOutFromSheetStart = rowsFilteredOut;
          const excludedNoUsefulFieldsFromSheetStart = rowsExcludedNoUsefulFields;

          jsonData.forEach((row: any) => {
            totalRowsProcessed++;

            const customerCode = getColumnValue(row, ['Customer Code', 'CustomerCode', 'customer code']) || '';
            const customerPart = getColumnValue(row, ['Custmer Part', 'Customer Part', 'CustomerPart', 'customer part']) || '';

            // Only extract PART NUMBER if detected (legacy). If not detected, keep empty and still import rows for logging.
            const partNumberRaw = partNumberColumnExists
              ? getColumnValue(row, ['PART NUMBER', 'Part Number', 'PartNumber', 'part number', 'Part_Number']) || ''
              : '';
            const partNumber = String(partNumberRaw).trim().replace(/\s+/g, ' ');
            const qadPart = getColumnValue(row, ['QAD part', 'QAD Part', 'QADPart', 'qad part']) || '';
            const description = getColumnValue(row, ['Description', 'description']) || '';
            const snp = parseInt(getColumnValue(row, ['SNP', 'snp']) || '0') || 0;
            const bin = parseInt(getColumnValue(row, ['Bin', 'bin']) || '0') || 0;

            const quantityStr = getColumnValue(row, ['Quantity', 'quantity', 'Qty', 'qty', 'QUANTITY']);
            const quantityDispatchedStr = getColumnValue(row, [
              'Quantity Dispatched',
              'QuantityDispatched',
              'quantity dispatched',
              'Qty Dispatched',
              'QtyDispatched',
              'QUANTITY DISPATCHED',
            ]);

            const quantity = parseQuantity(quantityStr);
            const quantityDispatched = parseQuantity(quantityDispatchedStr);

            if (quantity !== null && quantity === quantityDispatched) {
              rowsFilteredOut++;
              return;
            }

            const deliveryDateTime = getColumnValue(row, [
              'SUPPLY DATE',
              'Supply Date',
              'SupplyDate',
              'supply date',
              'Delivery Date & Time',
              'Delivery Date and Time',
              'DeliveryDateTime',
              'Delivery Date',
              'delivery date',
            ]);

            const supplyTime = getColumnValue(row, [
              'Supply Time',
              'SupplyTime',
              'SUPPLY TIME',
              'supply time',
              'Delivery Time',
              'DeliveryTime',
              'delivery time',
            ]);

            // Some files put the date inside SUPPLY TIME (or only populate that column).
            const deliveryDate = parseDate(deliveryDateTime) || parseDate(supplyTime);

            let timeStr: string | null = null;
            if (supplyTime !== undefined && supplyTime !== null && supplyTime !== '') {
              // Excel sometimes provides time as fraction-of-day number (e.g., 0.5 => 12:00).
              if (typeof supplyTime === 'number' && Number.isFinite(supplyTime) && supplyTime >= 0 && supplyTime < 1) {
                const totalMinutes = Math.round(supplyTime * 24 * 60);
                const hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
                const mm = String(totalMinutes % 60).padStart(2, '0');
                timeStr = `${hh}:${mm}`;
              } else {
                timeStr = supplyTime.toString();
              }
            } else if (deliveryDateTime && typeof deliveryDateTime === 'string') {
              const timeMatch = deliveryDateTime.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/);
              if (timeMatch) {
                timeStr = timeMatch[1];
              }
            }

            const plant = getColumnValue(row, [
              'Plant',
              'plant',
              'PLANT',
              'Plant Code',
              'PlantCode',
              'Delivery Location',
              'DeliveryLocation',
              'delivery location',
            ]);

            const unloadingLoc = getColumnValue(row, [
              'UNLOADING LOC',
              'UnloadingLoc',
              'Unloading Location',
              'UnloadingLocation',
              'Unload Location',
              'UnloadLocation',
              'UNLOADING DOC',
              'Unloading Doc',
              'UnloadingDoc',
              'UNLOADING DOCK',
              'Unloading Dock',
              'UnloadingDock',
              'Location',
              'unloading loc',
              'unloading location',
              'unloading doc',
              'unloading dock',
              'unload location',
              'location',
              'LOCATION',
            ]);

            const hasAnyUsefulField =
              !!partNumber ||
              !!deliveryDate ||
              !!timeStr ||
              (!!unloadingLoc && String(unloadingLoc).trim() !== '') ||
              (!!plant && String(plant).trim() !== '') ||
              (!!customerPart && String(customerPart).trim() !== '') ||
              (!!qadPart && String(qadPart).trim() !== '') ||
              (!!description && String(description).trim() !== '');

            if (!hasAnyUsefulField) {
              rowsExcludedNoUsefulFields++;
              return;
            }

            // Diagnostics: if we have time/unloading but no parsed date, log a small sample.
            // This is the common failure mode for month-name dates or unexpected formats.
            if (!deliveryDate && (timeStr || (unloadingLoc && String(unloadingLoc).trim() !== ''))) {
              // Avoid spamming logs; show only the first few occurrences.
              if ((globalThis as any).__scheduleDateParseWarnCount === undefined) {
                (globalThis as any).__scheduleDateParseWarnCount = 0;
              }
              if ((globalThis as any).__scheduleDateParseWarnCount < 5) {
                (globalThis as any).__scheduleDateParseWarnCount++;
                console.warn('⚠️ Schedule row has time/unloading but could not parse SUPPLY DATE', {
                  sheet: sheetName,
                  supplyDateRaw: deliveryDateTime,
                  supplyTimeRaw: supplyTime,
                  parsedDate: null,
                  parsedTime: timeStr || null,
                  unloadingLoc: unloadingLoc ? String(unloadingLoc).trim() : null,
                });
              }
            }

            allScheduleItems.push({
              customerCode: customerCode ? customerCode.toString() : null,
              customerPart: customerPart.toString(),
              partNumber: partNumber ? partNumber.toString() : null,
              qadPart: qadPart.toString(),
              description: description.toString(),
              snp,
              bin,
              sheetName,
              deliveryDate,
              deliveryTime: timeStr,
              plant: plant ? plant.toString() : null,
              unloadingLoc: unloadingLoc ? unloadingLoc.toString() : null,
              quantity: quantity !== null ? Math.round(quantity) : null,
            });

            if (!partNumber) {
              rowsWithoutPartNumber++;
            }
          });

          const importedFromSheet = allScheduleItems.length - beforeCount;
          const filteredOutFromSheet = rowsFilteredOut - filteredOutFromSheetStart;
          const excludedNoUsefulFieldsFromSheet = rowsExcludedNoUsefulFields - excludedNoUsefulFieldsFromSheetStart;

          sheetDiagnostics.push({
            sheetName,
            rowsInSheet: jsonData.length,
            usedHeaderFallback,
            partNumberColumnExists,
            importedFromSheet,
            filteredOutFromSheet,
            excludedNoUsefulFieldsFromSheet,
            sampleHeaders: sheetHeaders.slice(0, 20),
            headerHints,
          });

          // If headers look wrong and we imported nothing, caller may try fallback parsing.
          return { importedFromSheet, headerHints, sheetHeaders };
        };

        // First pass: default header parsing (first row as header)
        let jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }) as any[];
        if (!jsonData || jsonData.length === 0) {
          console.warn(`⚠️  No data found in sheet "${sheetName}"`);
          sheetDiagnostics.push({
            sheetName,
            rowsInSheet: 0,
            usedHeaderFallback: false,
            partNumberColumnExists: false,
            importedFromSheet: 0,
            filteredOutFromSheet: 0,
            excludedNoUsefulFieldsFromSheet: 0,
            sampleHeaders: [],
            headerHints: [],
          });
          return;
        }

        console.log(`📊 Rows in sheet: ${jsonData.length}`);
        
        // Check first 5 rows to see if PART NUMBER column exists (like frontend does)
        const firstFiveRows = jsonData.slice(0, Math.min(5, jsonData.length));
        let partNumberColumnExists = false;
        
        for (const checkRow of firstFiveRows) {
          const partNumCheck = getColumnValue(checkRow, ['PART NUMBER', 'Part Number', 'PartNumber', 'part number', 'Part_Number']);
          if (partNumCheck && String(partNumCheck).trim() !== '') {
            partNumberColumnExists = true;
            break;
          }
        }
        
        if (!partNumberColumnExists) {
          console.warn(
            `⚠️  PART NUMBER column not found in first 5 rows of sheet "${sheetName}". Continuing without part numbers (still importing rows for logging).`
          );
        } else {
          console.log(`✓ PART NUMBER column detected in sheet "${sheetName}"`);
        }

        const firstPass = processRows(jsonData, partNumberColumnExists);

        // Fallback: if we imported nothing and headers look wrong, try to detect a header row
        if (firstPass.importedFromSheet === 0 && firstPass.headerHints.length === 0) {
          const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as any[][];
          if (Array.isArray(matrix) && matrix.length > 0) {
            let headerRowIdx = -1;
            for (let r = 0; r < Math.min(matrix.length, 30); r++) {
              const rowCells = matrix[r] || [];
              const normalizedCells = rowCells.map(normalizeHeader).filter(Boolean);
              const foundHints = hasAnyHint(normalizedCells);
              if (foundHints.length >= 2) {
                headerRowIdx = r;
                break;
              }
            }

            if (headerRowIdx >= 0) {
              usedHeaderFallback = true;
              const headerRow = (matrix[headerRowIdx] || []).map((c) => String(c ?? ''));
              const dataRows = matrix.slice(headerRowIdx + 1);
              const objects: any[] = dataRows.map((cells) => {
                const obj: any = {};
                headerRow.forEach((h, idx) => {
                  if (!h) return;
                  obj[h] = (cells && cells[idx] !== undefined) ? cells[idx] : '';
                });
                return obj;
              });

              // Re-check part number col existence based on detected header row
              const headerHints = hasAnyHint(headerRow);
              const partNumberDetected = headerRow.some((h) => normalizeHeader(h).includes('PART NUMBER'));

              // Replace the last diagnostics row for this sheet (from first pass) with a fallback one
              // by removing it and re-processing with fallback rows.
              sheetDiagnostics.pop();
              processRows(objects, partNumberDetected || partNumberColumnExists);

              console.log(`🧠 Header fallback used for "${sheetName}" (row ${headerRowIdx + 1}). Hints: ${headerHints.join(', ') || 'NONE'}`);
            }
          }
        }
        
        console.log(`✅ Processed ${jsonData.length} rows from sheet "${sheetName}"`);
      } catch (sheetError) {
        console.error(`❌ Error parsing sheet ${sheetName}:`, sheetError);
      }
    });
    
    // Log parsing summary
    console.log('\n📊 ===== PARSING SUMMARY =====');
    console.log(`  Total rows processed: ${totalRowsProcessed}`);
    console.log(`  Rows filtered (qty matched): ${rowsFilteredOut}`);
    console.log(`  Rows excluded (missing columns): ${rowsExcludedMissingColumns}`);
    console.log(`  Rows without part number: ${rowsWithoutPartNumber}`);
    console.log(`  Rows excluded (no useful fields): ${rowsExcludedNoUsefulFields}`);
    console.log(`  Rows imported: ${allScheduleItems.length}`);
    
    // Sample part numbers for debugging
    const samplePartNumbers = allScheduleItems
      .map(item => item.partNumber)
      .filter(Boolean)
      .slice(0, 10);
    console.log(`\n📋 Sample part numbers (first 10):`, samplePartNumbers);
    
    // Show unique part numbers count
    const uniquePartNumbers = new Set(allScheduleItems.map(item => item.partNumber).filter(Boolean));
    console.log(`📊 Unique part numbers: ${uniquePartNumbers.size}`);
    console.log('================================\n');

    // If 0 items were imported, log a clear reason breakdown (and store it in DB logs) but do not crash.
    if (allScheduleItems.length === 0) {
      const reasons: string[] = [];
      if (totalRowsProcessed === 0) reasons.push('No rows were processed from any sheet (sheet_to_json returned empty).');
      if (rowsFilteredOut > 0 && rowsFilteredOut === totalRowsProcessed) {
        reasons.push('All rows were filtered because Quantity == Quantity Dispatched.');
      }
      if (rowsExcludedNoUsefulFields > 0 && rowsExcludedNoUsefulFields + rowsFilteredOut === totalRowsProcessed) {
        reasons.push('All remaining rows had no usable fields (date/time/unloading/plant/etc.) — likely header row not detected or columns renamed.');
      }
      if (reasons.length === 0) {
        reasons.push('Unknown: parsed rows did not produce any schedule items. Check sheet diagnostics in logs.');
      }

      console.warn('🧯 ===== SCHEDULE UPLOAD RESULT: 0 ITEMS =====');
      console.warn('Reasons:', reasons);
      console.warn('Sheet diagnostics:', sheetDiagnostics);
      console.warn('===========================================');
    }

    // Customer code validation removed - schedule files no longer contain customer codes
    // Schedule items are matched globally by PART NUMBER only
    // No need to validate customer codes since they don't exist in schedule files

    // Insert into database using transaction with bulk operations (optimized)
    await transaction(async (client) => {
      // Clear existing schedule
      await client.query('DELETE FROM schedule_items');

      // Bulk insert all items using UNNEST (single query instead of N queries)
      console.log(`Inserting ${allScheduleItems.length} schedule items into database...`);
      
      if (allScheduleItems.length > 0) {
        const customerCodes: (string | null)[] = [];
        const customerParts: string[] = [];
        const partNumbers: (string | null)[] = [];
        const qadParts: string[] = [];
        const descriptions: string[] = [];
        const snps: number[] = [];
        const bins: number[] = [];
        const sheetNames: string[] = [];
        const deliveryDates: (string | null)[] = [];
        const deliveryTimes: (string | null)[] = [];
        const plants: (string | null)[] = [];
        const unloadingLocs: (string | null)[] = [];
        const uploadedBys: string[] = [];
        const quantities: (number | null)[] = [];

        for (const item of allScheduleItems) {
          customerCodes.push(item.customerCode || null);
          customerParts.push(item.customerPart || '');
          partNumbers.push(item.partNumber || null);
          qadParts.push(item.qadPart || '');
          descriptions.push(item.description || '');
          snps.push(item.snp || 0);
          bins.push(item.bin || 0);
          sheetNames.push(item.sheetName || '');
          deliveryDates.push(item.deliveryDate ? toIsoDateOnly(item.deliveryDate) : null);
          deliveryTimes.push(item.deliveryTime || null);
          plants.push(item.plant || null);
          unloadingLocs.push(item.unloadingLoc || null);
          uploadedBys.push(req.user?.username || 'unknown');
          quantities.push(item.quantity || null);
        }

        await client.query(
          `INSERT INTO schedule_items 
           (customer_code, customer_part, part_number, qad_part, description, snp, bin, sheet_name, delivery_date, delivery_time, plant, unloading_loc, uploaded_by, quantity)
           SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::integer[], $7::integer[], $8::text[], $9::date[], $10::text[], $11::text[], $12::text[], $13::text[], $14::integer[])`,
          [customerCodes, customerParts, partNumbers, qadParts, descriptions, snps, bins, sheetNames, deliveryDates, deliveryTimes, plants, unloadingLocs, uploadedBys, quantities]
        );
      }
      
      console.log(`✅ Successfully inserted ${allScheduleItems.length} schedule items`);

      // Log the upload with filtering statistics
      const logDetails = [
        `Total rows processed: ${totalRowsProcessed}`,
        `Rows imported: ${allScheduleItems.length}`,
        `Rows filtered out (quantity matched): ${rowsFilteredOut}`,
        `Rows excluded (missing columns): ${rowsExcludedMissingColumns}`,
        `Validation: schedule matching disabled (invoice-first)`
      ].join(' | ');

      await client.query(
        `INSERT INTO logs (user_name, action, details, log_type)
         VALUES ($1, $2, $3, 'upload')`,
        [
          req.user?.username,
          `Uploaded schedule with ${allScheduleItems.length} item(s)`,
          `${logDetails} | Sheets: ${workbook.SheetNames.join(', ')} | 0-items? ${allScheduleItems.length === 0}`
        ]
      );
    });

    // Invalidate schedule cache after successful upload
    await invalidateScheduleCache();

    // Broadcast update via WebSocket
    const io: SocketIOServer = req.app.get('io');
    io.emit('schedule:updated', { 
      action: 'upload',
      count: allScheduleItems.length,
      uploadedBy: req.user?.username 
    });

    // samplePartNumbers and uniquePartNumbers already calculated above (lines 355, 362)
    // Use first 5 for response (already calculated first 10 for logging)
    const samplePartNumbersForResponse = samplePartNumbers.slice(0, 5);

    res.json({
      success: true,
      message: `Uploaded ${allScheduleItems.length} schedule items`,
      itemCount: allScheduleItems.length,
      filteringStats: {
        totalRowsProcessed,
        rowsImported: allScheduleItems.length,
        rowsFilteredOut,
        rowsExcludedMissingColumns,
        rowsWithoutPartNumber,
        rowsExcludedNoUsefulFields
      },
      diagnostics: {
        uniquePartNumbers: uniquePartNumbers.size,
        samplePartNumbers: samplePartNumbersForResponse,
        sheetDiagnostics
      },
      // Schedule-matching validation removed (invoice is source-of-truth)
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

