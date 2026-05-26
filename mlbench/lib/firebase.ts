// lib/firebase.ts
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth";
import { config } from "./config";

const firebaseConfig = {
  apiKey: config.firebase.apiKey,
  authDomain: config.firebase.authDomain,
  projectId: config.firebase.projectId,
};

// Guard initialization: Next.js evaluates this module on the server during
// static prerendering. Firebase throws auth/invalid-api-key when the key is
// empty (e.g. build-time env vars not set). Auth/Firestore are only used
// inside "use client" useEffect hooks, so null values are safe at SSR time.
let app: FirebaseApp | undefined;
let auth: Auth;
let db: Firestore;

if (config.firebase.apiKey && config.firebase.projectId) {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} else {
  // Cast as the real types — these are only accessed inside useEffect (browser-only).
  auth = null as unknown as Auth;
  db = null as unknown as Firestore;
}

export { db, auth, app };
