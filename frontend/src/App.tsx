import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import CustomerSiteSelection from "./pages/CustomerSiteSelection";
import Home from "./pages/Home";
import UploadData from "./pages/UploadData";
import DocAudit from "./pages/DocAudit";
import Dispatch from "./pages/Dispatch";
import Analytics from "./pages/Analytics";
import GatepassVerification from "./pages/GatepassVerification";
import MasterData from "./pages/MasterData";
import ExceptionAlerts from "./pages/ExceptionAlerts";
import NotFound from "./pages/NotFound";
import { SessionProvider, useSession } from "./contexts/SessionContext";

const queryClient = new QueryClient();

// Protected Route wrapper - requires authentication
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('authToken');
  
  if (!token) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};

// Admin-only Route wrapper
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { currentUserRole } = useSession();
  const token = localStorage.getItem('authToken');
  
  if (!token) {
    return <Navigate to="/" replace />;
  }
  
  if (currentUserRole !== 'admin') {
    return <Navigate to="/home" replace />;
  }
  
  return <>{children}</>;
};

const AppRoutes = () => {
  return (
    <Routes>
      {/* Public route */}
      <Route path="/" element={<Login />} />
      
      {/* Protected routes - all users */}
      <Route path="/select-customer-site" element={
        <ProtectedRoute>
          <CustomerSiteSelection />
        </ProtectedRoute>
      } />
      <Route path="/home" element={
        <ProtectedRoute>
          <Home />
        </ProtectedRoute>
      } />
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      } />
      <Route path="/upload" element={
        <ProtectedRoute>
          <UploadData />
        </ProtectedRoute>
      } />
      <Route path="/doc-audit" element={
        <ProtectedRoute>
          <DocAudit />
        </ProtectedRoute>
      } />
      <Route path="/dispatch" element={
        <ProtectedRoute>
          <Dispatch />
        </ProtectedRoute>
      } />
      <Route path="/verify" element={
        <ProtectedRoute>
          <GatepassVerification />
        </ProtectedRoute>
      } />
      
      {/* Admin-only routes */}
      <Route path="/analytics" element={
        <AdminRoute>
          <Analytics />
        </AdminRoute>
      } />
      <Route path="/master-data" element={
        <AdminRoute>
          <MasterData />
        </AdminRoute>
      } />
      <Route path="/exceptions" element={
        <AdminRoute>
          <ExceptionAlerts />
        </AdminRoute>
      } />
      
      {/* Catch-all */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <SessionProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </SessionProvider>
  </QueryClientProvider>
);

export default App;
