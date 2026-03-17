/* ===== NexusChat v2 – Firebase Config & Exports ===== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getDatabase, ref, set, get, push, onValue,
  remove, onDisconnect, update, query, limitToLast
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const cfg = {
  apiKey: "AIzaSyBeT226lzGP0ERDY7QZhKF8zfo0OwSGEZ4",
  authDomain: "fir-50409.firebaseapp.com",
  databaseURL: "https://fir-50409-default-rtdb.firebaseio.com",
  projectId: "fir-50409",
  storageBucket: "fir-50409.firebasestorage.app",
  messagingSenderId: "336958746825",
  appId: "1:336958746825:web:dc23031418217663b85d18"
};

const firebaseApp = initializeApp(cfg);
export const auth = getAuth(firebaseApp);
export const db = getDatabase(firebaseApp);
export {
  onAuthStateChanged, signOut,
  ref, set, get, push, onValue, remove, onDisconnect, update, query, limitToLast
};
