import { useState, useRef, useEffect } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, X, ScanBarcode } from "lucide-react";
import { toast } from "sonner";

export interface BarcodeData {
  rawValue: string;
  partCode: string;
  quantity: string;
  binNumber: string;
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [cameraType, setCameraType] = useState<'front' | 'back'>('front');
  const lastScannedBarcodeRef = useRef<string | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const scanningIntervalRef = useRef<number | null>(null);

  // Parse barcode data from format: Part_code-{value},Quantity-{value},Bin_number-{value}
  const parseBarcodeData = (rawValue: string): BarcodeData | null => {
    try {
      console.log("Parsing barcode:", rawValue);
      
      let partCode = "";
      let quantity = "";
      let binNumber = "";

      // Parse format: Part_code-{value},Quantity-{value},Bin_number-{value}
      // Example: Part_code-48150M69R20-C48,Quantity-3,Bin_number-2023919386007
      
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
        console.error("Failed to parse partCode from barcode:", rawValue);
        return null;
      }

      return {
        rawValue,
        partCode,
        quantity: quantity || "0",
        binNumber: binNumber || ""
      };
    } catch (error) {
      console.error("Error parsing barcode:", error);
      return null;
    }
  };

  useEffect(() => {
    if (isOpen) {
      console.log('Scanner dialog opened');
      
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
    } else {
      stopScanning();
    }
  }, [isOpen]);

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
            
            // Show success message
            toast.success("Barcode scanned successfully!", {
              description: `Part: ${parsedData.partCode}, Qty: ${parsedData.quantity}, Bin: ${parsedData.binNumber}`
            });
            
            // Stop scanning
            stopScanning();
            
            // Send the parsed barcode data to parent
            onScan(parsedData);
            
            // Close the dialog immediately
            onClose();
          } else {
            // Parsing failed - show error but keep scanning
            toast.error("Failed to parse barcode", {
              description: "Barcode format is invalid. Expected: Part_code-{value},Quantity-{value},Bin_number-{value}"
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
    stopScanning();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full" onEscapeKeyDown={handleClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <ScanBarcode className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="truncate">{title}</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 sm:space-y-6">
          {/* Real Camera View */}
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

          {/* Instructions */}
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4">
            <p className="text-xs sm:text-sm font-medium mb-2">📌 How it works:</p>
            <ul className="text-[10px] sm:text-xs text-muted-foreground space-y-1">
              <li>• <strong>Laptop/Desktop</strong>: Uses front camera (webcam)</li>
              <li>• <strong>Mobile</strong>: Uses back camera for better viewing</li>
              <li>• Browser will ask for camera permission on first use</li>
              <li>• <strong>Automatic scanning</strong> - just point at barcode</li>
              <li>• Scanner will detect barcode automatically and close</li>
              <li>• If barcode format is invalid, scanner stays open for retry</li>
            </ul>
          </div>

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
