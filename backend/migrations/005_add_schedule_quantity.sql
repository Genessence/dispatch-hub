-- =============================================
-- MIGRATION 005: Add Quantity to Schedule Items
-- Add quantity column to schedule_items table for tracking quantity from schedule
-- =============================================

-- Add quantity column to schedule_items table
ALTER TABLE schedule_items 
ADD COLUMN IF NOT EXISTS quantity INTEGER;

-- Add comment to column
COMMENT ON COLUMN schedule_items.quantity IS 'Quantity required for this part number from the schedule file';

