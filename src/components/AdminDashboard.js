import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

const AdminDashboard = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Welcome Admin</h1>
          <button
            onClick={() => navigate('/login')}
            className="text-sm px-3 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-100"
          >
            Back to Sign in
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow p-5">
            <h2 className="text-lg font-semibold text-gray-800">Manage Leave Requests</h2>
            <p className="mt-2 text-sm text-gray-600">Placeholder for approving/rejecting requests, bulk actions, and reports.</p>
            <div className="mt-4">
              <button className="px-3 py-2 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white">Open</button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-5">
            <h2 className="text-lg font-semibold text-gray-800">View Student Activity</h2>
            <p className="mt-2 text-sm text-gray-600">Placeholder for recent leave submissions, usage stats, and trends.</p>
            <div className="mt-4">
              <button className="px-3 py-2 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white">Open</button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-5">
            <h2 className="text-lg font-semibold text-gray-800">Manage Faculty</h2>
            <p className="mt-2 text-sm text-gray-600">Placeholder for faculty accounts, roles, and departments.</p>
            <div className="mt-4">
              <button className="px-3 py-2 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white">Open</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
