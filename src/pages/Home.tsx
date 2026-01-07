import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Home as HomeIcon,
  Upload,
  ScanBarcode,
  Truck,
  BarChart3,
  AlertTriangle,
  LogOut,
  Settings,
  User,
  HelpCircle,
  Menu,
  X,
} from "lucide-react";
import { useSession } from "@/contexts/SessionContext";
import { toast } from "sonner";

const Home = () => {
  const navigate = useNavigate();
  const { currentUser, selectedCustomer, selectedSite } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const isAdmin = currentUser === "Admin";

  // Route guard: Check if customer and site are selected
  useEffect(() => {
    if (!selectedCustomer || !selectedSite) {
      toast.error("Please select a customer and site first");
      navigate("/select-customer-site");
    }
  }, [selectedCustomer, selectedSite, navigate]);

  const handleLogout = () => {
    toast.success("Logged out successfully");
    navigate("/");
  };

  const navigationCards = [
    {
      title: "Dashboard",
      description: "View overview and metrics",
      icon: HomeIcon,
      color: "text-blue-600",
      bgColor: "bg-blue-50 hover:bg-blue-100",
      onClick: () => navigate("/dashboard?view=dashboard"),
    },
    {
      title: "Upload Sales Data",
      description: "Import and schedule dispatch orders",
      icon: Upload,
      color: "text-primary",
      bgColor: "bg-primary/10 hover:bg-primary/20",
      onClick: () => navigate("/dashboard?view=upload"),
    },
    {
      title: "Doc Audit",
      description: "Scan and validate barcode labels",
      icon: ScanBarcode,
      color: "text-accent",
      bgColor: "bg-accent/10 hover:bg-accent/20",
      onClick: () => navigate("/dashboard?view=doc-audit"),
    },
    {
      title: "Loading & Dispatch",
      description: "Manage vehicle loading and gatepass",
      icon: Truck,
      color: "text-green-600",
      bgColor: "bg-green-50 hover:bg-green-100",
      onClick: () => navigate("/dashboard?view=dispatch"),
    },
    {
      title: "Analytics & Report",
      description: "View performance metrics and reports",
      icon: BarChart3,
      color: "text-orange-600",
      bgColor: "bg-orange-50 hover:bg-orange-100",
      onClick: () => navigate("/analytics"),
    },
    ...(isAdmin
      ? [
          {
            title: "Exception Alerts",
            description: "Review mismatches and overrides",
            icon: AlertTriangle,
            color: "text-red-600",
            bgColor: "bg-red-50 hover:bg-red-100",
            onClick: () => navigate("/exceptions"),
          },
        ]
      : []),
  ];

  const sidebarItems = [
    {
      label: "User Profile",
      icon: User,
      onClick: () => setShowProfile(true),
    },
    {
      label: "Settings",
      icon: Settings,
      onClick: () => setShowSettings(true),
    },
    {
      label: "Help & Support",
      icon: HelpCircle,
      onClick: () => setShowHelp(true),
    },
    {
      label: "Logout",
      icon: LogOut,
      onClick: handleLogout,
      variant: "destructive" as const,
    },
  ];

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transition-transform duration-300 ease-in-out md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:static md:z-auto`}
      >
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="p-6 border-b border-border">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Menu</h2>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {selectedCustomer} - {selectedSite}
            </p>
            <p className="text-xs text-muted-foreground mt-1">User: {currentUser}</p>
          </div>

          {/* Sidebar Content */}
          <div className="flex-1 overflow-y-auto p-4">
            <nav className="space-y-2">
              {sidebarItems.map((item, index) => (
                <div key={index}>
                  <Button
                    variant={item.variant || "ghost"}
                    className="w-full justify-start gap-3"
                    onClick={item.onClick}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </Button>
                  {index === sidebarItems.length - 2 && <Separator className="my-2" />}
                </div>
              ))}
            </nav>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-6 w-6" />
              </Button>
              <h1 className="text-xl font-bold">Manufacturing Dispatch Hub</h1>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold mb-2">Welcome, {currentUser}</h2>
            <p className="text-muted-foreground">
              Select a module to get started
            </p>
          </div>

          {/* Navigation Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {navigationCards.map((card, index) => (
              <Card
                key={index}
                className={`cursor-pointer transition-all duration-200 hover:shadow-lg ${card.bgColor}`}
                onClick={card.onClick}
              >
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${card.bgColor}`}>
                      <card.icon className={`h-6 w-6 ${card.color}`} />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-lg">{card.title}</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm">{card.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Application settings and preferences
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Settings functionality will be implemented here.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* User Profile Dialog */}
      <Dialog open={showProfile} onOpenChange={setShowProfile}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>User Profile</DialogTitle>
            <DialogDescription>
              View and manage your profile information
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <p className="text-sm font-medium">Current User</p>
              <p className="text-sm text-muted-foreground">{currentUser}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Customer</p>
              <p className="text-sm text-muted-foreground">{selectedCustomer}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Facility</p>
              <p className="text-sm text-muted-foreground">{selectedSite}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Help & Support Dialog */}
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Help & Support</DialogTitle>
            <DialogDescription>
              Get help and support for using the application
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Help and support information will be available here.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Home;

