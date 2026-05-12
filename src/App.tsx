import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";

const CRMLandingPage = lazy(() => import("./pages/CRMLandingPage"));
const ConsultantPage = lazy(() => import("./pages/ConsultantPage"));
const CadastroPage = lazy(() => import("./pages/CadastroPage"));
const WhatsAppClientsPage = lazy(() => import("./pages/WhatsAppClientsPage"));
const LicenciadaPage = lazy(() => import("./pages/LicenciadaPage"));
const LicenciadaPreview = lazy(() => import("./pages/LicenciadaPreview"));
const AssistentePage = lazy(() => import("./pages/AssistentePage"));
const Auth = lazy(() => import("./pages/Auth"));
const Admin = lazy(() => import("./pages/Admin"));
const SuperAdmin = lazy(() => import("./pages/SuperAdmin"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={
            <div className="flex h-screen items-center justify-center bg-background">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <div className="animate-spin h-6 w-6 border-3 border-primary border-t-transparent rounded-full" />
                  </div>
                  <div className="absolute inset-0 rounded-2xl bg-primary/5 animate-ping" />
                </div>
              </div>
            </div>
          }>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/whatsapp-clients" element={<WhatsAppClientsPage />} />
              <Route path="/super-admin" element={<SuperAdmin />} />
              <Route path="/assistente" element={<AssistentePage />} />
              <Route path="/crm" element={<CRMLandingPage />} />
              <Route path="/licenciado/preview" element={<LicenciadaPreview />} />
              <Route path="/licenciado/:licenca" element={<LicenciadaPage />} />
              <Route path="/cadastro/:licenca" element={<CadastroPage />} />
              <Route path="/:licenca" element={<ConsultantPage />} />
              <Route path="/" element={<Navigate to="/auth" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
