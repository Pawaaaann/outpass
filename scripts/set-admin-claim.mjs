import admin from 'firebase-admin';
import fs from 'node:fs';

// Usage:
// 1) Place your Firebase service account JSON at project root as serviceAccountKey.json
//    or set env var GOOGLE_APPLICATION_CREDENTIALS to the file path.
// 2) Optionally set ADMIN_EMAIL env var (defaults to admin@college.com)
// 3) Run: node scripts/set-admin-claim.mjs

const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccountKey.json';
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(`Service account file not found at ${SERVICE_ACCOUNT_PATH}`);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'))),
});

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@college.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';

async function ensureAdminUser(email) {
  try {
    const user = await admin.auth().getUserByEmail(email);
    return user;
  } catch (e) {
    if (e?.errorInfo?.code === 'auth/user-not-found') {
      // Create the user if not found (password creation only possible via Admin SDK if not disabled)
      const user = await admin.auth().createUser({
        email,
        password: ADMIN_PASSWORD,
        emailVerified: true,
        displayName: 'Admin',
      });
      return user;
    }
    throw e;
  }
}

async function main() {
  try {
    const user = await ensureAdminUser(ADMIN_EMAIL);

    // Apply custom claim role=admin
    const claims = { role: 'admin' };
    await admin.auth().setCustomUserClaims(user.uid, claims);

    // Force token refresh so the claim propagates
    await admin.auth().revokeRefreshTokens(user.uid);

    console.log(`Admin user ready: ${ADMIN_EMAIL}`);
    console.log(`Custom claims set: ${JSON.stringify(claims)}`);
    console.log('Have the admin sign out and sign back in, or call getIdToken(true) to refresh claims.');
  } catch (e) {
    console.error('Failed to provision admin user/claims:', e);
    process.exit(1);
  }
}

main();
