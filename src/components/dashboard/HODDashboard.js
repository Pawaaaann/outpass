import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { collection, query, onSnapshot, doc, runTransaction, serverTimestamp, getDoc, limit, where, orderBy } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase/config';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import LeaveRequestCard from '../cards/LeaveRequestCard';

const HODDashboard = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [pendingRequests, setPendingRequests] = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [department, setDepartment] = useState('');
  const [activeTab, setActiveTab] = useState('pending'); // pending | approved | rejected
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [detailsReq, setDetailsReq] = useState(null);
  // Clean dashboard: show only pending requests for HOD. Flip to false to restore full UI.
  const PENDING_ONLY = true;

  useEffect(() => {
    if (!currentUser) return;
    let unsubAll = () => {};
    let unsubPending = () => {};
    (async () => {
      try {
        const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
        const dept = (userSnap.exists() && (userSnap.data()?.department || '')) || '';
        setDepartment(dept);
        // Cache for student profile lookups to reduce reads
        const profileCache = new Map(); // uid -> { department, name, studentId }

        // All requests: fetch recent requests
        const allQ = query(
          collection(db, 'leaveRequests'),
          orderBy('createdAt', 'desc'),
          limit(200)
        );
        unsubAll = onSnapshot(allQ, (snap) => {
          try {
            console.log('HOD all snapshot docs:', snap.size);
            const requests = snap.docs.map(doc => ({
              id: doc.id,
              ...doc.data(),
              status: (doc.data().status || '').toLowerCase()
            }));
            setAllRequests(requests);
          } catch (e) {
            console.error('HOD all filter error:', e);
          } finally {
            setLoading(false);
          }
        }, (e) => {
          console.error('Error listening HOD all:', e);
          setLoading(false);
        });

        // Pending approvals for HOD (only requests that haven't been processed by any HOD yet)
        const pendingQ = query(
          collection(db, 'leaveRequests'),
          where('status', '==', 'PENDING'),
          where('nextApproverRole', '==', 'hod'),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
        unsubPending = onSnapshot(pendingQ, (snap) => {
          try {
            console.log('HOD pending snapshot docs:', snap.size);
            const requests = snap.docs.map(doc => {
              const data = doc.data();
              console.log(`Request ${doc.id}: status=${data.status}, nextApproverRole=${data.nextApproverRole}, approvals=`, data.approvals);
              return {
                id: doc.id,
                ...data,
                status: (data.status || '').toLowerCase()
              };
            }).filter(request => {
              // Filter out requests that have already been processed by any HOD
              const approvals = request.approvals || [];
              const hasHodApproval = approvals.some(approval => 
                approval.role === 'hod' && 
                (approval.status === 'approved' || approval.status === 'rejected')
              );
              console.log(`Request ${request.id}: hasHodApproval=${hasHodApproval}`);
              return !hasHodApproval;
            });
            console.log('Final filtered requests:', requests.length);
            setPendingRequests(requests);
          } catch (e) {
            console.error('HOD pending filter error:', e);
          } finally {
            setLoading(false);
          }
        }, (e) => {
          console.error('Error listening HOD pending:', e);
          setLoading(false);
        });
      } catch (e) {
        console.error('Failed to load HOD department:', e);
        setLoading(false);
      }
    })();
    return () => { try { unsubAll(); } catch {}; try { unsubPending(); } catch {}; };
  }, [currentUser]);

  const tabbedRequests = useMemo(() => {
    const norm = (s) => (s || '').toString().toLowerCase();
    const q = norm(search);
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo) : null;
    const base = activeTab === 'pending'
      ? pendingRequests
      : allRequests.filter((r) => (r.status || 'pending') === activeTab);
    return base.filter((r) => {
      // search by studentName, registerNumber, reason
      if (q) {
        const hay = `${r.studentName || ''} ${r.registerNumber || ''} ${r.reason || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // date range on startDate
      try {
        const sd = r.startDate?.toDate ? r.startDate.toDate() : (r.startDate ? new Date(r.startDate) : null);
        if (from && sd && sd < from) return false;
        if (to && sd && sd > to) return false;
      } catch {}
      return true;
    });
  }, [activeTab, pendingRequests, allRequests, search, dateFrom, dateTo]);

  const handleApproval = async (request, status, comment = '') => {
    setProcessingId(request.id);
    try {
      const callable = httpsCallable(functions, 'updateLeaveStatus');
      await callable({ leaveRequestId: request.id, status, comments: comment });
      toast.success(`Request ${status}`);
    } catch (error) {
      console.error('Error updating approval:', error);
      // Fallback: apply update directly via Firestore transaction (no Functions / CORS safe)
      try {
        await runTransaction(db, async (tx) => {
          const ref = doc(db, 'leaveRequests', request.id);
          const snap = await tx.get(ref);
          if (!snap.exists()) throw new Error('Request not found');
          const data = snap.data();
          const approvals = Array.isArray(data.approvals) ? data.approvals.slice() : [];
          approvals.push({
            role: 'hod',
            status,
            comment: comment || '',
            approverUid: currentUser?.uid || null,
            at: new Date(),
          });
          let nextApproverRole = null;
          let newStatus = data.status || 'pending';
          if (status === 'approved') {
            nextApproverRole = 'principal';
            newStatus = 'PENDING';
          } else {
            nextApproverRole = null;
            newStatus = 'REJECTED';
          }
          tx.update(ref, {
            approvals,
            status: newStatus,
            nextApproverRole,
            updatedAt: serverTimestamp(),
          });
        });
        toast.success(`Request ${status} (fallback applied)`);
      } catch (fallbackErr) {
        console.error('HOD fallback update failed:', fallbackErr);
        const code = fallbackErr?.code || fallbackErr?.name || 'error';
        const msg = fallbackErr?.message || 'Unknown error';
        toast.error(`Failed to update request. [${code}] ${msg}`);
      }
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-3xl font-bold text-gray-900">Head of Department Dashboard</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/all-requests')}
              className="bg-gray-800 text-white hover:bg-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              title="View all leave requests"
            >
              View All Requests
            </button>
            <button
              onClick={() => navigate('/history')}
              className="border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-2 rounded-md text-sm font-medium"
              title="View leave history"
            >
              History
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-6">Your Department: <span className="font-medium">{department || '-'}</span></p>

        {/* Statistics (hidden when PENDING_ONLY) */}
        {!PENDING_ONLY && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-bold">{pendingRequests.length}</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Pending Approvals</dt>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-bold">
                        {allRequests.filter(req => req.approvals?.some(a => a.role === 'hod' && String(a.status || '').toLowerCase() === 'approved')).length}
                      </span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Approved by You</dt>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-bold">
                        {allRequests.filter(req => req.isOutstation).length}
                      </span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Outstation Requests</dt>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-bold">{allRequests.length}</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Total Requests</dt>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pending-only list when PENDING_ONLY, else render full tabbed UI */}
        {PENDING_ONLY ? (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <div className="px-4 py-5 sm:px-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg leading-6 font-medium text-gray-900">Department Leave Requests</h3>
                <div className="inline-flex rounded-md shadow-sm" role="tablist">
                  {['pending','approved','rejected'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setActiveTab(t)}
                      className={`px-3 py-1.5 text-sm border ${activeTab===t ? 'bg-gray-800 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'} ${t==='pending' ? 'rounded-l-md' : ''} ${t==='rejected' ? 'rounded-r-md' : ''}`}
                      role="tab"
                      aria-selected={activeTab===t}
                    >
                      {t.charAt(0).toUpperCase()+t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="border-t border-gray-200">
              {(() => {
                const base = activeTab === 'pending'
                  ? pendingRequests
                  : allRequests.filter((r) => (r.status || 'pending') === activeTab);
                if (base.length === 0) {
                  return (
                    <div className="text-center py-12">
                      <p className="text-gray-500">No {activeTab} requests</p>
                    </div>
                  );
                }
                return (
                  <div className="space-y-4 p-4">
                    {base.map((request) => (
                      <LeaveRequestCard
                        key={request.id}
                        request={request}
                        showActions={activeTab === 'pending'}
                        actionsDisabled={processingId === request.id}
                        onApprove={(req, comment) => handleApproval(req, 'approved', comment)}
                        onReject={(req, comment) => handleApproval(req, 'rejected', comment)}
                        onViewDetails={() => setDetailsReq(request)}
                      />
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        ) : (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <div className="px-4 py-5 sm:px-6">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">Department Leave Requests</h3>
                  <div className="inline-flex rounded-md shadow-sm" role="tablist">
                    {['pending','approved','rejected'].map((t) => (
                      <button
                        key={t}
                        onClick={() => setActiveTab(t)}
                        className={`px-3 py-1.5 text-sm border ${activeTab===t ? 'bg-gray-800 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'} ${t==='pending' ? 'rounded-l-md' : ''} ${t==='rejected' ? 'rounded-r-md' : ''}`}
                        role="tab"
                        aria-selected={activeTab===t}
                      >
                        {t.charAt(0).toUpperCase()+t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by student name, register no., or reason..."
                    className="w-full rounded-md border-gray-300 focus:ring-primary-500 focus:border-primary-500 text-sm"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-md border-gray-300 focus:ring-primary-500 focus:border-primary-500 text-sm" />
                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-md border-gray-300 focus:ring-primary-500 focus:border-primary-500 text-sm" />
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-gray-200">
              {tabbedRequests.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No {activeTab} requests</p>
                </div>
              ) : (
                <div className="space-y-4 p-4">
                  {tabbedRequests.map((request) => (
                    <LeaveRequestCard
                      key={request.id}
                      request={request}
                      showActions={activeTab==='pending'}
                      actionsDisabled={processingId === request.id}
                      onApprove={(req, comment) => handleApproval(req, 'approved', comment)}
                      onReject={(req, comment) => handleApproval(req, 'rejected', comment)}
                      onViewDetails={() => setDetailsReq(request)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {/* Details Modal */}
        {detailsReq && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-2/3 lg:w-1/2 shadow-lg rounded-md bg-white">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-semibold text-gray-900">Leave Request Details</h3>
                <button onClick={() => setDetailsReq(null)} className="text-gray-400 hover:text-gray-600">
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-2 text-sm text-gray-800">
                <div><span className="text-gray-500">Student:</span> {detailsReq.studentName || '-'} ({detailsReq.registerNumber || '-'})</div>
                <div><span className="text-gray-500">Dates:</span> {detailsReq.startDate?.toDate ? detailsReq.startDate.toDate().toLocaleString() : (detailsReq.startDate || '-')} {detailsReq.endDate ? ` - ${detailsReq.endDate?.toDate ? detailsReq.endDate.toDate().toLocaleString() : detailsReq.endDate}` : ''}</div>
                <div><span className="text-gray-500">Type:</span> {detailsReq.leaveType || '-'}</div>
                <div><span className="text-gray-500">Reason:</span> {detailsReq.reason || '-'}</div>
                <div><span className="text-gray-500">Status:</span> {(detailsReq.status || 'pending').toString().toUpperCase()}</div>
                <div><span className="text-gray-500">Remarks:</span> {detailsReq.comments || detailsReq.remarks || '-'}</div>
              </div>
              <div className="mt-4 flex justify-end">
                <button onClick={() => setDetailsReq(null)} className="px-3 py-2 rounded-md border text-sm">Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HODDashboard;
