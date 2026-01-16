import { useState, useRef, useEffect } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, X, ScanBarcode, Keyboard, Settings } from "lucide-react";
import { toast } from "sonner";
import { useScannerPreferences } from "@/hooks/useScannerPreferences";
import { ScannerPreferencesDialog } from "./ScannerPreferencesDialog";

export interface BarcodeData {
  rawValue: string;
  partCode: string;
  quantity: string;
  binNumber: string;
  binQuantity?: string; // Bin quantity extracted from QR (for validation)
  qrType?: 'autoliv' | 'customer'; // Type of QR code scanned
}

interface BarcodeScannerProps {
  onScan: (data: BarcodeData) => void;
  title?: string;
  description?: string;
  isOpen: boolean;
  onClose: () => void;
  cameraGuideText?: string; // Custom text for the camera guide
}

export const BarcodeScanner = ({ 
  onScan, 
  title = "Scan Barcode", 
  description = "Position the barcode within the frame", 
  isOpen, 
  onClose,
  cameraGuideText = "Position barcode here"
}: BarcodeScannerProps) => {
  // Camera-related refs and state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [cameraType, setCameraType] = useState<'front' | 'back'>('front');
  const lastScannedBarcodeRef = useRef<string | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const scanningIntervalRef = useRef<number | null>(null);

  // Scanner mode refs and state
  const { preferences, loading: prefsLoading } = useScannerPreferences();
  const [scanMode, setScanMode] = useState<'scanner' | 'camera'>('scanner');
  const [scannerInput, setScannerInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  
  // Scanner input handling refs
  const scannerInputRef = useRef<string>('');
  const scannerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastKeyTimeRef = useRef<number>(0);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  // Detect if device is mobile or laptop/desktop
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
    || (window.innerWidth < 768 && ('ontouchstart' in window));

  // Parse Autoliv QR code format
  // Example: [)>0612SA16S1V123456SR22281225173P641704700HQ83QPCEH281225R20075D2512280941LAM2005
  // Part Number: Between first P and Q → 641704700H
  // Bin Quantity: Single digit immediately after that Q → 8
  const parseAutolivQR = (rawValue: string): BarcodeData | null => {
    try {
      console.log("Parsing Autoliv QR:", rawValue);
      
      // Find the first occurrence of P followed by Q
      const pIndex = rawValue.indexOf('P');
      if (pIndex === -1) {
        console.error("No 'P' found in Autoliv QR");
        return null;
      }

      // Find Q after P
      const qIndex = rawValue.indexOf('Q', pIndex);
      if (qIndex === -1) {
        console.error("No 'Q' found after 'P' in Autoliv QR");
        return null;
      }

      // Extract part number between P and Q
      const partCode = rawValue.substring(pIndex + 1, qIndex).trim();
      
      // Extract bin quantity (single digit after Q)
      const binQuantity = rawValue.substring(qIndex + 1, qIndex + 2).trim();

      if (!partCode) {
        console.error("Failed to extract part code from Autoliv QR");
        return null;
      }

      if (!binQuantity || !/^\d$/.test(binQuantity)) {
        console.error("Failed to extract valid bin quantity (single digit) from Autoliv QR");
        return null;
      }

      return {
        rawValue,
        partCode,
        quantity: binQuantity, // Use binQuantity as quantity for consistency
        binNumber: "", // Not available in Autoliv format
        binQuantity: binQuantity,
        qrType: 'autoliv'
      };
    } catch (error) {
      console.error("Error parsing Autoliv QR:", error);
      return null;
    }
  };

  // Parse Customer QR code format (multi-line)
  // Part Code: Line 2 (second line) → 84940M69R13-BHE
  // Bin Quantity: Line 3 (third line, single digit) → 8
  const parseCustomerQR = (rawValue: string): BarcodeData | null => {
    try {
      console.log("Parsing Customer QR:", rawValue);
      
      // Split by newlines (handle both \n and \r\n)
      const lines = rawValue.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
      
      if (lines.length < 3) {
        console.error("Customer QR must have at least 3 lines, got:", lines.length);
        return null;
      }

      // Part code is on line 2 (index 1)
      const partCode = lines[1].trim();
      
      // Bin quantity is on line 3 (index 2), should be a single digit
      const binQuantity = lines[2].trim();

      if (!partCode) {
        console.error("Failed to extract part code from Customer QR (line 2)");
        return null;
      }

      if (!binQuantity || !/^\d$/.test(binQuantity)) {
        console.error("Failed to extract valid bin quantity (single digit) from Customer QR (line 3)");
        return null;
      }

      return {
        rawValue,
        partCode,
        quantity: binQuantity, // Use binQuantity as quantity for consistency
        binNumber: "", // Not available in customer format
        binQuantity: binQuantity,
        qrType: 'customer'
      };
    } catch (error) {
      console.error("Error parsing Customer QR:", error);
      return null;
    }
  };

  // Detect QR type and parse accordingly
  const parseBarcodeData = (rawValue: string): BarcodeData | null => {
    try {
      console.log("Parsing barcode/QR:", rawValue);
      
      // Check if it's Autoliv QR format (contains P and Q pattern)
      if (rawValue.includes('P') && rawValue.includes('Q')) {
        const autolivResult = parseAutolivQR(rawValue);
        if (autolivResult) {
          return autolivResult;
        }
      }

      // Check if it's Customer QR format (multi-line with at least 3 lines)
      const lines = rawValue.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length >= 3) {
        const customerResult = parseCustomerQR(rawValue);
        if (customerResult) {
          return customerResult;
        }
      }

      // Fallback: Try old format (Part_code-{value},Quantity-{value},Bin_number-{value})
      // This maintains backward compatibility
      let partCode = "";
      let quantity = "";
      let binNumber = "";

      const partCodeMatch = rawValue.match(/Part_code-([^,]+)/);
      const quantityMatch = rawValue.match(/Quantity-([^,]+)/);
      const binNumberMatch = rawValue.match(/Bin_number-([^,]+)/);

      if (partCodeMatch) {
        partCode = partCodeMatch[1].trim();
      }
      if (quantityMatch) {
        quantity = quantityMatch[1].trim();
      }
      if (binNumberMatch) {
        binNumber = binNumberMatch[1].trim();
      }

      // Validate that we got at least partCode
      if (!partCode) {
        console.error("Failed to parse any known QR/barcode format:", rawValue);
        return null;
      }

      return {
        rawValue,
        partCode,
        quantity: quantity || "0",
        binNumber: binNumber || "",
        binQuantity: quantity || undefined
      };
    } catch (error) {
      console.error("Error parsing barcode:", error);
      return null;
    }
  };

  // Initialize scan mode from preferences when dialog opens
  // IMPORTANT: On laptop/desktop, ALWAYS use scanner mode (never camera)
  // On mobile, use preferences or default to camera
  useEffect(() => {
    if (isOpen) {
      // Force scanner mode on laptop/desktop - NEVER open camera
      if (!isMobileDevice) {
        console.log('Laptop/Desktop detected - forcing scanner mode (camera disabled)');
        setScanMode('scanner');
      } else {
        // Mobile device - use preferences or default to camera
        if (!prefsLoading && preferences) {
          setScanMode(preferences.defaultScanMode);
        } else if (!prefsLoading) {
          setScanMode('camera'); // Default to camera on mobile
        }
      }
      // Reset scanner state
      scannerInputRef.current = '';
      setScannerInput('');
      lastScannedBarcodeRef.current = null;
      lastScanTimeRef.current = 0;
      setIsProcessing(false);
    }
  }, [isOpen, prefsLoading, preferences, isMobileDevice]);

  // Handle scanner input from wired scanner
  const handleScannerInput = (e: KeyboardEvent) => {
    try {
      // Only process if scanner mode is active and dialog is open
      if (scanMode !== 'scanner' || !isOpen) {
        return;
      }

      // Use default preferences if not loaded yet (for immediate scanner use)
      const effectivePrefs = preferences || {
        defaultScanMode: 'scanner' as const,
        scannerSuffix: 'Enter' as const,
        autoTimeoutMs: 150,
        duplicateScanThresholdMs: 2000,
        showRealtimeDisplay: true
      };

      const now = Date.now();
      const timeSinceLastKey = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // If Enter key is pressed, process the accumulated input
      if (e.key === 'Enter' || e.keyCode === 13) {
        console.log('Enter key detected - processing scan:', scannerInputRef.current);
        e.preventDefault();
        e.stopPropagation();
        
        const scannedValue = scannerInputRef.current.trim();
        
        if (scannedValue.length > 0) {
          processScannedInput(scannedValue);
        } else {
          console.warn('Enter pressed but no input accumulated');
        }
        return;
      }

      // Handle Tab key (if scanner sends Tab)
      if (e.key === 'Tab' && effectivePrefs.scannerSuffix === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const scannedValue = scannerInputRef.current.trim();
        if (scannedValue.length > 0) {
          processScannedInput(scannedValue);
        }
        return;
      }

      // Handle regular character input
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Log first few characters for debugging Zebra scanner
        if (scannerInputRef.current.length < 5) {
          console.log('Scanner character received:', e.key, '| KeyCode:', e.keyCode, '| Total length:', scannerInputRef.current.length + 1);
        }
        
        e.preventDefault();
        e.stopPropagation();
        
        // Check max length to prevent memory issues
        if (scannerInputRef.current.length >= 10000) {
          console.warn("Scanner input too long, resetting");
          scannerInputRef.current = '';
          setScannerInput('');
          toast.error("Scan too long", {
            description: "The scanned data is too long. Please check your scanner.",
            duration: 3000
          });
          return;
        }
        
        // Accumulate characters
        scannerInputRef.current += e.key;
        setScannerInput(scannerInputRef.current);
        
        // Clear timeout if exists
        if (scannerTimeoutRef.current) {
          clearTimeout(scannerTimeoutRef.current);
        }
        
        // Set timeout to auto-process if no suffix comes (for scanners without suffix)
        const suffix = effectivePrefs.scannerSuffix;
        const timeout = effectivePrefs.autoTimeoutMs;
        
        if (suffix === 'None' || suffix === 'Tab') {
          scannerTimeoutRef.current = setTimeout(() => {
            if (scannerInputRef.current.trim().length > 0) {
              processScannedInput(scannerInputRef.current.trim());
            }
          }, timeout);
        }
      }
    } catch (error) {
      console.error("Error handling scanner input:", error);
      // Don't show toast here to avoid spam, just log
    }
  };

  // Process scanned input
  const processScannedInput = (scannedValue: string) => {
    try {
      // Clear timeout
      if (scannerTimeoutRef.current) {
        clearTimeout(scannerTimeoutRef.current);
        scannerTimeoutRef.current = null;
      }

      // Validate input
      if (!scannedValue || scannedValue.trim().length === 0) {
        console.warn("Empty scan detected, ignoring");
        scannerInputRef.current = '';
        setScannerInput('');
        return;
      }

      // Check for maximum length to prevent memory issues
      if (scannedValue.length > 10000) {
        toast.error("Scan too long", {
          description: "The scanned data is too long. Please check your scanner."
        });
        scannerInputRef.current = '';
        setScannerInput('');
        return;
      }

      console.log("Barcode scanned from wired scanner:", scannedValue);
      
      // Prevent duplicate scans
      const now = Date.now();
      const timeSinceLastScan = now - lastScanTimeRef.current;
      const effectivePrefs = preferences || {
        defaultScanMode: 'scanner' as const,
        scannerSuffix: 'Enter' as const,
        autoTimeoutMs: 150,
        duplicateScanThresholdMs: 2000,
        showRealtimeDisplay: true
      };
      const threshold = effectivePrefs.duplicateScanThresholdMs;
      
      if (scannedValue === lastScannedBarcodeRef.current && timeSinceLastScan < threshold) {
        console.log("Duplicate scan ignored");
        toast.info("Duplicate scan ignored", {
          description: "Same barcode scanned too quickly. Please wait before scanning again.",
          duration: 2000
        });
        scannerInputRef.current = '';
        setScannerInput('');
        return;
      }

      lastScannedBarcodeRef.current = scannedValue;
      lastScanTimeRef.current = now;
      setIsProcessing(true);

      // Parse the barcode data
      const parsedData = parseBarcodeData(scannedValue);
      
      if (parsedData) {
        console.log("Parsed barcode data:", parsedData);
        
        const qrTypeLabel = parsedData.qrType === 'autoliv' ? 'Autoliv QR' : 
                           parsedData.qrType === 'customer' ? 'Customer QR' : 'Barcode';
        const description = parsedData.binQuantity 
          ? `Part: ${parsedData.partCode}, Bin Qty: ${parsedData.binQuantity}`
          : `Part: ${parsedData.partCode}, Qty: ${parsedData.quantity}`;
        
        toast.success(`${qrTypeLabel} scanned successfully!`, {
          description: description
        });
        
        // Reset scanner state
        scannerInputRef.current = '';
        setScannerInput('');
        setIsProcessing(false);
        
        // Send the parsed barcode data to parent
        onScan(parsedData);
        
        // Close the dialog
        onClose();
      } else {
        // Parsing failed
        toast.error("Failed to parse QR code", {
          description: "QR code format is invalid. Please ensure you're scanning the correct QR code type (Customer or Autoliv).",
          duration: 5000
        });
        scannerInputRef.current = '';
        setScannerInput('');
        setIsProcessing(false);
      }
    } catch (error) {
      console.error("Error processing scanned input:", error);
      toast.error("Error processing scan", {
        description: error instanceof Error ? error.message : "An unexpected error occurred. Please try again.",
        duration: 5000
      });
      scannerInputRef.current = '';
      setScannerInput('');
      setIsProcessing(false);
    }
  };

  // Setup keyboard listener for scanner mode
  useEffect(() => {
    if (isOpen && scanMode === 'scanner') {
      console.log('Setting up scanner mode - keyboard listener active');
      
      // Focus hidden input field when dialog opens in scanner mode
      const timer = setTimeout(() => {
        if (hiddenInputRef.current) {
          hiddenInputRef.current.focus();
          console.log('Hidden input focused for scanner');
        }
      }, 100);

      // Add global keyboard listener (capture phase to intercept before other handlers)
      // This will capture ALL keyboard input including from Zebra scanner
      const handleKeyDown = (e: KeyboardEvent) => {
        handleScannerInput(e);
      };
      
      window.addEventListener('keydown', handleKeyDown, true);
      console.log('Keyboard listener added for scanner mode');
      
      return () => {
        clearTimeout(timer);
        window.removeEventListener('keydown', handleKeyDown, true);
        if (scannerTimeoutRef.current) {
          clearTimeout(scannerTimeoutRef.current);
          scannerTimeoutRef.current = null;
        }
        scannerInputRef.current = '';
        setScannerInput('');
        console.log('Keyboard listener removed');
      };
    }
  }, [isOpen, scanMode]);

  // Camera mode useEffect - ONLY for mobile devices
  useEffect(() => {
    if (isOpen && scanMode === 'camera' && isMobileDevice) {
      console.log('Scanner dialog opened in camera mode (mobile device)');
      
      // Reset scan state when dialog opens
      lastScannedBarcodeRef.current = null;
      lastScanTimeRef.current = 0;
      
      if (!readerRef.current) {
        readerRef.current = new BrowserMultiFormatReader();
        console.log('Barcode reader initialized');
      }

      // Add a small delay to ensure video element is ready
      const timer = setTimeout(() => {
        if (videoRef.current) {
          console.log('Video element ready, starting camera...');
          startScanning();
        } else {
          console.error('Video element not ready!');
        }
      }, 100);

      return () => {
        clearTimeout(timer);
        stopScanning();
      };
    } else if (isOpen && scanMode === 'scanner') {
      // Reset scanner state when in scanner mode
      console.log('Scanner mode active - camera will NOT start');
      // Ensure camera is stopped if it was running
      stopScanning();
      scannerInputRef.current = '';
      setScannerInput('');
      lastScannedBarcodeRef.current = null;
      lastScanTimeRef.current = 0;
      setIsProcessing(false);
    } else if (!isOpen) {
      // Dialog closed - stop everything
      stopScanning();
    }
  }, [isOpen, scanMode, isMobileDevice]);

  const startScanning = async () => {
    if (!videoRef.current || isScanning) return;

    try {
      setIsScanning(true);
      
      // Check if mediaDevices API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const isHTTPS = window.location.protocol === 'https:';
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        
        if (!isHTTPS && !isLocalhost) {
          throw new Error('HTTPS_REQUIRED');
        } else {
          throw new Error('CAMERA_API_NOT_AVAILABLE');
        }
      }
      
      // Detect if device is mobile
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
        || (window.innerWidth < 768 && ('ontouchstart' in window));
      
      // Set camera type for UI display
      setCameraType(isMobile ? 'back' : 'front');
      
      console.log('Device detection:', {
        userAgent: navigator.userAgent,
        screenWidth: window.innerWidth,
        isMobile: isMobile,
        cameraToUse: isMobile ? 'back' : 'front',
        protocol: window.location.protocol,
        hostname: window.location.hostname
      });
      
      // Request camera permission
      let stream: MediaStream;
      
      if (isMobile) {
        // Mobile: Try back camera first, fallback to any camera
        console.log('Requesting BACK camera for mobile device...');
        try {
          stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              facingMode: { exact: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 }
            } 
          });
        } catch {
          console.log('Exact back camera not available, trying any camera...');
          stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              facingMode: "environment",
              width: { ideal: 1920 },
              height: { ideal: 1080 }
            } 
          });
        }
      } else {
        // Desktop/Laptop: Request front camera (user-facing webcam)
        console.log('Requesting FRONT camera for laptop/desktop...');
        
        try {
          stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              facingMode: "user",  // Front camera
              width: { ideal: 1280 },
              height: { ideal: 720 }
            } 
          });
          console.log('✅ Front camera accessed successfully');
        } catch (e) {
          console.log('Front camera with facingMode failed, trying basic video constraint...');
          // Fallback: just request any video camera
          stream = await navigator.mediaDevices.getUserMedia({ 
            video: true
          });
          console.log('✅ Camera accessed with basic constraint');
        }
      }
      
      setHasPermission(true);
      console.log(`✅ Camera permission granted! Stream active:`, stream.active);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait for video to be ready and play
        try {
          await videoRef.current.play();
          console.log('✅ Video element playing!');
          
          // Start continuous barcode scanning
          startBarcodeScanning();
        } catch (playErr) {
          console.log('Auto-play might be blocked, trying manual play...', playErr);
          // Video will play once user interacts
        }
      }
    } catch (err: any) {
      console.error("❌ Error starting scanner:", err);
      setHasPermission(false);
      setIsScanning(false);
      
      if (err.message === 'HTTPS_REQUIRED') {
        toast.error("HTTPS Required for Camera Access", {
          description: "Mobile browsers require HTTPS for camera access. Please use a secure connection or access via localhost.",
          duration: 10000
        });
      } else if (err.message === 'CAMERA_API_NOT_AVAILABLE') {
        toast.error("Camera API Not Available", {
          description: "Your browser doesn't support camera access. Please try a different browser or device.",
          duration: 8000
        });
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        toast.error("Camera access denied", {
          description: "Please click 'Allow' when browser asks for camera permission."
        });
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        toast.error("No camera found", {
          description: "Please ensure your device has a working camera."
        });
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        toast.error("Camera is in use", {
          description: "Please close other apps using the camera and try again."
        });
      } else {
        toast.error("Failed to start camera", {
          description: err.message || "Unknown error occurred. Check console for details."
        });
      }
    }
  };

  const startBarcodeScanning = () => {
    if (!readerRef.current || !videoRef.current) {
      console.error("Reader or video element not available");
      return;
    }

    console.log("Starting continuous barcode scanning...");

    // Use decodeFromVideoElement for continuous scanning
    // This will scan every frame from the video element
    readerRef.current.decodeFromVideoElement(
      videoRef.current,
      (result, error) => {
        if (result) {
          const rawValue = result.getText();
          console.log("Barcode detected:", rawValue);

          // Prevent duplicate scans (same barcode within 2 seconds)
          const now = Date.now();
          if (rawValue === lastScannedBarcodeRef.current && (now - lastScanTimeRef.current) < 2000) {
            console.log("Duplicate scan ignored (same barcode within 2 seconds)");
            return;
          }

          lastScannedBarcodeRef.current = rawValue;
          lastScanTimeRef.current = now;

          // Parse the barcode data
          const parsedData = parseBarcodeData(rawValue);
          
          if (parsedData) {
            console.log("Parsed barcode data:", parsedData);
            
            // Show success message with QR type-specific info
            const qrTypeLabel = parsedData.qrType === 'autoliv' ? 'Autoliv QR' : 
                               parsedData.qrType === 'customer' ? 'Customer QR' : 'Barcode';
            const description = parsedData.binQuantity 
              ? `Part: ${parsedData.partCode}, Bin Qty: ${parsedData.binQuantity}`
              : `Part: ${parsedData.partCode}, Qty: ${parsedData.quantity}`;
            
            toast.success(`${qrTypeLabel} scanned successfully!`, {
              description: description
            });
            
            // Stop scanning
            stopScanning();
            
            // Send the parsed barcode data to parent
            onScan(parsedData);
            
            // Close the dialog immediately
            onClose();
          } else {
            // Parsing failed - show error but keep scanning
            toast.error("Failed to parse QR code", {
              description: "QR code format is invalid. Please ensure you're scanning the correct QR code type."
            });
            // Continue scanning
          }
        } else if (error) {
          // Error during scanning - this is normal when no barcode is detected
          // Only log if it's not a NotFoundException (which is expected)
          if (error.name !== 'NotFoundException') {
            console.log("Scanning error (expected when no barcode in frame):", error.name);
          }
          // Continue scanning
        }
      }
    ).catch((err) => {
      console.error("Error starting barcode scanning:", err);
      toast.error("Failed to start barcode scanning", {
        description: err.message || "Please try again"
      });
    });
  };

  const stopScanning = () => {
    console.log('Stopping camera and scanning...');
    
    // Stop barcode scanning
    if (readerRef.current) {
      try {
        readerRef.current.reset();
        console.log('Barcode reader reset');
      } catch (err) {
        console.log('Error resetting reader:', err);
      }
    }
    
    // Stop video stream
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => {
        track.stop();
        console.log('Stopped track:', track.label);
      });
      videoRef.current.srcObject = null;
      console.log('Video stream stopped');
    }
    
    // Clear scanning interval if any
    if (scanningIntervalRef.current) {
      clearInterval(scanningIntervalRef.current);
      scanningIntervalRef.current = null;
    }
    
    setIsScanning(false);
    setHasPermission(null);
    lastScannedBarcodeRef.current = null;
    lastScanTimeRef.current = 0;
    console.log('Scanner state reset');
  };
  
  const handleClose = () => {
    if (scanMode === 'camera') {
      stopScanning();
    }
    scannerInputRef.current = '';
    setScannerInput('');
    if (scannerTimeoutRef.current) {
      clearTimeout(scannerTimeoutRef.current);
      scannerTimeoutRef.current = null;
    }
    onClose();
  };

  const handleModeChange = (mode: 'scanner' | 'camera') => {
    // Prevent switching to camera mode on laptop/desktop
    if (mode === 'camera' && !isMobileDevice) {
      toast.warning("Camera mode disabled", {
        description: "Camera mode is only available on mobile devices. Please use wired scanner on laptop/desktop.",
        duration: 3000
      });
      return;
    }

    if (mode === 'camera' && scanMode === 'scanner') {
      // Switching to camera mode (mobile only)
      setScanMode('camera');
      scannerInputRef.current = '';
      setScannerInput('');
      if (scannerTimeoutRef.current) {
        clearTimeout(scannerTimeoutRef.current);
        scannerTimeoutRef.current = null;
      }
      // Start camera after a delay
      setTimeout(() => {
        if (videoRef.current) {
          startScanning();
        }
      }, 100);
    } else if (mode === 'scanner' && scanMode === 'camera') {
      // Switching to scanner mode
      stopScanning();
      setScanMode('scanner');
      // Focus hidden input
      setTimeout(() => {
        if (hiddenInputRef.current) {
          hiddenInputRef.current.focus();
        }
      }, 100);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full" onEscapeKeyDown={handleClose}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <ScanBarcode className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="truncate">{title}</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-8 w-8 p-0"
                onClick={() => setShowPreferences(true)}
                title="Scanner Settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">{description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 sm:space-y-6">
            {/* Mode Selector - Only show on mobile, hide on laptop/desktop */}
            {isMobileDevice && (
              <div className="flex gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => handleModeChange('scanner')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
                    scanMode === 'scanner'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  <Keyboard className="h-4 w-4" />
                  Wired Scanner
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('camera')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
                    scanMode === 'camera'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  <Camera className="h-4 w-4" />
                  Camera
                </button>
              </div>
            )}
            
            {/* Info banner for laptop/desktop */}
            {!isMobileDevice && (
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  💡 Using Wired Scanner Mode
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  Camera mode is disabled on laptop/desktop. Connect your Zebra scanner and scan the QR code.
                </p>
              </div>
            )}

            {/* Scanner Mode UI */}
            {scanMode === 'scanner' && (
              <div className="space-y-4">
                <div className={`relative bg-blue-50 dark:bg-blue-950 border-2 rounded-lg p-8 text-center transition-all ${
                  isProcessing 
                    ? 'border-green-500 dark:border-green-600 bg-green-50 dark:bg-green-950' 
                    : scannerInput.length > 0
                    ? 'border-blue-400 dark:border-blue-600'
                    : 'border-blue-300 dark:border-blue-700 border-dashed'
                }`}>
                  <Keyboard className={`h-16 w-16 mx-auto mb-4 ${
                    isProcessing ? 'text-green-500 animate-pulse' : 'text-blue-500'
                  }`} />
                  <h3 className="text-lg font-semibold mb-2">
                    {isProcessing ? 'Processing...' : scannerInput.length > 0 ? 'Scanning...' : 'Ready to Scan'}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {isProcessing 
                      ? 'Validating barcode...'
                      : scannerInput.length > 0
                      ? 'Point your wired scanner at the QR code and scan'
                      : 'Point your wired scanner at the QR code and scan'
                    }
                  </p>
                  <input
                    ref={hiddenInputRef}
                    type="text"
                    autoFocus
                    className="sr-only"
                    readOnly
                    tabIndex={0}
                    onKeyDown={(e) => {
                      // Log for debugging
                      console.log('Hidden input keydown:', e.key, e.keyCode);
                      // Don't prevent default - let it bubble to global listener
                    }}
                    onFocus={() => {
                      console.log('Hidden input focused - ready for scanner input');
                    }}
                  />
                  <div className={`w-full px-4 py-4 text-center text-lg font-mono border-2 rounded-lg transition-all ${
                    isProcessing
                      ? 'border-green-400 bg-green-50 dark:bg-green-900/30'
                      : scannerInput.length > 0
                      ? 'border-blue-400 bg-white dark:bg-gray-900 focus-within:ring-2 focus-within:ring-blue-500'
                      : 'border-blue-300 bg-white dark:bg-gray-900'
                  }`}>
                    {scannerInput || (
                      <span className="text-muted-foreground">Scanning will appear here...</span>
                    )}
                  </div>
                  {scannerInput.length > 0 && !isProcessing && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {scannerInput.length} character{scannerInput.length !== 1 ? 's' : ''} scanned
                    </div>
                  )}
                </div>

                <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 sm:p-4">
                  <p className="text-xs sm:text-sm font-medium mb-2">📌 Scanner Mode:</p>
                  <ul className="text-[10px] sm:text-xs text-muted-foreground space-y-1">
                    <li>• Connect your wired USB barcode scanner</li>
                    <li>• Point scanner at QR code and pull trigger</li>
                    <li>• Scanner will automatically detect and process</li>
                    <li>• Works with both Customer and Autoliv QR codes</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Camera Mode UI */}
            {scanMode === 'camera' && (
              <>
                <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              onLoadedMetadata={() => console.log('Video metadata loaded')}
              onCanPlay={() => console.log('Video can play')}
              onPlay={() => console.log('Video is playing')}
            />
            
            {/* Camera Type Indicator */}
            {hasPermission && (
              <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-2 z-10">
                <Camera className="h-3 w-3 text-white" />
                <span className="text-white text-xs font-medium">
                  {cameraType === 'front' ? 'Front Camera (Laptop)' : 'Back Camera (Mobile)'}
                </span>
              </div>
            )}
            
            {/* Scanning Indicator */}
            {hasPermission && isScanning && (
              <div className="absolute top-3 right-3 bg-green-600/80 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-2 z-10">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                <span className="text-white text-xs font-medium">Scanning...</span>
              </div>
            )}
            
            {/* Camera Preview Overlay - Simple guide */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Barcode Guide Frame */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-3/4 max-w-md">
                  {/* Scanning frame with corners */}
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-lg"></div>
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-lg"></div>
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-lg"></div>
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-lg"></div>
                  
                  {/* Center guide text */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-black/60 backdrop-blur-sm px-4 py-2 rounded-lg">
                      <p className="text-white text-sm font-medium text-center">
                        {cameraGuideText}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* No camera message */}
            {hasPermission === false && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/90">
                <div className="text-center text-white p-6">
                  <Camera className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium mb-2">Camera Access Required</p>
                  <p className="text-sm opacity-75 mb-4">Please allow camera access in your browser settings</p>
                </div>
              </div>
            )}
            
            {/* Loading camera */}
            {hasPermission === null && isScanning && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/90">
                <div className="text-center text-white p-6">
                  <Camera className="h-12 w-12 mx-auto mb-3 animate-pulse" />
                  <p className="font-medium">Starting camera...</p>
                </div>
              </div>
            )}
          </div>

                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4">
                  <p className="text-xs sm:text-sm font-medium mb-2">📌 Camera Mode:</p>
                  <ul className="text-[10px] sm:text-xs text-muted-foreground space-y-1">
                    <li>• <strong>Laptop/Desktop</strong>: Uses front camera (webcam)</li>
                    <li>• <strong>Mobile</strong>: Uses back camera for better viewing</li>
                    <li>• Browser will ask for camera permission on first use</li>
                    <li>• <strong>Automatic scanning</strong> - just point at barcode</li>
                    <li>• Scanner will detect barcode automatically and close</li>
                    <li>• If barcode format is invalid, scanner stays open for retry</li>
                  </ul>
                </div>
              </>
            )}

            {/* Actions */}
            <div className="flex gap-2 sm:gap-3">
              <button 
                type="button"
                onClick={handleClose}
                className="flex-1 h-10 sm:h-12 border-2 border-gray-300 hover:border-gray-400 bg-white hover:bg-gray-50 rounded-md font-semibold text-sm sm:text-base transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                <X className="h-3 w-3 sm:h-4 sm:w-4" />
                Cancel
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Scanner Preferences Dialog */}
      <ScannerPreferencesDialog
        isOpen={showPreferences}
        onClose={() => setShowPreferences(false)}
      />
    </>
  );
};

// Button component to trigger the scanner
interface BarcodeScanButtonProps {
  onScan: (data: BarcodeData) => void;
  label: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  className?: string;
  disabled?: boolean;
  cameraGuideText?: string; // Custom text for the camera guide
}

export const BarcodeScanButton = ({ 
  onScan, 
  label, 
  variant = "outline", 
  className = "", 
  disabled = false,
  cameraGuideText
}: BarcodeScanButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleScan = (data: BarcodeData) => {
    onScan(data);
    setIsOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        className={`w-full h-14 text-base font-medium ${className}`}
        onClick={() => setIsOpen(true)}
        disabled={disabled}
      >
        <Camera className="h-5 w-5 mr-2" />
        {label}
      </Button>
      
      <BarcodeScanner
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onScan={handleScan}
        title={label}
        description="Position the barcode within the frame to scan"
        cameraGuideText={cameraGuideText}
      />
    </>
  );
};
