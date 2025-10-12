import { useState, useRef, useEffect } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, X, ScanBarcode, Zap } from "lucide-react";
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
  matchValue?: string; // If provided, use this value to match
  shouldMismatch?: boolean; // If true, generate different value
  matchData?: BarcodeData; // The full barcode data to match (for keeping same values)
}

export const BarcodeScanner = ({ 
  onScan, 
  title = "Scan Barcode", 
  description = "Position the barcode within the frame", 
  isOpen, 
  onClose,
  matchValue,
  shouldMismatch = false,
  matchData
}: BarcodeScannerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [barcodeDetected, setBarcodeDetected] = useState(false);
  const [cameraType, setCameraType] = useState<'front' | 'back'>('front');

  useEffect(() => {
    if (isOpen) {
      console.log('Scanner dialog opened');
      
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
    }
  }, [isOpen]);

  const startScanning = async () => {
    if (!videoRef.current || isScanning) return;

    try {
      setIsScanning(true);
      
      // Detect if device is mobile
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
        || (window.innerWidth < 768 && ('ontouchstart' in window));
      
      // Set camera type for UI display
      setCameraType(isMobile ? 'back' : 'front');
      
      console.log('Device detection:', {
        userAgent: navigator.userAgent,
        screenWidth: window.innerWidth,
        isMobile: isMobile,
        cameraToUse: isMobile ? 'back' : 'front'
      });
      
      // Request camera permission
      // Try multiple approaches to ensure camera access
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
        
        // List available cameras
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(device => device.kind === 'videoinput');
          console.log('Available cameras:', videoDevices);
        } catch (e) {
          console.log('Could not enumerate devices:', e);
        }
        
        // Try to get user-facing camera
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
      console.log(`✅ Video tracks:`, stream.getVideoTracks());

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait for video to be ready and play
        try {
          await videoRef.current.play();
          console.log('✅ Video element playing!');
        } catch (playErr) {
          console.log('Auto-play might be blocked, trying manual play...', playErr);
          // Video will play once user interacts
        }
      }

      // Start decoding from video element
      if (readerRef.current && videoRef.current) {
        console.log('Starting barcode detection...');
        readerRef.current.decodeFromVideoElement(videoRef.current, (result, error) => {
          if (result) {
            // Barcode detected - extract the actual value
            const actualValue = result.getText();
            console.log("✅ Real barcode scanned:", actualValue);
            setBarcodeDetected(true);
            
            // Parse the real barcode to generate unique values
            const barcodeData = parseBarcodeData(actualValue);
            console.log("Generated values for real barcode:", barcodeData);
            
            toast.success("Barcode scanned successfully!", {
              description: `Part: ${barcodeData.partCode}, Qty: ${barcodeData.quantity}`
            });
            
            // Stop scanning and send data
            stopScanning();
            onScan(barcodeData);
            onClose();
          }
          // Suppress errors to avoid console spam
        });
      }
    } catch (err: any) {
      console.error("❌ Error starting scanner:", err);
      console.error("Error name:", err.name);
      console.error("Error message:", err.message);
      setHasPermission(false);
      setIsScanning(false);
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        toast.error("Camera access denied", {
          description: "Please click 'Allow' when browser asks for camera permission."
        });
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        toast.error("No camera found", {
          description: "Please ensure your laptop has a working webcam."
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

  const stopScanning = () => {
    console.log('Stopping camera...');
    
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => {
        track.stop();
        console.log('Stopped track:', track.label);
      });
      videoRef.current.srcObject = null;
      console.log('Video stream stopped');
    }
    
    // Reset reader by creating a new instance
    if (readerRef.current) {
      readerRef.current = null;
      console.log('Reader reset');
    }
    
    setIsScanning(false);
    setBarcodeDetected(false);
    setHasPermission(null);
    console.log('Scanner state reset');
  };
  
  const handleClose = () => {
    stopScanning();
    onClose();
  };

  // Parse barcode data to extract Part Code, Quantity, and Bin Number
  const parseBarcodeData = (rawValue: string): BarcodeData => {
    console.log("Parsing barcode:", rawValue);
    
    // Try different parsing strategies
    let partCode = "";
    let quantity = "";
    let binNumber = "";
    
    // Strategy 1: Delimited format (e.g., "PART123|50|BIN-001" or "PART123-50-BIN001")
    if (rawValue.includes('|')) {
      const parts = rawValue.split('|');
      partCode = parts[0] || "";
      quantity = parts[1] || "";
      binNumber = parts[2] || "";
    } 
    else if (rawValue.includes('-') && rawValue.split('-').length >= 3) {
      const parts = rawValue.split('-');
      partCode = parts[0] || "";
      quantity = parts[1] || "";
      binNumber = parts.slice(2).join('-') || ""; // In case bin has multiple dashes
    }
    // Strategy 2: Fixed length positions (customize based on your barcode format)
    else if (rawValue.length >= 15) {
      partCode = rawValue.substring(0, 8).trim();
      quantity = rawValue.substring(8, 12).trim();
      binNumber = rawValue.substring(12).trim();
    }
    // Strategy 3: Generate demo data in correct format if real barcode doesn't match expected format
    else {
      // Generate demo values in correct format
      // Part Code: 13 digits (e.g., 2023919386007)
      const randomPart = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      partCode = `202391938${randomPart}`;
      
      // Quantity: 1-9 (single digit)
      quantity = (Math.floor(Math.random() * 9) + 1).toString();
      
      // Bin Number: 11 characters (e.g., 76480M66T00)
      const randomBin = Math.floor(Math.random() * 100).toString().padStart(2, '0');
      binNumber = `76480M66T${randomBin}`;
    }
    
    return {
      rawValue,
      partCode: partCode || `202391938${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
      quantity: quantity || (Math.floor(Math.random() * 9) + 1).toString(),
      binNumber: binNumber || `76480M66T${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`
    };
  };

  const handleDemoScan = () => {
    console.log("Scan button clicked!");
    
    let rawBarcode: string;
    let barcodeData: BarcodeData;
    
    // If we have matchData and should NOT mismatch, use the EXACT SAME data
    if (matchData && !shouldMismatch) {
      // Use the exact same data from the first scan to ensure they match
      barcodeData = {
        rawValue: matchData.rawValue,
        partCode: matchData.partCode,
        quantity: matchData.quantity,
        binNumber: matchData.binNumber
      };
      console.log("Using EXACT matching data from first scan:", barcodeData);
    }
    // If we should mismatch, generate completely different values
    else if (matchValue && shouldMismatch) {
      const randomBarcode = Math.floor(Math.random() * 900000000000) + 100000000000;
      rawBarcode = randomBarcode.toString();
      // Make sure it's actually different
      while (rawBarcode === matchValue) {
        const newRandom = Math.floor(Math.random() * 900000000000) + 100000000000;
        rawBarcode = newRandom.toString();
      }
      console.log("Generated mismatching barcode:", rawBarcode);
      barcodeData = parseBarcodeData(rawBarcode);
    }
    // First scan - generate new random value with unique data
    else {
      const randomBarcode = Math.floor(Math.random() * 900000000000) + 100000000000;
      rawBarcode = randomBarcode.toString();
      // Generate unique random values for each NEW scan
      barcodeData = parseBarcodeData(rawBarcode);
      console.log("Generated NEW barcode with unique values:", barcodeData);
    }
    
    console.log("Final barcode data:", barcodeData);
    
    // Show success message
    toast.success("Barcode scanned successfully!", {
      description: `Part: ${barcodeData.partCode}, Qty: ${barcodeData.quantity}, Bin: ${barcodeData.binNumber}`
    });
    
    // Send the parsed barcode data to parent
    onScan(barcodeData);
    
    console.log("Calling onClose...");
    
    // Close the dialog immediately
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
            
            {/* Scanning Overlay */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Barcode Guide */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-3/4 max-w-md">
                  {/* Scanning frame with corners */}
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-lg"></div>
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-lg"></div>
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-lg"></div>
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-lg"></div>
                  
                  {/* Center guide text */}
                  {!barcodeDetected && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-black/60 backdrop-blur-sm px-4 py-2 rounded-lg">
                        <p className="text-white text-sm font-medium text-center">
                          Position barcode here
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {/* Detected indicator */}
                  {barcodeDetected && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-green-500/90 backdrop-blur-sm px-6 py-3 rounded-lg">
                        <p className="text-white text-base font-bold text-center flex items-center gap-2">
                          <ScanBarcode className="h-5 w-5" />
                          Barcode Detected!
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Scanning line animation */}
              {isScanning && !barcodeDetected && (
                <div className="absolute inset-x-0 top-1/2 h-0.5 bg-primary shadow-lg shadow-primary animate-pulse"></div>
              )}
            </div>

            {/* No camera message */}
            {hasPermission === false && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/90">
                <div className="text-center text-white p-6">
                  <Camera className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium mb-2">Camera Access Required</p>
                  <p className="text-sm opacity-75 mb-4">Please allow camera access in your browser settings</p>
                  <p className="text-xs opacity-60">Or use the manual scan button below</p>
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

          {/* Demo POC Message */}
          <div className="bg-gradient-to-r from-primary/10 to-accent/10 border-2 border-primary/20 rounded-lg p-4 sm:p-6 text-center relative">
            <div className="mb-3 sm:mb-4">
              <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-primary/20 rounded-full mb-2 sm:mb-3">
                <ScanBarcode className="h-6 w-6 sm:h-8 sm:w-8 text-primary animate-pulse" />
              </div>
              <h3 className="text-base sm:text-lg font-bold mb-2">Demo Mode</h3>
              <p className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4">
                Click the button below to simulate a successful barcode scan
              </p>
            </div>
            <button 
              type="button"
              onClick={handleDemoScan}
              className="w-full h-12 sm:h-14 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md font-semibold text-sm sm:text-base shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Zap className="h-4 w-4 sm:h-5 sm:w-5" />
              Scan This Barcode
            </button>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4">
            <p className="text-xs sm:text-sm font-medium mb-2">📌 How it works:</p>
            <ul className="text-[10px] sm:text-xs text-muted-foreground space-y-1">
              <li>• <strong>Laptop/Desktop</strong>: Uses front camera (webcam)</li>
              <li>• <strong>Mobile</strong>: Uses back camera for better scanning</li>
              <li>• Browser will ask for camera permission on first use</li>
              <li>• Point at any real barcode - auto-detects and uses demo value</li>
              <li>• Or click "Scan This Barcode" button manually</li>
              <li>• Demo values ensure consistent workflow for POC</li>
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
  matchValue?: string; // Pass to scanner for matching logic
  shouldMismatch?: boolean; // Pass to scanner for mismatch logic
  matchData?: BarcodeData; // Pass the full barcode data to match
}

export const BarcodeScanButton = ({ 
  onScan, 
  label, 
  variant = "outline", 
  className = "", 
  disabled = false,
  matchValue,
  shouldMismatch = false,
  matchData
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
        matchValue={matchValue}
        shouldMismatch={shouldMismatch}
        matchData={matchData}
      />
    </>
  );
};

