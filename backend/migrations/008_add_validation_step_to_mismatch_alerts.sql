-- =============================================
-- MIGRATION 008: Add validation_step to mismatch_alerts
-- Track which validation step failed (Step 1-4)
-- =============================================

-- Add validation_step column to track which step failed
ALTER TABLE mismatch_alerts 
ADD COLUMN IF NOT EXISTS validation_step VARCHAR(50);

-- Add comment
COMMENT ON COLUMN mismatch_alerts.validation_step IS 'Validation step that failed: customer_qr_no_match, autoliv_qr_no_match, invoice_mismatch, bin_quantity_mismatch';

