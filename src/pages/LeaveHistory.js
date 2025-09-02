import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import LeaveRequestCard from '../components/cards/LeaveRequestCard';

const LeaveHistory = () => {
  const { currentUser, userRole } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // UI controls
  const [activeStatus, setActiveStatus] = useState('all'); // all | pending | approved | rejected
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(''); // yyyy-mm-dd
  const [dateTo, setDateTo] = useState('');
  const [viewMode, setViewMode] = useState('card'); // card | table
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState(null); // modal request
  const [dept, setDept] = useState('');

  // Cache for student profiles when enriching department
  const profileCache = React.useRef(new Map());

  useEffect(() => {
    if (!currentUser) return;

    let isMounted = true;
    let unsub1 = () => {};
    let unsub2 = () => {};

    const init = async () => {
      if (!isMounted) return;
      setLoading(true);

      try {
        // Load own department for mentor/hod filtering
        try {
          const usnap = await getDoc(doc(db, 'users', currentUser.uid));
          if (isMounted) {
            const d = usnap.exists() ? (usnap.data()?.department || '') : '';
            setDept(d);
          }
        } catch (error) {
          console.error('Error loading user department:', error);
        }

        const norm = (s) => (s || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');

        if (userRole === 'student') {
          const studentRef = doc(db, 'users', currentUser.uid);
          const qByRef = query(collection(db, 'leaveRequests'), where('studentId', '==', studentRef));
          const qByUid = query(collection(db, 'leaveRequests'), where('studentUid', '==', currentUser.uid));

          const refDocs = [];
          const uidDocs = [];
          
          const onError = (error) => {
            if (!isMounted) return;
            console.error('Snapshot error:', error);
            setToast('Could not load history. Please refresh the page.');
            setLoading(false);
          };

          // Set up first listener
          unsub1 = onSnapshot(qByRef, 
            (snapshot) => {
              if (!isMounted) return;
              const updatedDocs = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
              refDocs.length = 0;
              refDocs.push(...updatedDocs);
              mergeAndSet(refDocs, uidDocs);
            },
            onError
          );

          // Set up second listener
          unsub2 = onSnapshot(qByUid, 
            (snapshot) => {
              if (!isMounted) return;
              const updatedDocs = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
              uidDocs.length = 0;
              uidDocs.push(...updatedDocs);
              mergeAndSet(refDocs, uidDocs);
            },
            onError
          );

          // Function to merge and update state
          const mergeAndSet = (docs1, docs2) => {
            if (!isMounted) return;
            
            const byId = new Map();
            [...docs1, ...docs2].forEach((d) => byId.set(d.id, d));
            
            const merged = Array.from(byId.values()).map((r) => ({
              ...r,
              status: (r.status || 'pending').toString().toLowerCase(),
            }));

            merged.sort((a, b) => {
              const ad = a.createdAt?.toDate ? a.createdAt.toDate() : (a.createdAt ? new Date(a.createdAt) : 0);
              const bd = b.createdAt?.toDate ? b.createdAt.toDate() : (b.createdAt ? new Date(b.createdAt) : 0);
              return (bd?.getTime?.() || 0) - (ad?.getTime?.() || 0);
            });

            setRequests(merged);
            setLoading(false);
          };
        } else {
          // For non-student roles (mentors/admins)
          const myDept = norm(dept);
          const snap = await getDocs(collection(db, 'leaveRequests'));
          
          if (!isMounted) return;
          
          const enriched = await Promise.all(snap.docs.map(async (d) => {
            const data = d.data() || {};
            let studentUid = null;
            const ref = data?.studentId;
            if (typeof ref === 'string') studentUid = ref;
            else if (ref?.id) studentUid = ref.id;
            if (!studentUid) studentUid = data?.studentUid || null;

            let effDept = (data?.department || '').toString();
            if (!effDept && studentUid) {
              try {
                const cached = profileCache.current.get(studentUid);
                if (cached) {
                  effDept = cached.department || '';
                } else {
                  const sSnap = await getDoc(doc(db, 'users', studentUid));
                  if (sSnap.exists()) {
                    effDept = sSnap.data()?.department || '';
                    profileCache.current.set(studentUid, { department: effDept });
                  }
                }
              } catch (error) {
                console.error('Error fetching student department:', error);
              }
            }
            return { 
              id: d.id, 
              ...data, 
              status: (data?.status || 'pending').toString().toLowerCase(), 
              department: effDept 
            };
          }));

          if (!isMounted) return;

          const filtered = (userRole === 'mentor' || userRole === 'hod')
            ? enriched.filter((r) => !myDept || norm(r.department) === myDept)
            : enriched;

          filtered.sort((a, b) => {
            const ad = a.createdAt?.toDate ? a.createdAt.toDate() : (a.createdAt ? new Date(a.createdAt) : 0);
            const bd = b.createdAt?.toDate ? b.createdAt.toDate() : (b.createdAt ? new Date(b.createdAt) : 0);
            return (bd?.getTime?.() || 0) - (ad?.getTime?.() || 0);
          });
          
          setRequests(filtered);
          setLoading(false);
        }
      } catch (error) {
        console.error('Error initializing leave history:', error);
        if (isMounted) {
          setToast('Failed to load leave history. Please try again.');
          setLoading(false);
        }
      }
    };

    init();

    // Cleanup function
    return () => {
      isMounted = false;
      try { unsub1(); } catch (e) { console.error('Error unsubscribing listener 1:', e); }
      try { unsub2(); } catch (e) { console.error('Error unsubscribing listener 2:', e); }
    };
  }, [currentUser, userRole, dept]);

  const formatDateTime = (value) => {
    if (!value) return '-';
    try {
      const d = value?.toDate ? value.toDate() : new Date(value);
      if (Number.isNaN(d.getTime())) return '-';
      return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '-';
    }
  };

  // Derived filters
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom + 'T00:00:00') : null;
    const to = dateTo ? new Date(dateTo + 'T23:59:59') : null;
    const statusFilter = activeStatus;

    const inRange = (r) => {
      if (!from && !to) return true;
      const sd = r.startDate?.toDate ? r.startDate.toDate() : (r.startDate ? new Date(r.startDate) : null);
      const ed = r.endDate?.toDate ? r.endDate.toDate() : (r.endDate ? new Date(r.endDate) : null);
      if (!sd && !ed) return false;
      const start = sd || ed;
      const end = ed || sd;
      if (from && end && end < from) return false;
      if (to && start && start > to) return false;
      return true;
    };

    return requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (q) {
        const hay = `${r.leaveType || ''} ${r.reason || ''} ${r.studentName || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (!inRange(r)) return false;
      return true;
    });
  }, [requests, activeStatus, search, dateFrom, dateTo]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => { setPage(1); }, [activeStatus, search, dateFrom, dateTo, pageSize]);

  // Toast auto-hide
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const statusBadge = useCallback((status) => {
    const s = (status || 'pending').toString().toLowerCase();
    const cls = s === 'approved' ? 'bg-green-100 text-green-800' : s === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800';
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${cls}`}>{s.toUpperCase()}</span>;
  }, []);

  const callBadge = useCallback((attempted, at) => (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${attempted ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`} title={at?.toDate ? at.toDate().toLocaleString() : ''}>
      {attempted ? 'Call Attempted' : 'Not Attempted'}
    </span>
  ), []);


  const SkeletonCard = () => (
    <div className="animate-pulse bg-white rounded-xl border shadow-sm p-4">
      <div className="h-4 bg-gray-200 rounded w-1/3 mb-3"></div>
      <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
      <div className="h-3 bg-gray-200 rounded w-2/3"></div>
    </div>
  );

  const stats = useMemo(() => ({
    total: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  }), [requests]);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">My Leave Requests</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setViewMode('card')} className={`px-3 py-1.5 rounded-md border text-sm ${viewMode==='card' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white hover:bg-gray-50'}`}>Card View</button>
            <button onClick={() => setViewMode('table')} className={`px-3 py-1.5 rounded-md border text-sm ${viewMode==='table' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white hover:bg-gray-50'}`}>Table View</button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border rounded-lg p-4 text-center">
            <div className="text-xs text-gray-500">Total</div>
            <div className="text-xl font-semibold">{stats.total}</div>
          </div>
          <div className="bg-white border rounded-lg p-4 text-center">
            <div className="text-xs text-gray-500">Pending</div>
            <div className="text-xl font-semibold text-yellow-600">{stats.pending}</div>
          </div>
          <div className="bg-white border rounded-lg p-4 text-center">
            <div className="text-xs text-gray-500">Approved</div>
            <div className="text-xl font-semibold text-green-600">{stats.approved}</div>
          </div>
          <div className="bg-white border rounded-lg p-4 text-center">
            <div className="text-xs text-gray-500">Rejected</div>
            <div className="text-xl font-semibold text-red-600">{stats.rejected}</div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white border rounded-lg p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
            <div className="flex items-center gap-2">
              <button onClick={() => setActiveStatus('all')} className={`px-3 py-1.5 rounded-md border text-sm ${activeStatus==='all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white hover:bg-gray-50'}`}>All</button>
              <button onClick={() => setActiveStatus('pending')} className={`px-3 py-1.5 rounded-md border text-sm ${activeStatus==='pending' ? 'bg-yellow-600 text-white border-yellow-600' : 'bg-white hover:bg-gray-50'}`}>Pending</button>
              <button onClick={() => setActiveStatus('approved')} className={`px-3 py-1.5 rounded-md border text-sm ${activeStatus==='approved' ? 'bg-green-600 text-white border-green-600' : 'bg-white hover:bg-gray-50'}`}>Approved</button>
              <button onClick={() => setActiveStatus('rejected')} className={`px-3 py-1.5 rounded-md border text-sm ${activeStatus==='rejected' ? 'bg-red-600 text-white border-red-600' : 'bg-white hover:bg-gray-50'}`}>Rejected</button>
            </div>
            <div className="flex-1">
              <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search by reason or type" className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex flex-col">
                <label className="text-xs text-gray-500">From</label>
                <input type="date" value={dateFrom} onChange={(e)=>setDateFrom(e.target.value)} className="px-3 py-2 border rounded-md" />
              </div>
              <div className="flex flex-col">
                <label className="text-xs text-gray-500">To</label>
                <input type="date" value={dateTo} onChange={(e)=>setDateTo(e.target.value)} className="px-3 py-2 border rounded-md" />
              </div>
              {(dateFrom || dateTo) && (
                <button onClick={()=>{setDateFrom('');setDateTo('');}} className="px-3 py-2 border rounded-md text-sm hover:bg-gray-50">Clear</button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Per page</label>
              <select value={pageSize} onChange={(e)=>setPageSize(Number(e.target.value))} className="px-2 py-1.5 border rounded-md text-sm">
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
              </select>
            </div>
          </div>
        </div>

        {/* Card/Table Views */}
        {viewMode === 'card' ? (
          <div>
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_,i)=>(<SkeletonCard key={i} />))}
              </div>
            ) : (
              <>
                {paged.length === 0 ? (
                  <div className="bg-white border rounded-lg p-8 text-center">
                    <div className="text-5xl mb-2">🗂️</div>
                    <div className="text-gray-700 font-medium">No requests found</div>
                    <div className="text-gray-500 text-sm">Try adjusting filters or date range.</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-6">
                    {paged.map((r) => (
                      <LeaveRequestCard 
                        key={r.id} 
                        request={r} 
                        showActions={false}
                        actionsDisabled={true}
                        canLogCall={false}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Period</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Parent Call</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loading ? (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-600">Loading…</td></tr>
                  ) : paged.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-600">No requests found.</td></tr>
                  ) : (
                    paged.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm text-gray-900 capitalize">{r.leaveType || '—'}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{formatDateTime(r.startDate)} - {formatDateTime(r.endDate)}</td>
                        <td className="px-4 py-2 text-sm">{statusBadge(r.status)}</td>
                        <td className="px-4 py-2 text-sm">{callBadge(!!r.callAttempted, r.callAttemptedAt)}</td>
                        <td className="px-4 py-2 text-sm">
                          <button onClick={()=>setSelected(r)} className="px-2 py-1 border rounded-md text-xs hover:bg-gray-50">View</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-gray-600">Page {page} of {totalPages}</div>
          <div className="flex items-center gap-2">
            <button disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))} className={`px-3 py-1.5 rounded-md border text-sm ${page<=1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}>Previous</button>
            <button disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))} className={`px-3 py-1.5 rounded-md border text-sm ${page>=totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}>Next</button>
          </div>
        </div>

        {/* Modal */}
        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={()=>setSelected(null)}></div>
            <div className="relative bg-white rounded-xl shadow-lg w-full max-w-2xl mx-4 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Request Details</h2>
                <button onClick={()=>setSelected(null)} className="p-2 rounded-md hover:bg-gray-100">
                  <span className="sr-only">Close</span>
                  ✕
                </button>
              </div>
              <div className="space-y-3 text-sm text-gray-800">
                <div className="flex items-center justify-between">
                  <div className="capitalize font-medium">{selected.leaveType || '—'}</div>
                  <div className="flex items-center gap-2">
                    {statusBadge(selected.status)}
                    {callBadge(!!selected.callAttempted, selected.callAttemptedAt)}
                  </div>
                </div>
                <div><span className="text-gray-500">Duration:</span> {formatDateTime(selected.startDate)} → {formatDateTime(selected.endDate)}</div>
                <div>
                  <div className="text-gray-500">Reason</div>
                  <div className="whitespace-pre-wrap">{selected.reason || '—'}</div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">Status History</div>
                  <div className="space-y-2">
                    {(Array.isArray(selected.approvals) && selected.approvals.length > 0) ? (
                      selected.approvals.map((a, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-md px-3 py-2">
                          <div className="text-xs text-gray-600">{(a?.role || 'Approver').toString().toUpperCase()}</div>
                          <div className="flex items-center gap-2">
                            {statusBadge(a?.status)}
                            <div className="text-xs text-gray-500">{a?.at?.toDate ? a.at.toDate().toLocaleString() : ''}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-gray-500">No status history yet.</div>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <button onClick={()=>setSelected(null)} className="px-3 py-2 rounded-md border text-sm">Close</button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-4 right-4 bg-gray-900 text-white px-4 py-2 rounded-md shadow-lg text-sm">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
};

export default LeaveHistory;
