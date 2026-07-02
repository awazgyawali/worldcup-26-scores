import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
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

/**
 * Recommended Firestore rules (Firebase Console → Firestore → Rules):
 *
 *   match /predictions/{userId} {
 *     allow read: if true;
 *     allow create: if request.auth != null && request.auth.uid == userId;
 *     allow update: if request.auth != null && request.auth.uid == userId
 *       && !resource.data.get('locked', false)
 *       && (!('locked' in request.resource.data) || request.resource.data.locked == true);
 *   }
 *
 * Users can lock (set locked: true) but cannot unlock or edit while locked.
 * Admin unlock: set locked to false in Firebase Console for that document.
 */
