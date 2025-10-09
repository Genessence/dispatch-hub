import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, TrendingUp, TrendingDown, BarChart3, Download } from "lucide-react";
import { Link } from "react-router-dom";

const Analytics = () => {
  const kpiData = [
    { title: "Total Invoices Audited", value: "1,248", change: "+12.5%", trend: "up" },
    { title: "Avg. Time per Audit", value: "8.5 min", change: "-2.3 min", trend: "down" },
    { title: "Error Rate", value: "2.4%", change: "+0.3%", trend: "up" },
    { title: "Pending Approvals", value: "5", change: "-3", trend: "down" },
  ];

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

        {/* Charts Placeholder */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Doc Audit Completion Rate</CardTitle>
              <CardDescription>Daily audit completion over the past week</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center bg-muted rounded-lg">
                <div className="text-center">
                  <BarChart3 className="h-16 w-16 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Chart visualization area</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dispatch Throughput</CardTitle>
              <CardDescription>BINs processed per shift</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center bg-muted rounded-lg">
                <div className="text-center">
                  <BarChart3 className="h-16 w-16 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Chart visualization area</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Exception Trends */}
        <Card>
          <CardHeader>
            <CardTitle>Exception Trends</CardTitle>
            <CardDescription>Mismatches and errors over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80 flex items-center justify-center bg-muted rounded-lg">
              <div className="text-center">
                <BarChart3 className="h-20 w-20 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Trend analysis visualization</p>
                <p className="text-xs text-muted-foreground mt-1">Historical data will be displayed here</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Analytics;
