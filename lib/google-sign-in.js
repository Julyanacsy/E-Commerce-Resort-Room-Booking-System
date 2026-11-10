import { signInWithPopup, signInWithRedirect } from "firebase/auth"

export async function signInWithGoogle(auth, provider) {
  provider.setCustomParameters({ prompt: "select_account" })

  try {
    return { result: await signInWithPopup(auth, provider), redirected: false }
  } catch (error) {
    if (error?.code !== "auth/popup-blocked") throw error
    await signInWithRedirect(auth, provider)
    return { result: null, redirected: true }
  }
}

export function getGoogleSignInErrorMessage(error) {
  switch (error?.code) {
    case "auth/popup-closed-by-user":
      return "Google sign-in was canceled. Please try again."
    case "auth/unauthorized-domain":
      return "This site is not authorized for Google sign-in. Add its domain in Firebase Authentication settings."
    case "auth/operation-not-allowed":
      return "Google sign-in is not enabled for this Firebase project."
    case "auth/network-request-failed":
      return "Google sign-in could not reach Firebase. Check your connection and try again."
    default:
      return "Google login failed. Please try again."
  }
}
