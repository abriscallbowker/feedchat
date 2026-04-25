import admin from "firebase-admin";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const databaseURL = process.env.FIREBASE_DATABASE_URL;
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;

if (!projectId || !clientEmail || !privateKey || !databaseURL) {
  throw new Error(
    "Missing Firebase config. Ensure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, and FIREBASE_DATABASE_URL are set.",
  );
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    databaseURL,
    storageBucket,
  });
}

export const auth = admin.auth();
export const firestore = admin.firestore();
export const rtdb = admin.database();
export const storage = admin.storage();
