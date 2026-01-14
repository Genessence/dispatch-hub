-- =============================================
-- MIGRATION 002: Enhance validated_barcodes table
-- Add scan_context, customer_name, and customer_code columns
-- =============================================

-- Add scan_context column to distinguish between doc-audit and loading-dispatch scans
ALTER TABLE validated_barcodes 
ADD COLUMN IF NOT EXISTS scan_context VARCHAR(50) DEFAULT 'doc-audit';

-- Add customer_name column to store customer name with each scan
ALTER TABLE validated_barcodes 
ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255);

-- Add customer_code column to store customer code (bill_to) with each scan
ALTER TABLE validated_barcodes 
ADD COLUMN IF NOT EXISTS customer_code VARCHAR(100);

-- Update existing records to have default scan_context if null
UPDATE validated_barcodes 
SET scan_context = 'doc-audit' 
WHERE scan_context IS NULL;

-- Create index on scan_context for faster queries when filtering by context
CREATE INDEX IF NOT EXISTS idx_validated_barcodes_scan_context ON validated_barcodes(scan_context);

-- Create index on customer_code for faster lookups
CREATE INDEX IF NOT EXISTS idx_validated_barcodes_customer_code ON validated_barcodes(customer_code);

-- Update existing records: populate customer_name and customer_code from invoices table
UPDATE validated_barcodes vb
SET 
  customer_name = i.customer,
  customer_code = i.bill_to
FROM invoices i
WHERE vb.invoice_id = i.id 
  AND (vb.customer_name IS NULL OR vb.customer_code IS NULL);

-- Add comment to table
COMMENT ON COLUMN validated_barcodes.scan_context IS 'Context of the scan: doc-audit or loading-dispatch';
COMMENT ON COLUMN validated_barcodes.customer_name IS 'Customer name from the invoice';
COMMENT ON COLUMN validated_barcodes.customer_code IS 'Customer code (bill_to) from the invoice';

