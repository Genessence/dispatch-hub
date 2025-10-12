import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const UploadData = () => {
  const [file, setFile] = useState<File | null>(null);
  const [uploadStage, setUploadStage] = useState<'upload' | 'validate' | 'complete'>('upload');
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setUploadStage('validate');
      toast.success("File uploaded successfully!");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setUploadStage('validate');
      toast.success("File uploaded successfully!");
    }
  };

  const handleImport = () => {
    setUploadStage('complete');
    toast.success("Data imported successfully!");
  };

  const validationResults = {
    total: 150,
    valid: 145,
    errors: 5,
    warnings: 8
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/dashboard">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Upload Sales Data</h1>
                <p className="text-sm text-muted-foreground">Import and schedule dispatch orders</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 max-w-5xl">
        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center font-semibold ${
                uploadStage === 'upload' ? 'bg-primary text-primary-foreground' : 'bg-success text-success-foreground'
              }`}>
                1
              </div>
              <span className="text-sm font-medium">Upload</span>
            </div>
            <div className={`h-1 w-20 ${uploadStage !== 'upload' ? 'bg-success' : 'bg-border'}`} />
            <div className="flex items-center gap-2">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center font-semibold ${
                uploadStage === 'validate' ? 'bg-primary text-primary-foreground' : 
                uploadStage === 'complete' ? 'bg-success text-success-foreground' : 
                'bg-muted text-muted-foreground'
              }`}>
                2
              </div>
              <span className="text-sm font-medium">Validate</span>
            </div>
            <div className={`h-1 w-20 ${uploadStage === 'complete' ? 'bg-success' : 'bg-border'}`} />
            <div className="flex items-center gap-2">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center font-semibold ${
                uploadStage === 'complete' ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'
              }`}>
                3
              </div>
              <span className="text-sm font-medium">Import</span>
            </div>
          </div>
        </div>

        {/* Upload Stage */}
        {uploadStage === 'upload' && (
          <Card>
            <CardHeader>
              <CardTitle>Select Excel File</CardTitle>
              <CardDescription>Upload an Excel file containing sales order data</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                  dragActive ? 'border-primary bg-primary/5' : 'border-border'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <div className="flex flex-col items-center gap-4">
                  <div className="p-4 bg-primary/10 rounded-full">
                    <Upload className="h-12 w-12 text-primary" />
                  </div>
                  <div>
                    <p className="text-lg font-medium mb-2">Drag and drop your file here</p>
                    <p className="text-sm text-muted-foreground mb-4">or</p>
                    <label htmlFor="file-upload">
                      <Button variant="outline" className="cursor-pointer">
                        Browse Files
                      </Button>
                      <input
                        id="file-upload"
                        type="file"
                        className="hidden"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleFileChange}
                      />
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground">Supported formats: .xlsx, .xls, .csv</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Validate Stage */}
        {uploadStage === 'validate' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-6 w-6 text-primary" />
                  <div>
                    <CardTitle>File Preview</CardTitle>
                    <CardDescription>{file?.name}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Validation Summary */}
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-muted rounded-lg p-4">
                      <p className="text-2xl font-bold text-foreground">{validationResults.total}</p>
                      <p className="text-sm text-muted-foreground">Total Records</p>
                    </div>
                    <div className="bg-success/10 rounded-lg p-4">
                      <p className="text-2xl font-bold text-success">{validationResults.valid}</p>
                      <p className="text-sm text-muted-foreground">Valid</p>
                    </div>
                    <div className="bg-destructive/10 rounded-lg p-4">
                      <p className="text-2xl font-bold text-destructive">{validationResults.errors}</p>
                      <p className="text-sm text-muted-foreground">Errors</p>
                    </div>
                    <div className="bg-warning/10 rounded-lg p-4">
                      <p className="text-2xl font-bold text-warning">{validationResults.warnings}</p>
                      <p className="text-sm text-muted-foreground">Warnings</p>
                    </div>
                  </div>

                  {/* Sample Data Table */}
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="text-left p-3 font-semibold">Invoice No</th>
                          <th className="text-left p-3 font-semibold">Customer</th>
                          <th className="text-left p-3 font-semibold">Part Code</th>
                          <th className="text-left p-3 font-semibold">Qty</th>
                          <th className="text-left p-3 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { invoice: 'INV-2024-001', customer: 'Acme Corp', part: '2023919386001', qty: 5, status: 'valid' },
                          { invoice: 'INV-2024-002', customer: 'Tech Solutions', part: '2023919386002', qty: 8, status: 'valid' },
                          { invoice: 'INV-2024-003', customer: 'Global Industries', part: '2023919386003', qty: 4, status: 'error' },
                          { invoice: 'INV-2024-004', customer: 'Manufacturing Co', part: '2023919386004', qty: 7, status: 'warning' },
                        ].map((row, i) => (
                          <tr key={i} className="border-t">
                            <td className="p-3">{row.invoice}</td>
                            <td className="p-3">{row.customer}</td>
                            <td className="p-3">{row.part}</td>
                            <td className="p-3">{row.qty}</td>
                            <td className="p-3">
                              <Badge variant={
                                row.status === 'valid' ? 'default' : 
                                row.status === 'error' ? 'destructive' : 
                                'outline'
                              }>
                                {row.status === 'valid' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                                {row.status === 'error' && <XCircle className="h-3 w-3 mr-1" />}
                                {row.status === 'warning' && <AlertCircle className="h-3 w-3 mr-1" />}
                                {row.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    <Button 
                      onClick={handleImport} 
                      className="flex-1"
                      disabled={validationResults.errors > 0}
                    >
                      Import & Schedule Dispatch
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setUploadStage('upload');
                        setFile(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                  {validationResults.errors > 0 && (
                    <p className="text-sm text-destructive">
                      Please fix {validationResults.errors} error(s) before importing
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Complete Stage */}
        {uploadStage === 'complete' && (
          <Card>
            <CardContent className="pt-12 pb-12 text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="p-4 bg-success/10 rounded-full">
                  <CheckCircle2 className="h-16 w-16 text-success" />
                </div>
                <h2 className="text-2xl font-bold">Data Imported Successfully!</h2>
                <p className="text-muted-foreground max-w-md">
                  {validationResults.valid} records have been imported and scheduled for dispatch.
                </p>
                <div className="flex gap-3 mt-4">
                  <Link to="/dashboard">
                    <Button>Return to Dashboard</Button>
                  </Link>
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setUploadStage('upload');
                      setFile(null);
                    }}
                  >
                    Upload Another File
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default UploadData;
