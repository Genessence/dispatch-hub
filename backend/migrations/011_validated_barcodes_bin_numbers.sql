-- MIGRATION 011: Store bin numbers on validated_barcodes for de-dupe of staged scans

ALTER TABLE validated_barcodes
ADD COLUMN IF NOT EXISTS customer_bin_number TEXT;

ALTER TABLE validated_barcodes
ADD COLUMN IF NOT EXISTS autoliv_bin_number TEXT;

COMMENT ON COLUMN validated_barcodes.customer_bin_number IS 'Customer label bin number (for doc-audit stage=customer de-dupe)';
COMMENT ON COLUMN validated_barcodes.autoliv_bin_number IS 'Autoliv label bin number (for doc-audit stage=inbd/paired de-dupe)';

-- De-dupe helpers (kept as regular indexes for portability)
CREATE INDEX IF NOT EXISTS idx_vb_item_ctx_customer_bin
  ON validated_barcodes(invoice_item_id, scan_context, scan_stage, customer_bin_number);

CREATE INDEX IF NOT EXISTS idx_vb_item_ctx_autoliv_bin
  ON validated_barcodes(invoice_item_id, scan_context, autoliv_bin_number);


