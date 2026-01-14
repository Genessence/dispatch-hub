-- Migration 003: Enhance Gatepass and Invoice Tables
-- Add UNLOADING LOC to invoices, dispatch_date and customer_code to gatepasses

-- Add unloading_loc column to invoices table
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS unloading_loc VARCHAR(100);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_invoices_unloading_loc ON invoices(unloading_loc);

-- Add dispatch_date column to gatepasses table
ALTER TABLE gatepasses 
ADD COLUMN IF NOT EXISTS dispatch_date TIMESTAMP WITH TIME ZONE;

-- Add customer_code column to gatepasses table
ALTER TABLE gatepasses 
ADD COLUMN IF NOT EXISTS customer_code VARCHAR(100);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_gatepasses_customer_code ON gatepasses(customer_code);
CREATE INDEX IF NOT EXISTS idx_gatepasses_dispatch_date ON gatepasses(dispatch_date);

