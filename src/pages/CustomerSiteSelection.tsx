import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Building2, MapPin, X, ArrowRight, ChevronDown, Check } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/contexts/SessionContext";
import { cn } from "@/lib/utils";

const CustomerSiteSelection = () => {
  const navigate = useNavigate();
  const { 
    selectedCustomer: contextCustomers, 
    selectedSite: contextSite,
    setSelectedCustomer: setContextCustomer, 
    setSelectedSite: setContextSite 
  } = useSession();
  
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>(contextCustomers || []);
  const [selectedSite, setSelectedSite] = useState<string>(contextSite || "");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Update local state when context values change (e.g., from localStorage)
  useEffect(() => {
    if (contextCustomers && contextCustomers.length > 0) {
      setSelectedCustomers(contextCustomers);
    }
    if (contextSite) {
      setSelectedSite(contextSite);
    }
  }, [contextCustomers, contextSite]);

  // All customers (all visible, only MSIL selectable)
  const allCustomers = [
    "KML Manesar",
    "KML Narsighpur",
    "KML Kharkhoda",
    "BSL Manesar",
    "BSL Gurgaon",
    "BSL Kharkhoda",
    "Renault, Chennai",
    "Skoda VW",
    "Mahindra Haridwar",
    "TS Tech, Neemrana",
    "MSIL, Gurgaon",
    "MSIL, Manesar",
    "MSIL Kharkhoda",
    "Honda Car",
  ];

  const facilities = ["Cheyyar", "Pune", "Bengaluru", "mysuru", "badli"];

  // Check if customer is an MSIL option
  const isMSILCustomer = (customer: string) => {
    return customer.startsWith("MSIL");
  };

  const toggleCustomer = (customerName: string) => {
    setSelectedCustomers(prev => 
      prev.includes(customerName)
        ? prev.filter(c => c !== customerName)
        : [...prev, customerName]
    );
  };

  const removeCustomer = (customerName: string) => {
    setSelectedCustomers(prev => prev.filter(c => c !== customerName));
  };

  const selectAllCustomers = () => {
    const msilOnly = allCustomers.filter(c => isMSILCustomer(c));
    setSelectedCustomers(msilOnly);
  };

  const clearAllCustomers = () => {
    setSelectedCustomers([]);
  };

  const handleContinue = () => {
    if (selectedCustomers.length === 0 || !selectedSite) {
      toast.error("Please select at least one customer and a facility");
      return;
    }

    // Store selections in context (which will persist to localStorage)
    setContextCustomer(selectedCustomers);
    setContextSite(selectedSite);
    
    toast.success("Selection saved!");
    navigate("/home");
  };

  const isButtonDisabled = selectedCustomers.length === 0 || !selectedSite;
  const msilCustomers = allCustomers.filter(c => isMSILCustomer(c));
  const allSelected = selectedCustomers.length === msilCustomers.length && msilCustomers.every(c => selectedCustomers.includes(c));

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
              Select your customers and facility to continue
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
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                <Building2 className="h-4 w-4 text-blue-500" />
                Select Customers
              </Label>
              {msilCustomers.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950"
                  onClick={allSelected ? clearAllCustomers : selectAllCustomers}
                >
                  {allSelected ? "Clear All" : "Select All"}
                </Button>
              )}
            </div>

            {/* Selected Customers Badge Chips - Above Dropdown */}
            {selectedCustomers.length > 0 && (
              <div className="flex flex-wrap gap-2 min-h-[2.5rem] p-2 rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                {selectedCustomers.map((customer) => (
                  <Badge
                    key={customer}
                    variant="secondary"
                    className="pl-3 pr-1.5 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:hover:bg-blue-900/70 transition-colors"
                  >
                    <span className="text-xs font-medium">{customer}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCustomer(customer);
                      }}
                      className="ml-1.5 p-0.5 rounded-full hover:bg-blue-300/50 dark:hover:bg-blue-700/50 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Customer Dropdown */}
            <Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={dropdownOpen}
                  className={cn(
                    "w-full h-12 justify-between text-base border-2 transition-colors",
                    selectedCustomers.length > 0
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                      : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                  )}
                >
                  <span className="text-left flex-1 truncate">
                    {selectedCustomers.length > 0
                      ? `${selectedCustomers.length} customer${selectedCustomers.length > 1 ? 's' : ''} selected`
                      : "Select customers..."}
                  </span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <div className="max-h-[300px] overflow-y-auto">
                  {allCustomers.map((customer) => {
                    const isSelected = selectedCustomers.includes(customer);
                    const isMSIL = isMSILCustomer(customer);
                    const isDisabled = !isMSIL;
                    
                    return (
                      <div
                        key={customer}
                        onClick={() => {
                          if (!isDisabled) {
                            toggleCustomer(customer);
                          }
                        }}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors",
                          isDisabled 
                            ? "opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-900/50" 
                            : "hover:bg-slate-100 dark:hover:bg-slate-800",
                          isSelected && !isDisabled && "bg-blue-50 dark:bg-blue-950/30"
                        )}
                      >
                        <div className={cn(
                          "flex items-center justify-center h-5 w-5 rounded border-2 transition-colors flex-shrink-0",
                          isSelected && !isDisabled
                            ? "border-blue-500 bg-blue-500"
                            : isDisabled
                            ? "border-slate-300 dark:border-slate-600"
                            : "border-slate-300 dark:border-slate-600"
                        )}>
                          {isSelected && !isDisabled && (
                            <Check className="h-3 w-3 text-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "font-medium text-sm",
                            isSelected && !isDisabled
                              ? "text-blue-700 dark:text-blue-300"
                              : isDisabled
                              ? "text-slate-400 dark:text-slate-500"
                              : "text-slate-700 dark:text-slate-300"
                          )}>
                            {customer}
                            {isDisabled && (
                              <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">(Not available)</span>
                            )}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
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
          {(selectedCustomers.length > 0 || selectedSite) && (
            <div className="text-center text-xs text-slate-500 dark:text-slate-400 pt-2">
              {selectedCustomers.length > 0 && (
                <span>{selectedCustomers.length} customer{selectedCustomers.length > 1 ? 's' : ''} selected</span>
              )}
              {selectedCustomers.length > 0 && selectedSite && <span className="mx-1">•</span>}
              {selectedSite && <span>Facility: {selectedSite}</span>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomerSiteSelection;
