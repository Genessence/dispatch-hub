import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, X, ScanBarcode, Zap } from "lucide-react";
import { toast } from "sonner";

interface BarcodeScannerProps {
  onScan: (value: string) => void;
  title?: string;
  description?: string;
  isOpen: boolean;
  onClose: () => void;
  matchValue?: string; // If provided, use this value to match
  shouldMismatch?: boolean; // If true, generate different value
}

export const BarcodeScanner = ({ 
  onScan, 
  title = "Scan Barcode", 
  description = "Position the barcode within the frame", 
  isOpen, 
  onClose,
  matchValue,
  shouldMismatch = false
}: BarcodeScannerProps) => {
  
  const handleClose = () => {
    onClose();
  };

  const handleDemoScan = () => {
    console.log("Scan button clicked!");
    
    let demoBarcode: string;
    
    // If we have a matchValue and should NOT mismatch, use the same value
    if (matchValue && !shouldMismatch) {
      demoBarcode = matchValue;
      console.log("Using matching barcode:", demoBarcode);
    }
    // If we should mismatch, generate a different value
    else if (matchValue && shouldMismatch) {
      const randomBarcode = Math.floor(Math.random() * 900000000000) + 100000000000;
      demoBarcode = randomBarcode.toString();
      // Make sure it's actually different
      while (demoBarcode === matchValue) {
        const newRandom = Math.floor(Math.random() * 900000000000) + 100000000000;
        demoBarcode = newRandom.toString();
      }
      console.log("Generated mismatching barcode:", demoBarcode);
    }
    // First scan - generate new random value
    else {
      const randomBarcode = Math.floor(Math.random() * 900000000000) + 100000000000;
      demoBarcode = randomBarcode.toString();
      console.log("Generated new barcode:", demoBarcode);
    }
    
    // Show success message
    toast.success("Barcode scanned successfully!");
    
    // Send the barcode value to parent
    onScan(demoBarcode);
    
    console.log("Calling onClose...");
    
    // Close the dialog immediately
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onEscapeKeyDown={handleClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanBarcode className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Barcode Visual Demo */}
          <div className="relative bg-gradient-to-br from-gray-900 to-gray-800 rounded-lg overflow-hidden p-8">
            <div className="flex items-center justify-center">
              <div className="bg-white rounded-lg p-8 shadow-2xl">
                <div className="flex items-center justify-center mb-4">
                  <ScanBarcode className="h-12 w-12 text-primary animate-pulse" />
                </div>
                <div className="border-4 border-primary rounded-lg p-6 bg-white">
                  <svg viewBox="0 0 200 80" className="w-full h-auto" style={{ maxWidth: "300px" }}>
                    {/* Barcode illustration */}
                    <rect x="10" y="10" width="3" height="60" fill="#000"/>
                    <rect x="15" y="10" width="2" height="60" fill="#000"/>
                    <rect x="19" y="10" width="4" height="60" fill="#000"/>
                    <rect x="25" y="10" width="2" height="60" fill="#000"/>
                    <rect x="29" y="10" width="3" height="60" fill="#000"/>
                    <rect x="34" y="10" width="5" height="60" fill="#000"/>
                    <rect x="41" y="10" width="2" height="60" fill="#000"/>
                    <rect x="45" y="10" width="3" height="60" fill="#000"/>
                    <rect x="50" y="10" width="2" height="60" fill="#000"/>
                    <rect x="54" y="10" width="4" height="60" fill="#000"/>
                    <rect x="60" y="10" width="2" height="60" fill="#000"/>
                    <rect x="64" y="10" width="3" height="60" fill="#000"/>
                    <rect x="69" y="10" width="2" height="60" fill="#000"/>
                    <rect x="73" y="10" width="5" height="60" fill="#000"/>
                    <rect x="80" y="10" width="2" height="60" fill="#000"/>
                    <rect x="84" y="10" width="3" height="60" fill="#000"/>
                    <rect x="89" y="10" width="4" height="60" fill="#000"/>
                    <rect x="95" y="10" width="2" height="60" fill="#000"/>
                    <rect x="99" y="10" width="3" height="60" fill="#000"/>
                    <rect x="104" y="10" width="2" height="60" fill="#000"/>
                    <rect x="108" y="10" width="5" height="60" fill="#000"/>
                    <rect x="115" y="10" width="2" height="60" fill="#000"/>
                    <rect x="119" y="10" width="3" height="60" fill="#000"/>
                    <rect x="124" y="10" width="2" height="60" fill="#000"/>
                    <rect x="128" y="10" width="4" height="60" fill="#000"/>
                    <rect x="134" y="10" width="3" height="60" fill="#000"/>
                    <rect x="139" y="10" width="2" height="60" fill="#000"/>
                    <rect x="143" y="10" width="4" height="60" fill="#000"/>
                    <rect x="149" y="10" width="2" height="60" fill="#000"/>
                    <rect x="153" y="10" width="3" height="60" fill="#000"/>
                    <rect x="158" y="10" width="5" height="60" fill="#000"/>
                    <rect x="165" y="10" width="2" height="60" fill="#000"/>
                    <rect x="169" y="10" width="3" height="60" fill="#000"/>
                    <rect x="174" y="10" width="2" height="60" fill="#000"/>
                    <rect x="178" y="10" width="4" height="60" fill="#000"/>
                    <rect x="184" y="10" width="2" height="60" fill="#000"/>
                    <rect x="188" y="10" width="3" height="60" fill="#000"/>
                  </svg>
                  <p className="text-center text-sm font-mono mt-4 text-gray-700 font-bold">*1234567890*</p>
                </div>
                <p className="text-center text-sm font-medium mt-4 text-gray-700">
                  Sample Barcode for Demo
                </p>
              </div>
            </div>
          </div>

          {/* Demo POC Message */}
          <div className="bg-gradient-to-r from-primary/10 to-accent/10 border-2 border-primary/20 rounded-lg p-6 text-center relative">
            <div className="mb-4">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/20 rounded-full mb-3">
                <ScanBarcode className="h-8 w-8 text-primary animate-pulse" />
              </div>
              <h3 className="text-lg font-bold mb-2">Demo Mode</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Click the button below to simulate a successful barcode scan
              </p>
            </div>
            <button 
              type="button"
              onClick={handleDemoScan}
              className="w-full h-14 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md font-semibold text-base shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Zap className="h-5 w-5" />
              Scan This Barcode
            </button>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm font-medium mb-2">📌 How it works:</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• The camera view shows what the barcode scanner sees</li>
              <li>• In production, it will automatically detect barcodes</li>
              <li>• For this demo, click "Scan This Barcode" to simulate scanning</li>
              <li>• Each click generates a unique barcode value</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button 
              type="button"
              onClick={handleClose}
              className="flex-1 h-12 border-2 border-gray-300 hover:border-gray-400 bg-white hover:bg-gray-50 rounded-md font-semibold text-base transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              <X className="h-4 w-4" />
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
  onScan: (value: string) => void;
  label: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  className?: string;
  disabled?: boolean;
  matchValue?: string; // Pass to scanner for matching logic
  shouldMismatch?: boolean; // Pass to scanner for mismatch logic
}

export const BarcodeScanButton = ({ 
  onScan, 
  label, 
  variant = "outline", 
  className = "", 
  disabled = false,
  matchValue,
  shouldMismatch = false
}: BarcodeScanButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleScan = (value: string) => {
    onScan(value);
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
      />
    </>
  );
};

