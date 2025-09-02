import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import { signInAnonymously } from 'firebase/auth';
import { useAuth } from '../../contexts/AuthContext';
import LeaveRequestCard from '../cards/LeaveRequestCard';
import { PieChart, Pie, Cell, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import jsPDF from 'jspdf';

const AdminDashboard = () => {
  const { currentUser, userRole } = useAuth();
  const [allRequests, setAllRequests] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalRequests: 0,
    pendingRequests: 0,
    approvedRequests: 0,
    rejectedRequests: 0,
    totalUsers: 0
  });
  const [topTakers, setTopTakers] = useState([]);
  const [monthlyData, setMonthlyData] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      // If using local admin backdoor (no Firebase user), sign in anonymously
      if (!currentUser) {
        try {
          const cred = await signInAnonymously(auth);
          try { await cred.user?.getIdToken(true); } catch {}
          // give auth a brief moment then fetch
          await new Promise(r => setTimeout(r, 300));
        } catch (e) {
          console.error('Anonymous sign-in failed:', e);
        }
      }
      fetchData();
    })();
  }, [currentUser]);

  const fetchData = async () => {
    try {
      // Fetch all leave requests
      const requestsQuery = query(collection(db, 'leaveRequests'));
      const requestsSnapshot = await getDocs(requestsQuery);
      const requests = requestsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Fetch all users
      const usersQuery = query(collection(db, 'users'));
      const usersSnapshot = await getDocs(usersQuery);
      const users = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      setAllRequests(requests);
      setAllUsers(users);

      // Calculate statistics
      setStats({
        totalRequests: requests.length,
        pendingRequests: requests.filter(req => req.status === 'pending').length,
        approvedRequests: requests.filter(req => req.status === 'approved').length,
        rejectedRequests: requests.filter(req => req.status === 'rejected').length,
        totalUsers: users.length
      });

      // Frequent leave takers aggregation (top 5 by count)
      const byStudent = new Map();
      requests.forEach(r => {
        const sid = r.studentId?.id || 'unknown';
        const name = r.studentName || sid;
        const entry = byStudent.get(sid) || { studentId: sid, studentName: name, count: 0 };
        entry.count += 1;
        byStudent.set(sid, entry);
      });
      const top = Array.from(byStudent.values()).sort((a, b) => b.count - a.count).slice(0, 5);
      setTopTakers(top);

      // Monthly trend aggregation by createdAt month (MMM YYYY)
      const monthKey = (d) => {
        const dt = d?.toDate ? d.toDate() : (d ? new Date(d) : null);
        if (!dt || isNaN(dt.getTime())) return 'Unknown';
        return dt.toLocaleString(undefined, { month: 'short', year: 'numeric' });
      };
      const byMonth = new Map();
      requests.forEach(r => {
        const key = monthKey(r.createdAt);
        const m = byMonth.get(key) || { month: key, total: 0, approved: 0, rejected: 0, pending: 0 };
        m.total += 1;
        if (r.status === 'approved') m.approved += 1;
        else if (r.status === 'rejected') m.rejected += 1;
        else m.pending += 1;
        byMonth.set(key, m);
      });
      const monthArr = Array.from(byMonth.values());
      // Optional: sort by date where possible
      monthArr.sort((a, b) => {
        const pd = (s) => Date.parse('01 ' + s);
        const da = pd(a.month), db = pd(b.month);
        if (isNaN(da) || isNaN(db)) return 0;
        return da - db;
      });
      setMonthlyData(monthArr);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError(error);
    } finally {
      setLoading(false);
    }
  };

  const pieData = useMemo(() => ([
    { name: 'Approved', value: stats.approvedRequests },
    { name: 'Rejected', value: stats.rejectedRequests },
    { name: 'Pending', value: stats.pendingRequests },
  ]), [stats]);

  const COLORS = ['#10B981', '#EF4444', '#F59E0B'];

  const exportCSV = () => {
    const rows = [
      ['Leave ID', 'Student ID', 'Student Name', 'Status', 'Type', 'Start', 'End', 'Created'],
      ...allRequests.map(r => [
        r.id,
        r.studentId?.id || '-',
        r.studentName || '-',
        r.status,
        r.leaveType || '-',
        (r.startDate?.toDate ? r.startDate.toDate() : (r.startDate ? new Date(r.startDate) : null))?.toISOString() || '-',
        (r.endDate?.toDate ? r.endDate.toDate() : (r.endDate ? new Date(r.endDate) : null))?.toISOString() || '-',
        (r.createdAt?.toDate ? r.createdAt.toDate() : (r.createdAt ? new Date(r.createdAt) : null))?.toISOString() || '-',
      ])
    ];
    const csv = rows.map(r => r.map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leave-report-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const docPdf = new jsPDF();
    docPdf.text('Leave Report', 14, 16);
    let y = 24;
    const header = ['Leave ID', 'Student', 'Status', 'Type', 'From', 'To'];
    docPdf.setFontSize(10);
    docPdf.text(header.join(' | '), 14, y);
    y += 6;
    const maxRows = 30;
    allRequests.slice(0, maxRows).forEach((r) => {
      const row = [
        r.id,
        (r.studentName || r.studentId?.id || '-'),
        r.status,
        r.leaveType || '-',
        ((r.startDate?.toDate ? r.startDate.toDate() : (r.startDate ? new Date(r.startDate) : null))?.toLocaleDateString()) || '-',
        ((r.endDate?.toDate ? r.endDate.toDate() : (r.endDate ? new Date(r.endDate) : null))?.toLocaleDateString()) || '-',
      ].join(' | ');
      docPdf.text(row, 14, y);
      y += 6;
      if (y > 280) {
        docPdf.addPage();
        y = 14;
      }
    });
    docPdf.save(`leave-report-${Date.now()}.pdf`);
  };

  const handleDeleteRequest = async (requestId) => {
    if (window.confirm('Are you sure you want to delete this request?')) {
      try {
        await deleteDoc(doc(db, 'leaveRequests', requestId));
        fetchData();
      } catch (error) {
        console.error('Error deleting request:', error);
      }
    }
  };

  const handleUpdateRequestStatus = async (requestId, newStatus) => {
    try {
      const requestRef = doc(db, 'leaveRequests', requestId);
      await updateDoc(requestRef, {
        status: newStatus,
        lastUpdated: new Date().toISOString()
      });
      fetchData();
    } catch (error) {
      console.error('Error updating request status:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-10 px-6">
        <h1 className="text-2xl font-semibold mb-4">Admin Dashboard</h1>
        <div className="p-4 rounded border border-red-200 bg-red-50 text-red-700">
          <p className="font-medium mb-1">Unable to load data.</p>
          <p className="text-sm">This usually happens when you're not signed in as a real admin user. The local admin backdoor lets you access the page, but Firestore still requires an authenticated user with role "admin" in <code>users/&lt;uid&gt;</code>.</p>
          <ul className="list-disc ml-5 mt-2 text-sm">
            <li>Sign in with an admin email/password that has <code>role: "admin"</code>.</li>
            <li>Or create a user in Auth and a matching document in <code>users</code> with role "admin".</li>
          </ul>
          <button onClick={() => { setLoading(true); setError(null); fetchData(); }} className="mt-3 inline-flex items-center px-3 py-1.5 rounded bg-red-600 text-white text-sm">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <button onClick={() => { setLoading(true); fetchData(); }} className="text-sm px-3 py-2 rounded bg-gray-700 text-white hover:bg-gray-800">Refresh</button>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-bold">{stats.totalRequests}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Total Requests
                    </dt>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-bold">{stats.pendingRequests}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Pending
                    </dt>
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
                    <span className="text-white text-sm font-bold">{stats.approvedRequests}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Approved
                    </dt>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-bold">{stats.rejectedRequests}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Rejected
                    </dt>
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
                    <span className="text-white text-sm font-bold">{stats.totalUsers}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Total Users
                    </dt>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white shadow rounded-lg p-4">
            <h3 className="text-md font-semibold text-gray-800 mb-4">Approvals Breakdown</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie dataKey="value" data={pieData} cx="50%" cy="50%" outerRadius={80} label>
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-white shadow rounded-lg p-4">
            <h3 className="text-md font-semibold text-gray-800 mb-4">Monthly Requests</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="approved" stackId="a" fill="#10B981" name="Approved" />
                  <Bar dataKey="rejected" stackId="a" fill="#EF4444" name="Rejected" />
                  <Bar dataKey="pending" stackId="a" fill="#F59E0B" name="Pending" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Frequent Leave Takers + Exports */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white shadow rounded-lg p-4">
            <h3 className="text-md font-semibold text-gray-800 mb-4">Frequent Leave Takers</h3>
            {topTakers.length === 0 ? (
              <div className="text-sm text-gray-500">No data</div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {topTakers.map(t => (
                  <li key={t.studentId} className="py-2 flex items-center justify-between text-sm">
                    <span className="text-gray-800">{t.studentName}</span>
                    <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800">{t.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="bg-white shadow rounded-lg p-4">
            <h3 className="text-md font-semibold text-gray-800 mb-4">Export Reports</h3>
            <div className="space-x-3">
              <button onClick={exportCSV} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm">Export CSV</button>
              <button onClick={exportPDF} className="bg-gray-700 hover:bg-gray-800 text-white px-3 py-2 rounded text-sm">Export PDF</button>
            </div>
            <p className="text-xs text-gray-500 mt-2">Exports include leave ID, student, status, type, and dates.</p>
          </div>
        </div>

        {/* Users Management */}
        <div className="bg-white shadow overflow-hidden sm:rounded-md mb-8">
          <div className="px-4 py-5 sm:px-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              User Management
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Manage system users and their roles
            </p>
          </div>
          <div className="border-t border-gray-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Department
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {allUsers.slice(0, 10).map((user) => (
                    <tr key={user.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {user.firstName} {user.lastName}
                          </div>
                          <div className="text-sm text-gray-500">{user.email}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {user.department}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* All Requests */}
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <div className="px-4 py-5 sm:px-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              All Leave Requests
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Complete system overview with admin controls
            </p>
          </div>
          <div className="border-t border-gray-200">
            {allRequests.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No requests found</p>
              </div>
            ) : (
              <div className="space-y-4 p-4">
                {allRequests.slice(0, 15).map((request) => (
                  <div key={request.id}>
                    <LeaveRequestCard request={request} />
                    <div className="mt-2 flex items-center justify-end gap-2">
                      {userRole !== 'admin' && (
                        <span className="text-[10px] text-gray-500 mr-2" title="Sign in as an admin to modify or delete">
                          read-only
                        </span>
                      )}
                      <select
                        value={request.status}
                        onChange={(e) => handleUpdateRequestStatus(request.id, e.target.value)}
                        className="text-xs border border-gray-300 rounded px-2 py-1"
                        disabled={userRole !== 'admin'}
                        title={userRole !== 'admin' ? 'Only admins can change status' : 'Change status'}
                      >
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                      </select>
                      <button
                        onClick={() => handleDeleteRequest(request.id)}
                        className={`text-xs px-2 py-1 rounded ${userRole !== 'admin' ? 'bg-gray-300 cursor-not-allowed text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}
                        disabled={userRole !== 'admin'}
                        title={userRole !== 'admin' ? 'Only admins can delete' : 'Delete request'}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                {allRequests.length > 15 && (
                  <div className="text-center py-4">
                    <p className="text-gray-500">Showing 15 of {allRequests.length} requests</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
