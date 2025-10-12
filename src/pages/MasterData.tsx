import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import * as XLSX from 'xlsx';
import { 
  ArrowLeft, 
  Database, 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2,
  Package,
  Users as UsersIcon,
  Home,
  Edit,
  Plus,
  Trash2
} from "lucide-react";
import { useSession } from "@/contexts/SessionContext";

type ViewType = 'upload' | 'edit';
type EditMasterType = 'item' | 'customer' | null;

interface ItemMaster {
  id: string;
  partCode: string;
  itemName: string;
  quantity: string;
}

interface CustomerMaster {
  id: string;
  companyName: string;
  partCode: string;
  quantity: string;
  binNumber: string;
}

const MasterData = () => {
  const navigate = useNavigate();
  const { currentUser } = useSession();
  const [activeView, setActiveView] = useState<ViewType>('upload');
  const [selectedMasterType, setSelectedMasterType] = useState<EditMasterType>(null);

  // Permission check
  if (currentUser !== "Admin") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-md mx-auto">
          <div className="mb-6">
            <div className="w-24 h-24 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-4">
              <span className="text-4xl">🔒</span>
            </div>
            <h1 className="text-3xl font-bold text-red-600 mb-2">Permission Denied</h1>
            <p className="text-muted-foreground mb-6">
              Only Admin users can access the Master Data module.
            </p>
          </div>
          <Button onClick={() => navigate("/dashboard")} className="w-full">
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }
  const [itemMasterFile, setItemMasterFile] = useState<File | null>(null);
  const [customerMasterFile, setCustomerMasterFile] = useState<File | null>(null);
  const [itemMasterUploaded, setItemMasterUploaded] = useState(false);
  const [customerMasterUploaded, setCustomerMasterUploaded] = useState(false);

  // Edit functionality states
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<ItemMaster | CustomerMaster | null>(null);

  // Sample data
  const [itemMasterData, setItemMasterData] = useState<ItemMaster[]>([
    { id: '1', partCode: '2023919386001', itemName: 'Connector Assembly', quantity: '5' },
    { id: '2', partCode: '2023919386002', itemName: 'Wire Harness', quantity: '8' },
    { id: '3', partCode: '2023919386003', itemName: 'Control Module', quantity: '12' },
  ]);

  const [customerMasterData, setCustomerMasterData] = useState<CustomerMaster[]>([
    { id: '1', companyName: 'Acme Corporation', partCode: '2023919386004', quantity: '6', binNumber: '76480M66T01' },
    { id: '2', companyName: 'Tech Solutions Inc', partCode: '2023919386005', quantity: '9', binNumber: '76480M66T02' },
    { id: '3', companyName: 'Global Industries', partCode: '2023919386006', quantity: '4', binNumber: '76480M66T03' },
  ]);

  // Edit form states
  const [editFormData, setEditFormData] = useState<any>({});

  const handleItemMasterUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setItemMasterFile(file);
      
      toast.loading("Processing Item Master file...");
      
      setTimeout(() => {
        setItemMasterUploaded(true);
        toast.dismiss();
        toast.success("Item Master uploaded successfully!", {
          description: `File: ${file.name} uploaded by ${currentUser}`
        });
      }, 1500);
    }
  };

  const handleCustomerMasterUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setCustomerMasterFile(file);
      
      toast.loading("Processing Customer Master file...");
      
      setTimeout(() => {
        setCustomerMasterUploaded(true);
        toast.dismiss();
        toast.success("Customer Master uploaded successfully!", {
          description: `File: ${file.name} uploaded by ${currentUser}`
        });
      }, 1500);
    }
  };

  // Edit/Add/Delete handlers
  const handleEdit = (record: ItemMaster | CustomerMaster) => {
    setSelectedRecord(record);
    setEditFormData(record);
    setShowEditDialog(true);
  };

  const handleSaveEdit = () => {
    if (selectedMasterType === 'item') {
      setItemMasterData(prev => prev.map(item => 
        item.id === selectedRecord?.id ? editFormData as ItemMaster : item
      ));
      toast.success("Item updated successfully!");
    } else {
      setCustomerMasterData(prev => prev.map(customer => 
        customer.id === selectedRecord?.id ? editFormData as CustomerMaster : customer
      ));
      toast.success("Customer updated successfully!");
    }
    setShowEditDialog(false);
    setSelectedRecord(null);
  };

  const handleAdd = () => {
    setEditFormData({});
    setShowAddDialog(true);
  };

  const handleSaveAdd = () => {
    if (selectedMasterType === 'item') {
      const newItem: ItemMaster = {
        id: Date.now().toString(),
        ...editFormData
      };
      setItemMasterData(prev => [...prev, newItem]);
      toast.success("New item added successfully!");
    } else {
      const newCustomer: CustomerMaster = {
        id: Date.now().toString(),
        ...editFormData
      };
      setCustomerMasterData(prev => [...prev, newCustomer]);
      toast.success("New customer added successfully!");
    }
    setShowAddDialog(false);
    setEditFormData({});
  };

  const handleDeleteClick = (record: ItemMaster | CustomerMaster) => {
    setSelectedRecord(record);
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = () => {
    if (selectedMasterType === 'item') {
      setItemMasterData(prev => prev.filter(item => item.id !== selectedRecord?.id));
      toast.success("Item deleted successfully!");
    } else {
      setCustomerMasterData(prev => prev.filter(customer => customer.id !== selectedRecord?.id));
      toast.success("Customer deleted successfully!");
    }
    setShowDeleteDialog(false);
    setSelectedRecord(null);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-4">
              <Link to="/dashboard">
                <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10">
                  <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-secondary/10 rounded-lg">
                  <Database className="h-5 w-5 sm:h-6 sm:w-6 text-secondary" />
                </div>
                <div>
                  <h1 className="text-lg sm:text-2xl font-bold text-foreground">Master Data Management</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Upload and manage master data files</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <Badge className="text-xs sm:text-sm px-2 sm:px-3 py-1 bg-primary">
                <UsersIcon className="h-3 w-3 mr-1" />
                {currentUser}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-background border-b border-border overflow-x-auto">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex gap-2 sm:gap-3 min-w-max sm:min-w-0">
            <Button
              variant={activeView === 'upload' ? 'default' : 'outline'}
              onClick={() => setActiveView('upload')}
              className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4"
            >
              <Upload className="h-3 w-3 sm:h-4 sm:w-4" />
              Upload Master Data
            </Button>
            <Button
              variant={activeView === 'edit' ? 'default' : 'outline'}
              onClick={() => setActiveView('edit')}
              className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4"
            >
              <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
              Edit Master Data
            </Button>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8 pb-24 sm:pb-8">
        {/* Back to Dashboard */}
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="outline"
            onClick={() => window.location.href = '/dashboard'}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to Dashboard</span>
            <span className="sm:hidden">Back</span>
          </Button>
        </div>

        {/* Upload Master Data View */}
        {activeView === 'upload' && (
          <>
            {/* Info Banner */}
            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm font-medium mb-2">📊 Master Data Upload</p>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>• Upload Item Master: Part Code, Item Name, and Bin Quantity</p>
                <p>• Upload Customer Master: Company Name, Part Code, Quantity, and Bin Number</p>
                <p>• Files will be validated before import</p>
              </div>
            </div>

            {/* Upload Options */}
            <div className="grid md:grid-cols-2 gap-6">
          {/* Option 1: Upload Item Master */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Package className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-xl">Upload Item Master</CardTitle>
                  <CardDescription>Upload part codes, item names and quantities</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Upload Area */}
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary transition-colors">
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 bg-primary/10 rounded-full">
                      <Upload className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-1">Upload Item Master File</p>
                      <p className="text-xs text-muted-foreground mb-3">Excel or CSV format</p>
                      <Button 
                        type="button" 
                        variant="outline"
                        onClick={() => document.getElementById('item-master-upload')?.click()}
                      >
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Browse Files
                      </Button>
                      <input
                        id="item-master-upload"
                        type="file"
                        className="hidden"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleItemMasterUpload}
                      />
                    </div>
                  </div>
                </div>

                {/* Upload Status */}
                {itemMasterFile && (
                  <div className={`p-4 rounded-lg border ${itemMasterUploaded ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' : 'bg-muted'}`}>
                    <div className="flex items-center gap-3">
                      {itemMasterUploaded && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                      <div className="flex-1">
                        <p className="text-sm font-medium">{itemMasterFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {itemMasterUploaded ? `Uploaded by ${currentUser}` : 'Processing...'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Expected Format */}
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-xs font-medium mb-2">Expected Columns:</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Part Code</li>
                    <li>• Item Name</li>
                    <li>• Bin Quantity</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Option 2: Upload Customer Master */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-accent/10 rounded-lg">
                  <UsersIcon className="h-6 w-6 text-accent" />
                </div>
                  <div>
                    <CardTitle className="text-xl">Upload Customer Master</CardTitle>
                    <CardDescription>Upload company names, part codes, quantities, and bin numbers</CardDescription>
                  </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Upload Area */}
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-accent transition-colors">
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 bg-accent/10 rounded-full">
                      <Upload className="h-8 w-8 text-accent" />
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-1">Upload Customer Master File</p>
                      <p className="text-xs text-muted-foreground mb-3">Excel or CSV format</p>
                      <Button 
                        type="button" 
                        variant="outline"
                        onClick={() => document.getElementById('customer-master-upload')?.click()}
                      >
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Browse Files
                      </Button>
                      <input
                        id="customer-master-upload"
                        type="file"
                        className="hidden"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleCustomerMasterUpload}
                      />
                    </div>
                  </div>
                </div>

                {/* Upload Status */}
                {customerMasterFile && (
                  <div className={`p-4 rounded-lg border ${customerMasterUploaded ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' : 'bg-muted'}`}>
                    <div className="flex items-center gap-3">
                      {customerMasterUploaded && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                      <div className="flex-1">
                        <p className="text-sm font-medium">{customerMasterFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {customerMasterUploaded ? `Uploaded by ${currentUser}` : 'Processing...'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Expected Format */}
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-xs font-medium mb-2">Expected Columns:</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Company Name</li>
                    <li>• Part Code</li>
                    <li>• Quantity</li>
                    <li>• Bin Number</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Summary */}
        {(itemMasterUploaded || customerMasterUploaded) && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Upload Summary</CardTitle>
              <CardDescription>Master data files uploaded in this session</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {itemMasterUploaded && (
                  <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="text-sm font-medium">Item Master</p>
                        <p className="text-xs text-muted-foreground">{itemMasterFile?.name}</p>
                      </div>
                    </div>
                    <Badge variant="default">Uploaded</Badge>
                  </div>
                )}
                {customerMasterUploaded && (
                  <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="text-sm font-medium">Customer Master</p>
                        <p className="text-xs text-muted-foreground">{customerMasterFile?.name}</p>
                      </div>
                    </div>
                    <Badge variant="default">Uploaded</Badge>
                  </div>
                )}
              </div>
              
              <div className="flex gap-3 mt-6">
                <Button 
                  onClick={() => window.location.href = '/dashboard'}
                  className="flex-1"
                >
                  <Home className="h-4 w-4 mr-2" />
                  Return to Dashboard
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => {
                    setItemMasterFile(null);
                    setCustomerMasterFile(null);
                    setItemMasterUploaded(false);
                    setCustomerMasterUploaded(false);
                  }}
                >
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
          </>
        )}

        {/* Edit Master Data View */}
        {activeView === 'edit' && (
          <>
            {!selectedMasterType ? (
              /* Master Type Selection */
              <>
                <div className="mb-6 p-4 bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg">
                  <p className="text-sm font-medium mb-2">✏️ Edit Master Data</p>
                  <p className="text-xs text-muted-foreground">
                    Select which master data you want to edit, add, or delete records from
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Edit Item Master */}
                  <Card 
                    className="hover:shadow-lg transition-all hover:scale-[1.02] cursor-pointer"
                    onClick={() => setSelectedMasterType('item')}
                  >
                    <CardHeader>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-3 bg-primary/10 rounded-lg">
                          <Package className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-xl">Edit Item Master</CardTitle>
                          <CardDescription>Manage part codes and item details</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Edit className="h-4 w-4" />
                          <span>Edit existing items</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Plus className="h-4 w-4" />
                          <span>Add new items</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Trash2 className="h-4 w-4" />
                          <span>Delete items</span>
                        </div>
                      </div>
                      <Button className="w-full mt-4">
                        Select Item Master
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Edit Customer Master */}
                  <Card 
                    className="hover:shadow-lg transition-all hover:scale-[1.02] cursor-pointer"
                    onClick={() => setSelectedMasterType('customer')}
                  >
                    <CardHeader>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-3 bg-accent/10 rounded-lg">
                          <UsersIcon className="h-8 w-8 text-accent" />
                        </div>
                  <div>
                    <CardTitle className="text-xl">Edit Customer Master</CardTitle>
                    <CardDescription>Manage company names, part codes, quantities, and bin numbers</CardDescription>
                  </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Edit className="h-4 w-4" />
                          <span>Edit existing customer records</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Plus className="h-4 w-4" />
                          <span>Add new customer records</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Trash2 className="h-4 w-4" />
                          <span>Delete customer records</span>
                        </div>
                      </div>
                      <Button className="w-full mt-4" variant="secondary">
                        Select Customer Master
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : (
              /* Edit Interface for Selected Master */
              <>
                {/* Back Button */}
                <Button
                  variant="ghost"
                  onClick={() => setSelectedMasterType(null)}
                  className="flex items-center gap-2 mb-6"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Selection
                </Button>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-lg ${selectedMasterType === 'item' ? 'bg-primary/10' : 'bg-accent/10'}`}>
                          {selectedMasterType === 'item' ? (
                            <Package className="h-6 w-6 text-primary" />
                          ) : (
                            <UsersIcon className="h-6 w-6 text-accent" />
                          )}
                        </div>
                        <div>
                          <CardTitle className="text-xl">
                            {selectedMasterType === 'item' ? 'Item Master' : 'Customer Master'}
                          </CardTitle>
                          <CardDescription>
                            Edit or add {selectedMasterType === 'item' ? 'items' : 'customers'}
                          </CardDescription>
                        </div>
                      </div>
                      <Button onClick={handleAdd} className="flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        Add New
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>

                    {/* Record Count */}
                    <div className="mb-4 p-3 bg-muted rounded-lg flex items-center justify-between">
                      <p className="text-sm font-medium">
                        Total Records: <span className="text-primary">{selectedMasterType === 'item' ? itemMasterData.length : customerMasterData.length}</span>
                      </p>
                      <Badge variant="outline">
                        {selectedMasterType === 'item' ? 'Item Master' : 'Customer Master'}
                      </Badge>
                    </div>

                    {/* Sample Table */}
                    <div className="border rounded-lg overflow-hidden overflow-x-auto">
                      <table className="w-full text-xs sm:text-sm min-w-[600px]">
                        <thead className="bg-muted">
                          <tr>
                            {selectedMasterType === 'item' ? (
                              <>
                                <th className="text-left p-3 font-semibold">Part Code</th>
                                <th className="text-left p-3 font-semibold">Item Name</th>
                                <th className="text-left p-3 font-semibold">Bin Quantity</th>
                                <th className="text-left p-3 font-semibold">Actions</th>
                              </>
                            ) : (
                              <>
                                <th className="text-left p-3 font-semibold">Company Name</th>
                                <th className="text-left p-3 font-semibold">Part Code</th>
                                <th className="text-left p-3 font-semibold">Quantity</th>
                                <th className="text-left p-3 font-semibold">Bin Number</th>
                                <th className="text-left p-3 font-semibold">Actions</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedMasterType === 'item' ? (
                            itemMasterData.map((item) => (
                              <tr key={item.id} className="border-t hover:bg-muted/50">
                                <td className="p-3 font-mono">{item.partCode}</td>
                                <td className="p-3">{item.itemName}</td>
                                <td className="p-3 font-semibold">{item.quantity}</td>
                                <td className="p-3">
                                  <div className="flex gap-2">
                                    <Button size="sm" variant="ghost" onClick={() => handleEdit(item)}>
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => handleDeleteClick(item)}>
                                      <Trash2 className="h-3 w-3 text-destructive" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          ) : (
                            customerMasterData.map((customer) => (
                              <tr key={customer.id} className="border-t hover:bg-muted/50">
                                <td className="p-3">{customer.companyName}</td>
                                <td className="p-3 font-mono">{customer.partCode}</td>
                                <td className="p-3">{customer.quantity}</td>
                                <td className="p-3 font-mono">{customer.binNumber}</td>
                                <td className="p-3">
                                  <div className="flex gap-2">
                                    <Button size="sm" variant="ghost" onClick={() => handleEdit(customer)}>
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => handleDeleteClick(customer)}>
                                      <Trash2 className="h-3 w-3 text-destructive" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-6 p-4 bg-muted rounded-lg">
                      <p className="text-sm font-medium mb-2">Available Actions:</p>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        <li>• <strong>Edit:</strong> Click the edit icon (✏️) on any row to modify record details</li>
                        <li>• <strong>Add:</strong> Click "Add New" button at the top to create new records</li>
                        <li>• <strong>Delete:</strong> Click the delete icon (🗑️) on any row to remove records</li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}
      </main>

      {/* Edit Dialog */}
      {showEditDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Edit {selectedMasterType === 'item' ? 'Item' : 'Customer'}
            </h3>
            
            <div className="space-y-4">
              {selectedMasterType === 'item' ? (
                <>
                  <div>
                    <Label>Part Code</Label>
                    <Input
                      value={editFormData.partCode || ''}
                      onChange={(e) => setEditFormData({...editFormData, partCode: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Item Name</Label>
                    <Input
                      value={editFormData.itemName || ''}
                      onChange={(e) => setEditFormData({...editFormData, itemName: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Bin Quantity</Label>
                    <Input
                      type="number"
                      value={editFormData.quantity || ''}
                      onChange={(e) => setEditFormData({...editFormData, quantity: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label>Company Name</Label>
                    <Input
                      value={editFormData.companyName || ''}
                      onChange={(e) => setEditFormData({...editFormData, companyName: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Part Code</Label>
                    <Input
                      value={editFormData.partCode || ''}
                      onChange={(e) => setEditFormData({...editFormData, partCode: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      value={editFormData.quantity || ''}
                      onChange={(e) => setEditFormData({...editFormData, quantity: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Bin Number</Label>
                    <Input
                      value={editFormData.binNumber || ''}
                      onChange={(e) => setEditFormData({...editFormData, binNumber: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <Button onClick={handleSaveEdit} className="flex-1">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Save Changes
              </Button>
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add New {selectedMasterType === 'item' ? 'Item' : 'Customer'}
            </h3>
            
            <div className="space-y-4">
              {selectedMasterType === 'item' ? (
                <>
                  <div>
                    <Label>Part Code</Label>
                    <Input
                      placeholder="e.g., 2023919386008"
                      value={editFormData.partCode || ''}
                      onChange={(e) => setEditFormData({...editFormData, partCode: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Item Name</Label>
                    <Input
                      placeholder="e.g., Sensor Module"
                      value={editFormData.itemName || ''}
                      onChange={(e) => setEditFormData({...editFormData, itemName: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Bin Quantity</Label>
                    <Input
                      type="number"
                      placeholder="e.g., 5"
                      value={editFormData.quantity || ''}
                      onChange={(e) => setEditFormData({...editFormData, quantity: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label>Company Name</Label>
                    <Input
                      placeholder="e.g., New Company Inc"
                      value={editFormData.companyName || ''}
                      onChange={(e) => setEditFormData({...editFormData, companyName: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Part Code</Label>
                    <Input
                      placeholder="e.g., 2023919386009"
                      value={editFormData.partCode || ''}
                      onChange={(e) => setEditFormData({...editFormData, partCode: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      placeholder="e.g., 7"
                      value={editFormData.quantity || ''}
                      onChange={(e) => setEditFormData({...editFormData, quantity: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Bin Number</Label>
                    <Input
                      placeholder="e.g., 76480M66T04"
                      value={editFormData.binNumber || ''}
                      onChange={(e) => setEditFormData({...editFormData, binNumber: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <Button onClick={handleSaveAdd} className="flex-1">
                <Plus className="h-4 w-4 mr-2" />
                Add {selectedMasterType === 'item' ? 'Item' : 'Customer'}
              </Button>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Confirm Deletion
            </h3>
            
            <p className="text-sm text-muted-foreground mb-6">
              Are you sure you want to delete this {selectedMasterType === 'item' ? 'item' : 'customer'}? This action cannot be undone.
            </p>

            {selectedRecord && (
              <div className="bg-muted p-3 rounded-lg mb-6">
                <p className="text-xs font-medium mb-2">Record to delete:</p>
                {selectedMasterType === 'item' ? (
                  <p className="text-sm font-mono">{(selectedRecord as ItemMaster).partCode} - {(selectedRecord as ItemMaster).itemName}</p>
                ) : (
                  <p className="text-sm font-mono">{(selectedRecord as CustomerMaster).companyName} - {(selectedRecord as CustomerMaster).partCode} - Qty: {(selectedRecord as CustomerMaster).quantity} - {(selectedRecord as CustomerMaster).binNumber}</p>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)} className="flex-1">
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleConfirmDelete} className="flex-1">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MasterData;

