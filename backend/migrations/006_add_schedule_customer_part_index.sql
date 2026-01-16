-- Add composite index for schedule items to optimize part number matching by customer code
-- This improves performance when validating invoice items against schedule items
CREATE INDEX IF NOT EXISTS idx_schedule_customer_code_part_number ON schedule_items(customer_code, part_number);

