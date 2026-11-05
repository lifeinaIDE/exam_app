import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCavsAFzU77yWfqNM6wdb_WrdjeyYYILPI",
  authDomain: "exam-app-ccc1c.firebaseapp.com",
  projectId: "exam-app-ccc1c",
  storageBucket: "exam-app-ccc1c.firebasestorage.app",
  messagingSenderId: "400532147089",
  appId: "1:400532147089:web:710e323d33977663daa830",
  measurementId: "G-S1BJLMXF4B"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Export Firestore and Auth instances
export const db = getFirestore(app);
export const auth = getAuth(app);
