"use client";

import { useState } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, deleteUser } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { config } from "@/lib/config";
import { getUserFriendlyAuthError, getUserFriendlyRegistrationError } from "@/lib/authErrors";
import { useAuth } from "@/lib/authContext";
import Link from "next/link";

export type JobTitle = "Student" | "Researcher" | "Software Engineer" | "Others";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [signupStage, setSignupStage] = useState<1 | 2>(1);
  
  // Stage 1 fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [bio, setBio] = useState("");
  const [jobTitle, setJobTitle] = useState<JobTitle>("Others");
  const [photoUrl, setPhotoUrl] = useState("");
  
  // Stage 2 fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");
  const [ageCheckbox, setAgeCheckbox] = useState(false);
  const [consentCheckbox, setConsentCheckbox] = useState(false);
  
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { refreshUserProfile } = useAuth();
  
  // Cleanup function to reset all signup state
  const resetSignupState = () => {
    setSignupStage(1);
    setFirstName("");
    setLastName("");
    setAffiliation("");
    setBio("");
    setJobTitle("Others");
    setPhotoUrl("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setUsername("");
    setAgeCheckbox(false);
    setConsentCheckbox(false);
    setError("");
  };
  
  // Handle modal close
  const handleClose = () => {
    resetSignupState();
    setIsLogin(true);
    onClose();
  };
  
  // Handle switching between login and signup
  const handleToggleMode = () => {
    resetSignupState();
    setIsLogin(!isLogin);
  };
  
  // Stage 1 validation and navigation
  const handleStage1Next = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!firstName.trim()) {
      setError("First name is required");
      return;
    }
    
    if (!lastName.trim()) {
      setError("Last name is required");
      return;
    }
    
    setSignupStage(2);
  };
  
  // Stage 2 validation
  const validateStage2 = (): string | null => {
    if (!ageCheckbox) {
      return "You must confirm that you are 13 years old or older to register.";
    }
    
    if (!consentCheckbox) {
      return "You must agree to the Privacy Policy and Terms and Conditions to register.";
    }
    
    if (password !== confirmPassword) {
      return "Passwords do not match";
    }
    
    if (password.length < 6) {
      return "Password must be at least 6 characters";
    }
    
    if (!username.trim()) {
      return "Username is required";
    }
    
    return null;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Get the Secure Token
      const token = await user.getIdToken();

      // Refresh user profile to update the header
      await refreshUserProfile();
      
      onClose();
      // Reset form
      setEmail("");
      setPassword("");
    } catch (loginError: any) {
      setError(getUserFriendlyAuthError(loginError, "login"));
    } finally {
      setLoading(false);
    }
  };
  
  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    // Validate Stage 2
    const validationError = validateStage2();
    if (validationError) {
      setError(validationError);
      return;
    }
    
    setLoading(true);
    let firebaseUser: any = null;
    
    try {
      // Step 1: Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      firebaseUser = userCredential.user;
      
      // Step 2: Get authentication token
      const token = await firebaseUser.getIdToken();
      
      // Step 3: Prepare complete registration data
      const registrationData: any = {
        username: username.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      };
      
      // Add optional fields if provided
      if (affiliation.trim()) registrationData.affiliation = affiliation.trim();
      if (bio.trim()) registrationData.bio = bio.trim();
      if (jobTitle && jobTitle !== "Others") registrationData.jobTitle = jobTitle;
      if (photoUrl.trim()) registrationData.photoUrl = photoUrl.trim();
      
      // Step 4: Create backend profile
      const response = await fetch(`${config.backendUrl}/users/register`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(registrationData),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Registration failed" }));
        throw new Error(errorData.message || "Registration failed");
      }
      
      // Success! Refresh profile and close modal
      await refreshUserProfile();
      resetSignupState();
      onClose();
      
    } catch (error: any) {
      // If we created a Firebase user but backend failed, clean it up
      if (firebaseUser) {
        try {
          await deleteUser(firebaseUser);
          console.log("Cleaned up Firebase Auth user after backend failure");
        } catch (cleanupError) {
          console.error("Failed to cleanup Firebase user:", cleanupError);
        }
      }
      
      setError(getUserFriendlyRegistrationError(error, !!firebaseUser));
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
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={handleClose}
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
            {isLogin ? "Login" : `Sign Up - Stage ${signupStage} of 2`}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {isLogin
              ? "Welcome back! Please login to your account."
              : signupStage === 1
              ? "Tell us a bit about yourself (all fields optional except name)."
              : "Create your account credentials."}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Login Form */}
        {isLogin ? (
          <form onSubmit={handleLogin} className="space-y-4">
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

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Please wait..." : "Login"}
            </button>
          </form>
        ) : signupStage === 1 ? (
          /* Stage 1: Personal Information */
          <form onSubmit={handleStage1Next} className="space-y-4">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="John"
              />
            </div>

            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Doe"
              />
            </div>

            <div>
              <label htmlFor="jobTitle" className="block text-sm font-medium text-gray-700 mb-1">
                Job Title
              </label>
              <select
                id="jobTitle"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value as JobTitle)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="Others">Others</option>
                <option value="Student">Student</option>
                <option value="Researcher">Researcher</option>
                <option value="Software Engineer">Software Engineer</option>
              </select>
            </div>

            <div>
              <label htmlFor="affiliation" className="block text-sm font-medium text-gray-700 mb-1">
                Affiliation
              </label>
              <input
                id="affiliation"
                type="text"
                value={affiliation}
                onChange={(e) => setAffiliation(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="University, Company, etc."
              />
            </div>

            <div>
              <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-1">
                Bio
              </label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Tell us about yourself..."
              />
            </div>

            <div>
              <label htmlFor="photoUrl" className="block text-sm font-medium text-gray-700 mb-1">
                Photo URL
              </label>
              <input
                id="photoUrl"
                type="url"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="https://example.com/photo.jpg"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 py-2 px-4 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 px-4 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 transition-colors"
              >
                Next
              </button>
            </div>
          </form>
        ) : (
          /* Stage 2: Account Credentials */
          <form onSubmit={handleSignupSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email <span className="text-red-500">*</span>
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
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Username <span className="text-red-500">*</span>
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
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password <span className="text-red-500">*</span>
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

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password <span className="text-red-500">*</span>
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

            <div className="space-y-3">
              <div className="flex items-start">
                <input
                  id="ageCheckbox"
                  type="checkbox"
                  checked={ageCheckbox}
                  onChange={(e) => setAgeCheckbox(e.target.checked)}
                  className="mt-1 mr-2 h-4 w-4 min-w-[1rem] flex-shrink-0 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                />
                <label htmlFor="ageCheckbox" className="text-sm text-gray-700">
                  I am 13 years old or older <span className="text-red-500">*</span>
                </label>
              </div>

              <div className="flex items-start">
                <input
                  id="consentCheckbox"
                  type="checkbox"
                  checked={consentCheckbox}
                  onChange={(e) => setConsentCheckbox(e.target.checked)}
                  className="mt-1 mr-2 h-4 w-4 min-w-[1rem] flex-shrink-0 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                />
                <label htmlFor="consentCheckbox" className="text-sm text-gray-700">
                  I have read and agree to the{" "}
                  <Link href="/privacy" target="_blank" className="text-green-600 hover:text-green-700 underline">
                    Privacy Policy
                  </Link>{" "}
                  and{" "}
                  <Link href="/terms" target="_blank" className="text-green-600 hover:text-green-700 underline">
                    Terms and Conditions
                  </Link>{" "}
                  <span className="text-red-500">*</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setSignupStage(1)}
                className="flex-1 py-2 px-4 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2 px-4 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Please wait..." : "Sign Up"}
              </button>
            </div>
          </form>
        )}

        {/* Toggle between Login and Signup */}
        {(isLogin || (!isLogin && signupStage === 1)) && (
          <div className="mt-6 text-center">
            <button
              onClick={handleToggleMode}
              className="text-sm text-green-600 hover:text-green-700 font-medium"
            >
              {isLogin
                ? "Don't have an account? Sign up"
                : "Already have an account? Login"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
