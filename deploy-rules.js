const fs = require('fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Load service account
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase Admin
const app = initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore(app);

// Read the rules file
const rules = fs.readFileSync('firestore.rules', 'utf8');

// Deploy the rules
db.app.options.projectId = serviceAccount.project_id;

db.app.firestore.setRules(rules)
  .then(() => {
    console.log('Successfully deployed Firestore security rules');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error deploying Firestore security rules:', error);
    process.exit(1);
  });
