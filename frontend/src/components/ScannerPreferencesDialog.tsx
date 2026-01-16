import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useScannerPreferences, type ScannerPreferences } from "@/hooks/useScannerPreferences";
import { Settings } from "lucide-react";

interface ScannerPreferencesDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ScannerPreferencesDialog = ({ isOpen, onClose }: ScannerPreferencesDialogProps) => {
  const { preferences, savePreferences, loading } = useScannerPreferences();
  const [formData, setFormData] = useState<Partial<ScannerPreferences>>({});
  const [saving, setSaving] = useState(false);

  // Initialize form data when preferences load or dialog opens
  useEffect(() => {
    if (isOpen && preferences) {
      setFormData({
        defaultScanMode: preferences.defaultScanMode,
        scannerSuffix: preferences.scannerSuffix,
        autoTimeoutMs: preferences.autoTimeoutMs,
        duplicateScanThresholdMs: preferences.duplicateScanThresholdMs,
        showRealtimeDisplay: preferences.showRealtimeDisplay
      });
    }
  }, [isOpen, preferences]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const success = await savePreferences(formData);
      if (success) {
        onClose();
      }
    } catch (error) {
      console.error('Failed to save preferences:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset form data to current preferences
    if (preferences) {
      setFormData({
        defaultScanMode: preferences.defaultScanMode,
        scannerSuffix: preferences.scannerSuffix,
        autoTimeoutMs: preferences.autoTimeoutMs,
        duplicateScanThresholdMs: preferences.duplicateScanThresholdMs,
        showRealtimeDisplay: preferences.showRealtimeDisplay
      });
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Scanner Preferences
          </DialogTitle>
          <DialogDescription>
            Configure your barcode scanner settings. These preferences will be saved and synced across devices.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Default Scan Mode */}
          <div className="space-y-2">
            <Label htmlFor="defaultScanMode">Default Scan Mode</Label>
            <Select
              value={formData.defaultScanMode || 'scanner'}
              onValueChange={(value: 'scanner' | 'camera') => 
                setFormData({ ...formData, defaultScanMode: value })
              }
            >
              <SelectTrigger id="defaultScanMode">
                <SelectValue placeholder="Select default mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scanner">Wired Scanner</SelectItem>
                <SelectItem value="camera">Camera</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Choose the default scanning method when the scanner dialog opens
            </p>
          </div>

          {/* Scanner Suffix */}
          <div className="space-y-2">
            <Label htmlFor="scannerSuffix">Scanner Termination Character</Label>
            <Select
              value={formData.scannerSuffix || 'Enter'}
              onValueChange={(value: 'Enter' | 'Tab' | 'None') => 
                setFormData({ ...formData, scannerSuffix: value })
              }
            >
              <SelectTrigger id="scannerSuffix">
                <SelectValue placeholder="Select suffix" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Enter">Enter (Most Common)</SelectItem>
                <SelectItem value="Tab">Tab</SelectItem>
                <SelectItem value="None">None (No suffix)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The character your scanner sends after scanning (usually Enter)
            </p>
          </div>

          {/* Auto Timeout */}
          <div className="space-y-2">
            <Label htmlFor="autoTimeoutMs">Auto-Timeout (milliseconds)</Label>
            <Input
              id="autoTimeoutMs"
              type="number"
              min="50"
              max="5000"
              value={formData.autoTimeoutMs || 150}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10);
                if (!isNaN(value) && value >= 50 && value <= 5000) {
                  setFormData({ ...formData, autoTimeoutMs: value });
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Time to wait before auto-processing scan if no termination character is received (50-5000 ms)
            </p>
          </div>

          {/* Duplicate Scan Threshold */}
          <div className="space-y-2">
            <Label htmlFor="duplicateScanThresholdMs">Duplicate Scan Threshold (milliseconds)</Label>
            <Input
              id="duplicateScanThresholdMs"
              type="number"
              min="500"
              max="10000"
              value={formData.duplicateScanThresholdMs || 2000}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10);
                if (!isNaN(value) && value >= 500 && value <= 10000) {
                  setFormData({ ...formData, duplicateScanThresholdMs: value });
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Time window to ignore duplicate scans of the same barcode (500-10000 ms)
            </p>
          </div>

          {/* Show Realtime Display */}
          <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="showRealtimeDisplay">Show Real-time Display</Label>
              <p className="text-xs text-muted-foreground">
                Display scanned characters in real-time as they are received
              </p>
            </div>
            <Switch
              id="showRealtimeDisplay"
              checked={formData.showRealtimeDisplay !== undefined ? formData.showRealtimeDisplay : true}
              onCheckedChange={(checked) => 
                setFormData({ ...formData, showRealtimeDisplay: checked })
              }
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

