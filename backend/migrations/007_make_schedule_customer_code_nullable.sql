-- =============================================
-- MIGRATION 007: Make customer_code nullable in schedule_items
-- Schedule files no longer contain customer codes, so make this column nullable
-- =============================================

-- Make customer_code nullable
ALTER TABLE schedule_items 
ALTER COLUMN customer_code DROP NOT NULL;

-- Add comment to column
COMMENT ON COLUMN schedule_items.customer_code IS 'Customer code (optional - schedule files no longer contain customer codes, matching is done globally by PART NUMBER)';

