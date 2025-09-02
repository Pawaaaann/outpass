import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Navigate } from 'react-router-dom';

const Dashboard = () => {
  const { userRole } = useAuth();

  // Redirect to role-specific dashboard
  switch (userRole) {
    case 'student':
      return <Navigate to="/student" />;
    case 'mentor':
      return <Navigate to="/mentor" />;
    case 'hod':
      return <Navigate to="/hod" />;
    case 'principal':
      return <Navigate to="/principal" />;
    case 'warden':
      return <Navigate to="/warden" />;
    case 'admin':
      return <Navigate to="/admin" />;
    default:
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Welcome to LeaveEasy</h2>
            <p className="text-gray-600">Loading your dashboard...</p>
          </div>
        </div>
      );
  }
};

export default Dashboard;
