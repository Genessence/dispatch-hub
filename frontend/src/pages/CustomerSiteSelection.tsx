import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, MapPin, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/contexts/SessionContext";
import { MSIL_CUSTOMERS } from "@/lib/customerCodes";

const CustomerSiteSelection = () => {
  const navigate = useNavigate();
  const { 
    selectedCustomer: contextCustomer, 
    selectedSite: contextSite,
    setSelectedCustomer: setContextCustomer, 
    setSelectedSite: setContextSite 
  } = useSession();
  
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(contextCustomer || null);
  const [selectedSite, setSelectedSite] = useState<string>(contextSite || "");

  // Update local state when context values change (e.g., from localStorage)
  useEffect(() => {
    if (contextCustomer) {
      setSelectedCustomer(contextCustomer);
    }
    if (contextSite) {
      setSelectedSite(contextSite);
    }
  }, [contextCustomer, contextSite]);

  const facilities = ["Cheyyar", "Pune", "Bengaluru", "mysuru", "badli"];

  const handleContinue = () => {
    if (!selectedCustomer || !selectedSite) {
      toast.error("Please select a customer and a facility");
      return;
    }

    // Store selections in context (which will persist to localStorage)
    setContextCustomer(selectedCustomer);
    setContextSite(selectedSite);
    
    toast.success("Selection saved!");
    navigate("/home");
  };

  const isButtonDisabled = !selectedCustomer || !selectedSite;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 25% 25%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
                           radial-gradient(circle at 75% 75%, rgba(168, 85, 247, 0.1) 0%, transparent 50%)`
        }} />
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      <Card className="w-full max-w-lg shadow-2xl border-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl relative z-10">
        <CardHeader className="space-y-4 text-center pb-2">
          {/* Autoliv Logo */}
          <div className="flex justify-center">
            <img 
              src="/autoliv_logo .jpeg" 
              alt="Autoliv" 
              className="h-14 w-auto object-contain"
            />
          </div>
          
          <div className="space-y-2">
            <CardTitle className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Dispatch Hub
            </CardTitle>
            <CardDescription className="text-sm text-slate-500 dark:text-slate-400">
              Select your customer and facility to continue
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-2">
          {/* Facility Selection */}
          <div className="space-y-3">
            <Label htmlFor="facility" className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <MapPin className="h-4 w-4 text-purple-500" />
              Select Facility
            </Label>
            <Select value={selectedSite} onValueChange={setSelectedSite}>
              <SelectTrigger 
                id="facility" 
                className={`
                  h-12 text-base border-2 transition-colors
                  ${selectedSite 
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/30' 
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }
                `}
              >
                <SelectValue placeholder="Choose a facility..." />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] overflow-y-auto">
                {facilities.map((facility) => (
                  <SelectItem 
                    key={facility} 
                    value={facility}
                    className="cursor-pointer"
                  >
                    {facility}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-700" />
            </div>
          </div>

          {/* Customer Selection */}
          <div className="space-y-3">
            <Label htmlFor="customer" className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <Building2 className="h-4 w-4 text-blue-500" />
              Select Customer
            </Label>
            <Select value={selectedCustomer || undefined} onValueChange={setSelectedCustomer}>
              <SelectTrigger 
                id="customer" 
                className={`
                  h-12 text-base border-2 transition-colors
                  ${selectedCustomer 
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' 
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }
                `}
              >
                <SelectValue placeholder="Choose a customer..." />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] overflow-y-auto">
                {MSIL_CUSTOMERS.map((customer) => (
                  <SelectItem 
                    key={customer} 
                    value={customer}
                    className="cursor-pointer"
                  >
                    {customer}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Continue Button */}
          <Button
            onClick={handleContinue}
            disabled={isButtonDisabled}
            className={`
              w-full h-12 text-base font-semibold rounded-lg
              transition-all duration-200 ease-in-out
              ${isButtonDisabled 
                ? 'bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-500' 
                : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl'
              }
            `}
          >
            <span>Continue to Dashboard</span>
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>

          {/* Selection Summary */}
          {(selectedCustomer || selectedSite) && (
            <div className="text-center text-xs text-slate-500 dark:text-slate-400 pt-2">
              {selectedCustomer && (
                <span>Customer: {selectedCustomer}</span>
              )}
              {selectedCustomer && selectedSite && <span className="mx-1">•</span>}
              {selectedSite && <span>Facility: {selectedSite}</span>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomerSiteSelection;
