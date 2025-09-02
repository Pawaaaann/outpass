import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, onSnapshot, orderBy, where, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase/config';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import LeaveRequestCard from '../cards/LeaveRequestCard';

const WardenDashboard = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [pendingRequests, setPendingRequests] = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  // Clean dashboard: show only pending requests for Warden. Flip to false to restore full UI.
  const PENDING_ONLY = true;
  // Status filter buttons
  const [activeTab, setActiveTab] = useState('pending'); // pending | approved | rejected

  useEffect(() => {
    if (!currentUser) return;
    const allQ = query(collection(db, 'leaveRequests'), orderBy('createdAt', 'desc'));
    const unsubAll = onSnapshot(allQ, (snap) => {
      setAllRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const pendingQ = query(
      collection(db, 'leaveRequests'),
      where('status', '==', 'pending'),
      where('nextApproverRole', '==', 'warden')
    );
    const unsubPending = onSnapshot(pendingQ, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Ensure only Hosteller requests appear in pending
      const hostellerOnly = rows.filter((r) => {
        const t = (r?.studentType || '').toString().toLowerCase();
        const isDay = t === 'day scholar' || r?.isDayScholar === true;
        return !isDay;
      });
      setPendingRequests(hostellerOnly);
      setLoading(false);
    }, (e) => {
      console.error('Error listening warden pending:', e);
      setLoading(false);
    });
    return () => { unsubAll(); unsubPending(); };
  }, [currentUser]);

  const handleApproval = async (request, status, comment = '') => {
    setProcessingId(request.id);
    try {
      const callable = httpsCallable(functions, 'updateLeaveStatus');
      await callable({ leaveRequestId: request.id, status, comments: comment });
      alert(`Request ${status}`);
    } catch (error) {
      console.error('Error updating approval:', error);
      // Fallback: finalize via Firestore transaction (warden is final approver)
      try {
        await runTransaction(db, async (tx) => {
          const ref = doc(db, 'leaveRequests', request.id);
          const snap = await tx.get(ref);
          if (!snap.exists()) throw new Error('Request not found');
          const data = snap.data();
          const approvals = Array.isArray(data.approvals) ? data.approvals.slice() : [];
          approvals.push({
            role: 'warden',
            status,
            comment: comment || '',
            approverUid: currentUser?.uid || null,
            at: new Date(),
          });
          const newStatus = status === 'approved' ? 'approved' : 'rejected';
          tx.update(ref, {
            approvals,
            status: newStatus,
            nextApproverRole: null,
            updatedAt: serverTimestamp(),
          });
        });
        alert(`Request ${status} (fallback applied)`);
      } catch (fallbackErr) {
        console.error('Warden fallback update failed:', fallbackErr);
        const code = fallbackErr?.code || fallbackErr?.name || 'error';
        const msg = fallbackErr?.message || 'Unknown error';
        alert(`Failed to update request. [${code}] ${msg}`);
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
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Warden Dashboard</h1>
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
                        {allRequests.filter(req => req.status === 'approved').length}
                      </span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Approved Requests</dt>
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

        {/* Pending/Approved/Rejected via buttons (pending-only layout) */}
        <div className="bg-white shadow overflow-hidden sm:rounded-md mb-8">
          <div className="px-4 py-5 sm:px-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg leading-6 font-medium text-gray-900">Final Warden Approval</h3>
                <p className="mt-1 max-w-2xl text-sm text-gray-500">Review and finalize leave requests</p>
              </div>
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
                    />
                  ))}
                </div>
              );
            })()}
          </div>
        </div>

        {/* All Requests (hidden when PENDING_ONLY) */}
        {!PENDING_ONLY && (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">All Leave Requests</h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">Complete overview of student leave requests</p>
            </div>
            <div className="border-t border-gray-200">
              {allRequests.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No requests found</p>
                </div>
              ) : (
                <div className="space-y-4 p-4">
                  {allRequests.slice(0, 10).map((request) => (
                    <LeaveRequestCard key={request.id} request={request} />
                  ))}
                  {allRequests.length > 10 && (
                    <div className="text-center py-4">
                      <p className="text-gray-500">Showing 10 of {allRequests.length} requests</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WardenDashboard;
