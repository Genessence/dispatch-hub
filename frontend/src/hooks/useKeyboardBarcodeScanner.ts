import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useScannerPreferences } from '@/hooks/useScannerPreferences';
import { canonicalizeBarcodePayload, parseBarcodeData, type BarcodeData } from '@/lib/barcode';

type UseKeyboardBarcodeScannerOptions = {
  enabled: boolean;
  onScan: (data: BarcodeData) => void;
  /**
   * Allows the caller to accept/reject a parsed scan (e.g. enforce scan order).
   * If rejected, we will NOT show the success toast and will NOT call `onScan`.
   * The caller can surface `rejectReason` via inline UI messaging if desired.
   */
  onScanAttempt?: (data: BarcodeData) => { accepted: boolean; rejectReason?: string };
  /**
   * If true, we won’t show the “scanned successfully” toast.
   * Errors (parse failures / too-long / etc.) will still toast.
   */
  suppressSuccessToast?: boolean;
};

type UseKeyboardBarcodeScannerReturn = {
  reset: () => void;
};

const isTypingTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el) return false;

  const tag = el.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;

  // contenteditable elements (and children inside them)
  if ((el as any).isContentEditable) return true;
  if (typeof el.closest === 'function' && el.closest('[contenteditable="true"]')) return true;

  return false;
};

export const useKeyboardBarcodeScanner = ({
  enabled,
  onScan,
  onScanAttempt,
  suppressSuccessToast = false,
}: UseKeyboardBarcodeScannerOptions): UseKeyboardBarcodeScannerReturn => {
  const { preferences } = useScannerPreferences();

  const bufferRef = useRef<string>('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScannedCanonicalRef = useRef<string | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const isProcessingRef = useRef<boolean>(false);

  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    bufferRef.current = '';
    isProcessingRef.current = false;
  }, []);

  const processScannedInput = useCallback(
    (scannedValue: string) => {
      try {
        // Clear any pending timeout immediately.
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        const trimmed = scannedValue?.trim() ?? '';
        if (!trimmed) {
          bufferRef.current = '';
          return;
        }

        if (trimmed.length > 10000) {
          toast.error('Scan too long', {
            description: 'The scanned data is too long. Please check your scanner.',
            duration: 3000,
          });
          bufferRef.current = '';
          return;
        }

        const normalized = canonicalizeBarcodePayload(trimmed);

        // Duplicate suppression
        const now = Date.now();
        const timeSinceLastScan = now - lastScanTimeRef.current;
        const effectivePrefs = preferences || {
          defaultScanMode: 'scanner' as const,
          scannerSuffix: 'Enter' as const,
          autoTimeoutMs: 150,
          duplicateScanThresholdMs: 2000,
          showRealtimeDisplay: true,
        };
        const threshold = effectivePrefs.duplicateScanThresholdMs;

        if (
          normalized.canonical === lastScannedCanonicalRef.current &&
          timeSinceLastScan < threshold
        ) {
          toast.info('Duplicate scan ignored', {
            description: 'Same barcode scanned too quickly. Please wait before scanning again.',
            duration: 2000,
          });
          bufferRef.current = '';
          return;
        }

        lastScannedCanonicalRef.current = normalized.canonical;
        lastScanTimeRef.current = now;
        isProcessingRef.current = true;

        const parseResult = parseBarcodeData(normalized.canonical);
        if (parseResult.data) {
          const data: BarcodeData = {
            ...parseResult.data,
            rawValue: normalized.canonical,
            originalRawValue: normalized.original,
          };

          if (onScanAttempt) {
            const attempt = onScanAttempt(data);
            if (!attempt.accepted) {
              bufferRef.current = '';
              isProcessingRef.current = false;
              return;
            }
          }

          if (!suppressSuccessToast) {
            const qrTypeLabel =
              data.qrType === 'autoliv'
                ? 'Autoliv QR'
                : data.qrType === 'customer'
                  ? 'Customer QR'
                  : 'Barcode';
            const description = data.binQuantity
              ? `Part: ${data.partCode}, Bin Qty: ${data.binQuantity}`
              : `Part: ${data.partCode}, Qty: ${data.quantity}`;

            toast.success(`✅ ${qrTypeLabel} scanned successfully!`, {
              description,
              duration: 3000,
            });
          }

          bufferRef.current = '';
          isProcessingRef.current = false;
          onScan(data);
          return;
        }

        toast.error('Failed to Parse QR Code', {
          description:
            parseResult.error ||
            "QR code format is invalid. Please ensure you're scanning the correct QR code type.",
          duration: 8000,
          style: { maxWidth: '500px', whiteSpace: 'pre-line' },
        });

        bufferRef.current = '';
        isProcessingRef.current = false;
      } catch (error) {
        console.error('Error processing scanned input:', error);
        toast.error('Error processing scan', {
          description: error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.',
          duration: 5000,
        });
        bufferRef.current = '';
        isProcessingRef.current = false;
      }
    },
    [onScan, onScanAttempt, preferences, suppressSuccessToast]
  );

  useEffect(() => {
    if (!enabled) {
      reset();
      return;
    }

    const effectivePrefs = preferences || {
      defaultScanMode: 'scanner' as const,
      scannerSuffix: 'Enter' as const,
      autoTimeoutMs: 150,
      duplicateScanThresholdMs: 2000,
      showRealtimeDisplay: true,
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      try {
        if (!enabled) return;
        if (isTypingTarget(e.target)) return;

        // Don’t capture when modifier keys are active (except shift).
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        // If Enter key is pressed, process the accumulated input.
        if (e.key === 'Enter' || (e as any).keyCode === 13) {
          e.preventDefault();
          e.stopPropagation();
          const scannedValue = bufferRef.current.trim();
          if (scannedValue.length > 0) {
            processScannedInput(scannedValue);
          } else {
            bufferRef.current = '';
          }
          return;
        }

        // Tab suffix mode.
        if (e.key === 'Tab' && effectivePrefs.scannerSuffix === 'Tab') {
          e.preventDefault();
          e.stopPropagation();
          const scannedValue = bufferRef.current.trim();
          if (scannedValue.length > 0) {
            processScannedInput(scannedValue);
          } else {
            bufferRef.current = '';
          }
          return;
        }

        // Regular character input.
        if (e.key.length === 1) {
          e.preventDefault();
          e.stopPropagation();

          if (bufferRef.current.length >= 10000) {
            toast.error('Scan too long', {
              description: 'The scanned data is too long. Please check your scanner.',
              duration: 3000,
            });
            bufferRef.current = '';
            return;
          }

          bufferRef.current += e.key;

          // Reset timeout if exists.
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }

          // Auto-process if no suffix comes (for scanners without suffix), or when suffix is Tab.
          const suffix = effectivePrefs.scannerSuffix;
          const timeout = effectivePrefs.autoTimeoutMs;
          if (suffix === 'None' || suffix === 'Tab') {
            timeoutRef.current = setTimeout(() => {
              const v = bufferRef.current.trim();
              if (v.length > 0) processScannedInput(v);
            }, timeout);
          }
        }
      } catch (error) {
        console.error('Error handling scanner input:', error);
      }
    };

    // Capture phase to intercept scanner keystrokes before other handlers.
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      reset();
    };
  }, [enabled, preferences, processScannedInput, reset]);

  return { reset };
};

