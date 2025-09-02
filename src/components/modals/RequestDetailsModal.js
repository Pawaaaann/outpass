import React from 'react';
import { format } from 'date-fns';

const RequestDetailsModal = ({ request, onClose }) => {
  if (!request) return null;

  const formatDate = (dateValue) => {
    if (!dateValue) return '--';
    try {
      let date;
      // Handle Firestore Timestamp
      if (dateValue && typeof dateValue.toDate === 'function') {
        date = dateValue.toDate();
      } 
      // Handle string dates (from form submission)
      else if (typeof dateValue === 'string') {
        // Check if it's just a date string (YYYY-MM-DD)
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
          const [year, month, day] = dateValue.split('-').map(Number);
          date = new Date(year, month - 1, day);
        } else {
          date = new Date(dateValue);
        }
      } 
      // Handle Firestore Timestamp in {seconds, nanoseconds} format
      else if (dateValue.seconds) {
        date = new Date(dateValue.seconds * 1000);
      } 
      // Assume it's already a Date object
      else {
        date = dateValue;
      }
      
      if (isNaN(date.getTime())) {
        console.warn('Invalid date value:', dateValue);
        return '--';
      }
      
      // Format the date as 'MMM dd, yyyy'
      return format(date, 'MMM dd, yyyy');
    } catch (e) {
      console.warn('Error formatting date:', dateValue, e);
      return '--';
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" onClick={onClose}>
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>
        
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
        
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          {/* Header */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:items-center sm:justify-between border-b border-gray-200">
            <h3 className="text-lg leading-6 font-bold text-gray-900">
              Request Details
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 focus:outline-none"
            >
              <span className="sr-only">Close</span>
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4">
                <div className="border-b pb-4">
                  <h4 className="text-lg font-medium text-gray-900 mb-4">Request Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Student Name</p>
                      <p className="mt-1 text-sm text-gray-900">{request.studentName || '--'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Student Type</p>
                      <p className="mt-1 text-sm text-gray-900 capitalize">{request.studentType?.toLowerCase() || '--'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Leave Type</p>
                      <p className="mt-1 text-sm text-gray-900 capitalize">
                        {(() => {
                          const type = request.leaveType || request.leaveCause || request.type || '--';
                          return typeof type === 'string' ? type.toLowerCase() : type;
                        })()}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Status</p>
                      <span className={`mt-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        request.status === 'APPROVED' 
                          ? 'bg-green-100 text-green-800' 
                          : request.status === 'REJECTED' 
                            ? 'bg-red-100 text-red-800' 
                            : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {request.status || 'PENDING'}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <p className="text-sm font-medium text-gray-500">Duration</p>
                      <p className="mt-1 text-sm text-gray-900">
                        {formatDate(
                          request.duration?.from || 
                          request.duration?.start || 
                          request.startDate || 
                          request.start ||
                          request.duration?.fromDate ||
                          '--'
                        )} → {formatDate(
                          request.duration?.to || 
                          request.duration?.end || 
                          request.endDate || 
                          request.end ||
                          request.duration?.toDate ||
                          '--'
                        )}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-sm font-medium text-gray-500">Reason</p>
                      <p className="mt-1 text-sm text-gray-900 whitespace-pre-line">
                        {request.reason || '--'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Parent Call</p>
                      <span className={`mt-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        request.callAttempted || request.callAttempt === 'Attempted'
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {request.callAttempted || request.callAttempt === 'Attempted' 
                          ? `Attempted${request.callAttemptedAt ? ` (${formatDate(request.callAttemptedAt)})` : ''}` 
                          : 'Not Attempted'}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Submitted</p>
                      <p className="mt-1 text-sm text-gray-900">
                        {formatDate(request.createdAt) || '--'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Status History */}
                <div>
                  <h4 className="text-lg font-medium text-gray-900 mb-4">Status History</h4>
                  <div className="space-y-3">
                    {request.statusHistory?.length > 0 ? (
                      request.statusHistory.map((status, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-gray-900 capitalize">{status.role || 'System'}</p>
                            <p className="text-xs text-gray-500">
                              {status.timestamp ? formatDate(status.timestamp) : '--'}
                            </p>
                          </div>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            status.status === 'APPROVED' 
                              ? 'bg-green-100 text-green-800' 
                              : status.status === 'REJECTED' 
                                ? 'bg-red-100 text-red-800' 
                                : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {status.status || 'PENDING'}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-4 text-sm text-gray-500">
                        No status history available
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={onClose}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RequestDetailsModal;
