import { useState, useEffect, useCallback } from 'react';
import { authApi } from '@/lib/api';
import { toast } from 'sonner';

export interface ScannerPreferences {
  defaultScanMode: 'scanner' | 'camera';
  scannerSuffix: 'Enter' | 'Tab' | 'None';
  autoTimeoutMs: number;
  duplicateScanThresholdMs: number;
  showRealtimeDisplay: boolean;
}

const DEFAULT_PREFERENCES: ScannerPreferences = {
  defaultScanMode: 'scanner',
  scannerSuffix: 'Enter',
  autoTimeoutMs: 150,
  duplicateScanThresholdMs: 2000,
  showRealtimeDisplay: true
};

export const useScannerPreferences = () => {
  const [preferences, setPreferences] = useState<ScannerPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPreferences = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await authApi.getScannerPreferences();
      if (response.success && response.preferences) {
        setPreferences(response.preferences);
      } else {
        // Use defaults if no preferences found
        setPreferences(DEFAULT_PREFERENCES);
      }
    } catch (err: any) {
      console.error('Failed to fetch scanner preferences:', err);
      setError(err.message || 'Failed to load scanner preferences');
      // Use defaults on error
      setPreferences(DEFAULT_PREFERENCES);
      toast.error('Failed to load scanner preferences', {
        description: 'Using default settings. You can configure them in settings.',
        duration: 3000
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const savePreferences = useCallback(async (newPreferences: Partial<ScannerPreferences>) => {
    try {
      setError(null);
      const response = await authApi.saveScannerPreferences(newPreferences);
      if (response.success && response.preferences) {
        setPreferences(response.preferences);
        toast.success('Scanner preferences saved', {
          description: 'Your scanner settings have been updated.',
          duration: 2000
        });
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('Failed to save scanner preferences:', err);
      const errorMessage = err.message || 'Failed to save scanner preferences';
      setError(errorMessage);
      toast.error('Failed to save scanner preferences', {
        description: errorMessage,
        duration: 4000
      });
      return false;
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  return {
    preferences,
    loading,
    error,
    fetchPreferences,
    savePreferences,
    setPreferences // Allow direct state updates if needed
  };
};

