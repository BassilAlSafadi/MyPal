import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuthStore } from "@/stores/authStore";
import { refreshTokenStore } from "@/api/client";
import { PersonaOnboardingModal } from "@/components/PersonaOnboardingModal";
import SessionInitializer from "@/components/SessionInitializer";
import { Loader2 } from "lucide-react";
import SplashScreen from "./pages/SplashScreen";
import LoginScreen from "./pages/LoginScreen";
import SignupScreen from "./pages/SignupScreen";
import HomeScreen from "./pages/HomeScreen";
import SearchScreen from "./pages/SearchScreen";
import AISearchScreen from "./pages/AISearchScreen";
import WishlistScreen from "./pages/WishlistScreen";
import WalletScreen from "./pages/WalletScreen";
import SellScreen from "./pages/SellScreen";
import CartScreen from "./pages/CartScreen";
import SettingsScreen from "./pages/SettingsScreen";
import AuthCallback from "./pages/AuthCallback";
import CompleteProfileScreen from "./pages/CompleteProfileScreen";
import NotFound from "./pages/NotFound";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const user               = useAuthStore((s) => s.user);
  const isRestoring        = useAuthStore((s) => s.isRestoringSession);
  const hasHydrated        = useAuthStore((s) => s.hasHydrated);
  const hasRefreshToken    = !!refreshTokenStore.get();

  // While SessionInitializer is verifying the persisted session, hold here
  // instead of redirecting — prevents the flash-to-login on refresh.
  if (!hasHydrated || isRestoring || (!user && hasRefreshToken)) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-cobalt-light" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <SessionInitializer />
    <PersonaOnboardingModal />
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SplashScreen />} />
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/signup" element={<SignupScreen />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        {/* Post-Google-OAuth location onboarding — shown when country is not set */}
        <Route path="/complete-profile" element={<ProtectedRoute><CompleteProfileScreen /></ProtectedRoute>} />
        <Route path="/home" element={<ProtectedRoute><HomeScreen /></ProtectedRoute>} />
        <Route path="/search" element={<ProtectedRoute><SearchScreen /></ProtectedRoute>} />
        <Route path="/ai-search" element={<ProtectedRoute><AISearchScreen /></ProtectedRoute>} />
        <Route path="/wishlist" element={<ProtectedRoute><WishlistScreen /></ProtectedRoute>} />
        <Route path="/wallet" element={<ProtectedRoute><WalletScreen /></ProtectedRoute>} />
        <Route path="/sell" element={<ProtectedRoute><SellScreen /></ProtectedRoute>} />
        {/* /my-listings → /sell until per-user listing ownership is modelled in the DB */}
        <Route path="/my-listings" element={<Navigate to="/sell" replace />} />
        <Route path="/cart" element={<ProtectedRoute><CartScreen /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsScreen /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
