import React from 'react';

// Visualizes the sequential approval flow using simple step pills
// Flow rules must mirror backend in functions/src/index.ts
// - Default: Mentor -> HOD -> Principal -> Warden
// - Day scholar + emergency: Mentor -> HOD -> Warden
const StatusTracker = ({ request }) => {
  if (!request) return null;
  const isDayScholar = !!request.isDayScholar;
  const isEmergency = (request.leaveType || '').toLowerCase() === 'emergency';
  const baseFlow = ['mentor', 'hod', 'principal', 'warden'];
  const specialFlow = ['mentor', 'hod', 'warden'];
  const flow = isDayScholar && isEmergency ? specialFlow : baseFlow;

  const approvals = Array.isArray(request.approvals) ? request.approvals : [];
  const approvedRoles = approvals.filter(a => a.status === 'approved').map(a => a.role);
  const rejected = approvals.some(a => a.status === 'rejected');
  const next = request.nextApproverRole || null;
  const finalStatus = request.status; // 'pending' | 'approved' | 'rejected'

  const badgeFor = (role) => {
    const isApproved = approvedRoles.includes(role);
    const isNext = next === role && finalStatus === 'pending' && !rejected;
    const isBlocked = rejected && !isApproved;
    let cls = 'bg-gray-100 text-gray-700';
    if (isApproved) cls = 'bg-green-100 text-green-800';
    else if (isNext) cls = 'bg-yellow-100 text-yellow-800';
    else if (isBlocked) cls = 'bg-red-100 text-red-800';
    const label = role.charAt(0).toUpperCase() + role.slice(1);
    return (
      <span key={role} className={`px-2 py-1 rounded-full text-xs font-medium ${cls}`}>{label}</span>
    );
  };

  return (
    <div className="flex items-center space-x-2">
      {flow.map((role, idx) => (
        <div key={role} className="flex items-center">
          {badgeFor(role)}
          {idx < flow.length - 1 && (
            <svg className="w-4 h-4 mx-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
};

export default StatusTracker;
