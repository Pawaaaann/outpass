import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { 
  collection, query, onSnapshot, orderBy,
  doc, runTransaction, serverTimestamp, getDoc, limit
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';

const MentorDashboard = () => {
  const { currentUser } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [department, setDepartment] = useState('');
  const [activeFilter, setActiveFilter] = useState('pending');
  
  // Modular function to fetch requests
  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get mentor's department
      const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
      const userDept = userSnap.exists() ? userSnap.data()?.department || '' : '';
      setDepartment(userDept);
      
      // Query all requests and filter by department
      const q = query(
        collection(db, 'leaveRequests'),
        orderBy('createdAt', 'desc'),
        limit(200)
      );
      
      return onSnapshot(q, (snapshot) => {
        const allRequests = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          status: (doc.data().status || 'pending').toLowerCase(),
          createdAt: doc.data().createdAt?.toDate() || new Date(),
          updatedAt: doc.data().updatedAt?.toDate() || new Date()
        }));
        
        // Filter by department if mentor has one
        const filteredRequests = userDept 
          ? allRequests.filter(req => req.department === userDept)
          : allRequests;
        
        setRequests(filteredRequests);
        setLoading(false);
      }, (err) => {
        console.error('Error fetching requests:', err);
        setError('Failed to load requests. Please try again.');
        setLoading(false);
      });
    } catch (err) {
      console.error('Error setting up listener:', err);
      setError('Failed to initialize dashboard. Please refresh.');
      setLoading(false);
    }
  }, [currentUser.uid]);

  useEffect(() => {
    if (!currentUser) return;

    let unsubscribe;
    const setupListener = async () => {
      unsubscribe = await fetchRequests();
    };

    setupListener();

    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [currentUser, fetchRequests]);

  // Filter requests based on active filter
  const filteredRequests = requests.filter(request => {
    if (activeFilter === 'pending') {
      return request.status === 'pending' && request.nextApproverRole === 'mentor';
    }
    return request.status === activeFilter;
  });

  // Modular function to handle approval/rejection
  const handleApproval = async (request, status, comment = '') => {
    if (!currentUser) {
      toast.error('Authentication required');
      return;
    }
    
    setProcessingId(request.id);
    
    try {
      // Try Firebase function first
      const callable = httpsCallable(functions, 'updateLeaveStatus');
      await callable({ 
        leaveRequestId: request.id, 
        status, 
        comments: comment 
      });
      
      toast.success(`Request ${status} successfully`);
    } catch (error) {
      console.error('Function call failed, trying fallback:', error);
      
      // Fallback to direct Firestore update
      try {
        await runTransaction(db, async (tx) => {
          const ref = doc(db, 'leaveRequests', request.id);
          const snap = await tx.get(ref);
          
          if (!snap.exists()) {
            throw new Error('Request not found');
          }
          
          const data = snap.data();
          const approvals = Array.isArray(data.approvals) ? [...data.approvals] : [];
          
          // Add mentor approval
          approvals.push({
            role: 'mentor',
            status,
            comment: comment || '',
            approverUid: currentUser.uid,
            at: new Date(),
          });
          
          // Update workflow
          const updates = {
            approvals,
            updatedAt: serverTimestamp(),
          };
          
          if (status === 'approved') {
            updates.nextApproverRole = 'hod';
            updates.status = 'PENDING';
          } else {
            updates.nextApproverRole = null;
            updates.status = 'REJECTED';
          }
          
          tx.update(ref, updates);
        });
        
        toast.success(`Request ${status} successfully`);
      } catch (fallbackError) {
        console.error('Fallback update failed:', fallbackError);
        toast.error(`Failed to ${status} request. Please try again.`);
      }
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">⚠️</div>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Mentor Dashboard</h1>
            <p className="text-gray-600">
              Department: <span className="font-medium text-gray-900">{department || 'Not assigned'}</span>
            </p>
          </div>

          {/* Filter Buttons */}
          <div className="mb-6">
            <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
              {['pending', 'approved', 'rejected'].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeFilter === filter
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <div className="w-6 h-6 text-yellow-600">⏳</div>
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Pending Approval</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {requests.filter(r => r.status === 'pending' && r.nextApproverRole === 'mentor').length}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <div className="w-6 h-6 text-green-600">✅</div>
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Approved</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {requests.filter(r => r.status === 'approved').length}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="p-2 bg-red-100 rounded-lg">
                  <div className="w-6 h-6 text-red-600">❌</div>
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Rejected</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {requests.filter(r => r.status === 'rejected').length}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Requests List */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {activeFilter.charAt(0).toUpperCase() + activeFilter.slice(1)} Requests
              </h2>
            </div>
            
            <div className="p-6">
              {filteredRequests.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-gray-400 text-4xl mb-4">📋</div>
                  <p className="text-gray-500">No {activeFilter} requests found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredRequests.map((request) => (
                    <RequestCard 
                      key={request.id} 
                      request={request} 
                      onApprove={handleApproval}
                      onReject={handleApproval}
                      processing={processingId === request.id}
                      showActions={activeFilter === 'pending'}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Clean Request Card Component
const RequestCard = ({ request, onApprove, onReject, processing, showActions }) => {
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState('');

  const getStatusBadge = (status) => {
    const badges = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800', 
      rejected: 'bg-red-100 text-red-800'
    };
    return badges[status] || badges.pending;
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    const d = date instanceof Date ? date : date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString();
  };

  const handleApprove = () => {
    onApprove(request, 'approved', comment);
    setComment('');
    setShowComment(false);
  };

  const handleReject = () => {
    onReject(request, 'rejected', comment);
    setComment('');
    setShowComment(false);
  };

  return (
    <div className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            {request.studentName || 'Unknown Student'}
          </h3>
          <p className="text-sm text-gray-600">
            {request.registerNumber || 'No register number'} • {request.department || 'No department'}
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(request.status)}`}>
          {request.status?.toUpperCase() || 'PENDING'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-sm text-gray-600">Leave Type</p>
          <p className="font-medium">{request.leaveType || 'Not specified'}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Duration</p>
          <p className="font-medium">
            {formatDate(request.startDate)} - {formatDate(request.endDate)}
          </p>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-sm text-gray-600">Reason</p>
        <p className="text-gray-900">{request.reason || 'No reason provided'}</p>
      </div>

      {/* Call Status Display */}
      {request.callAttempts && request.callAttempts.length > 0 && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600 mb-1">Call Status</p>
          <p className="text-sm font-medium text-gray-900">
            Last attempt: {request.callAttempts[request.callAttempts.length - 1]?.status || 'Unknown'}
          </p>
        </div>
      )}

      {showActions && (
        <div className="border-t pt-4">
          {!showComment ? (
            <div className="flex space-x-3">
              <button
                onClick={() => setShowComment(true)}
                disabled={processing}
                className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {processing ? 'Processing...' : 'Approve'}
              </button>
              <button
                onClick={() => setShowComment(true)}
                disabled={processing}
                className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {processing ? 'Processing...' : 'Reject'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment (optional)"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
              />
              <div className="flex space-x-3">
                <button
                  onClick={handleApprove}
                  disabled={processing}
                  className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {processing ? 'Approving...' : 'Approve'}
                </button>
                <button
                  onClick={handleReject}
                  disabled={processing}
                  className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {processing ? 'Rejecting...' : 'Reject'}
                </button>
                <button
                  onClick={() => {
                    setShowComment(false);
                    setComment('');
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MentorDashboard;
