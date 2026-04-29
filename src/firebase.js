export const loginWithGoogle = async () => {
  try {
    const { signInWithRedirect, getRedirectResult } = await import("firebase/auth");
    await signInWithRedirect(auth, googleProvider);
  } catch (error) {
    console.error("Error login:", error);
    throw error;
  }
};
