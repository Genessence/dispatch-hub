-- =============================================
-- MIGRATION 010: Doc Audit Dual Counters (Customer vs INBD)
-- Track customer-side vs inbound-side bin counts and scanned quantities separately.
-- =============================================

-- Invoice item counters
ALTER TABLE invoice_items
ADD COLUMN IF NOT EXISTS cust_scanned_quantity INTEGER DEFAULT 0;

ALTER TABLE invoice_items
ADD COLUMN IF NOT EXISTS cust_scanned_bins_count INTEGER DEFAULT 0;

ALTER TABLE invoice_items
ADD COLUMN IF NOT EXISTS inbd_scanned_quantity INTEGER DEFAULT 0;

ALTER TABLE invoice_items
ADD COLUMN IF NOT EXISTS inbd_scanned_bins_count INTEGER DEFAULT 0;

-- Validated barcodes: track whether a row is customer-only (pending) or paired (matched)
ALTER TABLE validated_barcodes
ADD COLUMN IF NOT EXISTS scan_stage VARCHAR(20) DEFAULT 'paired';

-- Performance: stage lookups per item
CREATE INDEX IF NOT EXISTS idx_validated_barcodes_invoice_item_stage
  ON validated_barcodes(invoice_item_id, scan_stage);

-- Helpful comments
COMMENT ON COLUMN invoice_items.cust_scanned_quantity IS 'Cumulative quantity scanned from Customer QR labels during doc-audit';
COMMENT ON COLUMN invoice_items.cust_scanned_bins_count IS 'Number of Customer QR labels scanned (bins) during doc-audit';
COMMENT ON COLUMN invoice_items.inbd_scanned_quantity IS 'Cumulative quantity scanned from Autoliv QR labels during doc-audit';
COMMENT ON COLUMN invoice_items.inbd_scanned_bins_count IS 'Number of Autoliv QR labels scanned (bins) during doc-audit';
COMMENT ON COLUMN validated_barcodes.scan_stage IS 'Scan stage for doc-audit: customer (pending) or paired (customer+autoliv matched)';


