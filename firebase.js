// ==========================================
// EddieOS v2.0 - Firebase Initialization
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBCQcvxYpAofdrvMkjqyfp7FxY4XlYSwCs",
  authDomain: "eddie-s-dashboard.firebaseapp.com",
  projectId: "eddie-s-dashboard",
  storageBucket: "eddie-s-dashboard.firebasestorage.app",
  messagingSenderId: "262522365804",
  appId: "1:262522365804:web:e45f677d3fb8f80454b549",
  measurementId: "G-VB75B9KPLS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
const auth = getAuth(app);
const db = getFirestore(app);

// Export for use in other files
export { app, auth, db };

console.log("✅ Firebase initialized successfully!");
