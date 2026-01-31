import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  ChevronLeft,
  ChevronRight,
  Database,
} from "lucide-react";
import { useSession } from "@/contexts/SessionContext";
import { toast } from "sonner";
import { disconnectSocket } from "@/lib/socket";

const Home = () => {
  const navigate = useNavigate();
  const { currentUser, currentUserRole, selectedCustomer, selectedSite, mismatchAlerts } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const isAdmin = currentUserRole === "admin";
  const pendingExceptionCount = isAdmin
    ? mismatchAlerts.filter((a) => a.status === "pending").length
    : 0;

  const handleLogoError = () => {
    setLogoError(true);
  };

  // Load sidebar collapse state from localStorage
  useEffect(() => {
    const savedState = localStorage.getItem("sidebarCollapsed");
    if (savedState !== null) {
      setSidebarCollapsed(JSON.parse(savedState));
    }
  }, []);

  // Save sidebar collapse state to localStorage
  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", JSON.stringify(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Route guard: Check if customer and site are selected
  useEffect(() => {
    if (!selectedCustomer || !selectedSite) {
      toast.error("Please select a customer and site first");
      navigate("/select-customer-site");
    }
  }, [selectedCustomer, selectedSite, navigate]);

  const handleLogout = () => {
    // Clear all auth data
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    localStorage.removeItem('dispatch-hub-selected-customer');
    localStorage.removeItem('dispatch-hub-selected-site');
    
    // Disconnect socket
    disconnectSocket();
    
    toast.success("Logged out successfully");
    navigate("/");
  };

  // Home page cards
  const navigationCards = [
    {
      title: "Upload Invoice and schedule data",
      description: "Upload invoices and schedule",
      icon: Upload,
      color: "text-blue-700",
      bgColor: "bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200",
      iconBg: "bg-blue-500",
      onClick: () => navigate("/upload"),
    },
    {
      title: "Dock Audit",
      description: "Scan and validate barcode labels",
      icon: ScanBarcode,
      color: "text-blue-700",
      bgColor: "bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200",
      iconBg: "bg-blue-500",
      onClick: () => navigate("/doc-audit"),
    },
    {
      title: "Loading & Dispatch",
      description: "Manage vehicle loading and gatepass",
      icon: Truck,
      color: "text-blue-700",
      bgColor: "bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200",
      iconBg: "bg-blue-500",
      onClick: () => navigate("/dispatch"),
    },
  ];

  // Sidebar navigation items - filtered by role
  const sidebarNavItems = [
    {
      label: "Dashboard",
      icon: HomeIcon,
      onClick: () => navigate("/dashboard"),
      adminOnly: false,
    },
    {
      label: "Master Data",
      icon: Database,
      onClick: () => navigate("/master-data"),
      adminOnly: true,
    },
    {
      label: "Analytics & Report",
      icon: BarChart3,
      onClick: () => navigate("/analytics"),
      adminOnly: true,
    },
    {
      label: "Exception Alerts",
      icon: AlertTriangle,
      onClick: () => navigate("/exceptions"),
      adminOnly: true,
    },
  ].filter(item => !item.adminOnly || isAdmin);

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
        className={`fixed inset-y-0 left-0 z-50 bg-gradient-to-b from-blue-50 to-white dark:from-blue-950/20 dark:to-background border-r border-blue-200 dark:border-blue-800 transition-all duration-300 ease-in-out md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } ${
          sidebarCollapsed ? "w-16" : "w-64"
        } md:static md:z-auto`}
      >
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className={`border-b border-blue-200 dark:border-blue-800 ${sidebarCollapsed ? "p-2" : "p-4"}`}>
            {/* Logo Section */}
            <div className={`flex items-center ${sidebarCollapsed ? "justify-center flex-col gap-2" : "justify-between"} mb-4`}>
              {!logoError ? (
                <img
                  src="/autoliv_logo .jpeg"
                  alt="Autoliv Logo"
                  className={`object-contain ${sidebarCollapsed ? "h-10 w-10" : "h-12 w-auto max-w-[180px]"}`}
                  onError={handleLogoError}
                />
              ) : (
                <div className={`bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center ${sidebarCollapsed ? "h-10 w-10" : "h-12 px-4"}`}>
                  <span className={`text-blue-700 dark:text-blue-300 ${sidebarCollapsed ? "text-xs" : "text-sm font-semibold"}`}>
                    {sidebarCollapsed ? "A" : "Autoliv"}
                  </span>
                </div>
              )}
              {!sidebarCollapsed && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/50 hidden md:flex"
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/50 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              )}
              {sidebarCollapsed && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/50 hidden md:flex"
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
            
            {/* Menu Title and Controls */}
            {!sidebarCollapsed && (
              <>
                <div className="mb-2">
                  <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100">Menu</h2>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedCustomer && (
                    <Badge 
                      variant="secondary" 
                      className="text-xs bg-blue-200 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300"
                    >
                      {selectedCustomer}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  Facility: {selectedSite}
                </p>
                <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  User: {currentUser} 
                  <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">
                    {currentUserRole}
                  </Badge>
                </div>
              </>
            )}
            {sidebarCollapsed && (
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/50 md:hidden"
                  onClick={() => setSidebarOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            )}
          </div>

          {/* Sidebar Content */}
          <div className={`flex-1 overflow-y-auto ${sidebarCollapsed ? "p-2" : "p-4"}`}>
            <nav className="space-y-2">
              {/* Navigation Items */}
              {sidebarNavItems.map((item, index) => (
                <Tooltip key={index} delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      className={`w-full gap-3 text-blue-800 hover:bg-blue-100 hover:text-blue-900 dark:text-blue-200 dark:hover:bg-blue-900/50 dark:hover:text-blue-100 ${
                        sidebarCollapsed ? "justify-center px-2" : "justify-start"
                      }`}
                      onClick={item.onClick}
                    >
                      <span className="relative flex-shrink-0">
                        <item.icon className="h-5 w-5" />
                        {item.label === "Exception Alerts" && pendingExceptionCount > 0 && sidebarCollapsed && (
                          <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
                            {pendingExceptionCount}
                          </span>
                        )}
                      </span>
                      {!sidebarCollapsed && (
                        <>
                          <span className="truncate">{item.label}</span>
                          {item.label === "Exception Alerts" && pendingExceptionCount > 0 && (
                            <Badge variant="destructive" className="ml-auto">
                              {pendingExceptionCount}
                            </Badge>
                          )}
                        </>
                      )}
                    </Button>
                  </TooltipTrigger>
                  {sidebarCollapsed && (
                    <TooltipContent side="right" className="bg-blue-900 text-blue-50 border-blue-700">
                      {item.label}
                    </TooltipContent>
                  )}
                </Tooltip>
              ))}

              <Separator className="my-3 bg-blue-200 dark:bg-blue-800" />

              {/* Utility Items */}
              {sidebarItems.map((item, index) => (
                <Tooltip key={index} delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Button
                      variant={item.variant || "ghost"}
                      className={`w-full gap-3 ${
                        item.variant === "destructive"
                          ? "text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/50"
                          : "text-blue-800 hover:bg-blue-100 hover:text-blue-900 dark:text-blue-200 dark:hover:bg-blue-900/50 dark:hover:text-blue-100"
                      } ${
                        sidebarCollapsed ? "justify-center px-2" : "justify-start"
                      }`}
                      onClick={item.onClick}
                    >
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                    </Button>
                  </TooltipTrigger>
                  {sidebarCollapsed && (
                    <TooltipContent side="right" className="bg-blue-900 text-blue-50 border-blue-700">
                      {item.label}
                    </TooltipContent>
                  )}
                </Tooltip>
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
        <header className="sticky top-0 z-40 w-full border-b border-blue-200 dark:border-blue-800 bg-gradient-to-r from-blue-50/95 to-white/95 dark:from-blue-950/60 dark:to-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/50"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-6 w-6" />
              </Button>
              <h1 className="text-xl font-bold text-blue-900 dark:text-blue-100">Manufacturing Dispatch Hub</h1>
            </div>
            <Badge variant={isAdmin ? "default" : "secondary"} className="hidden sm:flex">
              {isAdmin ? "Admin Access" : "User Access"}
            </Badge>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h2 className="text-3xl font-bold mb-2 text-blue-900 dark:text-blue-100">Welcome, {currentUser}</h2>
            <p className="text-blue-700 dark:text-blue-300">
              Select a module to get started
            </p>
          </div>

          {/* Navigation Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl">
            {navigationCards.map((card, index) => (
              <Card
                key={index}
                className={`cursor-pointer transition-all duration-300 hover:shadow-xl hover:scale-105 border-2 border-blue-200 dark:border-blue-800 ${card.bgColor}`}
                onClick={card.onClick}
              >
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-4">
                    <div className={`p-4 rounded-xl ${card.iconBg} shadow-lg`}>
                      <card.icon className="h-8 w-8 text-white" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-xl font-bold text-blue-900 dark:text-blue-100">{card.title}</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base text-blue-700 dark:text-blue-300">{card.description}</CardDescription>
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
              <p className="text-sm font-medium">Role</p>
              <Badge variant={isAdmin ? "default" : "secondary"}>
                {currentUserRole}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium">Customers</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {selectedCustomer && (
                  <Badge 
                    variant="secondary" 
                    className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                  >
                    {selectedCustomer}
                  </Badge>
                )}
              </div>
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
