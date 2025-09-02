import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { QRCodeCanvas } from 'qrcode.react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';

const LeaveRequestCard = ({ request, showActions = false, onApprove, onReject, actionsDisabled = false, canLogCall = false }) => {
  const [comment, setComment] = useState('');
  const [loggingCall, setLoggingCall] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // 'approve' | 'reject' | null
  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDateTime = (value) => {
    const d = value?.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const CallStatusBadge = ({ attempted }) => (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${attempted ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
      {attempted ? 'Call Attempted' : 'Not Attempted'}
    </span>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-4">
        <div className="min-w-0">
          <h3 className="text-lg font-medium text-gray-900 capitalize">
            {request.leaveType} Leave
          </h3>
          <p className="text-sm text-gray-500">
            {formatDateTime(request.startDate)} - {formatDateTime(request.endDate)}
          </p>
        </div>
        <span className={`self-start sm:self-auto px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
          {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
        </span>
      </div>

      <div className="space-y-2 mb-4">
        {(request.studentName || request.registerNumber) && (
          <div>
            <span className="text-sm font-medium text-gray-700">Student: </span>
            <span className="text-sm text-gray-900">
              {request.studentName || '-'}{request.registerNumber ? ` (${request.registerNumber})` : ''}
            </span>
          </div>
        )}
        {Boolean(request.department) && (
          <div>
            <span className="text-sm font-medium text-gray-700">Department: </span>
            <span className="text-sm text-gray-900">{request.department}</span>
          </div>
        )}
        <div className="break-words">
          <span className="text-sm font-medium text-gray-700">Destination: </span>
          <span className="text-sm text-gray-900">{request.destination}</span>
        </div>
        <div className="break-words">
          <span className="text-sm font-medium text-gray-700">Reason: </span>
          <span className="text-sm text-gray-900">{request.reason}</span>
        </div>
        <div>
          <span className="text-sm font-medium text-gray-700">Contact: </span>
          <span className="text-sm text-gray-900">{request.contactNumber}</span>
        </div>
        {/* Parent call attempt status badge */}
        <div>
          <span className="text-sm font-medium text-gray-700">Parent Call: </span>
          <CallStatusBadge attempted={!!request.callAttempted} />
        </div>
        {request.isOutstation && (
          <div className="flex items-center">
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
              Outstation
            </span>
          </div>
        )}
      </div>

      {request.parentConfirmation && (
        <div className="border-t pt-4 mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Parent Confirmation</h4>
          <div className="text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="text-gray-600">Status: </span>
              <span className={`font-medium ${request.parentConfirmation.status === 'approved' ? 'text-green-600' : request.parentConfirmation.status === 'rejected' ? 'text-red-600' : 'text-yellow-600'}`}>
                {request.parentConfirmation.status}
              </span>
              {request.parentConfirmation.method && (
                <span className="text-gray-500 ml-2">via {request.parentConfirmation.method}</span>
              )}
            </div>
            {request.parentConfirmation.updatedAt && (
              <div className="text-xs text-gray-500 mt-1 sm:mt-0">
                Updated {formatDateTime(request.parentConfirmation.updatedAt)}
              </div>
            )}
          </div>
          {request.parentConfirmation.message && (
            <div className="text-xs text-gray-600 mt-1">
              {request.parentConfirmation.message}
            </div>
          )}
        </div>
      )}

      {request.approvals && request.approvals.length > 0 && (
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Approval Status:</h4>
          <div className="space-y-1">
            {request.approvals.map((approval, index) => (
              <div key={index} className="flex justify-between text-sm">
                <span className="text-gray-600">{approval.role}:</span>
                <span className={`font-medium ${approval.status === 'approved' ? 'text-green-600' : 'text-red-600'}`}>
                  {approval.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(request?.gatePass?.qrDataUrl || request.status === 'approved') && (
        <div className="border-t pt-4 mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Gate Pass QR</h4>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            {request?.gatePass?.qrDataUrl ? (
              <img
                src={request.gatePass.qrDataUrl}
                alt="Gate Pass QR"
                className="w-32 h-32 border rounded"
              />
            ) : (
              <QRCodeCanvas
                value={JSON.stringify({
                  leaveId: request.id,
                  studentId: request.studentUid || request.studentId?.id || null,
                  studentName: request.studentName || 'Unknown',
                  registerNumber: request.registerNumber || '',
                  department: request.department || '',
                  leaveType: request.leaveType || '',
                  startDate: request.startDate?.toDate ? request.startDate.toDate().toISOString() : request.startDate,
                  endDate: request.endDate?.toDate ? request.endDate.toDate().toISOString() : request.endDate,
                  status: request.status,
                  approvedAt: new Date().toISOString(),
                  validUntil: request.endDate?.toDate ? request.endDate.toDate().toISOString() : request.endDate
                })}
                size={128}
                includeMargin={true}
              />
            )}
            <div className="text-xs text-gray-600 space-y-1">
              <div>Leave ID: <span className="font-mono">{request.id}</span></div>
              <div>Student: <span className="font-mono">{request.studentName || 'Unknown'}</span></div>
              <div>Register No: <span className="font-mono">{request.registerNumber || '-'}</span></div>
              <div>Department: <span className="font-mono">{request.department || '-'}</span></div>
              {request?.gatePass?.issuedAt && (
                <div>Issued: <span className="font-mono">{formatDateTime(request.gatePass.issuedAt)}</span></div>
              )}
              {request?.gatePass?.validFrom && request?.gatePass?.validTo && (
                <div>Valid: <span className="font-mono">{formatDateTime(request.gatePass.validFrom)} - {formatDateTime(request.gatePass.validTo)}</span></div>
              )}
              <div>Status: <span className="font-semibold text-green-700">{request.status === 'approved' ? 'Approved' : (request.status || '-')}</span></div>
              {request?.gatePass?.qrDataUrl && (
                <div>
                  <a
                    href={request.gatePass.qrDataUrl}
                    download={`gatepass-${request.id}.png`}
                    className="inline-block mt-1 text-primary-700 hover:text-primary-800 underline"
                  >
                    Download QR
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4">
      {showActions && request.status === 'pending' && (
        <div className="border-t pt-4 space-y-3">
          <textarea
            className="w-full border border-gray-300 rounded-md p-2 text-sm"
            placeholder="Add a comment (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => !actionsDisabled && setConfirmAction('approve')}
              disabled={actionsDisabled}
              className={`flex-1 text-white px-4 py-2 rounded-md text-sm font-medium ${actionsDisabled ? 'bg-green-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
            >
              Approve
            </button>
            <button
              onClick={() => !actionsDisabled && setConfirmAction('reject')}
              disabled={actionsDisabled}
              className={`flex-1 text-white px-4 py-2 rounded-md text-sm font-medium ${actionsDisabled ? 'bg-red-300 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`}
            >
              Reject
            </button>
          </div>

          {/* Mentor-only call logging */}
          <div className="mt-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-700">Parent Call Attempt</h4>
              <CallStatusBadge attempted={!!request.callAttempted} />
            </div>
            {canLogCall && !request.callAttempted && (
              <div className="mt-3">
                <button
                  onClick={async () => {
                    try {
                      setLoggingCall(true);
                      await updateDoc(doc(db, 'leaveRequests', request.id), {
                        callAttempted: true,
                        callAttemptedAt: serverTimestamp(),
                      });
                      toast.success('Parent call attempt logged');
                    } catch (err) {
                      console.error('Error logging call:', err);
                      const code = err?.code || err?.name || 'error';
                      const msg = err?.message || 'Unknown error';
                      toast.error(`Failed to log call. [${code}] ${msg}`);
                    } finally {
                      setLoggingCall(false);
                    }
                  }}
                  disabled={loggingCall}
                  className={`inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-white ${
                    loggingCall ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {loggingCall ? 'Logging...' : 'Log Parent Call Attempt'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="text-xs text-gray-500 mt-4">
        Submitted on {formatDateTime(request.createdAt)}
      </div>
      </div>

      {/* Confirm Modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md shadow-lg w-full max-w-md">
            <div className="px-4 py-3 border-b">
              <h3 className="text-base font-semibold text-gray-900">
                {confirmAction === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
              </h3>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-gray-700">
                Are you sure you want to {confirmAction} this request?
              </p>
              {comment && (
                <div className="text-xs text-gray-500">
                  Comment: <span className="italic">{comment}</span>
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t flex justify-end gap-2">
              <button onClick={() => setConfirmAction(null)} className="px-3 py-2 text-sm border rounded-md">Cancel</button>
              <button
                onClick={() => {
                  const fn = confirmAction === 'approve' ? onApprove : onReject;
                  fn && fn(request, comment);
                  setConfirmAction(null);
                }}
                className={`px-3 py-2 text-sm text-white rounded-md ${confirmAction === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaveRequestCard;
