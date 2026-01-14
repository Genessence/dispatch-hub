import { Router, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { query, transaction } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { Server as SocketIOServer } from 'socket.io';

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
          unloadingLoc: item.unloading_loc
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

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false, raw: false });
    
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({ error: 'No sheets found in file' });
    }

    const allScheduleItems: any[] = [];

    // Parse each sheet
    workbook.SheetNames.forEach((sheetName: string) => {
      // Skip generic sheet names
      if (sheetName.toLowerCase() === 'sheet1' || sheetName.toLowerCase() === 'sheet2') {
        return;
      }

      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return;

      try {
        const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
        
        if (!jsonData || jsonData.length === 0) return;

        jsonData.forEach((row: any) => {
          const customerCode = getColumnValue(row, ['Customer Code', 'CustomerCode', 'customer code']) || '';
          const customerPart = getColumnValue(row, ['Custmer Part', 'Customer Part', 'CustomerPart', 'customer part']) || '';
          const partNumber = getColumnValue(row, ['PART NUMBER', 'Part Number', 'PartNumber', 'part number', 'Part_Number']) || '';
          const qadPart = getColumnValue(row, ['QAD part', 'QAD Part', 'QADPart', 'qad part']) || '';
          const description = getColumnValue(row, ['Description', 'description']) || '';
          const snp = parseInt(getColumnValue(row, ['SNP', 'snp']) || '0') || 0;
          const bin = parseInt(getColumnValue(row, ['Bin', 'bin']) || '0') || 0;
          
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
          
          if (customerCode) {
            allScheduleItems.push({
              customerCode: customerCode.toString(),
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
              unloadingLoc: unloadingLoc ? unloadingLoc.toString() : null
            });
          }
        });
      } catch (sheetError) {
        console.error(`Error parsing sheet ${sheetName}:`, sheetError);
      }
    });

    // Insert into database using transaction
    await transaction(async (client) => {
      // Clear existing schedule
      await client.query('DELETE FROM schedule_items');

      // Insert new items
      for (const item of allScheduleItems) {
        await client.query(
          `INSERT INTO schedule_items 
           (customer_code, customer_part, part_number, qad_part, description, snp, bin, sheet_name, delivery_date, delivery_time, plant, unloading_loc, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            item.customerCode, item.customerPart, item.partNumber, item.qadPart,
            item.description, item.snp, item.bin, item.sheetName,
            item.deliveryDate, item.deliveryTime, item.plant, item.unloadingLoc,
            req.user?.username
          ]
        );
      }

      // Log the upload
      await client.query(
        `INSERT INTO logs (user_name, action, details, log_type)
         VALUES ($1, $2, $3, 'upload')`,
        [
          req.user?.username,
          `Uploaded schedule with ${allScheduleItems.length} item(s)`,
          `Customer codes: ${[...new Set(allScheduleItems.map(i => i.customerCode))].join(', ')}`
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
      customerCodes: [...new Set(allScheduleItems.map(i => i.customerCode))]
    });
  } catch (error) {
    console.error('Upload schedule error:', error);
    res.status(500).json({ error: 'Failed to upload schedule' });
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

