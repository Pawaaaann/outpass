import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { collection, addDoc, doc, setDoc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import LeaveRequestForm from '../forms/LeaveRequestForm';

// Helper function to generate tamper-proof request ID (browser-compatible)
const generateRequestId = async (studentId) => {
  const requestId = uuidv4();
  const encoder = new TextEncoder();
  const data = encoder.encode(`${studentId}:${requestId}:${Date.now()}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `${requestId}:${hashHex.substring(0, 8)}`;
};

const StudentDashboard = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    const studentRef = doc(db, 'users', currentUser.uid);
    (async () => {
      try {
        const userSnap = await getDoc(studentRef);
        const data = userSnap.exists() ? (userSnap.data() || {}) : {};
        setProfile({
          uid: currentUser.uid,
          name: data.name || currentUser.displayName || '',
          email: (data.email || currentUser.email || '').toLowerCase(),
          department: data.department || '',
          studentId: data.studentId || data.registerNumber || '',
          section: (data.section || '').toString().toUpperCase(),
          year: data.year || '',
          studentType: data.studentType || (data.isDayScholar ? 'Day Scholar' : 'Hosteller') || '',
          phoneNumber: data.phoneNumber || '',
          parentPhone: data.parentPhone || (data.parentContact && data.parentContact.phone) || '',
          role: data.role || 'student',
          createdAt: data.createdAt || null,
          updatedAt: data.updatedAt || null,
          address: data.address || '',
        });
      } catch (e) {
        console.warn('Could not load student profile:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [currentUser]);

  const handleSubmitRequest = async (requestData) => {
    console.log('Starting form submission...');
    
    if (!currentUser) {
      const error = new Error('No authenticated user found');
      console.error(error);
      window.alert('Authentication error. Please log in again.');
      return;
    }

    try {
      console.log('Current user UID:', currentUser.uid);
      console.log('Form data received:', JSON.stringify(requestData, null, 2));
      
      const studentRef = doc(db, 'users', currentUser.uid);
      console.log('Student document reference:', studentRef.path);
      
      // 1. Update user profile if needed
      try {
        const updates = {};
        if (requestData.registerNumber) {
          updates.registerNumber = (requestData.registerNumber || '').toUpperCase();
        }
        if (requestData.parentPhone) {
          updates.parentPhone = requestData.parentPhone;
          updates.parentContact = { phone: requestData.parentPhone };
        }
        if (Object.keys(updates).length > 0) {
          console.log('Updating user profile with:', updates);
          await setDoc(studentRef, updates, { merge: true });
          console.log('User profile updated successfully');
        } else {
          console.log('No profile updates needed');
        }
      } catch (e) {
        console.warn('Could not update user profile:', e);
        // Non-critical error, continue with leave request submission
      }

      // 2. Validate required fields
      if (!requestData.startDate || !requestData.endDate) {
        throw new Error('Please select both start and end dates');
      }

      // 3. Determine student type and leave type
      const isDayScholar = requestData.isDayScholar || 
                         (requestData.studentType || '').toLowerCase().includes('day');
      const studentType = requestData.studentType || (isDayScholar ? 'Day Scholar' : 'Hosteller');
      const leaveType = isDayScholar ? (requestData.leaveCause || 'General') : (requestData.leaveType || 'General');

      // 4. Calculate duration in days
      const startDate = new Date(requestData.startDate);
      const endDate = new Date(requestData.endDate);
      const durationInDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

      // 5. Generate tamper-proof request ID
      const requestId = await generateRequestId(currentUser.uid);
      
      // 6. Prepare the document data
      const leaveRequest = {
        // Request metadata
        _id: requestId,
        _createdAt: serverTimestamp(),
        _updatedAt: serverTimestamp(),
        _version: 1,
        
        // Student information
        studentName: String(requestData.studentName || profile?.name || currentUser.displayName || 'Student'),
        studentType: String(studentType),
        studentUid: currentUser.uid,  // Required for security rules
        studentId: currentUser.uid,   // Store UID string, not a document reference
        department: String(profile?.department || ''), // Add department for filtering
        
        // Leave details
        leaveType: String(leaveType),
        reason: String(requestData.reason || (isDayScholar ? requestData.leaveCause : '') || 'Not specified'),
        
        // Dates
        startDate: requestData.startDate,
        endDate: requestData.endDate,
        
        // Duration information
        duration: {
          from: requestData.startDate,
          to: requestData.endDate,
          days: durationInDays
        },
        
        // Status
        status: 'PENDING',
        nextApproverRole: 'mentor',
        
        // Contact information
        parentPhone: String(requestData.parentPhone || ''),
        
        // Timestamps
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        
        // Additional metadata
        callAttempt: 'Not Attempted',
        callAttempted: false,
        callAttemptedAt: null
      };

      // Add optional fields if they exist
      if (requestData.registerNumber) {
        leaveRequest.registerNumber = String(requestData.registerNumber).toUpperCase();
      }
      if (requestData.section) {
        leaveRequest.section = String(requestData.section);
      }
      if (requestData.year) {
        leaveRequest.year = String(requestData.year);
      }

      console.log('Submitting leave request:', JSON.stringify(leaveRequest, null, 2));

      // Submit to Firestore using batch for atomic operations
      console.log('Attempting to create leave request document...');
      
      const batch = writeBatch(db);
      const requestRef = doc(collection(db, 'leaveRequests'), requestId);
      
      // Add request to batch
      batch.set(requestRef, leaveRequest);
      
      // Create audit log entry
      const auditLogRef = doc(collection(db, `leaveRequests/${requestId}/auditLogs`));
      batch.set(auditLogRef, {
        action: 'REQUEST_CREATED',
        status: 'PENDING',
        performedBy: currentUser.uid,
        performedAt: serverTimestamp(),
        metadata: {
          ip: '', // Could be populated if available
          userAgent: navigator.userAgent
        }
      });
      
      try {
        // Commit the batch
        await batch.commit();
        console.log('Leave request submitted successfully with ID:', requestId);
        
        // Update UI and reset form
        setShowForm(false);
        window.alert('Leave request submitted successfully!');
        
        // Refresh the page to show the new request
        window.location.reload();
      } catch (firestoreError) {
        console.error('Firestore error details:', {
          code: firestoreError.code,
          message: firestoreError.message,
          stack: firestoreError.stack
        });
        throw firestoreError; // Re-throw to be caught by the outer catch
      }
      
    } catch (error) {
      console.error('Error submitting leave request:', {
        code: error.code,
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      
      let errorMessage = 'Failed to submit leave request. ';
      
      // More specific error handling
      if (error.code === 'permission-denied') {
        errorMessage = 'You do not have permission to submit this request. Please contact support if you believe this is an error.';
      } else if (error.code === 'resource-exhausted') {
        errorMessage = 'Too many requests. Please try again later.';
      } else if (error.code === 'unavailable') {
        errorMessage = 'Service unavailable. Please check your internet connection and try again.';
      } else if (error.message) {
        errorMessage += 'Please try again or contact support if the problem persists.';
      }
      
      window.alert(errorMessage);
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
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-md border p-8 text-center">
          <div className="text-4xl mb-3">👤</div>
          <h1 className="text-xl font-semibold text-gray-900">
            {profile?.name || 'Student'}
          </h1>
          <p className="mt-2 text-sm text-gray-600">🎓 Type: {profile?.studentType || (profile?.isDayScholar ? 'Day Scholar' : 'Hosteller') || '-'}</p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex justify-center items-center rounded-lg px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 w-full"
            >
              Apply Leave
            </button>
            <button
              onClick={() => navigate('/history')}
              className="inline-flex justify-center items-center rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 w-full"
            >
              View Requests
            </button>
          </div>
        </div>
      </div>
      {showForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">New Leave Request</h3>
                <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <LeaveRequestForm onSubmit={handleSubmitRequest} onCancel={() => setShowForm(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentDashboard;
