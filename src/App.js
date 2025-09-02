import React from 'react';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/auth/Login';
import Signup from './components/auth/Signup';
import Dashboard from './components/dashboard/Dashboard';
import StudentDashboard from './components/dashboard/StudentDashboard';
import MentorDashboard from './components/dashboard/MentorDashboard';
import HODDashboard from './components/dashboard/HODDashboard';
import PrincipalDashboard from './components/dashboard/PrincipalDashboard';
import WardenDashboard from './components/dashboard/WardenDashboard';
import LegacyAdminDashboard from './components/dashboard/AdminDashboard';
import AdminDashboard from './pages/AdminDashboard';
import SecurityPage from './components/security/SecurityPage';
import SeedUsers from './components/dev/SeedUsers';
import Navbar from './components/layout/Navbar';
import LeaveHistory from './pages/LeaveHistory';
import AllRequests from './pages/AllRequests';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { currentUser, userRole } = useAuth();
  const adminSession = typeof window !== 'undefined' && window.localStorage.getItem('admin_session') === 'true';

  // Allow local admin session ONLY for routes that explicitly allow 'admin'
  if (adminSession && Array.isArray(allowedRoles) && allowedRoles.includes('admin')) {
    return children;
  }

  if (!currentUser) {
    return <Navigate to="/login" />;
  }
  
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    return <Navigate to="/dashboard" />;
  }
  
  return children;
};

const AppContent = () => {
  const { currentUser } = useAuth();
  
  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster
        position="top-right"
        toastOptions={{
          style: { fontSize: '0.9rem' },
          success: { iconTheme: { primary: '#16a34a', secondary: 'white' } },
          error: { iconTheme: { primary: '#dc2626', secondary: 'white' } },
        }}
      />
      {currentUser && <Navbar />}
      <Routes>
        <Route 
          path="/login" 
          element={currentUser ? <Navigate to="/dashboard" /> : <Login />} 
        />
        <Route 
          path="/signup" 
          element={currentUser ? <Navigate to="/dashboard" /> : <Signup />} 
        />
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/student" 
          element={
            <ProtectedRoute allowedRoles={['student']}>
              <StudentDashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/mentor" 
          element={
            <ProtectedRoute allowedRoles={['mentor']}>
              <MentorDashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/hod" 
          element={
            <ProtectedRoute allowedRoles={['hod']}>
              <HODDashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/principal" 
          element={
            <ProtectedRoute allowedRoles={['principal']}>
              <PrincipalDashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/warden" 
          element={
            <ProtectedRoute allowedRoles={['warden']}>
              <WardenDashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/history" 
          element={
            <ProtectedRoute>
              <LeaveHistory />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/all-requests" 
          element={
            <ProtectedRoute allowedRoles={['admin', 'mentor', 'hod', 'principal', 'warden']}>
              <AllRequests />
            </ProtectedRoute>
          } 
        />
        {/* Admin Dashboard page */}
        <Route 
          path="/admin-dashboard" 
          element={<AdminDashboard />} 
        />
        {/* TEMP DEV: allow any authenticated user to access /admin */}
        <Route 
          path="/admin" 
          element={
            <ProtectedRoute>
              <LegacyAdminDashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/security" 
          element={
            <ProtectedRoute allowedRoles={['admin', 'warden']}>
              <SecurityPage />
            </ProtectedRoute>
          } 
        />
        <Route path="/" element={<Navigate to="/dashboard" />} />
        {/* Dev-only: remove after seeding */}
        <Route path="/seed" element={<SeedUsers />} />
      </Routes>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}

export default App;
