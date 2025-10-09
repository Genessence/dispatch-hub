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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
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
          <Route path="/master-data" element={<Dashboard />} />
          <Route path="/exceptions" element={<Dashboard />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
