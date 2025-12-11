"use client";

import { useState } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, deleteUser } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { config } from "@/lib/config";
import { getUserFriendlyAuthError, getUserFriendlyRegistrationError } from "@/lib/authErrors";
import { useAuth } from "@/lib/authContext";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { refreshUserProfile } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isLogin) {
        // Login: 1. Sign in with Firebase Auth
        try {
          const userCredential = await signInWithEmailAndPassword(auth, email, password);
          const user = userCredential.user;

          // 2. Get the Secure Token
          const token = await user.getIdToken();

          // 3. Refresh user profile to update the header
          await refreshUserProfile();
          
          onClose();
          // Reset form
          setEmail("");
          setPassword("");
        } catch (loginError: any) {
          // Use user-friendly error message
          throw new Error(getUserFriendlyAuthError(loginError, "login"));
        }
      } else {
        // Signup
        if (password !== confirmPassword) {
          setError("Passwords do not match");
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError("Password must be at least 6 characters");
          setLoading(false);
          return;
        }
        if (!username.trim()) {
          setError("Username is required");
          setLoading(false);
          return;
        }

        // 1. Create Identity in Firebase Auth
        // This creates the Auth user first - if backend fails, we'll clean it up
        let user: any = null;
        let authUserCreated = false;
        
        try {
          const userCredential = await createUserWithEmailAndPassword(auth, email, password);
          user = userCredential.user;
          authUserCreated = true;
          console.log("Firebase Auth user created:", user.uid);

          // 2. Get the Secure Token
          const token = await user.getIdToken();

          // 3. Call backend to create Firestore profile (idempotent - safe to retry)
          // Retry logic with exponential backoff for transient failures
          let lastError: Error | null = null;
          const maxRetries = 3;
          const baseDelay = 1000; // 1 second
          let currentToken = token;

          for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
              const response = await fetch(`${config.backendUrl}/users/register`, {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${currentToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ username: username.trim() }),
              });

              if (response.ok) {
                console.log("User fully registered! Profile created in Firestore.");
                // Success - break out of retry loop
                lastError = null;
                break;
              }

              // If 401, don't retry (auth issue)
              if (response.status === 401) {
                const errorData = await response.json().catch(() => ({ message: "Authentication failed" }));
                // Sanitize backend error message
                const sanitizedMessage = getUserFriendlyAuthError(
                  { message: errorData.message || "Authentication failed" },
                  "signup"
                );
                throw new Error(sanitizedMessage);
              }

              // For other errors, prepare to retry
              const errorData = await response.json().catch(() => ({ message: "Backend registration failed" }));
              // Sanitize backend error message
              const sanitizedBackendMessage = getUserFriendlyAuthError(
                { message: errorData.message || "Backend registration failed" },
                "signup"
              );
              lastError = new Error(sanitizedBackendMessage);

              // If not the last attempt, wait before retrying
              if (attempt < maxRetries - 1) {
                const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
                console.warn(`Registration attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                // Refresh token before retry
                currentToken = await user.getIdToken(true);
              }
            } catch (fetchError: any) {
              // Sanitize error message before storing
              const sanitizedMessage = getUserFriendlyAuthError(
                { message: fetchError.message || "Network error occurred" },
                "signup"
              );
              lastError = new Error(sanitizedMessage);
              
              // If it's a network error and not the last attempt, retry
              if (attempt < maxRetries - 1 && !fetchError.message?.includes("Authentication failed")) {
                const delay = baseDelay * Math.pow(2, attempt);
                console.warn(`Registration attempt ${attempt + 1} failed with network error, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                // Refresh token before retry
                currentToken = await user.getIdToken(true);
              } else {
                // Don't retry on auth errors or last attempt - throw sanitized error
                throw lastError;
              }
            }
          }

          // If we still have an error after all retries, throw it
          if (lastError) {
            throw lastError;
          }

          // Registration successful - refresh user profile
          await refreshUserProfile();
        } catch (error: any) {
          // If backend registration failed and we created an Auth user, clean it up
          if (authUserCreated && user) {
            try {
              await deleteUser(user);
              console.log("Cleaned up Auth user after registration failure");
            } catch (deleteError: any) {
              // Log the cleanup failure but don't mask the original error
              console.error(
                "CRITICAL: Failed to delete Auth user after registration failure. " +
                "User may be orphaned. UID:",
                user.uid,
                "Error:",
                deleteError
              );
              // In production, you might want to send this to an error tracking service
              // or trigger an alert for manual cleanup
            }
          }
          // Create user-friendly error message with context
          const friendlyError = getUserFriendlyRegistrationError(error, authUserCreated);
          throw new Error(friendlyError);
        }

        onClose();
        // Reset form
        setEmail("");
        setPassword("");
        setConfirmPassword("");
        setUsername("");
      }
    } catch (err: any) {
      // Error message is already user-friendly from getUserFriendlyAuthError or getUserFriendlyRegistrationError
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            {isLogin ? "Login" : "Sign Up"}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {isLogin
              ? "Welcome back! Please login to your account."
              : "Create a new account to get started."}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          {!isLogin && (
            <>
              <div>
                <label
                  htmlFor="username"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="ML_Master"
                />
              </div>
              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Please wait..." : isLogin ? "Login" : "Sign Up"}
          </button>
        </form>

        {/* Toggle between Login and Signup */}
        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError("");
              setPassword("");
              setConfirmPassword("");
              setUsername("");
            }}
            className="text-sm text-green-600 hover:text-green-700 font-medium"
          >
            {isLogin
              ? "Don't have an account? Sign up"
              : "Already have an account? Login"}
          </button>
        </div>
      </div>
    </div>
  );
}
