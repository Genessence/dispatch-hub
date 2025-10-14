import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, TrendingUp, TrendingDown, BarChart3, FileText, AlertTriangle, CheckCircle2, Truck, ScanBarcode, Upload, Clock, User } from "lucide-react";
import { Link } from "react-router-dom";
import { useSession } from "@/contexts/SessionContext";

const Analytics = () => {
  const { getUploadLogs, getAuditLogs, getDispatchLogs, mismatchAlerts, sharedInvoices } = useSession();
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [activeReportTab, setActiveReportTab] = useState<'upload' | 'audit' | 'dispatch' | 'mismatch'>('upload');
  
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  // Get today's audit count
  const today = new Date();
  const todayAudits = sharedInvoices.filter(inv => {
    if (!inv.auditedAt) return false;
    const auditDate = new Date(inv.auditedAt);
    return auditDate.getDate() === today.getDate() &&
           auditDate.getMonth() === today.getMonth() &&
           auditDate.getFullYear() === today.getFullYear();
  }).length;
  // Sample monthly data for the past 12 months
  const monthlyData = [
    { month: "Jan 2024", dispatched: 45, docAuditMismatches: 3, loadingDispatchMismatches: 2 },
    { month: "Feb 2024", dispatched: 52, docAuditMismatches: 5, loadingDispatchMismatches: 1 },
    { month: "Mar 2024", dispatched: 48, docAuditMismatches: 2, loadingDispatchMismatches: 4 },
    { month: "Apr 2024", dispatched: 61, docAuditMismatches: 7, loadingDispatchMismatches: 3 },
    { month: "May 2024", dispatched: 55, docAuditMismatches: 4, loadingDispatchMismatches: 2 },
    { month: "Jun 2024", dispatched: 67, docAuditMismatches: 6, loadingDispatchMismatches: 5 },
    { month: "Jul 2024", dispatched: 72, docAuditMismatches: 8, loadingDispatchMismatches: 3 },
    { month: "Aug 2024", dispatched: 58, docAuditMismatches: 3, loadingDispatchMismatches: 4 },
    { month: "Sep 2024", dispatched: 64, docAuditMismatches: 5, loadingDispatchMismatches: 2 },
    { month: "Oct 2024", dispatched: 69, docAuditMismatches: 9, loadingDispatchMismatches: 6 },
    { month: "Nov 2024", dispatched: 73, docAuditMismatches: 4, loadingDispatchMismatches: 3 },
    { month: "Dec 2024", dispatched: 78, docAuditMismatches: 7, loadingDispatchMismatches: 4 },
  ];

  // Sample daily audit completion data for past week
  const dailyAuditData = [
    { day: "Mon", completed: 12, total: 15, completionRate: 80 },
    { day: "Tue", completed: 18, total: 20, completionRate: 90 },
    { day: "Wed", completed: 14, total: 18, completionRate: 78 },
    { day: "Thu", completed: 22, total: 25, completionRate: 88 },
    { day: "Fri", completed: 16, total: 19, completionRate: 84 },
    { day: "Sat", completed: 8, total: 12, completionRate: 67 },
    { day: "Sun", completed: 5, total: 8, completionRate: 63 },
  ];

  const kpiData = [
    { title: "Total Invoices Dispatched", value: "781", change: "+8.2%", trend: "up" },
    { title: "Total Mismatches", value: "89", change: "+3.1%", trend: "up" },
    { title: "Audit Completion Rate", value: "79.2%", change: "+2.4%", trend: "up" },
    { title: "Pending Approvals", value: "5", change: "-3", trend: "down" },
  ];

  const maxDispatched = Math.max(...monthlyData.map(d => d.dispatched));
  const maxMismatches = Math.max(...monthlyData.map(d => d.docAuditMismatches + d.loadingDispatchMismatches));
  const maxCompletion = Math.max(...dailyAuditData.map(d => d.completionRate));

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
                <h1 className="text-2xl font-bold text-foreground">Analytics & Reports</h1>
                <p className="text-sm text-muted-foreground">Performance metrics and insights</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => setShowReportDialog(true)}>
              <FileText className="h-4 w-4 mr-2" />
              View Reports
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {kpiData.map((kpi, index) => (
            <Card key={index}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-sm text-muted-foreground">{kpi.title}</p>
                  {kpi.trend === "up" ? (
                    <TrendingUp className="h-4 w-4 text-success" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-success" />
                  )}
                </div>
                <h3 className="text-3xl font-bold text-foreground mb-2">{kpi.value}</h3>
                <Badge variant={kpi.trend === "down" ? "default" : "outline"}>
                  {kpi.change} vs last month
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Monthly Analysis Chart */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Monthly Dispatch & Mismatch Analysis
            </CardTitle>
            <CardDescription>Invoices dispatched and mismatches by month (Past 12 months)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80 overflow-x-auto">
              <div className="min-w-[800px] h-full flex items-end justify-between gap-2 px-4">
                {monthlyData.map((data, index) => (
                  <div key={index} className="flex flex-col items-center gap-2 flex-1">
                    {/* Bars */}
                    <div className="flex items-end gap-1 h-60 w-full">
                      {/* Dispatched Bar */}
                      <div className="flex flex-col items-center gap-1 flex-1">
                        <div 
                          className="bg-green-500 w-full rounded-t-sm relative group cursor-pointer"
                          style={{ height: `${(data.dispatched / maxDispatched) * 240}px` }}
                          title={`${data.dispatched} dispatched`}
                        >
                          <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                            {data.dispatched}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground font-medium">Dispatched</span>
                      </div>
                      
                      {/* Doc Audit Mismatches Bar */}
                      <div className="flex flex-col items-center gap-1 flex-1">
                        <div 
                          className="bg-orange-500 w-full rounded-t-sm relative group cursor-pointer"
                          style={{ height: `${((data.docAuditMismatches + data.loadingDispatchMismatches) / maxMismatches) * 240}px` }}
                          title={`${data.docAuditMismatches} Doc Audit, ${data.loadingDispatchMismatches} Loading`}
                        >
                          <div className="absolute -top-16 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-3 py-2 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 border border-gray-600">
                            <div className="font-semibold mb-1">Mismatch Details</div>
                            <div>📊 Doc Audit: {data.docAuditMismatches}</div>
                            <div>🚚 Loading: {data.loadingDispatchMismatches}</div>
                            <div className="font-semibold mt-1 pt-1 border-t border-gray-600">Total: {data.docAuditMismatches + data.loadingDispatchMismatches}</div>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground font-medium">Mismatches</span>
                      </div>
                    </div>
                    
                    {/* Month Label */}
                    <span className="text-xs text-muted-foreground font-medium mt-2 text-center">
                      {data.month.split(' ')[0]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Legend */}
            <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500 rounded-sm"></div>
                <span className="text-sm font-medium">Invoices Dispatched</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-orange-500 rounded-sm"></div>
                <span className="text-sm font-medium">Mismatches (Doc Audit + Loading)</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Daily Audit Completion Rate */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Doc Audit Completion Rate
            </CardTitle>
            <CardDescription>Daily audit completion over the past week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-end justify-between gap-4 px-4">
              {dailyAuditData.map((data, index) => (
                <div key={index} className="flex flex-col items-center gap-2 flex-1">
                  {/* Completion Rate Bar */}
                  <div className="flex flex-col items-center gap-1 w-full">
                    <div 
                      className="bg-blue-500 w-full rounded-t-sm relative group cursor-pointer transition-all hover:bg-blue-600"
                      style={{ height: `${(data.completionRate / maxCompletion) * 180}px` }}
                      title={`${data.completed}/${data.total} audits (${data.completionRate}%)`}
                    >
                      <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {data.completed}/{data.total} ({data.completionRate}%)
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground font-medium">{data.day}</span>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Average Completion Rate */}
            <div className="mt-4 pt-4 border-t text-center">
              <div className="text-2xl font-bold text-green-600">
                {Math.round(dailyAuditData.reduce((sum, day) => sum + day.completionRate, 0) / dailyAuditData.length)}%
              </div>
              <div className="text-sm text-muted-foreground">Average Weekly Completion Rate</div>
            </div>
          </CardContent>
        </Card>

        {/* Mismatch Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Mismatch Breakdown by Step
            </CardTitle>
            <CardDescription>Distribution of mismatches between Doc Audit and Loading & Dispatch</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Doc Audit Mismatches */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <ScanBarcode className="h-4 w-4 text-blue-600" />
                  <span className="font-semibold">Doc Audit Mismatches</span>
                </div>
                <div className="space-y-2">
                  {monthlyData.slice(-6).map((data, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{data.month}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-500 h-2 rounded-full" 
                            style={{ width: `${(data.docAuditMismatches / Math.max(...monthlyData.map(d => d.docAuditMismatches))) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium w-8 text-right">{data.docAuditMismatches}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Loading & Dispatch Mismatches */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-purple-600" />
                  <span className="font-semibold">Loading & Dispatch Mismatches</span>
                </div>
                <div className="space-y-2">
                  {monthlyData.slice(-6).map((data, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{data.month}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-purple-500 h-2 rounded-full" 
                            style={{ width: `${(data.loadingDispatchMismatches / Math.max(...monthlyData.map(d => d.loadingDispatchMismatches))) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium w-8 text-right">{data.loadingDispatchMismatches}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Reports Dialog */}
      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Detailed Reports
            </DialogTitle>
          </DialogHeader>

          {/* Report Tabs */}
          <div className="flex gap-2 border-b pb-2 overflow-x-auto">
            <Button
              variant={activeReportTab === 'upload' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveReportTab('upload')}
              className="flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              Upload Report
            </Button>
            <Button
              variant={activeReportTab === 'audit' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveReportTab('audit')}
              className="flex items-center gap-2"
            >
              <ScanBarcode className="h-4 w-4" />
              Audit Report
            </Button>
            <Button
              variant={activeReportTab === 'dispatch' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveReportTab('dispatch')}
              className="flex items-center gap-2"
            >
              <Truck className="h-4 w-4" />
              Dispatch Report
            </Button>
            <Button
              variant={activeReportTab === 'mismatch' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveReportTab('mismatch')}
              className="flex items-center gap-2"
            >
              <AlertTriangle className="h-4 w-4" />
              Mismatch Report
            </Button>
          </div>

          {/* Report Content */}
          <ScrollArea className="h-[500px] pr-4">
            {/* Upload Report */}
            {activeReportTab === 'upload' && (
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Upload Activity Report
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Summary of all data uploads to the system
                  </p>
                </div>

                {getUploadLogs().length > 0 ? (
                  <div className="space-y-3">
                    {getUploadLogs().map((log) => (
                      <Card key={log.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-full">
                                <User className="h-4 w-4 text-blue-600" />
                              </div>
                              <div>
                                <p className="font-semibold">{log.user}</p>
                                <p className="text-xs text-muted-foreground">Uploaded data</p>
                              </div>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              <Clock className="h-3 w-3 mr-1" />
                              {formatDate(log.timestamp)}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {log.action}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Upload className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No upload activity recorded</p>
                  </div>
                )}
              </div>
            )}

            {/* Audit Report */}
            {activeReportTab === 'audit' && (
              <div className="space-y-4">
                <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <ScanBarcode className="h-4 w-4" />
                    Doc Audit Activity Report
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Summary of all document audits completed
                  </p>
                  <div className="flex items-center gap-4 pt-2 border-t border-green-200 dark:border-green-800">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Audits Today</p>
                      <p className="text-2xl font-bold text-green-600">{todayAudits}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">All Time Audits</p>
                      <p className="text-2xl font-bold">{getAuditLogs().length}</p>
                    </div>
                  </div>
                </div>

                {getAuditLogs().length > 0 ? (
                  <div className="space-y-3">
                    {getAuditLogs().map((log) => (
                      <Card key={log.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-full">
                                <User className="h-4 w-4 text-green-600" />
                              </div>
                              <div>
                                <p className="font-semibold">{log.user}</p>
                                <p className="text-xs text-muted-foreground">Completed audit</p>
                              </div>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              <Clock className="h-3 w-3 mr-1" />
                              {formatDate(log.timestamp)}
                            </Badge>
                          </div>
                          <div className="text-sm">
                            <p className="font-medium">{log.action}</p>
                            <p className="text-xs text-muted-foreground mt-1">{log.details}</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <ScanBarcode className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No audit activity recorded</p>
                  </div>
                )}
              </div>
            )}

            {/* Dispatch Report */}
            {activeReportTab === 'dispatch' && (
              <div className="space-y-4">
                <div className="p-4 bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg">
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Truck className="h-4 w-4" />
                    Dispatch Activity Report
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Summary of all dispatched invoices with vehicle and bin details
                  </p>
                </div>

                {getDispatchLogs().length > 0 ? (
                  <div className="space-y-3">
                    {getDispatchLogs().map((log) => {
                      // Parse details to extract information
                      const detailsMatch = log.details.match(/Customer: (.+?),\s*Bin Number:\s*(.+?),\s*Quantity:\s*(\d+),\s*Vehicle:\s*(.+)$/);
                      const customer = detailsMatch?.[1] || 'Unknown';
                      const binNumber = detailsMatch?.[2] || 'N/A';
                      const quantity = detailsMatch?.[3] || 'N/A';
                      const vehicle = detailsMatch?.[4] || 'N/A';
                      
                      // Extract invoice number
                      const invoiceMatch = log.action.match(/Dispatched invoice (.+)/);
                      const invoiceId = invoiceMatch?.[1] || '';
                      
                      return (
                        <Card key={log.id}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-full">
                                  <User className="h-4 w-4 text-purple-600" />
                                </div>
                                <div>
                                  <p className="font-semibold">{log.user}</p>
                                  <p className="text-xs text-muted-foreground">Dispatched invoice</p>
                                </div>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                <Clock className="h-3 w-3 mr-1" />
                                {formatDate(log.timestamp)}
                              </Badge>
                            </div>
                            
                            {/* Dispatch Details */}
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="p-2 bg-muted rounded">
                                  <p className="text-xs text-muted-foreground mb-1">Invoice Number</p>
                                  <p className="font-semibold text-sm">{invoiceId}</p>
                                </div>
                                <div className="p-2 bg-muted rounded">
                                  <p className="text-xs text-muted-foreground mb-1">Customer</p>
                                  <p className="font-semibold text-sm">{customer}</p>
                                </div>
                              </div>
                              
                              <div className="space-y-2">
                                <div className="p-2 bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded">
                                  <p className="text-xs text-muted-foreground mb-1">Bin Number</p>
                                  <p className="font-bold text-sm font-mono break-all">{binNumber}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="p-2 bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded">
                                    <p className="text-xs text-muted-foreground mb-1">Quantity</p>
                                    <p className="font-bold text-sm">{quantity}</p>
                                  </div>
                                  <div className="p-2 bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded">
                                    <p className="text-xs text-muted-foreground mb-1">Vehicle Number</p>
                                    <p className="font-bold text-sm break-all">{vehicle}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Truck className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No dispatch activity recorded</p>
                  </div>
                )}
              </div>
            )}

            {/* Mismatch Report */}
            {activeReportTab === 'mismatch' && (
              <div className="space-y-4">
                <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Mismatch Activity Report
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    All barcode mismatches detected in the system
                  </p>
                  <div className="flex items-center gap-4 pt-2 border-t border-red-200 dark:border-red-800">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Mismatches</p>
                      <p className="text-2xl font-bold text-red-600">{mismatchAlerts.length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Pending</p>
                      <p className="text-2xl font-bold text-orange-600">{mismatchAlerts.filter(a => a.status === 'pending').length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Corrected</p>
                      <p className="text-2xl font-bold text-green-600">{mismatchAlerts.filter(a => a.status === 'approved').length}</p>
                    </div>
                  </div>
                </div>

                {mismatchAlerts.length > 0 ? (
                  <div className="space-y-3">
                    {mismatchAlerts.map((alert) => (
                      <Card key={alert.id} className="border-2 border-orange-200 dark:border-orange-900">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <div className="p-2 bg-red-100 dark:bg-red-900 rounded-full">
                                <User className="h-4 w-4 text-red-600" />
                              </div>
                              <div>
                                <p className="font-semibold">{alert.user}</p>
                                <p className="text-xs text-muted-foreground">Scanned mismatched barcode</p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <Badge 
                                variant={alert.status === 'pending' ? 'destructive' : 'default'}
                                className={alert.status === 'approved' ? 'bg-green-600' : ''}
                              >
                                {alert.status === 'pending' ? 'PENDING' : 'CORRECTED'}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {alert.step === 'doc-audit' ? (
                                  <><ScanBarcode className="h-3 w-3 mr-1" />Doc Audit</>
                                ) : (
                                  <><Truck className="h-3 w-3 mr-1" />Loading & Dispatch</>
                                )}
                              </Badge>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div className="text-xs">
                              <p className="text-muted-foreground mb-1">Invoice</p>
                              <p className="font-semibold">{alert.invoiceId}</p>
                            </div>
                            <div className="text-xs">
                              <p className="text-muted-foreground mb-1">Customer</p>
                              <p className="font-semibold">{alert.customer}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="p-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded">
                              <p className="font-semibold mb-1">Customer Label</p>
                              <p className="text-muted-foreground">Part: {alert.customerScan.partCode}</p>
                              <p className="text-muted-foreground">Qty: {alert.customerScan.quantity}</p>
                              <p className="text-muted-foreground">Bin: {alert.customerScan.binNumber}</p>
                            </div>
                            <div className="p-2 bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded">
                              <p className="font-semibold mb-1">Autoliv Label</p>
                              <p className="text-muted-foreground">Part: {alert.autolivScan.partCode}</p>
                              <p className="text-muted-foreground">Qty: {alert.autolivScan.quantity}</p>
                              <p className="text-muted-foreground">Bin: {alert.autolivScan.binNumber}</p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between mt-3 pt-3 border-t">
                            <p className="text-xs text-muted-foreground">
                              <Clock className="h-3 w-3 inline mr-1" />
                              {formatDate(alert.timestamp)}
                            </p>
                            {alert.reviewedBy && (
                              <p className="text-xs text-green-600 font-medium">
                                Corrected by {alert.reviewedBy}
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No mismatches recorded</p>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Analytics;
