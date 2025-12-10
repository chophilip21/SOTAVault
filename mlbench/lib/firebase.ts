// lib/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { config } from "./config";

const firebaseConfig = {
  apiKey: config.firebase.apiKey,
  authDomain: config.firebase.authDomain,
  projectId: config.firebase.projectId,
};

// Initialize Firebase
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

// Initialize Auth
const auth = getAuth(app);

// Connect to Firebase Emulator if we are on localhost
// (This matches the pattern: check window.location.hostname === "localhost")
if (typeof window !== "undefined" && window.location.hostname === "localhost") {
  try {
    // Connect Auth Emulator (only if not already connected)
    const authConfig = (auth as any)._delegate?._config;
    if (!authConfig?.emulator) {
      connectAuthEmulator(auth, `http://${config.firebaseAuthEmulatorHost}`, {
        disableWarnings: true,
      });
      console.log(`Connected to Firebase Auth Emulator at http://${config.firebaseAuthEmulatorHost}`);
    }
  } catch (error: any) {
    // Ignore error if emulator is already connected
    if (!error.message?.includes("already been initialized")) {
      console.warn("Firebase emulator connection error:", error);
    }
  }
}

const db = getFirestore(app);

// Export app for potential use elsewhere
export { db, auth, app };
