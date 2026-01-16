-- =============================================
-- MIGRATION 009: Add user_scanner_preferences table
-- Store user preferences for barcode scanner settings
-- =============================================

-- Create user_scanner_preferences table
CREATE TABLE IF NOT EXISTS user_scanner_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    default_scan_mode VARCHAR(20) NOT NULL DEFAULT 'scanner' CHECK (default_scan_mode IN ('scanner', 'camera')),
    scanner_suffix VARCHAR(10) NOT NULL DEFAULT 'Enter' CHECK (scanner_suffix IN ('Enter', 'Tab', 'None')),
    auto_timeout_ms INTEGER NOT NULL DEFAULT 150 CHECK (auto_timeout_ms >= 50 AND auto_timeout_ms <= 5000),
    duplicate_scan_threshold_ms INTEGER NOT NULL DEFAULT 2000 CHECK (duplicate_scan_threshold_ms >= 500 AND duplicate_scan_threshold_ms <= 10000),
    show_realtime_display BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_scanner_preferences_user_id ON user_scanner_preferences(user_id);

-- Add comments
COMMENT ON TABLE user_scanner_preferences IS 'User preferences for barcode scanner behavior';
COMMENT ON COLUMN user_scanner_preferences.default_scan_mode IS 'Default scan mode: scanner (wired) or camera';
COMMENT ON COLUMN user_scanner_preferences.scanner_suffix IS 'Termination character sent by scanner: Enter, Tab, or None';
COMMENT ON COLUMN user_scanner_preferences.auto_timeout_ms IS 'Timeout in milliseconds to auto-process scan if no suffix is received';
COMMENT ON COLUMN user_scanner_preferences.duplicate_scan_threshold_ms IS 'Time in milliseconds to ignore duplicate scans';
COMMENT ON COLUMN user_scanner_preferences.show_realtime_display IS 'Whether to show characters in real-time as they are scanned';

-- Add trigger to update updated_at timestamp
DROP TRIGGER IF EXISTS update_user_scanner_preferences_updated_at ON user_scanner_preferences;
CREATE TRIGGER update_user_scanner_preferences_updated_at
    BEFORE UPDATE ON user_scanner_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

