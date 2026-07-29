// ==========================================
// EddieOS v2.0 - Authentication
// ==========================================

import { auth } from "./firebase.js";

import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const provider = new GoogleAuthProvider();

// Sign In
export async function login() {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Login Error:", error);
  }
}

// Sign Out
export async function logout() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout Error:", error);
  }
}

// Listen for login changes
onAuthStateChanged(auth, (user) => {

  if (user) {
    console.log("Signed in as:", user.displayName);

    const userName = document.getElementById("user-name");

    if (userName) {
      userName.textContent = user.displayName;
    }

  } else {

    console.log("Not signed in");

    const userName = document.getElementById("user-name");

    if (userName) {
      userName.textContent = "Guest";
    }

  }

});
