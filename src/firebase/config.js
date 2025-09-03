import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyCcvsEoFrAPo6H-T_4ko3k0cI2O4oQSJXA",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "leave-ease-9ae9c.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "leave-ease-9ae9c",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "leave-ease-9ae9c.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "680104418658",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:680104418658:web:6aaee00a13d763b398a03b",
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || "G-BXELST2G2P"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);

// Debug Firebase config in production
if (process.env.NODE_ENV === 'production') {
  console.log('Firebase config:', {
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain,
    apiKey: firebaseConfig.apiKey ? 'Set' : 'Missing'
  });
}
// Ensure region matches your Functions deployment/emulator
export const functions = getFunctions(app, 'us-central1');

// Only connect to emulators if explicitly enabled via env flag
export const useEmulators =
  typeof process !== 'undefined' &&
  process.env &&
  process.env.REACT_APP_USE_EMULATORS === 'true';

if (useEmulators) {
  try { connectFirestoreEmulator(db, 'localhost', 8080); } catch (_) {}
  try { connectFunctionsEmulator(functions, 'localhost', 5001); } catch (_) {}
}

export default app;