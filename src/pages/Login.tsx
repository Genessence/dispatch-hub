import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock } from "lucide-react";
import { toast } from "sonner";

const Login = () => {
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [logoError, setLogoError] = useState(false);
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Simple validation - accepts both email and username
    if (usernameOrEmail && password) {
      toast.success("Login successful!");
      navigate("/select-customer-site");
    } else {
      toast.error("Please enter both username/email and password");
    }
  };

  const handleLogoError = () => {
    setLogoError(true);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding Side */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-primary/80">
        {/* Gradient Overlay for Depth */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent" />
        
        {/* Pattern Overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)`,
          backgroundSize: '40px 40px'
        }} />
        
        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center w-full p-12 text-white">
          <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-left-4 duration-700">
            {!logoError ? (
              <img
                src="/autoliv_logo .jpeg"
                alt="Autoliv Logo"
                className="w-[250px] h-auto mx-auto object-contain drop-shadow-2xl animate-in fade-in zoom-in-95 duration-1000"
                onError={handleLogoError}
              />
            ) : (
              <div className="w-[250px] h-[150px] mx-auto bg-white/10 rounded-lg flex items-center justify-center">
                <span className="text-white/70 text-sm">Logo</span>
              </div>
            )}
            <div className="text-center space-y-4">
              <h2 className="text-3xl font-bold tracking-tight">Manufacturing Dispatch</h2>
              <p className="text-white/90 text-lg leading-relaxed">
                Streamline your dispatch operations with our comprehensive management system
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Form Side */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-background p-4 sm:p-8">
        <Card className="w-full max-w-md shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] border border-border/50 animate-in fade-in slide-in-from-right-4 duration-700">
          <CardHeader className="space-y-6 text-center pb-8">
            {/* Logo in Card Header */}
            <div className="flex justify-center">
              {!logoError ? (
                <img
                  src="/autoliv_logo .jpeg"
                  alt="Autoliv Logo"
                  className="w-[100px] h-auto object-contain animate-in fade-in zoom-in-95 duration-1000 delay-150"
                  onError={handleLogoError}
                />
              ) : (
                <div className="w-[100px] h-[60px] bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-xs">Logo</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl sm:text-3xl font-bold tracking-tight">
                Welcome Back
              </CardTitle>
              <CardDescription className="text-base">
                Sign in to access the dispatch management system
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="usernameOrEmail" className="text-sm font-medium">
                  Email or Username
                </Label>
                <Input
                  id="usernameOrEmail"
                  type="text"
                  placeholder="username or operator@factory.com"
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  className="h-11 text-base transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 text-base pr-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                    required
                  />
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
              <Button 
                type="submit" 
                className="w-full h-11 text-base font-semibold mt-6 transition-all duration-200 hover:shadow-md hover:scale-[1.01] active:scale-[0.99]"
              >
                Sign In
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
