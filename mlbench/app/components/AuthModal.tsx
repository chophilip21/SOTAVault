import { useState, useRef, useEffect } from "react";
import {
  deleteUser,
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup,
  getAdditionalUserInfo,
  signOut,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getBackendBaseUrl } from "@/lib/backendUrl";
import { getUserFriendlyAuthError, getUserFriendlyRegistrationError } from "@/lib/authErrors";
import { useAuth } from "@/lib/authContext";
import Link from "next/link";
import Turnstile from "react-turnstile";

export type JobTitle = "Student" | "Researcher" | "Software Engineer" | "Others";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_CLOUDFLARE_SITE_KEY || "";

async function verifyTurnstileWithBackend(token: string): Promise<void> {
  const response = await fetch(`${getBackendBaseUrl()}/users/verify-turnstile`, {
    method: "POST",
    headers: {
      "x-turnstile-token": token,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: "Security verification failed." }));
    throw new Error(errorData.detail || "Security verification failed. Please try again.");
  }
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [signupStage, setSignupStage] = useState<1 | 2 | 3>(1);

  // Track if we are in the middle of a Google Signup flow (authenticated but not registered backend)
  const [googleUser, setGoogleUser] = useState<any>(null);
  // Track if the current google user was newly created in Firebase during this session
  // We use this to decide whether to DELETE them or just SIGN OUT when aborting signup.
  const [isNewGoogleUser, setIsNewGoogleUser] = useState(false);

  // Stage 1 (Credentials) fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Stage 2 (Profile) fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [bio, setBio] = useState("");
  const [jobTitle, setJobTitle] = useState<JobTitle>("Others");
  const [photoUrl, setPhotoUrl] = useState("");

  // Stage 3 (Consent) fields
  const [ageCheckbox, setAgeCheckbox] = useState(false);
  const [consentCheckbox, setConsentCheckbox] = useState(false);

  // Turnstile State
  const [turnstileToken, setTurnstileToken] = useState("");
  const [isTurnstileSolved, setIsTurnstileSolved] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { refreshUserProfile, pendingGoogleSignup, clearPendingGoogleSignup } = useAuth();

  const populateGoogleSignupFromCurrentUser = (isNewUser: boolean) => {
    const user = auth.currentUser;
    if (!user) return;

    setGoogleUser(user);
    setIsNewGoogleUser(isNewUser);
    setIsLogin(false);
    setSignupStage(2);

    if (user.displayName) {
      const parts = user.displayName.split(" ");
      if (parts.length > 0) setFirstName(parts[0]);
      if (parts.length > 1) setLastName(parts.slice(1).join(" "));
    }
    if (user.email) {
      setEmail(user.email);
      setUsername(user.email.split("@")[0]);
    }
    if (user.photoURL) setPhotoUrl(user.photoURL);
  };

  // Resume signup after Google redirect when backend profile does not exist yet.
  useEffect(() => {
    if (!pendingGoogleSignup || !isOpen) return;
    populateGoogleSignupFromCurrentUser(pendingGoogleSignup.isNewUser);
    if (pendingGoogleSignup.intent === "login") {
      setError("Complete your profile to finish signing in with Google.");
    }
    clearPendingGoogleSignup();
  }, [pendingGoogleSignup, isOpen, clearPendingGoogleSignup]);

  // Reset function
  const resetSignupState = () => {
    setSignupStage(1);
    setGoogleUser(null);
    setIsNewGoogleUser(false);
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
    setLoading(false);

    // Reset Turnstile for next time
    setTurnstileToken("");
    setIsTurnstileSolved(false);
  };

  const requireTurnstileForLogin = (): string | null => {
    if (!TURNSTILE_SITE_KEY) {
      return "Captcha configuration error: site key missing.";
    }
    if (!turnstileToken || !isTurnstileSolved) {
      return "Please complete the security check.";
    }
    return null;
  };

  const handleTurnstileVerify = (token: string) => {
    setTurnstileToken(token);
    setIsTurnstileSolved(true);
    setError("");
  };

  const handleTurnstileExpire = () => {
    setTurnstileToken("");
    setIsTurnstileSolved(false);
  };

  const renderTurnstile = () => {
    if (!TURNSTILE_SITE_KEY) {
      return (
        <div className="text-red-500 text-sm border border-red-200 p-2 rounded bg-red-50">
          Captcha Configuration Error: Site Key Missing
        </div>
      );
    }

    return (
      <Turnstile
        sitekey={TURNSTILE_SITE_KEY}
        appearance="always"
        theme="light"
        onVerify={handleTurnstileVerify}
        onExpire={handleTurnstileExpire}
      />
    );
  };

  const handleCleanupGoogleUser = async () => {
    if (googleUser && auth.currentUser) {
      try {
        if (isNewGoogleUser) {
          // It was a brand new auth entry, so we delete it to keep it clean
          await deleteUser(auth.currentUser);
        } else {
          // It was an existing user (who just lacked a backend profile, presumably), 
          // so we just sign out to avoid destroying their main account.
          await signOut(auth);
        }
      } catch (error) {
        console.error("Error cleaning up incomplete Google signup:", error);
        // Fallback to ensure we aren't left logged in
        await signOut(auth);
      }
    }
  };

  const handleClose = async () => {
    await handleCleanupGoogleUser();
    resetSignupState();
    setIsLogin(true);
    onClose();
  };

  const handleToggleMode = async () => {
    await handleCleanupGoogleUser();
    resetSignupState();
    setIsLogin(!isLogin);
  };

  // Validation Helpers
  const validateStage2 = (): string | null => {
    if (!firstName.trim()) return "First name is required";
    if (!lastName.trim()) return "Last name is required";
    if (!username.trim()) return "Username is required";
    return null;
  };

  const handleStage2Next = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const err = validateStage2();
    if (err) {
      setError(err);
      return;
    }
    setSignupStage(3);
  };

  const validateStage3 = (): string | null => {
    if (!ageCheckbox) {
      return "You must confirm that you are 13 years old or older to register.";
    }
    if (!consentCheckbox) {
      return "You must agree to the Privacy Policy and Terms and Conditions to register.";
    }
    // Turnstile Check (always required for signup stage 3)
    if (!turnstileToken) {
      return "Please complete the security check.";
    }
    return null;
  };

  // --- Login Logic ---

  const handleGoogleLogin = () => handleOAuthLogin("google");
  const handleGithubLogin = () => handleOAuthLogin("github");

  const handleOAuthLogin = async (providerType: "google" | "github") => {
    setError("");
    setLoading(true);

    try {
      const provider = providerType === "google"
        ? new GoogleAuthProvider()
        : new GithubAuthProvider();

      if (providerType === "google") {
        (provider as GoogleAuthProvider).setCustomParameters({ prompt: "select_account" });
      }

      // Always use popup (desktop and mobile).
      //
      // signInWithRedirect is unreliable across all modern browsers:
      //  - Desktop: cross-origin iframe sandboxing blocks the Firebase relay handshake
      //  - Mobile: bfcache (Back/Forward cache) restores the frozen page instead of
      //    reloading it, so the useEffect/getRedirectResult never re-runs on return
      //
      // signInWithPopup is called FIRST (synchronous with the button click = user gesture)
      // so mobile popup blockers don't fire. Turnstile is verified AFTER the OAuth result
      // arrives, which is safe because we already have the Turnstile token in state.
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;

      // Verify Turnstile now (no longer on the user-gesture hot path).
      if (isLogin) {
        if (!turnstileToken || !isTurnstileSolved) {
          await signOut(auth);
          setError("Please complete the security check.");
          setLoading(false);
          return;
        }
        try {
          await verifyTurnstileWithBackend(turnstileToken);
        } catch {
          await signOut(auth);
          setError("Security verification failed. Please try again.");
          setLoading(false);
          return;
        }
      }

      const token = await user.getIdToken();
      const res = await fetch(`${getBackendBaseUrl()}/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        if (!isLogin) {
          alert("You are already registered with this email. Logging you in...");
        }
        await refreshUserProfile();
        onClose();
        resetSignupState();
      } else {
        const additionalInfo = getAdditionalUserInfo(userCredential);
        setIsNewGoogleUser(additionalInfo?.isNewUser ?? false);
        setGoogleUser(user);
        if (user.displayName) {
          const parts = user.displayName.split(" ");
          if (parts.length > 0) setFirstName(parts[0]);
          if (parts.length > 1) setLastName(parts.slice(1).join(" "));
        }
        if (user.email) {
          setEmail(user.email);
          setUsername(user.email.split("@")[0]);
        }
        if (user.photoURL) setPhotoUrl(user.photoURL);
        if (isLogin) setIsLogin(false);
        setLoading(false);
        setSignupStage(2);
      }
    } catch (loginError: any) {
      if (
        loginError.code === "auth/popup-closed-by-user" ||
        loginError.code === "auth/cancelled-popup-request"
      ) {
        setLoading(false);
        return;
      }
      const expectedCodes = [
        "auth/account-exists-with-different-credential",
        "auth/email-already-in-use",
        "auth/user-not-found",
        "auth/wrong-password",
        "auth/invalid-credential"
      ];
      if (expectedCodes.includes(loginError?.code)) {
        console.warn(`${providerType} login warning:`, loginError.message || loginError);
      } else {
        console.error(`${providerType} login error:`, loginError);
      }
      setError(getUserFriendlyAuthError(loginError, "login"));
      setLoading(false);
    }
  };

  // --- Signup Logic ---

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const validationError = validateStage3();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    const firebaseUser: any = googleUser;
    if (!firebaseUser) return; // should never happen (Google-only signup)

    try {
      // 1. Get token
      const token = await firebaseUser.getIdToken();

      // 3. Prepare data
      const registrationData: any = {
        username: username.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      };
      if (affiliation.trim()) registrationData.affiliation = affiliation.trim();
      if (bio.trim()) registrationData.bio = bio.trim();
      if (jobTitle && jobTitle !== "Others") registrationData.jobTitle = jobTitle;
      if (photoUrl.trim()) registrationData.photoUrl = photoUrl.trim();

      // 4. Send to Backend with Turnstile Token
      const response = await fetch(`${getBackendBaseUrl()}/users/register`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "x-turnstile-token": turnstileToken, // Pass token header
        },
        body: JSON.stringify(registrationData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Registration failed" }));
        throw new Error(errorData.message || "Registration failed");
      }

      // 5. Success Handling (Google-only path)
      await refreshUserProfile();
      alert("Account created successfully!");
      onClose();

      resetSignupState();

    } catch (error: any) {
      setError(getUserFriendlyRegistrationError(error, !!firebaseUser));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={handleClose} />

      <div className={`relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto border-t-4 ${isLogin ? 'border-gray-500' : 'border-green-500'}`}>
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="mb-6 text-center">
          <div className={`mx-auto w-12 h-12 flex items-center justify-center rounded-full mb-3 ${isLogin ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-500'}`}>
            {isLogin ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
            )}
          </div>

          <h2 className="text-2xl font-bold text-gray-900">
            {isLogin ? "Welcome Back" : "Create Account"}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {isLogin
              ? "Login to access your workspace."
              : signupStage === 1
                ? "Sign up with Google or GitHub to get started."
                : signupStage === 2
                  ? `Tell us about ${firstName || "yourself"}.`
                  : "Final step: Review and consent."}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* LOGIN FORM */}
        {isLogin ? (
          <>
            <div className="flex justify-center mb-4">
              {renderTurnstile()}
            </div>

            <button
              onClick={handleGoogleLogin}
              disabled={loading || !isTurnstileSolved}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 mb-3 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              <span>Continue with Google</span>
            </button>

            <button
              onClick={handleGithubLogin}
              disabled={loading || !isTurnstileSolved}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 mb-4 bg-[#24292e] text-white font-semibold rounded-lg hover:bg-[#2c3238] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              <span>Continue with GitHub</span>
            </button>

          </>
        ) : (
          /* SIGNUP FLOW */
          <>
            {/* Progress Bar */}
            <div className="mb-6 flex gap-2">
              <div className={`h-1 flex-1 rounded ${signupStage >= 1 ? "bg-green-500" : "bg-gray-200"}`} />
              <div className={`h-1 flex-1 rounded ${signupStage >= 2 ? "bg-green-500" : "bg-gray-200"}`} />
              <div className={`h-1 flex-1 rounded ${signupStage >= 3 ? "bg-green-500" : "bg-gray-200"}`} />
            </div>

            {signupStage === 1 && (
              <>
                <button
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 mb-3 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  <span>Sign up with Google</span>
                </button>

                <button
                  onClick={handleGithubLogin}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 mb-4 bg-[#24292e] text-white font-semibold rounded-lg hover:bg-[#2c3238] transition-colors disabled:opacity-50"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  <span>Sign up with GitHub</span>
                </button>

              </>
            )}

            {signupStage === 2 && (
              <form onSubmit={handleStage2Next} className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Username <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
                  <select
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value as JobTitle)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="Others">Others</option>
                    <option value="Student">Student</option>
                    <option value="Researcher">Researcher</option>
                    <option value="Software Engineer">Software Engineer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Affiliation</label>
                  <input
                    type="text"
                    value={affiliation}
                    onChange={(e) => setAffiliation(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div className="flex gap-3 mt-6">

                  <button
                    type="button"
                    onClick={async () => {
                      await handleCleanupGoogleUser();
                      setGoogleUser(null);
                      setSignupStage(1);
                      setIsNewGoogleUser(false);
                    }}
                    className="flex-1 py-2 px-4 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 px-4 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600"
                  >
                    Next: Consent
                  </button>
                </div>
              </form>
            )}

            {signupStage === 3 && (
              <form onSubmit={handleSignupSubmit} className="space-y-4">
                <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-start">
                    <input
                      id="ageCheckbox"
                      type="checkbox"
                      checked={ageCheckbox}
                      onChange={(e) => setAgeCheckbox(e.target.checked)}
                      className="mt-1 mr-2 h-4 w-4 text-green-600 border-gray-300 rounded"
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
                      className="mt-1 mr-2 h-4 w-4 text-green-600 border-gray-300 rounded"
                    />
                    <label htmlFor="consentCheckbox" className="text-sm text-gray-700">
                      I agree to the{" "}
                      <Link href="/privacy" className="text-green-600 underline">
                        Privacy Policy
                      </Link>{" "}
                      and{" "}
                      <Link href="/terms" className="text-green-600 underline">
                        Terms
                      </Link>{" "}
                      <span className="text-red-500">*</span>
                    </label>
                  </div>

                  {/* Turnstile for Signup */}
                  <div className="flex justify-center mt-2">
                    {renderTurnstile()}
                  </div>

                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setSignupStage(2)}
                    className="flex-1 py-2 px-4 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !isTurnstileSolved}
                    className="flex-1 py-2 px-4 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 disabled:opacity-50"
                  >
                    {loading ? "Creating Account..." : "Sign Up"}
                  </button>
                </div>
              </form>
            )}
          </>
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

