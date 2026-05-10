import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { AuthGateway } from "@/features/auth/AuthGateway";
import { PersonaOnboardingModal } from "@/features/auth/PersonaOnboardingModal";
import DashboardScreen from "@/pages/DashboardScreen";
import { useAuthStore } from "@/stores/authStore";

const App = () => {
  const { user, needsOnboarding, completeOnboarding } = useAuthStore();

  return (
    <>
      <Toaster />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={user ? <Navigate to="/dashboard" replace /> : <AuthGateway />} />
          <Route path="/dashboard" element={user ? <DashboardScreen /> : <Navigate to="/auth" replace />} />
          <Route path="*" element={<Navigate to={user ? "/dashboard" : "/auth"} replace />} />
        </Routes>
      </BrowserRouter>
      <PersonaOnboardingModal open={Boolean(user && needsOnboarding)} onComplete={completeOnboarding} />
    </>
  );
};

export default App;
