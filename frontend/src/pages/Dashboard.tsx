import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ScanBarcode,
  Truck,
  Package,
  Users,
  ArrowLeft
} from "lucide-react";
import { useSession } from "@/contexts/SessionContext";

const Dashboard = () => {
  const navigate = useNavigate();
  const {
    currentUser,
    getInvoicesWithSchedule,
    getPendingMismatches,
    selectedCustomer,
    selectedSite
  } = useSession();

  // Route guard: Check if customer and site are selected
  useEffect(() => {
    if (!selectedCustomer || !selectedSite) {
      toast.error("Please select a customer and site before accessing the dashboard");
      navigate("/select-customer-site");
    }
  }, [selectedCustomer, selectedSite, navigate]);

  // Get invoices with schedule
  const invoicesWithSchedule = getInvoicesWithSchedule();
  
  // Helper to check if date is today
  const isDateToday = (date: Date | undefined): boolean => {
    if (!date) return false;
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };
  
  // Overall System Metrics
  const pendingDocAudits = invoicesWithSchedule.filter(inv => 
    !inv.dispatchedBy && !inv.auditComplete
  ).length;
  
  const readyForDispatch = invoicesWithSchedule.filter(inv => 
    !inv.dispatchedBy && inv.auditComplete
  ).length;
  
  const completedTodayAudits = invoicesWithSchedule.filter(inv => 
    inv.auditComplete && isDateToday(inv.auditDate)
  ).length;
  
  const completedTodayDispatches = invoicesWithSchedule.filter(inv => 
    inv.dispatchedBy && isDateToday(inv.dispatchedAt)
  ).length;

  const hasRealData = invoicesWithSchedule.length > 0;

  const overallSystemKPIs = [
    {
      title: "Pending Doc Audits",
      value: hasRealData ? pendingDocAudits.toString() : "0",
      subtitle: "Requires audit",
      icon: ScanBarcode,
      trend: pendingDocAudits > 0 ? "Active" : "Empty"
    },
    {
      title: "Ready for Dispatch",
      value: hasRealData ? readyForDispatch.toString() : "0",
      subtitle: "Audited & ready",
      icon: Truck,
      trend: readyForDispatch > 0 ? "Active" : "Empty"
    },
    {
      title: "Completed Today (Audit)",
      value: hasRealData ? completedTodayAudits.toString() : "0",
      subtitle: "Audits completed today",
      icon: ScanBarcode,
      trend: completedTodayAudits > 0 ? "Active" : "None"
    },
    {
      title: "Completed Today (Dispatch)",
      value: hasRealData ? completedTodayDispatches.toString() : "0",
      subtitle: "Dispatches completed today",
      icon: Truck,
      trend: completedTodayDispatches > 0 ? "Active" : "None"
    }
  ];


  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 sm:h-10 sm:w-10"
                onClick={() => navigate("/home")}
              >
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              <div className="p-1.5 sm:p-2 bg-primary rounded-lg">
                <Package className="h-5 w-5 sm:h-6 sm:w-6 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <h1 className="text-lg sm:text-2xl font-bold text-foreground">Manufacturing Dispatch</h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Factory Operations Management</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 flex-wrap w-full sm:w-auto justify-end">
              <Badge variant="outline" className="text-xs sm:text-sm px-2 sm:px-3 py-1">
                <div className="h-2 w-2 bg-success rounded-full mr-1 sm:mr-2 animate-pulse" />
                <span className="hidden sm:inline">System </span>Online
              </Badge>
              <Badge className="text-xs sm:text-sm px-2 sm:px-3 py-1 bg-primary">
                <Users className="h-3 w-3 mr-1" />
                {currentUser}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8 pb-24 sm:pb-8">
        {/* Overall System Metrics */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Badge variant="default" className="text-sm px-3 py-1">
              📊 System Overview
            </Badge>
            <h2 className="text-lg font-semibold">Overall System Metrics</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {overallSystemKPIs.map((kpi, index) => (
              <Card key={index} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">{kpi.title}</p>
                      <h3 className="text-3xl font-bold text-foreground mb-1">{kpi.value}</h3>
                      <p className="text-xs text-muted-foreground">{kpi.subtitle}</p>
                    </div>
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <kpi.icon className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border">
                    <span className={`text-xs font-semibold ${
                      kpi.trend === 'Active' || kpi.trend === 'Scheduled' ? 'text-primary' : 
                      kpi.trend === 'None' || kpi.trend === 'Empty' ? 'text-muted-foreground' : 
                      'text-success'
                    }`}>
                      {kpi.trend}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

      </main>
    </div>
  );
};

export default Dashboard;
