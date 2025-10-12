import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, TrendingUp, TrendingDown, BarChart3, Download, AlertTriangle, CheckCircle2, Truck, ScanBarcode } from "lucide-react";
import { Link } from "react-router-dom";

const Analytics = () => {
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
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export Report
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
    </div>
  );
};

export default Analytics;
