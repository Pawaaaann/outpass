import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { functions } from '../../firebase/config';
import { httpsCallable } from 'firebase/functions';

const AdminLogin = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Resolve admin email using callable function (runs with server privileges)
      const resolve = httpsCallable(functions, 'resolveAdminEmail');
      const uname = (username || '').trim().toLowerCase();
      const { data } = await resolve({ username: uname });
      const email = data?.email;
      if (!email) throw new Error('Email not returned');
      await login(email, password);
      // After login, ProtectedRoute on /admin will enforce admin role
      navigate('/admin');
    } catch (e) {
      // Fallback: if functions are not deployed (free plan), try using the input as email directly
      try {
        const uname = (username || '').trim();
        await login(uname, password);
        navigate('/admin');
        return;
      } catch (fallbackErr) {
        const msg = (fallbackErr && fallbackErr.message) ? fallbackErr.message : '';
        if (/auth\/(user-not-found|invalid-email)/.test(msg)) {
          setError('Admin account not found. Use admin email or create an admin user in Firebase Auth.');
        } else if (/auth\/(wrong-password)/.test(msg)) {
          setError('Incorrect password.');
        } else {
          setError('Failed to log in. Please use admin email or contact support.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] relative py-12 px-4 sm:px-6 lg:px-8">
      <div className="absolute top-4 right-4">
        <Link to="/login" className="px-3 py-1.5 text-sm font-medium border rounded-md border-gray-300 text-gray-700 hover:bg-gray-100">Back to Sign in</Link>
      </div>
      <div className="max-w-md w-full mx-auto">
        <div className="bg-white shadow-lg rounded-xl p-8 space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-extrabold text-gray-900">Admin Login</h1>
            <p className="mt-2 text-sm text-gray-600">Sign in with an authorized admin account</p>
          </div>
          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div>
            )}
            <div className="space-y-4">
              <div>
                <label htmlFor="username" className="sr-only">Username or Email</label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  className="block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Admin username or email"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="password" className="sr-only">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2.5 px-4 text-sm font-medium rounded-lg text-white bg-[#2563EB] hover:bg-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#2563EB] disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in as Admin'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
