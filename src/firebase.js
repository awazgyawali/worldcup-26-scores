import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBf01Akm1NnLiMlr0846NXtcDxFg_XVqG8",
  authDomain: "aawaz-gyawali.firebaseapp.com",
  databaseURL: "https://aawaz-gyawali.firebaseio.com",
  projectId: "aawaz-gyawali",
  storageBucket: "aawaz-gyawali.appspot.com",
  messagingSenderId: "941783200134",
  appId: "1:941783200134:web:086904f1c4d0a7be3bfc07",
  measurementId: "G-XKZSKH7WQ8",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const PREDICTIONS_COLLECTION = "predictions";

export const googleProvider = new GoogleAuthProvider();

/**
 * Firebase Console setup for production (e.g. Cloudflare Workers):
 * 1. Authentication → Sign-in method → enable Anonymous and Google
 * 2. Authentication → Settings → Authorized domains → add your host
 *    (e.g. worldcup-26-scores.brainants.workers.dev)
 *
 * Firestore rules:
 *
 *   match /predictions/{userId} {
 *     allow read: if true;
 *     allow create: if request.auth != null && request.auth.uid == userId;
 *     allow update: if request.auth != null && request.auth.uid == userId;
 *     allow delete: if false;
 *   }
 *
 * Migration fields (anonymous → existing Google account):
 *   abandoned / abandonedAt on the old anonymous doc (locked copy, safe to delete later)
 *   migratedFrom / migratedAt on the Google account doc
 */
