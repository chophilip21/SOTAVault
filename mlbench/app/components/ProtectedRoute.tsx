'use client';

import { useAuth } from "@/lib/authContext";
import { requiresAuth } from "@/lib/routeAccess";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import AuthModal from "./AuthModal";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  const routeRequiresAuth = useMemo(() => requiresAuth(pathname), [pathname]);

  useEffect(() => {
    if (!loading) {
      if (routeRequiresAuth && !user) {
        if (hasChecked) {
          // User was authenticated and just logged out — go home instead of re-prompting.
          router.push('/');
        } else {
          // First check: user arrived without being logged in.
          setShowAuthModal(true);
        }
      }
      setHasChecked(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, routeRequiresAuth]);

  const handleModalClose = () => {
    setShowAuthModal(false);
    router.push('/');
  };

  // Show loading state while checking auth
  if (loading || !hasChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  // If route requires auth and user is not logged in, show modal and prevent content display
  if (routeRequiresAuth && !user) {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Authentication Required</h2>
            <p className="text-gray-600">Please log in to access this page.</p>
          </div>
        </div>
        <AuthModal isOpen={showAuthModal} onClose={handleModalClose} />
      </>
    );
  }

  // User is authenticated or route doesn't require auth
  return <>{children}</>;
}

