import "@/App.css";
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { Toaster } from "./components/ui/sonner";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import ViewPage from "./pages/ViewPage";
import TripDeckPage from "./pages/TripDeckPage";
import TripDeckBuilderPage from "./pages/TripDeckBuilderPage";
import PublicTripDeckPage from "./pages/PublicTripDeckPage";
import GateLinkResponsesPage from "./pages/GateLinkResponsesPage";
import LeadsPage from "./pages/LeadsPage";
import { Button } from "./components/ui/button";
import { Loader2 } from "lucide-react";

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("App runtime error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-white flex items-center justify-center px-6">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="text-xl font-bold text-slate-800">Something went wrong loading LinkDeck</div>
            <p className="mt-3 text-sm text-slate-500">
              We hit a runtime issue while opening the app. Refresh once, and if it still happens,
              this screen will help us pinpoint the exact problem faster.
            </p>
            {this.state.error?.message && (
              <div className="mt-4 rounded-xl bg-slate-50 p-4 text-left text-xs text-slate-600 break-words">
                {this.state.error.message}
              </div>
            )}
            <Button
              className="mt-6"
              onClick={() => window.location.reload()}
            >
              Reload
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#002FA7]" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#002FA7]" />
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;
  return children;
}

function App() {
  function HomePage() {
    const { user } = useAuth();
    return user?.role === "admin" ? <AdminDashboardPage /> : <DashboardPage />;
  }

  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
            <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
            <Route path="/tripdeck" element={<ProtectedRoute><TripDeckPage /></ProtectedRoute>} />
            <Route path="/tripdeck/responses/:linkId" element={<ProtectedRoute><GateLinkResponsesPage /></ProtectedRoute>} />
            <Route path="/tripdeck/leads" element={<ProtectedRoute><LeadsPage /></ProtectedRoute>} />
            <Route path="/tripdeck/:tripdeckId" element={<ProtectedRoute><TripDeckBuilderPage /></ProtectedRoute>} />
            <Route path="/deck/:slug" element={<PublicTripDeckPage />} />
            <Route path="/view/:uniqueId" element={<ViewPage />} />
          </Routes>
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}

export default App;
