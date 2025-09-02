import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
  EmailAuthProvider,
  linkWithCredential,
  fetchSignInMethodsForEmail
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const AuthContext = createContext();

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  const provider = new GoogleAuthProvider();

  const loadRoleFromClaims = async (user) => {
    try {
      const tokenResult = await user.getIdTokenResult(true);
      const role = tokenResult.claims?.role || null;
      if (role) {
        setUserRole(role);
        return role;
      }
      // Fallback to Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const fsRole = userDoc.exists() ? userDoc.data().role : null;
      setUserRole(fsRole || null);
      return fsRole || null;
    } catch (e) {
      console.error('Failed to load role from claims:', e);
      setUserRole(null);
      return null;
    }
  };

  const signup = async (email, password, userData) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Create user document in Firestore
    await setDoc(doc(db, 'users', user.uid), {
      email: user.email?.toLowerCase(),
      name: userData?.name || '',
      role: userData?.role || 'student',
      parentContact: userData?.parentContact || {},
      // extra profile fields if provided
      studentId: userData?.studentId || '',
      department: userData?.department || '',
      section: userData?.section || '',
      year: userData?.year || '',
      studentType: userData?.studentType || '',
      isDayScholar: typeof userData?.isDayScholar === 'boolean' ? userData.isDayScholar : ((userData?.studentType || '').toString().toLowerCase() === 'day scholar'),
      phoneNumber: userData?.phoneNumber || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    // Optional: set displayName
    if (userData?.name) {
      try { await updateProfile(user, { displayName: userData.name }); } catch {}
    }
    
    // Force refresh to pick up custom claims if set by backend trigger
    await user.getIdToken(true);
    await loadRoleFromClaims(user);
    // Clear local admin quick session if any
    try { window.localStorage.removeItem('admin_session'); } catch {}
    
    return userCredential;
  };

  const login = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    // Clear local admin quick session if any
    try { window.localStorage.removeItem('admin_session'); } catch {}
    return cred;
  };

  const loginWithGoogle = async () => {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    // Ensure user doc exists
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        email: user.email?.toLowerCase() || '',
        name: user.displayName || '',
        role: 'student',
        parentContact: {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
    await user.getIdToken(true);
    await loadRoleFromClaims(user);
    // Clear local admin quick session if any
    try { window.localStorage.removeItem('admin_session'); } catch {}
    return result;
  };

  const logout = async () => {
    try {
      // Clear any local state that might hold Firestore data
      setCurrentUser(null);
      setUserRole(null);
      
      // Clear any cached data in localStorage that might be user-specific
      try {
        window.localStorage.removeItem('admin_session');
        // Add any other localStorage keys that should be cleared on logout
      } catch (e) {
        console.warn('Error clearing localStorage on logout:', e);
      }
      
      // Sign out from Firebase Auth
      await signOut(auth);
      
      // Return a resolved promise to indicate success
      return Promise.resolve();
    } catch (error) {
      console.error('Error during logout:', error);
      // Re-throw the error to be handled by the caller
      return Promise.reject(error);
    }
  };

  // Link email/password to current account (e.g., after Google sign-in)
  const linkEmailPassword = async (email, password) => {
    const user = auth.currentUser;
    if (!user) throw new Error('Not signed in');
    // Optional: ensure the email matches current user's email to avoid surprising changes
    try {
      const methods = await fetchSignInMethodsForEmail(auth, email);
      if (methods.length > 0 && !methods.includes('password') && email.toLowerCase() !== (user.email || '').toLowerCase()) {
        // The email is used by another account with a different provider
        throw new Error('This email is already associated with another account. Sign in with that provider first.');
      }
    } catch (_) { /* non-fatal precheck */ }
    const credential = EmailAuthProvider.credential(email, password);
    const result = await linkWithCredential(user, credential);
    // Ensure Firestore user document keeps email normalized
    try {
      await setDoc(doc(db, 'users', result.user.uid), {
        email: result.user.email?.toLowerCase() || email.toLowerCase(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (_) {}
    return result;
  };

  const getUserRole = async (uid) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        return userDoc.data().role;
      }
      return null;
    } catch (error) {
      console.error('Error fetching user role:', error);
      return null;
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Clear local backdoor if a real session exists
        try { window.localStorage.removeItem('admin_session'); } catch {}
        setCurrentUser(user);
        // Prefer custom claims; fallback to Firestore
        const role = await loadRoleFromClaims(user);
        if (!role) {
          const fallback = await getUserRole(user.uid);
          setUserRole(fallback);
        }
      } else {
        setCurrentUser(null);
        setUserRole(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userRole,
    signup,
    login,
    loginWithGoogle,
    logout,
    linkEmailPassword
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
