import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  connectAuthEmulator,
  signOut,
} from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

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
// Solo para pruebas locales de extremo a extremo (VITE_USE_EMULATORS=true); en producción esta rama no existe.
if (import.meta.env.VITE_USE_EMULATORS === "true") {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  // Inicio de sesión falso solo para las pruebas (el emulador acepta credenciales JSON).
  window.__rnSignIn = (email) => signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true })));
}
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