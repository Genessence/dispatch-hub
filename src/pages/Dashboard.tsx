import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { 
  Upload, 
  ScanBarcode, 
  Truck, 
  Database, 
  BarChart3, 
  AlertTriangle,
  CheckCircle2,
  Clock,
  Package
} from "lucide-react";

const Dashboard = () => {
  const modules = [
    {
      title: "Upload Sales Data",
      description: "Import and schedule dispatch orders",
      icon: Upload,
      link: "/upload",
      color: "text-primary",
      bgColor: "bg-primary/10"
    },
    {
      title: "Doc Audit",
      description: "Scan and validate barcode labels",
      icon: ScanBarcode,
      link: "/doc-audit",
      color: "text-accent",
      bgColor: "bg-accent/10"
    },
    {
      title: "Loading & Dispatch",
      description: "Manage vehicle loading and gatepass",
      icon: Truck,
      link: "/dispatch",
      color: "text-success",
      bgColor: "bg-success/10"
    },
    {
      title: "Master Data",
      description: "Manage part codes and tags",
      icon: Database,
      link: "/master-data",
      color: "text-secondary",
      bgColor: "bg-secondary/10"
    },
    {
      title: "Analytics & Reports",
      description: "View performance metrics",
      icon: BarChart3,
      link: "/analytics",
      color: "text-warning",
      bgColor: "bg-warning/10"
    },
    {
      title: "Exception Alerts",
      description: "Review mismatches and overrides",
      icon: AlertTriangle,
      link: "/exceptions",
      color: "text-destructive",
      bgColor: "bg-destructive/10"
    }
  ];

  const kpis = [
    {
      title: "Total Invoices",
      value: "248",
      subtitle: "This month",
      icon: Package,
      trend: "+12%"
    },
    {
      title: "Pending Doc Audits",
      value: "15",
      subtitle: "Awaiting scan",
      icon: Clock,
      trend: "-5%"
    },
    {
      title: "Completed Dispatches",
      value: "182",
      subtitle: "This week",
      icon: CheckCircle2,
      trend: "+8%"
    },
    {
      title: "Exception Alerts",
      value: "3",
      subtitle: "Needs attention",
      icon: AlertTriangle,
      trend: "Critical"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary rounded-lg">
                <Package className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Manufacturing Dispatch</h1>
                <p className="text-sm text-muted-foreground">Factory Operations Management</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="text-sm px-3 py-1">
                <div className="h-2 w-2 bg-success rounded-full mr-2 animate-pulse" />
                System Online
              </Badge>
              <div className="text-right">
                <p className="text-sm font-medium">John Operator</p>
                <p className="text-xs text-muted-foreground">Shift: Morning</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {kpis.map((kpi, index) => (
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
                    kpi.trend.includes('+') ? 'text-success' : 
                    kpi.trend.includes('-') ? 'text-muted-foreground' : 
                    'text-destructive'
                  }`}>
                    {kpi.trend}
                  </span>
                  <span className="text-xs text-muted-foreground ml-1">vs last period</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Module Cards */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4 text-foreground">System Modules</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {modules.map((module, index) => (
            <Link key={index} to={module.link}>
              <Card className="hover:shadow-lg transition-all hover:scale-[1.02] cursor-pointer h-full">
                <CardHeader>
                  <div className={`p-4 ${module.bgColor} rounded-lg w-fit mb-3`}>
                    <module.icon className={`h-8 w-8 ${module.color}`} />
                  </div>
                  <CardTitle className="text-xl">{module.title}</CardTitle>
                  <CardDescription className="text-base">{module.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">
                    Open Module
                  </Button>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
