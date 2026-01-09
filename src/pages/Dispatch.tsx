import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import jsPDF from "jspdf";
import {
  Truck,
  ScanBarcode,
  CheckCircle2,
  ArrowLeft,
  X,
  QrCode,
  Printer,
  Download
} from "lucide-react";
import { BarcodeScanButton, type BarcodeData } from "@/components/BarcodeScanner";
import { useSession } from "@/contexts/SessionContext";
import { LogsDialog } from "@/components/LogsDialog";
import type { InvoiceData } from "@/contexts/SessionContext";
import { QRCodeSVG } from "qrcode.react";

interface UploadedRow {
  invoice: string;
  customer: string;
  part: string;
  qty: number;
  status: 'valid-matched' | 'valid-unmatched' | 'error' | 'warning';
  errorMessage?: string;
  customerItem?: string;
  partDescription?: string;
}

interface ValidatedBarcodePair {
  customerBarcode: string;
  autolivBarcode: string;
  binNumber?: string;
  quantity?: string;
  partCode?: string;
  customerItem?: string;
  itemNumber?: string;
  actualQuantity?: number;
}

const Dispatch = () => {
  const navigate = useNavigate();
  const {
    currentUser,
    sharedInvoices,
    scheduleData,
    getScheduledDispatchableInvoices,
    getScheduleForCustomer,
    updateInvoiceDispatch,
    getDispatchLogs,
    selectedCustomer,
    selectedSite
  } = useSession();

  // Route guard
  useEffect(() => {
    if (!selectedCustomer || selectedCustomer.length === 0 || !selectedSite) {
      toast.error("Please select a customer and site before accessing dispatch");
      navigate("/select-customer-site");
    }
  }, [selectedCustomer, selectedSite, navigate]);

  // State management
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [gatepassGenerated, setGatepassGenerated] = useState(false);
  const [dispatchCustomerScan, setDispatchCustomerScan] = useState<BarcodeData | null>(null);
  const [dispatchAutolivScan, setDispatchAutolivScan] = useState<BarcodeData | null>(null);
  const [loadedBarcodes, setLoadedBarcodes] = useState<ValidatedBarcodePair[]>([]);
  const [selectInvoiceValue, setSelectInvoiceValue] = useState<string>("");
  const [gatepassNumber, setGatepassNumber] = useState<string>("");
  const [showDispatchLogs, setShowDispatchLogs] = useState(false);

  // Clear selected invoices if they've been dispatched
  useEffect(() => {
    if (selectedInvoices.length > 0) {
      const stillAvailable = selectedInvoices.filter(id => {
        const invoice = sharedInvoices.find(inv => inv.id === id);
        return invoice && !invoice.dispatchedBy;
      });
      
      if (stillAvailable.length !== selectedInvoices.length) {
        setSelectedInvoices(stillAvailable);
        if (stillAvailable.length === 0) {
          setLoadedBarcodes([]);
          setSelectInvoiceValue("");
        }
      }
    }
  }, [sharedInvoices, selectedInvoices]);

  // Reset select value when switching to dispatch
  useEffect(() => {
    setSelectInvoiceValue("");
  }, []);

  // Helper function to extract unique Customer Items
  const getUniqueCustomerItems = (invoice: InvoiceData | undefined) => {
    if (!invoice || !invoice.items || invoice.items.length === 0) return [];
    
    const customerItemMap = new Map<string, {
      customerItem: string;
      itemNumber: string;
      partDescription: string;
      quantity: number;
    }>();
    
    invoice.items.forEach((item: UploadedRow) => {
      const customerItem = item.customerItem || '';
      if (customerItem) {
        if (customerItemMap.has(customerItem)) {
          const existing = customerItemMap.get(customerItem)!;
          existing.quantity += item.qty;
        } else {
          customerItemMap.set(customerItem, {
            customerItem: customerItem,
            itemNumber: item.part || '',
            partDescription: item.partDescription || '',
            quantity: item.qty
          });
        }
      }
    });
    
    return Array.from(customerItemMap.values());
  };

  const getExpectedBarcodes = () => {
    const selectedInvoiceData = sharedInvoices.filter(inv => 
      selectedInvoices.includes(inv.id) && inv.auditComplete
    );
    return selectedInvoiceData.reduce((total, inv) => total + (inv.scannedBins || 0), 0);
  };

  const getNextUnscannedBarcodePair = () => {
    const selectedInvoiceData = sharedInvoices.filter(inv => 
      selectedInvoices.includes(inv.id) && inv.auditComplete
    );
    
    const allValidatedBarcodes = selectedInvoiceData.flatMap(inv => inv.validatedBarcodes || []);
    
    return allValidatedBarcodes.find(pair => 
      !loadedBarcodes.find(loaded => 
        loaded.customerBarcode === pair.customerBarcode
      )
    );
  };

  // Auto-validate when customer barcode is scanned
  useEffect(() => {
    if (dispatchCustomerScan) {
      handleDispatchScan();
    }
  }, [dispatchCustomerScan]);

  const handleDispatchScan = () => {
    if (!dispatchCustomerScan) {
      toast.error("Please scan customer barcode");
      return;
    }

    const alreadyLoaded = loadedBarcodes.find(pair => 
      pair.customerBarcode === dispatchCustomerScan.rawValue
    );

    if (alreadyLoaded) {
      toast.error("⚠️ Already Loaded!", {
        description: "This item has already been loaded onto the vehicle.",
      });
      return;
    }

    let matchedInvoiceItem: UploadedRow | undefined;
    const scannedPartCode = dispatchCustomerScan.partCode?.trim();
    
    for (const invoiceId of selectedInvoices) {
      const invoice = sharedInvoices.find(inv => inv.id === invoiceId);
      if (invoice && invoice.items && scannedPartCode) {
        matchedInvoiceItem = invoice.items.find((item: UploadedRow) => 
          item.part && item.part.toString().trim() === scannedPartCode
        );
        if (matchedInvoiceItem) {
          break;
        }
      }
    }
    
    if (!matchedInvoiceItem && selectedInvoices.length > 0) {
      for (const invoiceId of selectedInvoices) {
        const invoice = sharedInvoices.find(inv => inv.id === invoiceId);
        if (invoice && invoice.items) {
          const uniqueCustomerItems = getUniqueCustomerItems(invoice);
          const loadedCustomerItems = new Set(
            loadedBarcodes.map(pair => pair.customerItem).filter(Boolean)
          );
          const unloadedCustomerItem = uniqueCustomerItems.find(item => 
            !loadedCustomerItems.has(item.customerItem)
          );
          
          if (unloadedCustomerItem) {
            matchedInvoiceItem = invoice.items.find((item: UploadedRow) => 
              item.customerItem && item.customerItem.trim() === unloadedCustomerItem.customerItem
            );
            if (matchedInvoiceItem) {
              break;
            }
          }
        }
      }
    }

    const newPair: ValidatedBarcodePair = {
      customerBarcode: dispatchCustomerScan.rawValue,
      autolivBarcode: "",
      binNumber: dispatchCustomerScan.binNumber,
      quantity: dispatchCustomerScan.quantity,
      partCode: dispatchCustomerScan.partCode,
      customerItem: matchedInvoiceItem?.customerItem || undefined,
      itemNumber: matchedInvoiceItem?.part || undefined,
      actualQuantity: matchedInvoiceItem?.qty || undefined
    };
    
    setLoadedBarcodes(prev => [...prev, newPair]);
    
    selectedInvoices.forEach(invoiceId => {
      const invoice = sharedInvoices.find(inv => inv.id === invoiceId);
      if (invoice) {
        invoice.binsLoaded = (invoice.binsLoaded || 0) + 1;
      }
    });
    
    const displayInfo = matchedInvoiceItem 
      ? `${matchedInvoiceItem.customerItem || dispatchCustomerScan.partCode} - Qty: ${matchedInvoiceItem.qty || dispatchCustomerScan.quantity}`
      : `${dispatchCustomerScan.partCode} - Qty: ${dispatchCustomerScan.quantity}`;
    
    toast.success("✅ Item loaded successfully!", {
      description: displayInfo
    });
    
    setDispatchCustomerScan(null);
    setDispatchAutolivScan(null);
  };

  const handleGenerateGatepass = () => {
    if (!vehicleNumber) {
      toast.error("Please enter vehicle number");
      return;
    }
    if (selectedInvoices.length === 0) {
      toast.error("Please select at least one invoice");
      return;
    }

    const expectedBarcodes = getExpectedBarcodes();
    if (loadedBarcodes.length < expectedBarcodes) {
      toast.error("⚠️ Not All Items Loaded!", {
        description: `Please scan all items. Loaded: ${loadedBarcodes.length}/${expectedBarcodes}`,
      });
      return;
    }

    const dispatchedInvoicesList = selectedInvoices.join(', ');
    selectedInvoices.forEach(invoiceId => {
      const binNumber = loadedBarcodes.length > 0 ? loadedBarcodes[0].binNumber : undefined;
      const totalQuantity = loadedBarcodes.reduce((sum, b) => sum + (parseInt(b.quantity || '0') || 0), 0);
      
      updateInvoiceDispatch(invoiceId, currentUser, vehicleNumber, binNumber, totalQuantity || undefined);
    });

    const newGatepassNumber = `GP-${Date.now().toString().slice(-8)}`;
    setGatepassNumber(newGatepassNumber);

    setGatepassGenerated(true);
    toast.success(`✅ Gatepass generated successfully by ${currentUser}!`, {
      description: `Vehicle ${vehicleNumber} dispatched with ${selectedInvoices.length} invoice(s).`,
      duration: 6000
    });
  };

  const generateGatepassQRData = () => {
    const selectedInvoiceData = sharedInvoices.filter(inv => selectedInvoices.includes(inv.id));
    const customers = [...new Set(selectedInvoiceData.map(inv => inv.customer))];
    const customerName = customers.join(", ");
    
    const partCodes = [...new Set(loadedBarcodes.map(b => b.partCode).filter(Boolean))];
    const binNumbers = [...new Set(loadedBarcodes.map(b => b.binNumber).filter(Boolean))];
    const totalQuantity = loadedBarcodes.reduce((sum, b) => sum + (parseInt(b.quantity || '0') || 0), 0);
    
    const items = loadedBarcodes.map((barcode, index) => ({
      itemNumber: index + 1,
      partCode: barcode.partCode || "N/A",
      binNumber: barcode.binNumber || "N/A",
      quantity: barcode.quantity || "0",
      customerBarcode: barcode.customerBarcode
    }));
    
    const qrData = {
      gatepassNumber: gatepassNumber || `GP-${Date.now().toString().slice(-8)}`,
      vehicleNumber: vehicleNumber,
      dateTime: new Date().toISOString(),
      authorizedBy: currentUser,
      customer: customerName,
      invoices: selectedInvoices,
      summary: {
        totalItems: loadedBarcodes.length,
        invoiceCount: selectedInvoices.length,
        totalQuantity: totalQuantity,
        uniquePartCodes: partCodes.length,
        uniqueBinNumbers: binNumbers.length
      },
      partCodes: partCodes,
      binNumbers: binNumbers,
      items: items
    };
    
    return JSON.stringify(qrData);
  };

  const handlePrintGatepass = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error("Please allow popups to print the gatepass");
      return;
    }

    const selectedInvoiceData = sharedInvoices.filter(inv => selectedInvoices.includes(inv.id));
    const customers = [...new Set(selectedInvoiceData.map(inv => inv.customer))];
    const customerName = customers.join(", ");
    const totalQuantity = loadedBarcodes.reduce((sum, b) => sum + (parseInt(b.quantity || '0') || 0), 0);
    const currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const currentTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    
    const qrData = generateGatepassQRData();
    const encodedQRData = encodeURIComponent(qrData);
    const qrCodeImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&ecc=H&margin=4&data=${encodedQRData}`;

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Gatepass ${gatepassNumber}</title>
          <style>
            @media print {
              @page { margin: 1cm; }
            }
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              max-width: 800px;
              margin: 0 auto;
            }
            .header {
              text-align: center;
              border-bottom: 3px solid #000;
              padding-bottom: 20px;
              margin-bottom: 20px;
            }
            .header h1 {
              margin: 0;
              font-size: 24px;
              font-weight: bold;
            }
            .header p {
              margin: 5px 0;
              color: #666;
            }
            .info-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 15px;
              margin-bottom: 20px;
            }
            .info-item {
              padding: 10px;
              border-bottom: 1px solid #ddd;
            }
            .info-label {
              font-weight: bold;
              color: #666;
              font-size: 12px;
              margin-bottom: 5px;
            }
            .info-value {
              font-size: 14px;
            }
            .invoices-section {
              margin: 20px 0;
            }
            .items-table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 15px;
            }
            .items-table th,
            .items-table td {
              border: 1px solid #ddd;
              padding: 8px;
              text-align: left;
              font-size: 12px;
            }
            .items-table th {
              background-color: #f5f5f5;
              font-weight: bold;
            }
            .qr-section {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 2px solid #000;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #ddd;
              text-align: center;
              font-size: 11px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>MANUFACTURING DISPATCH</h1>
            <p>Vehicle Exit Authorization</p>
            <p><strong>Gatepass #${gatepassNumber}</strong></p>
          </div>

          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Vehicle Number</div>
              <div class="info-value">${vehicleNumber}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Date & Time</div>
              <div class="info-value">${currentDate} at ${currentTime}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Customer</div>
              <div class="info-value">${customerName}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Authorized By</div>
              <div class="info-value">${currentUser}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Total Quantity</div>
              <div class="info-value">${totalQuantity}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Total Items</div>
              <div class="info-value">${loadedBarcodes.length}</div>
            </div>
          </div>

          <div class="invoices-section">
            <h3 style="margin-bottom: 10px; font-size: 16px;">Invoice Numbers:</h3>
            <p style="margin: 0;">${selectedInvoices.join(", ")}</p>
          </div>

          <div class="invoices-section">
            <h3 style="margin-bottom: 10px; font-size: 16px;">Items Loaded:</h3>
            <table class="items-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Part Code</th>
                  <th>Bin Number</th>
                  <th>Quantity</th>
                </tr>
              </thead>
              <tbody>
                ${loadedBarcodes.map((item, index) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td>${item.partCode || "N/A"}</td>
                    <td>${item.binNumber || "N/A"}</td>
                    <td>${item.quantity || "0"}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div class="qr-section">
            <h3 style="margin-bottom: 15px; font-size: 16px; text-align: center;">QR Code:</h3>
            <div style="text-align: center; padding: 20px;">
              <div style="display: inline-block; padding: 20px; background: white; border: 2px solid #ddd; border-radius: 8px;">
                <img src="${qrCodeImageUrl}" alt="Gatepass QR Code" style="width: 300px; height: 300px; display: block;" />
              </div>
            </div>
            <p style="margin-top: 10px; font-size: 11px; color: #666; text-align: center;">Scan QR code to verify gatepass details</p>
          </div>

          <div class="footer">
            <p>This gatepass is authorized for vehicle exit. Please verify all items before dispatch.</p>
            <p>Generated on ${currentDate} at ${currentTime}</p>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    
    printWindow.onload = () => {
      const img = printWindow.document.querySelector('img[alt="Gatepass QR Code"]') as HTMLImageElement;
      if (img) {
        if (img.complete) {
          setTimeout(() => {
            printWindow.print();
            printWindow.onafterprint = () => printWindow.close();
          }, 100);
        } else {
          img.onload = () => {
            setTimeout(() => {
              printWindow.print();
              printWindow.onafterprint = () => printWindow.close();
            }, 100);
          };
          img.onerror = () => {
            setTimeout(() => {
              printWindow.print();
              printWindow.onafterprint = () => printWindow.close();
            }, 100);
          };
        }
      } else {
        setTimeout(() => {
          printWindow.print();
          printWindow.onafterprint = () => printWindow.close();
        }, 500);
      }
    };
    
    toast.success("Print dialog opened");
  };

  const handleDownloadPDF = () => {
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let yPos = margin;

      const selectedInvoiceData = sharedInvoices.filter(inv => selectedInvoices.includes(inv.id));
      const customers = [...new Set(selectedInvoiceData.map(inv => inv.customer))];
      const customerName = customers.join(", ");
      const totalQuantity = loadedBarcodes.reduce((sum, b) => sum + (parseInt(b.quantity || '0') || 0), 0);
      const currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const currentTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

      pdf.setFontSize(20);
      pdf.setFont(undefined, 'bold');
      pdf.text('MANUFACTURING DISPATCH', pageWidth / 2, yPos, { align: 'center' });
      yPos += 8;

      pdf.setFontSize(12);
      pdf.setFont(undefined, 'normal');
      pdf.text('Vehicle Exit Authorization', pageWidth / 2, yPos, { align: 'center' });
      yPos += 8;

      pdf.setFontSize(14);
      pdf.setFont(undefined, 'bold');
      pdf.text(`Gatepass #${gatepassNumber}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;

      pdf.setFontSize(10);
      pdf.setFont(undefined, 'bold');
      pdf.text('Gatepass Information:', margin, yPos);
      yPos += 7;

      pdf.setFont(undefined, 'normal');
      pdf.setFontSize(9);
      pdf.text(`Vehicle Number: ${vehicleNumber}`, margin, yPos);
      yPos += 6;
      pdf.text(`Date & Time: ${currentDate} at ${currentTime}`, margin, yPos);
      yPos += 6;
      pdf.text(`Customer: ${customerName}`, margin, yPos);
      yPos += 6;
      pdf.text(`Authorized By: ${currentUser}`, margin, yPos);
      yPos += 6;
      pdf.text(`Total Quantity: ${totalQuantity}`, margin, yPos);
      yPos += 6;
      pdf.text(`Total Items: ${loadedBarcodes.length}`, margin, yPos);
      yPos += 10;

      pdf.setFont(undefined, 'bold');
      pdf.text('Invoice Numbers:', margin, yPos);
      yPos += 6;
      pdf.setFont(undefined, 'normal');
      const invoiceText = selectedInvoices.join(", ");
      const splitInvoices = pdf.splitTextToSize(invoiceText, pageWidth - 2 * margin);
      pdf.text(splitInvoices, margin, yPos);
      yPos += splitInvoices.length * 5 + 5;

      if (yPos > pageHeight - 60) {
        pdf.addPage();
        yPos = margin;
      }

      pdf.setFont(undefined, 'bold');
      pdf.text('Items Loaded:', margin, yPos);
      yPos += 7;

      pdf.setFontSize(8);
      pdf.setFont(undefined, 'bold');
      pdf.text('#', margin, yPos);
      pdf.text('Part Code', margin + 20, yPos);
      pdf.text('Bin Number', margin + 70, yPos);
      pdf.text('Quantity', margin + 120, yPos);
      yPos += 5;

      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 3;

      pdf.setFont(undefined, 'normal');
      loadedBarcodes.forEach((item, index) => {
        if (yPos > pageHeight - 20) {
          pdf.addPage();
          yPos = margin;
        }
        pdf.text(String(index + 1), margin, yPos);
        pdf.text(item.partCode || "N/A", margin + 20, yPos);
        pdf.text(item.binNumber || "N/A", margin + 70, yPos);
        pdf.text(item.quantity || "0", margin + 120, yPos);
        yPos += 6;
      });

      yPos = pageHeight - 20;
      pdf.setFontSize(8);
      pdf.setFont(undefined, 'italic');
      pdf.text('This gatepass is authorized for vehicle exit. Please verify all items before dispatch.', pageWidth / 2, yPos, { align: 'center' });
      yPos += 5;
      pdf.text(`Generated on ${currentDate} at ${currentTime}`, pageWidth / 2, yPos, { align: 'center' });

      const fileName = `Gatepass_${gatepassNumber}_${vehicleNumber}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
      
      toast.success("PDF downloaded successfully!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 sm:h-10 sm:w-10"
                onClick={() => navigate("/home")}
              >
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              <div className="flex-1">
                <h1 className="text-lg sm:text-2xl font-bold text-foreground">Loading & Dispatch</h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Manage vehicle loading and generate gatepass</p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowDispatchLogs(true)}
              className="flex items-center gap-2 w-full sm:w-auto justify-center"
            >
              <Truck className="h-4 w-4" />
              <span>Dispatch Logs</span>
              {getDispatchLogs().length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {getDispatchLogs().length}
                </Badge>
              )}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8 pb-24 sm:pb-8 max-w-5xl">
        {!scheduleData && (
          <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm font-medium">
              ⚠️ No schedule uploaded yet. Please go to <strong>Upload Sales Data</strong> to import both schedule and invoice files first.
            </p>
          </div>
        )}
        
        {scheduleData && getScheduledDispatchableInvoices().length === 0 && (
          <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm font-medium mb-2">
              📋 No scheduled invoices available for dispatch.
            </p>
            <p className="text-xs text-muted-foreground">
              {sharedInvoices.filter(inv => inv.dispatchedBy).length > 0 
                ? `✅ All scheduled invoices have been dispatched. Upload new data or complete pending audits.`
                : `Please complete document audit for scheduled invoices before dispatch.`
              }
            </p>
          </div>
        )}
        
        {scheduleData && getScheduledDispatchableInvoices().length > 0 && (
          <div className="mb-4 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
            <p className="text-sm font-medium mb-2">
              ✅ Scheduled Dispatch Available
            </p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>• Showing {getScheduledDispatchableInvoices().length} audited invoice(s) with matching schedule</p>
              <p>• Schedule uploaded: {scheduleData.uploadedAt.toLocaleString()}</p>
              <p>• Current user: <strong>{currentUser}</strong></p>
            </div>
          </div>
        )}
        
        {!gatepassGenerated ? (
          <div className="space-y-6">
            {/* Vehicle Information */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Truck className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Vehicle Details</CardTitle>
                    <CardDescription>Enter the vehicle number for loading</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="vehicle">Vehicle Number</Label>
                  <Input
                    id="vehicle"
                    placeholder="Enter vehicle registration number"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                    className="h-12 text-lg font-semibold"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Invoice Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Select Invoice for Loading</CardTitle>
                <CardDescription>Choose an audited invoice to load onto the vehicle</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="invoice-select">Select Invoice(s)</Label>
                    <div className="flex gap-2">
                      <Select 
                        value={selectInvoiceValue}
                        onValueChange={(value) => {
                          setSelectInvoiceValue("");
                          
                          if (value && value !== "no-invoices" && value.trim() !== "") {
                            const selectedInvoice = sharedInvoices.find(inv => inv.id === value);
                            if (selectedInvoice) {
                              if (!selectedInvoice.auditComplete) {
                                toast.error("Invoice not audited", {
                                  description: "Please complete audit before selecting for dispatch"
                                });
                                return;
                              }
                              if (selectedInvoice.dispatchedBy) {
                                toast.error("Invoice already dispatched", {
                                  description: "This invoice has already been dispatched"
                                });
                                return;
                              }
                              
                              const currentCustomer = selectedInvoices.length > 0 
                                ? sharedInvoices.find(inv => inv.id === selectedInvoices[0])?.customer 
                                : null;
                              
                              if (!currentCustomer || currentCustomer === selectedInvoice.customer) {
                                if (!selectedInvoices.includes(value)) {
                                  setSelectedInvoices(prev => [...prev, value]);
                                }
                              } else {
                                toast.error("Cannot add invoice from different customer", {
                                  description: `All invoices must be from ${currentCustomer}`
                                });
                              }
                            }
                          }
                        }}
                      >
                        <SelectTrigger id="invoice-select" className="h-14 text-base flex-1">
                          <SelectValue placeholder="Select an invoice to add" />
                        </SelectTrigger>
                        <SelectContent>
                          {getScheduledDispatchableInvoices().filter(inv => inv.id !== "No Data").length > 0 ? (
                            getScheduledDispatchableInvoices().filter(inv => inv.id !== "No Data").map(invoice => {
                              const currentCustomer = selectedInvoices.length > 0 
                                ? sharedInvoices.find(inv => inv.id === selectedInvoices[0])?.customer 
                                : null;
                              const isDifferentCustomer = currentCustomer && currentCustomer !== invoice.customer;
                              const isAlreadySelected = selectedInvoices.includes(invoice.id);
                              const scheduleItems = getScheduleForCustomer(invoice.billTo || '');

                              return (
                                <SelectItem 
                                  key={invoice.id}
                                  value={invoice.id} 
                                  className="py-3"
                                  disabled={isDifferentCustomer || isAlreadySelected}
                                >
                                  <div className="flex items-center justify-between w-full gap-4">
                                    <div className="flex flex-col">
                                      <span className="font-semibold">{invoice.id}</span>
                                      <span className="text-xs text-muted-foreground">{invoice.customer}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {isAlreadySelected && (
                                        <Badge variant="secondary" className="text-xs">
                                          Added
                                        </Badge>
                                      )}
                                      <Badge variant="outline" className="text-xs">
                                        Qty: {invoice.totalQty}
                                      </Badge>
                                      {scheduleItems.length > 0 && (
                                        <Badge variant="secondary" className="text-xs">
                                          {scheduleItems.length} items
                                        </Badge>
                                      )}
                                      <Badge variant="default" className="text-xs">
                                        <CheckCircle2 className="h-3 w-3 mr-1" />
                                        Audited
                                      </Badge>
                                    </div>
                                  </div>
                                </SelectItem>
                              );
                            })
                          ) : (
                            <div className="p-4 text-center text-sm text-muted-foreground">
                              No scheduled audited invoices available for dispatch
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Selected Invoices List */}
                  {selectedInvoices.length > 0 && (
                    <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-medium">
                          📦 Selected Invoice{selectedInvoices.length > 1 ? 's' : ''} ({selectedInvoices.length})
                        </p>
                        {selectedInvoices.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedInvoices([]);
                              setLoadedBarcodes([]);
                              setSelectInvoiceValue("");
                            }}
                            className="h-8 text-xs"
                          >
                            Clear All
                          </Button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {selectedInvoices.map((invoiceId, index) => {
                          const invoice = sharedInvoices.find(inv => inv.id === invoiceId);
                          return invoice ? (
                            <div key={invoiceId} className="p-3 bg-white dark:bg-gray-900 border border-border rounded-lg">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Badge variant="outline" className="text-xs">#{index + 1}</Badge>
                                    <p className="font-semibold text-sm">{invoice.id}</p>
                                    <p className="text-xs text-muted-foreground">{invoice.customer}</p>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                      <p className="text-muted-foreground">Customer Items</p>
                                      <p className="font-medium">{invoice.scannedBins}/{invoice.expectedBins}</p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground">Quantity</p>
                                      <p className="font-medium">{invoice.totalQty}</p>
                                    </div>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedInvoices(prev => prev.filter(id => id !== invoiceId));
                                    setLoadedBarcodes([]);
                                    setSelectInvoiceValue("");
                                  }}
                                  className="h-8 w-8 p-0"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ) : null;
                        })}
                      </div>
                      {selectedInvoices.length > 0 && (() => {
                        const firstInvoice = sharedInvoices.find(inv => inv.id === selectedInvoices[0]);
                        return firstInvoice ? (
                          <div className="mt-3 pt-3 border-t border-border">
                            <p className="text-xs text-muted-foreground mb-2">
                              🚚 Loading for: <strong>{firstInvoice.customer}</strong>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Only invoices from this customer can be added
                            </p>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Barcode Scanning for Loading */}
            {selectedInvoices.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <ScanBarcode className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Scan Items for Loading</CardTitle>
                      <CardDescription>Scan customer barcode for each item to load onto the vehicle</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Progress Indicator */}
                    <div className="p-4 bg-muted rounded-lg">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="font-medium">Loading Progress</span>
                        <span className="text-muted-foreground">
                          {loadedBarcodes.length} of {getExpectedBarcodes()} items loaded
                        </span>
                      </div>
                      <Progress 
                        value={getExpectedBarcodes() > 0 ? (loadedBarcodes.length / getExpectedBarcodes()) * 100 : 0} 
                        className="h-2"
                      />
                    </div>

                    {/* Scanning Input */}
                    <div className="flex justify-center">
                      <div className="w-full max-w-lg">
                        <div className="space-y-4">
                          <div className="text-center mb-4">
                            <Label htmlFor="dispatch-customer-barcode" className="flex items-center justify-center gap-2 text-base font-semibold">
                              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold">1</span>
                              Scan Customer Label
                            </Label>
                            <p className="text-sm text-muted-foreground mt-2">
                              Scan the customer barcode to load the item
                            </p>
                          </div>
                          
                          {dispatchCustomerScan && (
                            <div className="p-4 bg-muted rounded-lg border-2 border-primary/20">
                              <p className="text-sm font-semibold text-foreground mb-3 text-center">Scanned Data:</p>
                              <div className="grid grid-cols-3 gap-4">
                                <div className="text-center">
                                  <p className="text-xs text-muted-foreground mb-1">Part Code</p>
                                  <p className="text-sm font-mono font-bold break-all">{dispatchCustomerScan.partCode}</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-muted-foreground mb-1">Quantity</p>
                                  <p className="text-sm font-mono font-bold">{dispatchCustomerScan.quantity}</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-muted-foreground mb-1">Bin Number</p>
                                  <p className="text-sm font-mono font-bold break-all">{dispatchCustomerScan.binNumber}</p>
                                </div>
                              </div>
                            </div>
                          )}
                          
                          <BarcodeScanButton
                            onScan={(data) => {
                              setDispatchCustomerScan(data);
                              toast.success("Customer barcode scanned!");
                            }}
                            label={dispatchCustomerScan ? "Scan Again" : "Scan Customer Barcode"}
                            variant="default"
                            matchValue={getNextUnscannedBarcodePair()?.customerBarcode}
                            shouldMismatch={false}
                            totalQuantity={selectedInvoices.length > 0 ? sharedInvoices.find(inv => selectedInvoices.includes(inv.id))?.totalQty : undefined}
                            binCapacity={selectedInvoices.length > 0 ? sharedInvoices.find(inv => selectedInvoices.includes(inv.id))?.binCapacity : undefined}
                            expectedBins={selectedInvoices.length > 0 ? sharedInvoices.find(inv => selectedInvoices.includes(inv.id))?.expectedBins : undefined}
                            currentBinIndex={loadedBarcodes.length}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Status and Clear Button */}
                    {dispatchCustomerScan && (
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                          <span className="text-sm font-medium text-green-700 dark:text-green-300">
                            ✓ Customer Label Scanned - Item loaded automatically
                          </span>
                        </div>
                        <Button 
                          variant="outline"
                          onClick={() => {
                            setDispatchCustomerScan(null);
                            setDispatchAutolivScan(null);
                          }}
                          className="h-9 text-sm"
                        >
                          Clear Scan
                        </Button>
                      </div>
                    )}

                    {/* Loaded Items List */}
                    {loadedBarcodes.length > 0 && (
                      <div className="border rounded-lg p-3 sm:p-4 max-h-96 overflow-y-auto">
                        <p className="text-xs sm:text-sm font-medium mb-3">Loaded Items:</p>
                        <div className="space-y-3">
                          {loadedBarcodes.map((barcodePair, index) => (
                            <div key={index} className="border rounded-lg p-3 bg-muted">
                              <div className="flex items-start justify-between mb-2">
                                <span className="text-xs font-semibold text-muted-foreground">Item #{index + 1}</span>
                                <Badge variant="default" className="text-xs">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Loaded
                                </Badge>
                              </div>
                              <div className="space-y-2 text-sm">
                                {barcodePair.customerItem && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground min-w-[100px]">Customer Item:</span>
                                    <span className="font-medium text-xs">{barcodePair.customerItem}</span>
                                  </div>
                                )}
                                {barcodePair.itemNumber && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground min-w-[100px]">Item Number:</span>
                                    <span className="font-mono text-xs">{barcodePair.itemNumber}</span>
                                  </div>
                                )}
                                {(barcodePair.actualQuantity !== undefined) && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground min-w-[100px]">Quantity:</span>
                                    <span className="font-semibold text-xs">{barcodePair.actualQuantity}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Summary */}
            {selectedInvoices.length > 0 && loadedBarcodes.length === getExpectedBarcodes() && (
              <Card>
                <CardHeader>
                  <CardTitle>Loading Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted rounded-lg p-4 space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vehicle Number</span>
                      <span className="font-semibold">{vehicleNumber || "Not entered"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Selected Invoices</span>
                      <span className="font-semibold">{selectedInvoices.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Items</span>
                      <span className="font-semibold">
                        {sharedInvoices
                          .filter(inv => selectedInvoices.includes(inv.id))
                          .reduce((sum, inv) => sum + inv.scannedBins, 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Quantity</span>
                      <span className="font-semibold">
                        {sharedInvoices
                          .filter(inv => selectedInvoices.includes(inv.id))
                          .reduce((sum, inv) => sum + inv.totalQty, 0)}
                      </span>
                    </div>
                  </div>
                  <Button 
                    onClick={handleGenerateGatepass} 
                    className="w-full mt-4 h-12 text-base font-semibold"
                    disabled={!vehicleNumber || selectedInvoices.length === 0}
                  >
                    <QrCode className="h-5 w-5 mr-2" />
                    Generate Gatepass
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          /* Gatepass Preview */
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setGatepassGenerated(false);
                setGatepassNumber("");
              }}
              className="flex items-center gap-2 mb-4 text-sm sm:text-base"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to Loading</span>
              <span className="sm:hidden">Back</span>
            </Button>
            
            <Card>
              <CardHeader className="text-center pb-4">
                <div className="flex justify-center mb-3">
                  <div className="p-3 bg-success/10 rounded-full">
                    <QrCode className="h-10 w-10 text-success" />
                  </div>
                </div>
                <CardTitle className="text-2xl">Gatepass Generated</CardTitle>
                <CardDescription>Gatepass #{gatepassNumber || `GP-${Date.now().toString().slice(-8)}`}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Gatepass Details */}
                <div className="border rounded-lg p-6 space-y-4">
                  <div className="text-center pb-4 border-b">
                    <h3 className="text-lg font-bold mb-1">MANUFACTURING DISPATCH</h3>
                    <p className="text-sm text-muted-foreground">Vehicle Exit Authorization</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground mb-1">Vehicle Number</p>
                      <p className="font-semibold">{vehicleNumber}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Date & Time</p>
                      <p className="font-semibold">{new Date().toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Authorized By</p>
                      <p className="font-semibold">{currentUser}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Total Invoices</p>
                      <p className="font-semibold">{selectedInvoices.length}</p>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <p className="text-sm font-semibold mb-2">Invoices:</p>
                    <div className="space-y-1">
                      {selectedInvoices.map(id => {
                        const invoice = sharedInvoices.find(inv => inv.id === id);
                        return (
                          <div key={id} className="flex justify-between text-sm">
                            <span>{invoice?.id}</span>
                            <span className="text-muted-foreground">{invoice?.customer}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* QR Code */}
                  <div className="flex flex-col items-center pt-4 border-t">
                    <p className="text-sm font-semibold mb-3 text-muted-foreground">Scan QR Code for Details</p>
                    <div className="p-4 bg-white rounded-lg border-2 border-border shadow-sm">
                      <QRCodeSVG
                        value={generateGatepassQRData()}
                        size={300}
                        level="H"
                        includeMargin={true}
                        marginSize={4}
                        bgColor="#FFFFFF"
                        fgColor="#000000"
                      />
                    </div>
                    <div className="mt-4 p-3 bg-muted rounded-lg w-full max-w-md">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">QR Code Contains:</p>
                      <div className="text-xs space-y-1 text-foreground">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Customer:</span>
                          <span className="font-medium">{[...new Set(sharedInvoices.filter(inv => selectedInvoices.includes(inv.id)).map(inv => inv.customer))].join(", ")}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Part Codes:</span>
                          <span className="font-medium">{[...new Set(loadedBarcodes.map(b => b.partCode).filter(Boolean))].length} unique</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Bin Numbers:</span>
                          <span className="font-medium">{[...new Set(loadedBarcodes.map(b => b.binNumber).filter(Boolean))].length} unique</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Quantity:</span>
                          <span className="font-medium">{loadedBarcodes.reduce((sum, b) => sum + (parseInt(b.quantity || '0') || 0), 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Vehicle:</span>
                          <span className="font-medium">{vehicleNumber}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-3">
                  <Button 
                    variant="outline" 
                    className="h-12"
                    onClick={handlePrintGatepass}
                  >
                    <Printer className="h-5 w-5 mr-2" />
                    Print Gatepass
                  </Button>
                  <Button 
                    variant="outline" 
                    className="h-12"
                    onClick={handleDownloadPDF}
                  >
                    <Download className="h-5 w-5 mr-2" />
                    Download PDF
                  </Button>
                </div>

                <div className="flex gap-3">
                  <Button 
                    className="flex-1 h-12"
                    onClick={() => navigate("/home")}
                  >
                    Return to Home
                  </Button>
                  <Button 
                    variant="outline" 
                    className="h-12"
                    onClick={() => {
                      setGatepassGenerated(false);
                      setVehicleNumber("");
                      setSelectedInvoices([]);
                      setLoadedBarcodes([]);
                      setDispatchCustomerScan(null);
                      setDispatchAutolivScan(null);
                      setSelectInvoiceValue("");
                      setGatepassNumber("");
                    }}
                  >
                    New Dispatch
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>

      {/* Dispatch Logs Dialog */}
      <LogsDialog
        open={showDispatchLogs}
        onOpenChange={setShowDispatchLogs}
        title="Dispatch Logs"
        logs={getDispatchLogs()}
      />
    </div>
  );
};

export default Dispatch;
