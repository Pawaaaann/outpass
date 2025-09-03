import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, enableIndexedDbPersistence } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

// Firebase configuration with environment variable fallbacks
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
let app;
let auth;
let db;
let functions;

const initializeFirebase = () => {
  try {
    // Initialize Firebase app
    app = initializeApp(firebaseConfig);
    
    // Initialize services
    auth = getAuth(app);
    db = getFirestore(app);
    functions = getFunctions(app, 'us-central1');
    
    // Enable offline persistence for Firestore
    if (typeof window !== 'undefined') {
      enableIndexedDbPersistence(db).catch((err) => {
        if (err.code === 'failed-precondition') {
          console.warn('Offline persistence can only be enabled in one tab at a time.');
        } else if (err.code === 'unimplemented') {
          console.warn('The current browser does not support offline persistence.');
        }
      });
      
      // Set auth persistence
      setPersistence(auth, browserLocalPersistence).catch((error) => {
        console.error('Error setting auth persistence:', error);
      });
    }

    // Debug Firebase config in production
    if (process.env.NODE_ENV === 'production') {
      console.log('Firebase config:', {
        projectId: firebaseConfig.projectId,
        authDomain: firebaseConfig.authDomain,
        apiKey: firebaseConfig.apiKey ? 'Set' : 'Missing',
        environment: process.env.NODE_ENV
      });
    }

    // Connect to emulators if enabled
    const useEmulators = 
      process.env.NODE_ENV === 'development' && 
      process.env.REACT_APP_USE_EMULATORS === 'true';

    if (useEmulators) {
      try {
        connectFirestoreEmulator(db, 'localhost', 8080);
        connectFunctionsEmulator(functions, 'localhost', 5001);
        console.log('Connected to Firebase emulators');
      } catch (error) {
        console.error('Error connecting to emulators:', error);
      }
    }

    return { app, auth, db, functions };
  } catch (error) {
    console.error('Firebase initialization error:', error);
    throw error;
  }
};

// Initialize Firebase and export services
const firebase = initializeFirebase();

export { auth, db, functions };
export default app;