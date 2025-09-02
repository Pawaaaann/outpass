import React, { useState } from 'react';
import { auth, db } from '../../firebase/config';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

// TEMPORARY dev tool to seed Admin/Mentor/HOD users.
// Guarded by a simple token compare. Remove after seeding.

const SeedUsers = () => {
  const [tokenInput, setTokenInput] = useState('');
  const requiredToken = process.env.REACT_APP_SEED_TOKEN || '';
  const [adminEmail, setAdminEmail] = useState('admin@example.com');
  const [adminPass, setAdminPass] = useState('Admin@12345');
  const [mentorEmail, setMentorEmail] = useState('mentor@example.com');
  const [mentorPass, setMentorPass] = useState('Mentor@12345');
  const [hodEmail, setHodEmail] = useState('hod@example.com');
  const [hodPass, setHodPass] = useState('Hod@12345');
  const [department, setDepartment] = useState('CSE');
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState(false);

  const log = (m) => setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${m}`]);

  const seedOne = async ({ email, password, role, dept }) => {
    log(`Creating auth user for ${role}: ${email}`);
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    log(`Created ${role} uid=${uid}. Writing Firestore user doc...`);
    await setDoc(doc(db, 'users', uid), {
      email,
      role,
      department: dept || null,
      createdAt: serverTimestamp(),
    }, { merge: true });
    log(`Wrote users/${uid} with role=${role}${dept ? `, department=${dept}` : ''}.`);
    log(`Signing out ${role}...`);
    await signOut(auth);
  };

  const runSeeding = async () => {
    if (requiredToken && tokenInput !== requiredToken) {
      alert('Invalid token');
      return;
    }
    setBusy(true);
    setLogs([]);
    try {
      // 1) Admin
      await seedOne({ email: adminEmail, password: adminPass, role: 'admin' });
      // 2) Mentor (with department)
      await seedOne({ email: mentorEmail, password: mentorPass, role: 'mentor', dept: department });
      // 3) HOD (with department)
      await seedOne({ email: hodEmail, password: hodPass, role: 'hod', dept: department });
      // Sign back in as admin for convenience
      log('Signing back in as admin...');
      await signInWithEmailAndPassword(auth, adminEmail, adminPass);
      log('Seeding completed. You can now open /admin, /mentor, /hod with those accounts.');
      alert('Seeding completed. Admin signed in.');
    } catch (e) {
      console.error(e);
      log(`Error: ${e?.code || e?.name || 'error'} - ${e?.message || String(e)}`);
      alert(`Failed: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const tokenGate = requiredToken ? (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">Access Token</label>
      <input value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} className="border rounded px-3 py-2 w-full" placeholder="Enter token" />
    </div>
  ) : (
    <div className="mb-4 p-2 rounded bg-yellow-50 text-yellow-700 text-sm">No REACT_APP_SEED_TOKEN set. Page is unlocked.</div>
  );

  const locked = requiredToken && tokenInput !== requiredToken;

  return (
    <div className="max-w-xl mx-auto py-10 px-4">
      <h1 className="text-2xl font-semibold mb-6">Seed Users (DEV)</h1>
      <div className="p-4 rounded border bg-white shadow">
        {tokenGate}
        <div className="grid grid-cols-1 gap-4">
          <div>
            <h2 className="font-medium mb-2">Admin</h2>
            <input className="border rounded px-3 py-2 w-full mb-2" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin email" />
            <input className="border rounded px-3 py-2 w-full" type="password" value={adminPass} onChange={(e) => setAdminPass(e.target.value)} placeholder="admin password" />
          </div>
          <div>
            <h2 className="font-medium mb-2">Mentor</h2>
            <input className="border rounded px-3 py-2 w-full mb-2" value={mentorEmail} onChange={(e) => setMentorEmail(e.target.value)} placeholder="mentor email" />
            <input className="border rounded px-3 py-2 w-full mb-2" type="password" value={mentorPass} onChange={(e) => setMentorPass(e.target.value)} placeholder="mentor password" />
          </div>
          <div>
            <h2 className="font-medium mb-2">HOD</h2>
            <input className="border rounded px-3 py-2 w-full mb-2" value={hodEmail} onChange={(e) => setHodEmail(e.target.value)} placeholder="hod email" />
            <input className="border rounded px-3 py-2 w-full mb-2" type="password" value={hodPass} onChange={(e) => setHodPass(e.target.value)} placeholder="hod password" />
          </div>
          <div>
            <h2 className="font-medium mb-2">Department</h2>
            <input className="border rounded px-3 py-2 w-full" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g., CSE" />
          </div>
          <button disabled={busy || locked} onClick={runSeeding} className={`mt-2 px-4 py-2 rounded text-white ${busy || locked ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {busy ? 'Seeding...' : 'Run Seeding'}
          </button>
        </div>
        <div className="mt-4">
          <h3 className="font-medium mb-2">Logs</h3>
          <pre className="text-xs bg-gray-50 p-2 rounded max-h-64 overflow-auto">{logs.join('\n')}</pre>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-3">Remove this page after use. It creates real Auth users in your Firebase project.</p>
    </div>
  );
};

export default SeedUsers;
