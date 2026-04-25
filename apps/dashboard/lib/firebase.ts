import { initializeApp, getApp, getApps } from "firebase/app";
import { type Auth, getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function hasFirebaseConfig() {
  return Object.values(firebaseConfig).every(Boolean);
}

export function getFirebaseAuth(): Auth | null {
  if (typeof window === "undefined") return null;
  if (!hasFirebaseConfig()) return null;

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return getAuth(app);
}
