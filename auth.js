import {auth} from './firebase.js';
import {GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
const provider=new GoogleAuthProvider();
export const login=()=>signInWithPopup(auth,provider);
export const logout=()=>signOut(auth);
onAuthStateChanged(auth,u=>console.log(u?u.displayName:'Signed out'));
