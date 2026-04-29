import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyATJPXZ9oD4pZIxHaAc3V2QeFUL_Au3VMM",
  authDomain: "rednexo-fd35c.firebaseapp.com",
  projectId: "rednexo-fd35c",
  storageBucket: "rednexo-fd35c.firebasestorage.app",
  messagingSenderId: "196156120582",
  appId: "1:196156120582:web:78d44989d1ee078128ad87",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Error login:", error);
    throw error;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error logout:", error);
  }
};