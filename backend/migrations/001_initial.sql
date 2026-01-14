-- Dispatch Hub Database Schema
-- PostgreSQL Migration Script

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- USERS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- INVOICES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS invoices (
    id VARCHAR(100) PRIMARY KEY,
    customer VARCHAR(255) NOT NULL,
    bill_to VARCHAR(100),
    invoice_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    total_qty INTEGER DEFAULT 0,
    bin_capacity INTEGER DEFAULT 50,
    expected_bins INTEGER DEFAULT 0,
    scanned_bins INTEGER DEFAULT 0,
    bins_loaded INTEGER DEFAULT 0,
    audit_complete BOOLEAN DEFAULT FALSE,
    audit_date TIMESTAMP WITH TIME ZONE,
    plant VARCHAR(100),
    delivery_date TIMESTAMP WITH TIME ZONE,
    delivery_time VARCHAR(50),
    blocked BOOLEAN DEFAULT FALSE,
    blocked_at TIMESTAMP WITH TIME ZONE,
    uploaded_by VARCHAR(100),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    audited_by VARCHAR(100),
    audited_at TIMESTAMP WITH TIME ZONE,
    dispatched_by VARCHAR(100),
    dispatched_at TIMESTAMP WITH TIME ZONE,
    vehicle_number VARCHAR(50),
    gatepass_number VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- INVOICE ITEMS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id VARCHAR(100) NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    part VARCHAR(100),
    customer_item VARCHAR(100),
    part_description VARCHAR(255),
    qty INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'valid-unmatched',
    error_message VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_customer_item ON invoice_items(customer_item);

-- =============================================
-- SCHEDULE ITEMS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS schedule_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_code VARCHAR(100) NOT NULL,
    customer_part VARCHAR(100),
    part_number VARCHAR(100),
    qad_part VARCHAR(100),
    description VARCHAR(255),
    snp INTEGER DEFAULT 0,
    bin INTEGER DEFAULT 0,
    sheet_name VARCHAR(100),
    delivery_date DATE,
    delivery_time VARCHAR(50),
    plant VARCHAR(100),
    unloading_loc VARCHAR(100),
    uploaded_by VARCHAR(100),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for schedule filtering
CREATE INDEX IF NOT EXISTS idx_schedule_customer_code ON schedule_items(customer_code);
CREATE INDEX IF NOT EXISTS idx_schedule_part_number ON schedule_items(part_number);
CREATE INDEX IF NOT EXISTS idx_schedule_delivery_date ON schedule_items(delivery_date);
CREATE INDEX IF NOT EXISTS idx_schedule_unloading_loc ON schedule_items(unloading_loc);

-- =============================================
-- VALIDATED BARCODES TABLE (for audit tracking)
-- =============================================
CREATE TABLE IF NOT EXISTS validated_barcodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id VARCHAR(100) NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    customer_barcode TEXT,
    autoliv_barcode TEXT,
    customer_item VARCHAR(100),
    item_number VARCHAR(100),
    part_description VARCHAR(255),
    quantity INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'matched',
    scanned_by VARCHAR(100),
    scanned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_validated_barcodes_invoice_id ON validated_barcodes(invoice_id);

-- =============================================
-- LOGS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_name VARCHAR(100) NOT NULL,
    action VARCHAR(255) NOT NULL,
    details TEXT,
    log_type VARCHAR(50) NOT NULL CHECK (log_type IN ('upload', 'audit', 'dispatch', 'system')),
    invoice_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_logs_type ON logs(log_type);
CREATE INDEX IF NOT EXISTS idx_logs_user ON logs(user_name);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at);

-- =============================================
-- MISMATCH ALERTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS mismatch_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_name VARCHAR(100) NOT NULL,
    customer VARCHAR(255),
    invoice_id VARCHAR(100) REFERENCES invoices(id) ON DELETE SET NULL,
    step VARCHAR(50) NOT NULL CHECK (step IN ('doc-audit', 'loading-dispatch')),
    customer_scan_part_code VARCHAR(100),
    customer_scan_quantity VARCHAR(50),
    customer_scan_bin_number VARCHAR(100),
    customer_scan_raw_value TEXT,
    autoliv_scan_part_code VARCHAR(100),
    autoliv_scan_quantity VARCHAR(50),
    autoliv_scan_bin_number VARCHAR(100),
    autoliv_scan_raw_value TEXT,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by VARCHAR(100),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mismatch_alerts_status ON mismatch_alerts(status);
CREATE INDEX IF NOT EXISTS idx_mismatch_alerts_invoice_id ON mismatch_alerts(invoice_id);

-- =============================================
-- CUSTOMER SITE SELECTIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS user_selections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    selected_customers TEXT[], -- Array of customer names
    selected_site VARCHAR(100),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_selections_user_id ON user_selections(user_id);

-- =============================================
-- GATEPASS TABLE (for tracking dispatched vehicles)
-- =============================================
CREATE TABLE IF NOT EXISTS gatepasses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gatepass_number VARCHAR(50) UNIQUE NOT NULL,
    vehicle_number VARCHAR(50) NOT NULL,
    customer VARCHAR(255),
    invoice_ids TEXT[], -- Array of invoice IDs
    total_items INTEGER DEFAULT 0,
    total_quantity INTEGER DEFAULT 0,
    authorized_by VARCHAR(100),
    qr_data TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gatepasses_number ON gatepasses(gatepass_number);
CREATE INDEX IF NOT EXISTS idx_gatepasses_vehicle ON gatepasses(vehicle_number);

-- =============================================
-- FUNCTION: Update updated_at timestamp
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updated_at column
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- SEED DATA: Create default users
-- Password: pass123 (bcrypt hash)
-- =============================================
INSERT INTO users (username, password_hash, role)
VALUES 
    ('admin', '$2a$10$knVv/OqIGuH1aYv2btJ9eecGjSaf2bEEh4N53rgKthknL6PrTzPHW', 'admin'),
    ('user', '$2a$10$knVv/OqIGuH1aYv2btJ9eecGjSaf2bEEh4N53rgKthknL6PrTzPHW', 'user')
ON CONFLICT (username) DO NOTHING;

-- =============================================
-- VIEWS for common queries
-- =============================================

-- View: Invoices with schedule match status
CREATE OR REPLACE VIEW invoices_with_schedule AS
SELECT 
    i.*,
    CASE WHEN EXISTS (
        SELECT 1 FROM schedule_items s WHERE s.customer_code = i.bill_to
    ) THEN true ELSE false END as has_schedule_match
FROM invoices i;

-- View: Pending audits (invoices with schedule, not yet audited)
CREATE OR REPLACE VIEW pending_audits AS
SELECT i.* 
FROM invoices i
WHERE i.audit_complete = false 
  AND i.dispatched_by IS NULL
  AND EXISTS (SELECT 1 FROM schedule_items s WHERE s.customer_code = i.bill_to);

-- View: Ready for dispatch (audited but not dispatched)
CREATE OR REPLACE VIEW ready_for_dispatch AS
SELECT i.* 
FROM invoices i
WHERE i.audit_complete = true 
  AND i.dispatched_by IS NULL
  AND EXISTS (SELECT 1 FROM schedule_items s WHERE s.customer_code = i.bill_to);

-- Grant permissions (adjust as needed for your PostgreSQL user)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_user;

