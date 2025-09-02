import React, { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';

const LeaveRequestForm = ({ onSubmit, onCancel }) => {
  const { currentUser } = useAuth();
  const [formData, setFormData] = useState({
    // Auto-populated, readonly
    studentName: '',
    studentId: '',
    registerNumber: '',
    section: '',
    year: '',
    studentType: '',
    isDayScholar: false,
    // Dynamic inputs
    leaveType: 'casual', // Hosteller only
    reason: '', // Hosteller: Reason; Day Scholar: Leave Cause
    startDate: '',
    endDate: '',
    parentPhone: '',
    // day scholar only
    leaveCause: '',
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    const loadUserDefaults = async () => {
      try {
        if (!currentUser) return;
        const userRef = doc(db, 'users', currentUser.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const u = snap.data();
          const parentPhone = u?.parentContact?.phone || u?.parentPhone || '';
          const regCandidate = (u?.registerNumber || u?.regNo || u?.studentId || '').toString().toUpperCase();
          const studentName = u?.name || currentUser?.displayName || '';
          const profileStudentType = (u?.studentType || '').toString();
          const isDayScholar = typeof u?.isDayScholar === 'boolean' ? u.isDayScholar : ((profileStudentType || '').toLowerCase() === 'day scholar');
          setFormData((prev) => ({
            ...prev,
            parentPhone: parentPhone || prev.parentPhone,
            registerNumber: regCandidate || prev.registerNumber,
            studentName: studentName || prev.studentName,
            studentId: currentUser.uid || prev.studentId,
            section: (u?.section || '').toString().toUpperCase(),
            year: u?.year || '',
            isDayScholar: isDayScholar,
            studentType: profileStudentType || (isDayScholar ? 'Day Scholar' : 'Hosteller'),
          }));
        }
      } catch (e) {
        // Non-blocking
        console.warn('Could not prefill user fields:', e);
      }
    };
    loadUserDefaults();
  }, [currentUser]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const todayStr = useMemo(() => {
    const d = new Date();
    d.setHours(0,0,0,0);
    return d.toISOString().slice(0,10);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const phonePattern = /^[0-9]{10}$/;
    const newErrors = {};
    if (!formData.startDate) newErrors.startDate = 'Start date is required';
    if (!formData.endDate) newErrors.endDate = 'End date is required';
    if (formData.startDate && formData.startDate < todayStr) newErrors.startDate = 'Start date cannot be in the past';
    if (formData.endDate && formData.startDate && formData.endDate < formData.startDate) newErrors.endDate = 'End date cannot be before start date';

    if (formData.isDayScholar) {
      if (!phonePattern.test(formData.parentPhone)) newErrors.parentPhone = "Parent's Mobile must be 10 digits";
      if (!formData.leaveCause?.trim()) newErrors.leaveCause = 'Leave cause is required';
    } else {
      if (!formData.leaveType?.trim()) newErrors.leaveType = 'Leave type is required';
      if (formData.parentPhone && !phonePattern.test(formData.parentPhone)) newErrors.parentPhone = "Parent's Mobile must be 10 digits";
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    // Prepare payload (no undefined)
    const base = {
      studentName: formData.studentName,
      studentId: formData.studentId,
      registerNumber: (formData.registerNumber || '').toUpperCase(),
      section: formData.section,
      year: formData.year,
      studentType: formData.studentType || (formData.isDayScholar ? 'Day Scholar' : 'Hosteller'),
      isDayScholar: !!formData.isDayScholar,
      startDate: formData.startDate,
      endDate: formData.endDate,
    };
    const dynamic = formData.isDayScholar
      ? { leaveCause: formData.leaveCause?.trim() }
      : {
          leaveType: formData.leaveType?.trim(),
          // reason is optional per spec; include only if provided
          ...(formData.reason?.trim() ? { reason: formData.reason.trim() } : {}),
        };
    const optional = formData.parentPhone ? { parentPhone: formData.parentPhone } : {};
    const payload = { ...base, ...dynamic, ...optional };

    onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Student Info (readonly) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">Name</label>
          <input
            type="text"
            readOnly
            className="mt-1 block w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-md shadow-sm"
            value={formData.studentName}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Register Number</label>
          <input
            type="text"
            readOnly
            className="mt-1 block w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-md shadow-sm uppercase"
            value={(formData.registerNumber || '').toUpperCase()}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Year</label>
          <input
            type="text"
            readOnly
            className="mt-1 block w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-md shadow-sm"
            value={formData.year}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Section</label>
          <input
            type="text"
            readOnly
            className="mt-1 block w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-md shadow-sm"
            value={formData.section}
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Student Type</label>
          <input
            type="text"
            readOnly
            className="mt-1 block w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-md shadow-sm"
            value={formData.studentType || (formData.isDayScholar ? 'Day Scholar' : 'Hosteller')}
          />
        </div>
      </div>

      {/* Duration */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">Start Date</label>
          <input
            type="date"
            name="startDate"
            min={todayStr}
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            value={formData.startDate}
            onChange={handleChange}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">End Date</label>
          <input
            type="date"
            name="endDate"
            min={formData.startDate || todayStr}
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            value={formData.endDate}
            onChange={handleChange}
          />
        </div>
      </div>

      {/* Dynamic fields by type */}
      {formData.isDayScholar ? (
        // Day Scholar: Leave Cause (textarea) + Parent's Mobile (required)
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700">Leave Cause</label>
            <textarea
              name="leaveCause"
              rows={4}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              value={formData.leaveCause}
              onChange={handleChange}
            />
            {errors.leaveCause && (
              <p className="mt-1 text-xs text-red-600">{errors.leaveCause}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Parent's Mobile</label>
            <input
              type="tel"
              name="parentPhone"
              pattern="^[0-9]{10}$"
              title="Enter a 10-digit phone number"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              value={formData.parentPhone}
              onChange={handleChange}
            />
            {errors.parentPhone && (
              <p className="mt-1 text-xs text-red-600">{errors.parentPhone}</p>
            )}
          </div>
        </>
      ) : (
        // Hosteller: Leave Type (select) + Reason (textarea) + Parent's Mobile (optional)
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Leave Type</label>
              <select
                name="leaveType"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                value={formData.leaveType}
                onChange={handleChange}
              >
                <option value="casual">Casual Leave</option>
                <option value="medical">Medical Leave</option>
                <option value="emergency">Emergency Leave</option>
                <option value="academic">Academic Leave</option>
                <option value="personal">Personal Leave</option>
              </select>
              {errors.leaveType && (
                <p className="mt-1 text-xs text-red-600">{errors.leaveType}</p>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Reason</label>
            <textarea
              name="reason"
              rows={4}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              value={formData.reason}
              onChange={handleChange}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Parent's Mobile (optional)</label>
            <input
              type="tel"
              name="parentPhone"
              pattern="^[0-9]{10}$"
              title="Enter a 10-digit phone number"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              value={formData.parentPhone}
              onChange={handleChange}
            />
            {errors.parentPhone && (
              <p className="mt-1 text-xs text-red-600">{errors.parentPhone}</p>
            )}
          </div>
        </>
      )}

      <div className="flex justify-end space-x-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Submit Request
        </button>
      </div>
    </form>
  );
};

export default LeaveRequestForm;
