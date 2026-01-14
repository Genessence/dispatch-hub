-- =============================================
-- MIGRATION 004: Bin Quantity Tracking
-- Add bin quantity tracking to validated_barcodes and invoice_items
-- =============================================

-- Add bin_quantity column to validated_barcodes table (quantity in each bin from scan)
ALTER TABLE validated_barcodes 
ADD COLUMN IF NOT EXISTS bin_quantity INTEGER;

-- Add invoice_item_id column to validated_barcodes table (reference to invoice_items)
ALTER TABLE validated_barcodes 
ADD COLUMN IF NOT EXISTS invoice_item_id UUID REFERENCES invoice_items(id) ON DELETE CASCADE;

-- Add number_of_bins column to invoice_items table (calculated: ceil(total_qty / bin_quantity))
ALTER TABLE invoice_items 
ADD COLUMN IF NOT EXISTS number_of_bins INTEGER DEFAULT 0;

-- Add scanned_quantity column to invoice_items table (track cumulative scanned quantity)
ALTER TABLE invoice_items 
ADD COLUMN IF NOT EXISTS scanned_quantity INTEGER DEFAULT 0;

-- Add scanned_bins_count column to invoice_items table (count of bins scanned for this item)
ALTER TABLE invoice_items 
ADD COLUMN IF NOT EXISTS scanned_bins_count INTEGER DEFAULT 0;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_validated_barcodes_invoice_item_id ON validated_barcodes(invoice_item_id);
CREATE INDEX IF NOT EXISTS idx_validated_barcodes_bin_quantity ON validated_barcodes(bin_quantity);
CREATE INDEX IF NOT EXISTS idx_invoice_items_number_of_bins ON invoice_items(number_of_bins);
CREATE INDEX IF NOT EXISTS idx_invoice_items_scanned_quantity ON invoice_items(scanned_quantity);

-- Add comments to columns
COMMENT ON COLUMN validated_barcodes.bin_quantity IS 'Quantity in each bin from the scanned barcode';
COMMENT ON COLUMN validated_barcodes.invoice_item_id IS 'Reference to the invoice_item this scan belongs to';
COMMENT ON COLUMN invoice_items.number_of_bins IS 'Total number of bins needed for this item (calculated: ceil(qty / bin_quantity))';
COMMENT ON COLUMN invoice_items.scanned_quantity IS 'Cumulative quantity scanned so far (total_qty - remaining_qty)';
COMMENT ON COLUMN invoice_items.scanned_bins_count IS 'Number of bins scanned for this item';

