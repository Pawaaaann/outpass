import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../firebase/config';

const StatusBadge = ({ status }) => {
  const s = (status || 'pending').toString().toLowerCase();
  const color = s === 'approved' ? 'green' : s === 'rejected' ? 'red' : 'yellow';
  const text = s.charAt(0).toUpperCase() + s.slice(1);
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-${color}-100 text-${color}-800`}>{text}</span>
  );
};

const CallAttemptBadge = ({ attempted }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${attempted ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
    {attempted ? 'Call Attempted' : 'Not Attempted'}
  </span>
);

function formatApproverChain(approvals, nextApproverRole) {
  const chain = Array.isArray(approvals) ? approvals : [];
  const parts = chain.map((a) => {
    const role = a?.role || '—';
    const st = (a?.status || 'pending').toString().toLowerCase();
    const at = a?.at?.toDate ? a.at.toDate().toLocaleString() : (a?.at || '');
    return `${role}: ${st}${at ? ` @ ${at}` : ''}`;
  });
  if (nextApproverRole) parts.push(`${nextApproverRole}: pending`);
  return parts.length ? parts.join('  →  ') : '—';
}

export default function AllRequests() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all|pending|approved|rejected

  useEffect(() => {
    const q = query(
      collection(db, 'leaveRequests'),
      orderBy('createdAt', 'desc'),
      limit(300)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRequests(rows);
        setLoading(false);
      },
      (err) => {
        console.error('Failed to fetch leaveRequests:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const q = (search || '').toLowerCase();
    return requests.filter((r) => {
      const s = (r.status || 'pending').toString().toLowerCase();
      if (statusFilter !== 'all' && s !== statusFilter) return false;
      if (!q) return true;
      const hay = `${r.studentName || ''} ${r.registerNumber || ''} ${r.department || ''} ${r.reason || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [requests, search, statusFilter]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-gray-900">All Leave Requests</h1>
            <button
              onClick={() => navigate(-1)}
              className="border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-2 rounded-md text-sm font-medium"
            >
              Back
            </button>
          </div>

          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <div className="px-4 py-5 sm:px-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by student, register no., department, reason..."
                  className="w-full rounded-md border-gray-300 focus:ring-primary-500 focus:border-primary-500 text-sm"
                />
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-md border-gray-300 focus:ring-primary-500 focus:border-primary-500 text-sm"
                  >
                    <option value="all">All</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 overflow-x-auto">
              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Loading requests...</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No requests found.</p>
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Register No.</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Parent Call</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Approver Chain</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filtered.map((req) => (
                      <tr key={req.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{req.studentName || '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{req.registerNumber || '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{req.department || '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{req.leaveType || '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm"><StatusBadge status={req.status} /></td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm"><CallAttemptBadge attempted={!!req.callAttempted} /></td>
                        <td className="px-6 py-4 whitespace-pre-wrap text-xs text-gray-700">{formatApproverChain(req.approvals, req.nextApproverRole)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
