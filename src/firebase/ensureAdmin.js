import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const ADMIN_EMAIL = 'admin@leaveeasy.com';
const ADMIN_PASSWORD = 'admin1234';

/**
 * Ensures an admin Firebase Auth user exists and is signed in.
 * If missing, creates it. Also ensures users/{uid} has role: 'admin'.
 * Returns { user, role } where role should be 'admin' on success.
 */
export async function ensureAdminAccount(auth, db) {
  let cred;
  try {
    // Try sign in first
    cred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  } catch (e) {
    // Newer SDKs often return 'auth/invalid-credential' for both wrong password and user-not-found.
    // Our strategy: attempt creating the user; if it's already in use, then truly invalid credentials.
    if (e && (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential')) {
      try {
        cred = await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
      } catch (createErr) {
        if (createErr && createErr.code === 'auth/email-already-in-use') {
          // Email exists and password was wrong.
          throw new Error('Admin account exists but password is invalid.');
        }
        throw createErr;
      }
    } else {
      throw e;
    }
  }

  const user = cred.user;
  // Ensure users/{uid} doc has role: 'admin'
  const uref = doc(db, 'users', user.uid);
  const snap = await getDoc(uref);
  if (!snap.exists() || (snap.data()?.role !== 'admin')) {
    await setDoc(uref, {
      uid: user.uid,
      email: ADMIN_EMAIL,
      role: 'admin',
      updatedAt: serverTimestamp(),
      createdAt: snap.exists() ? (snap.data()?.createdAt || serverTimestamp()) : serverTimestamp(),
    }, { merge: true });
  }
  return { user, role: 'admin' };
}

/**
 * Reads users/{uid} and returns its role, or null if missing.
 */
export async function getUserRole(db, uid) {
  const uref = doc(db, 'users', uid);
  const snap = await getDoc(uref);
  return snap.exists() ? (snap.data()?.role || null) : null;
}
