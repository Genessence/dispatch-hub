import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Building2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/contexts/SessionContext";

const CustomerSiteSelection = () => {
  const navigate = useNavigate();
  const { 
    selectedCustomer: contextCustomer, 
    selectedSite: contextSite,
    setSelectedCustomer: setContextCustomer, 
    setSelectedSite: setContextSite 
  } = useSession();
  
  const [selectedCustomer, setSelectedCustomer] = useState<string>(contextCustomer || "");
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

  const customers = [
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

  const handleContinue = () => {
    if (!selectedCustomer || !selectedSite) {
      toast.error("Please select both customer and facility");
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <div className="p-4 bg-primary rounded-full">
              <Package className="h-12 w-12 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold">Select Customer & Facility</CardTitle>
          <CardDescription className="text-base">
            Choose your customer and facility to continue to the dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="customer" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Customer
              </Label>
              <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                <SelectTrigger id="customer" className="h-12 text-base">
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  {customers.map((customer) => {
                    const isMSIL = isMSILCustomer(customer);
                    return (
                      <SelectItem
                        key={customer}
                        value={customer}
                        disabled={!isMSIL}
                      >
                        {customer}
                        {!isMSIL && (
                          <span className="ml-2 text-xs text-muted-foreground">(Not available)</span>
                        )}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="facility" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Facility
              </Label>
              <Select value={selectedSite} onValueChange={setSelectedSite}>
                <SelectTrigger id="facility" className="h-12 text-base">
                  <SelectValue placeholder="Select a facility" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  {facilities.map((facility) => (
                    <SelectItem key={facility} value={facility}>
                      {facility}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleContinue}
              disabled={isButtonDisabled}
              className="w-full h-12 text-base font-semibold"
            >
              Continue to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomerSiteSelection;

