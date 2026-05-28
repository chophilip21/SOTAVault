/**
 * Sanitizes and translates authentication errors to user-friendly messages.
 * Removes all Firebase-specific keywords and technical details.
 */

interface AuthError {
  code?: string;
  message?: string;
}

/**
 * Sanitizes error messages by removing Firebase-specific keywords and technical details.
 */
function sanitizeErrorMessage(error: any): string {
  if (!error) return "An unexpected error occurred. Please try again.";

  let message = error.message || String(error);

  // Remove Firebase-specific keywords and patterns (case-insensitive)
  message = message
    .replace(/Firebase:/gi, "")
    .replace(/firebase/gi, "")
    .replace(/auth\/[a-z-]+/gi, "")
    .replace(/\(auth\/[^)]+\)/gi, "")
    .replace(/Error\s*\([^)]+\)/gi, "")
    .replace(/\[.*?\]/g, "")
    .replace(/Firestore/gi, "")
    .replace(/firestore/gi, "")
    .replace(/Admin SDK/gi, "")
    .replace(/AdminSDK/gi, "")
    .replace(/GOOGLE_APPLICATION_CREDENTIALS/gi, "")
    .replace(/FIREBASE_AUTH_EMULATOR_HOST/gi, "")
    .trim();

  // Remove common technical prefixes
  message = message.replace(/^(Error|ERROR|Exception|EXCEPTION):\s*/i, "").trim();

  // Remove UID references and other technical identifiers
  message = message.replace(/UID:\s*[a-zA-Z0-9]+/gi, "").trim();
  message = message.replace(/uid:\s*[a-zA-Z0-9]+/gi, "").trim();

  return message || "An unexpected error occurred. Please try again.";
}

/**
 * Gets a user-friendly error message based on the error type.
 */
export function getUserFriendlyAuthError(error: any, context: "signup" | "login" = "signup"): string {
  if (!error) {
    return context === "signup"
      ? "We couldn't create your account. Please try again."
      : "We couldn't sign you in. Please try again.";
  }

  const code = error.code || "";
  const sanitizedMessage = sanitizeErrorMessage(error);

  // Handle specific error codes with user-friendly messages
  if (code.includes("email-already-in-use") || sanitizedMessage.toLowerCase().includes("email already")) {
    return context === "signup"
      ? "This email is already registered. Please sign in instead or use a different email address."
      : "This email is already registered. Please sign in instead.";
  }

  if (code.includes("account-exists-with-different-credential") || sanitizedMessage.toLowerCase().includes("account-exists-with-different-credential")) {
    return "An account already exists with this email address under a different sign-in method (such as Google). Please sign in using your original method.";
  }

  if (code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request")) {
    return "Sign in was cancelled.";
  }

  if (code.includes("user-not-found") || sanitizedMessage.toLowerCase().includes("user not found")) {
    return "No account found with this email. Please check your email or sign up for a new account.";
  }

  if (code.includes("wrong-password") || sanitizedMessage.toLowerCase().includes("password")) {
    return "Incorrect password. Please try again or reset your password.";
  }

  if (code.includes("invalid-email") || sanitizedMessage.toLowerCase().includes("invalid email")) {
    return "Please enter a valid email address.";
  }

  if (code.includes("weak-password") || sanitizedMessage.toLowerCase().includes("password is too weak")) {
    return "Password is too weak. Please use a stronger password with at least 6 characters.";
  }

  if (code.includes("network") || sanitizedMessage.toLowerCase().includes("network") || sanitizedMessage.toLowerCase().includes("fetch")) {
    return context === "signup"
      ? "We couldn't complete your signup due to a network issue. Your account was not created. Please check your internet connection and try again."
      : "We couldn't sign you in due to a network issue. Please check your internet connection and try again.";
  }

  if (code.includes("too-many-requests") || sanitizedMessage.toLowerCase().includes("too many")) {
    return "Too many attempts. Please wait a few minutes before trying again.";
  }

  if (code.includes("user-disabled")) {
    return "This account has been disabled. Please contact support for assistance.";
  }

  // Handle backend registration errors
  if (sanitizedMessage.toLowerCase().includes("backend") ||
    sanitizedMessage.toLowerCase().includes("profile") ||
    sanitizedMessage.toLowerCase().includes("firestore") ||
    sanitizedMessage.toLowerCase().includes("failed to create")) {
    return context === "signup"
      ? "We couldn't complete your signup. Your account was not created. Please try again in a moment."
      : "We couldn't complete your sign-in. Please try again.";
  }

  if (sanitizedMessage.toLowerCase().includes("authentication failed") || sanitizedMessage.toLowerCase().includes("auth")) {
    return context === "signup"
      ? "We couldn't verify your account. Please try signing up again."
      : "We couldn't verify your account. Please try signing in again.";
  }

  // Generic fallback with context
  if (context === "signup") {
    return `We couldn't create your account. ${sanitizedMessage || "Please try again."}`;
  } else {
    return `We couldn't sign you in. ${sanitizedMessage || "Please try again."}`;
  }
}

/**
 * Gets a user-friendly error message for backend registration failures.
 */
export function getUserFriendlyRegistrationError(error: any, authUserCreated: boolean): string {
  if (!error) {
    return authUserCreated
      ? "We created your account, but couldn't set up your profile. Your account was cleaned up. Please try signing up again."
      : "We couldn't complete your signup. Please try again.";
  }

  const sanitizedMessage = sanitizeErrorMessage(error);

  if (authUserCreated) {
    // Auth user was created but backend failed
    if (sanitizedMessage.toLowerCase().includes("network") || sanitizedMessage.toLowerCase().includes("fetch")) {
      return "We started creating your account, but couldn't complete the setup due to a network issue. Your account was cleaned up. Please check your internet connection and try again.";
    }

    if (sanitizedMessage.toLowerCase().includes("authentication") || sanitizedMessage.toLowerCase().includes("401")) {
      return "We started creating your account, but couldn't verify it. Your account was cleaned up. Please try signing up again.";
    }

    return `We started creating your account, but couldn't complete the setup. Your account was cleaned up. ${sanitizedMessage || "Please try again."}`;
  } else {
    // Auth user creation failed
    return getUserFriendlyAuthError(error, "signup");
  }
}
