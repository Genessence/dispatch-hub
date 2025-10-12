import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import UploadData from "./pages/UploadData";
import DocAudit from "./pages/DocAudit";
import Dispatch from "./pages/Dispatch";
import Analytics from "./pages/Analytics";
import GatepassVerification from "./pages/GatepassVerification";
import MasterData from "./pages/MasterData";
import NotFound from "./pages/NotFound";
import UserSwitcher from "./components/UserSwitcher";
import { SessionProvider } from "./contexts/SessionContext";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <SessionProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/upload" element={<UploadData />} />
            <Route path="/doc-audit" element={<DocAudit />} />
            <Route path="/dispatch" element={<Dispatch />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/verify" element={<GatepassVerification />} />
            <Route path="/master-data" element={<MasterData />} />
            <Route path="/exceptions" element={<Dashboard />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          {/* User Switcher - visible on all pages */}
          <UserSwitcher />
        </BrowserRouter>
      </TooltipProvider>
    </SessionProvider>
  </QueryClientProvider>
);

export default App;
