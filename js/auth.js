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

    const userName = document.getElementById("user-name");
    const loginBtn = document.getElementById("loginBtn");
    const logoutBtn = document.getElementById("logoutBtn");

    if (user) {

        userName.textContent = user.displayName;

        loginBtn.style.display = "none";
        logoutBtn.style.display = "inline-block";

    } else {

        userName.textContent = "Guest";

        loginBtn.style.display = "inline-block";
        logoutBtn.style.display = "none";

    }

});
