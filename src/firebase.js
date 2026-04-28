import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAYKbbK7GqZgGKRl2-cWG8Gw8EGMYqS2HY",
  authDomain: "rednexo-fd35c.firebaseapp.com",
  projectId: "rednexo-fd35c",
  storageBucket: "rednexo-fd35c.appspot.com",
  messagingSenderId: "196156120582",
  appId: "1:196156120582:web:78d44989d1ee078128ad87",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

// Popup en localhost, redirect en producción
const isLocalhost = window.location.hostname === "localhost";
export const loginWithGoogle = () =>
  isLocalhost
    ? signInWithPopup(auth, provider)
    : signInWithRedirect(auth, provider);

export { getRedirectResult };
export const logout = () => signOut(auth);
