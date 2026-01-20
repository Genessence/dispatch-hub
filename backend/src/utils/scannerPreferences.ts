import { query } from '../config/database';

let tableEnsured = false;
let ensurePromise: Promise<boolean> | null = null;

const CREATE_SCANNER_PREFS_SQL = `
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

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

CREATE INDEX IF NOT EXISTS idx_user_scanner_preferences_user_id ON user_scanner_preferences(user_id);

DROP TRIGGER IF EXISTS update_user_scanner_preferences_updated_at ON user_scanner_preferences;
CREATE TRIGGER update_user_scanner_preferences_updated_at
    BEFORE UPDATE ON user_scanner_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

async function scannerPreferencesTableExists(): Promise<boolean> {
  const res = await query(`SELECT to_regclass('public.user_scanner_preferences') AS regclass`);
  return Boolean(res.rows?.[0]?.regclass);
}

/**
 * Best-effort fail-safe: ensure `user_scanner_preferences` exists.
 *
 * This is NOT a replacement for running migrations; it prevents runtime 500s
 * if a DB was created without migration 009.
 */
export async function ensureScannerPreferencesTable(): Promise<boolean> {
  if (tableEnsured) return true;

  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    try {
      if (await scannerPreferencesTableExists()) {
        tableEnsured = true;
        return true;
      }

      console.warn(
        '[db] user_scanner_preferences missing; attempting auto-create (please run migrations: npm run db:migrate)'
      );

      await query(CREATE_SCANNER_PREFS_SQL);

      const existsAfter = await scannerPreferencesTableExists();
      if (!existsAfter) {
        console.error('[db] user_scanner_preferences auto-create did not succeed (table still missing)');
        return false;
      }

      tableEnsured = true;
      return true;
    } catch (err) {
      // Don’t crash the process; callers decide whether to fail or fallback to defaults.
      console.error('[db] Failed to ensure user_scanner_preferences table:', err);
      return false;
    } finally {
      ensurePromise = null;
    }
  })();

  return ensurePromise;
}


