-- MIGRATION 012: Performance optimization - add composite indexes for common query patterns

-- Index for invoice items queries by invoice_id and customer_item (used in barcode matching)
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_customer 
  ON invoice_items(invoice_id, customer_item);

-- Index for invoice items queries by invoice_id and part (used in validation)
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_part 
  ON invoice_items(invoice_id, part);

-- Index for validated barcodes duplicate checks
CREATE INDEX IF NOT EXISTS idx_validated_barcodes_item_bin 
  ON validated_barcodes(invoice_item_id, customer_bin_number);

-- Index for validated barcodes queries by invoice, context, and date
CREATE INDEX IF NOT EXISTS idx_validated_barcodes_invoice_context 
  ON validated_barcodes(invoice_id, scan_context, scanned_at DESC);

-- Index for invoice queries by customer and status
CREATE INDEX IF NOT EXISTS idx_invoices_customer_status 
  ON invoices(bill_to, audit_complete, dispatched_by);

-- Index for schedule items queries by customer code and part number (used in dispatch fallback)
CREATE INDEX IF NOT EXISTS idx_schedule_items_customer_part 
  ON schedule_items(customer_code, part_number);

COMMENT ON INDEX idx_invoice_items_invoice_customer IS 'Performance: Speeds up barcode matching queries';
COMMENT ON INDEX idx_invoice_items_invoice_part IS 'Performance: Speeds up part validation queries';
COMMENT ON INDEX idx_validated_barcodes_item_bin IS 'Performance: Speeds up duplicate barcode checks';
COMMENT ON INDEX idx_validated_barcodes_invoice_context IS 'Performance: Speeds up scan history queries';
COMMENT ON INDEX idx_invoices_customer_status IS 'Performance: Speeds up invoice filtering queries';
COMMENT ON INDEX idx_schedule_items_customer_part IS 'Performance: Speeds up schedule fallback lookups';
