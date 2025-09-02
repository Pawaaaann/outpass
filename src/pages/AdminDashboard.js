import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, getDocs, doc, getDoc, updateDoc, serverTimestamp, query, orderBy, limit } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const AdminDashboard = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionBusy, setActionBusy] = useState({});
  const [actionError, setActionError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Require Firebase-authenticated user, then check users/{uid}.role === 'admin'
    const unSubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setError('You do not have permission to view leave requests. Contact Admin.');
        navigate('/login', { state: { adminError: 'Unauthorized access' } });
        return;
      }

      try {
        const uref = doc(db, 'users', user.uid);
        const usnap = await getDoc(uref);
        const role = usnap.exists() ? (usnap.data()?.role || null) : null;
        if (role !== 'admin') {
          setError('You do not have permission to view leave requests. Contact Admin.');
          navigate('/login', { state: { adminError: 'Unauthorized access' } });
          return;
        }
      } catch {
        setError('You do not have permission to view leave requests. Contact Admin.');
        navigate('/login', { state: { adminError: 'Unauthorized access' } });
        return;
      }

      try {
        const q = query(
          collection(db, 'leaveRequests'),
          orderBy('createdAt', 'desc'),
          limit(500)
        );
        const unsub = onSnapshot(
          q,
          (snap) => {
            const data = snap.docs.map((d /** @type {QueryDocumentSnapshot} */) => {
              const raw = d.data() || {};
              return {
                id: d.id,
                studentName: raw.studentName || (raw.student && raw.student.name) || 'N/A',
                department: raw.department || (raw.student && raw.student.department) || 'Unknown',
                reason: raw.reason || '',
                startDate: raw.startDate || raw.start_date || '',
                endDate: raw.endDate || raw.end_date || '',
                status: (raw.status || 'pending').toString().toLowerCase(),
              };
            });
            setRequests(data);
            setLoading(false);
          },
          (err) => {
            console.error('onSnapshot error', err);
            const msg = (err && (err.code === 'permission-denied' || String(err.message || '').toLowerCase().includes('missing or insufficient permissions')))
              ? 'You do not have permission to view leave requests. Contact Admin.'
              : 'Failed to load leave requests.';
            setError(msg);
            setLoading(false);
          }
        );
        // Cleanup listener on unmount
        return () => unsub();
      } catch (e) {
        console.error('onSnapshot setup error', e);
        (async () => {
          try {
            const q = query(
              collection(db, 'leaveRequests'),
              orderBy('createdAt', 'desc'),
              limit(500)
            );
            const snap = await getDocs(q);
            const data = snap.docs.map((d) => {
              const raw = d.data() || {};
              return {
                id: d.id,
                studentName: raw.studentName || 'N/A',
                department: raw.department || 'Unknown',
                reason: raw.reason || '',
                startDate: raw.startDate || '',
                endDate: raw.endDate || '',
                status: (raw.status || 'pending').toString().toLowerCase(),
              };
            });
            setRequests(data);
            setLoading(false);
          } catch (err) {
            console.error('getDocs error', err);
            const msg = (err && (err.code === 'permission-denied' || String(err.message || '').toLowerCase().includes('missing or insufficient permissions')))
              ? 'You do not have permission to view leave requests. Contact Admin.'
              : 'Failed to load leave requests.';
            setError(msg);
          } finally {
            setLoading(false);
          }
        })();
      }
    });

    return () => unSubAuth && unSubAuth();
  }, [navigate]);

  const groupedByDept = useMemo(() => {
    const grouped = {};
    for (const r of requests) {
      const dept = (r.department || 'Unknown').toUpperCase();
      grouped[dept] = grouped[dept] || [];
      grouped[dept].push(r);
    }
    return grouped;
  }, [requests]);

  const pendingByDept = useMemo(() => {
    const res = {};
    Object.entries(groupedByDept).forEach(([dept, list]) => {
      const filtered = list.filter((r) => (r.status || 'pending') === 'pending');
      if (filtered.length) res[dept] = filtered;
    });
    return res;
  }, [groupedByDept]);

  const formatDate = (d) => {
    if (!d) return '—';
    try {
      const dt = new Date(d);
      if (!isNaN(dt.getTime())) return dt.toLocaleDateString();
    } catch {}
    return d;
  };

  const handleStatusUpdate = async (id, status) => {
    setActionError(null);
    setActionBusy((p) => ({ ...p, [id]: true }));
    try {
      const ref = doc(db, 'leaveRequests', id);
      await updateDoc(ref, { status: String(status).toLowerCase(), updatedAt: serverTimestamp() });
    } catch (e) {
      console.error('Failed to update status', e);
      setActionError(e?.message || 'Failed to update request status.');
    } finally {
      setActionBusy((p) => ({ ...p, [id]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Welcome Admin</h1>
          <button
            onClick={() => navigate('/history')}
            className="border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-2 rounded-md text-sm font-medium"
            title="View leave history"
          >
            History
          </button>
        </div>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800">Pending Leave Requests</h2>
          {loading && <p className="mt-3 text-sm text-gray-600">Loading pending requests…</p>}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          {!loading && !error && Object.keys(pendingByDept).length === 0 && (
            <p className="mt-3 text-sm text-gray-600">No pending requests.</p>
          )}

          <div className="mt-4 space-y-8">
            {Object.entries(pendingByDept).map(([dept, list]) => (
              <div key={dept}>
                <h3 className="text-lg font-semibold text-gray-700 mb-3">{dept}</h3>
                <div className="overflow-x-auto bg-white rounded-lg shadow">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">End</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {list.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-sm text-gray-900">{r.studentName || 'N/A'}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{r.reason || '—'}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{formatDate(r.startDate)}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{formatDate(r.endDate)}</td>
                          <td className="px-4 py-2 text-sm">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                              {(r.status || 'pending').toString().toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleStatusUpdate(r.id, 'approved')}
                                disabled={!!actionBusy[r.id]}
                                className="px-2 py-1 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                              >
                                {actionBusy[r.id] ? 'Saving…' : 'Approve'}
                              </button>
                              <button
                                onClick={() => handleStatusUpdate(r.id, 'rejected')}
                                disabled={!!actionBusy[r.id]}
                                className="px-2 py-1 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                              >
                                {actionBusy[r.id] ? 'Saving…' : 'Reject'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-800">All Leave Requests</h2>
          {!loading && !error && requests.length === 0 && (
            <p className="mt-3 text-sm text-gray-600">No leave requests found.</p>
          )}

          <div className="mt-4 space-y-8">
            {Object.entries(groupedByDept).map(([dept, list]) => (
              <div key={dept}>
                <h3 className="text-lg font-semibold text-gray-700 mb-3">{dept}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {list.map((r) => (
                    <div key={r.id} className="bg-white rounded-lg shadow p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-gray-900">{r.studentName || 'N/A'}</p>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          (r.status || 'pending') === 'approved'
                            ? 'bg-green-100 text-green-800'
                            : (r.status || 'pending') === 'rejected'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {(r.status || 'pending').toString().toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700"><span className="font-medium">Reason:</span> {r.reason || '—'}</p>
                      <p className="text-sm text-gray-700"><span className="font-medium">From:</span> {formatDate(r.startDate)} <span className="font-medium">To:</span> {formatDate(r.endDate)}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default AdminDashboard;
