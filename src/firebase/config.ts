import { initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

/** Used when `import.meta.env` has no VITE_FIREBASE_* (e.g. CI without .env). */
const FB_FALLBACK: FirebaseOptions = {
  apiKey: "AIzaSyD0z3F9bb1Nql-QEABmc96XrRxgYcr20bk",
  authDomain: "xtudynote.firebaseapp.com",
  projectId: "xtudynote",
  storageBucket: "xtudynote.firebasestorage.app",
  messagingSenderId: "100671585398",
  appId: "1:100671585398:web:656af941b6de43d9937357",
  measurementId: "G-2T17FH0F94",
};

function trimOrEmpty(v: string | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

function buildFirebaseOptions(): FirebaseOptions {
  const apiKey = trimOrEmpty(import.meta.env.VITE_FIREBASE_API_KEY) || FB_FALLBACK.apiKey!;
  const authDomain =
    trimOrEmpty(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN) || FB_FALLBACK.authDomain!;
  const projectId =
    trimOrEmpty(import.meta.env.VITE_FIREBASE_PROJECT_ID) || FB_FALLBACK.projectId!;
  const storageBucket =
    trimOrEmpty(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET) || FB_FALLBACK.storageBucket!;
  const messagingSenderId =
    trimOrEmpty(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) ||
    FB_FALLBACK.messagingSenderId!;
  const appId = trimOrEmpty(import.meta.env.VITE_FIREBASE_APP_ID) || FB_FALLBACK.appId!;
  const measurementId =
    trimOrEmpty(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID) ||
    FB_FALLBACK.measurementId ||
    undefined;

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    ...(measurementId ? { measurementId } : {}),
  };
}

const firebaseConfig = buildFirebaseOptions();
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.addScope("profile");
googleAuthProvider.addScope("email");

export const db = getFirestore(app);
export const storage = getStorage(app);
