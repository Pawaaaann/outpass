import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, db } from '../../firebase/config';
import { ensureAdminAccount, getUserRole } from '../../firebase/ensureAdmin';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Admin modal state
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  // Register number is no longer collected during login
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      const cred = await login(email, password);
      navigate('/dashboard');
    } catch (error) {
      setError('Failed to log in. Please check your credentials.');
    }
    
    setLoading(false);
  };

  const handleAdminSignIn = async (e) => {
    e.preventDefault();
    setAdminError('');
    const isLocalAdmin = (adminUsername || '').trim().toLowerCase() === 'admin' && adminPassword === 'admin1234';
    if (!isLocalAdmin) {
      setAdminError('Invalid Admin Credentials');
      return;
    }
    try {
      // Ensure admin account exists and users/{uid} has role=admin
      const { user } = await ensureAdminAccount(auth, db);
      const role = await getUserRole(db, user.uid);
      if (role !== 'admin') {
        await signOut(auth);
        setAdminError('You are not authorized as admin.');
        return;
      }
      try {
        window.localStorage.setItem('admin_auth', 'true');
        window.localStorage.setItem('role', 'admin');
      } catch {}
      setShowAdmin(false);
      navigate('/admin-dashboard');
    } catch (err) {
      console.error('Admin Firebase sign-in failed', err);
      setAdminError('Invalid Admin Credentials');
    }
  };

  const handleGoogle = async () => {
    try {
      setError('');
      setLoading(true);
      await loginWithGoogle();
      navigate('/dashboard');
    } catch (e) {
      setError('Google sign-in failed.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] relative py-12 px-4 sm:px-6 lg:px-8">

      {/* Admin Login Button */}
      <div className="absolute top-4 right-4">
        <button
          type="button"
          onClick={() => { setShowAdmin(true); setAdminError(''); }}
          className="px-2.5 py-1 text-xs sm:text-sm font-medium border rounded-md border-gray-300 text-gray-700 bg-white hover:bg-gray-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500"
        >
          Admin Login
        </button>
      </div>

      <div className="max-w-md w-full mx-auto">
        <div className="bg-white shadow-lg rounded-xl p-8 space-y-6">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold text-gray-900">LeaveEasy</h1>
            <p className="mt-2 text-sm text-gray-600">Streamlined leave management for educational institutions</p>
          </div>

          {/* Router error (e.g., from admin guard) */}
          {location?.state?.adminError && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded mb-3 text-sm">
              {location.state.adminError}
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="sr-only">Email</label>
                <input
                  id="email"
                  name="email"
                  type="text"
                  autoComplete="username"
                  required
                  className="block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-500"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="password" className="sr-only">Password</label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    className="block w-full pr-10 px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-500"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-gray-700 focus:outline-none"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9.27-3.11-11-8 0-1.21.32-2.35.9-3.33" />
                        <path d="M3 3l18 18" />
                        <path d="M10.58 10.58a3 3 0 0 0 4.24 4.24" />
                        <path d="M9.88 4.12A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8-.45 1.23-1.1 2.36-1.9 3.33" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 text-sm font-medium rounded-lg text-white bg-[#2563EB] hover:bg-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#2563EB] disabled:opacity-50"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </div>

            <div className="flex items-center my-2">
              <div className="flex-grow border-t border-gray-200" />
              <span className="mx-2 text-gray-400 text-sm">OR</span>
              <div className="flex-grow border-t border-gray-200" />
            </div>

            <button
              type="button"
              onClick={handleGoogle}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <img alt="Google" src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" />
              Continue with Google
            </button>

            <div className="text-center">
              <span className="text-sm text-gray-600">
                Don't have an account?{' '}
                <Link to="/signup" className="font-medium text-[#2563EB] hover:text-[#1D4ED8]">Sign up</Link>
              </span>
            </div>
          </form>
        </div>
      </div>
      {/* Admin Modal */}
      {showAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 sm:p-6">
          <div className="bg-white w-full max-w-md rounded-xl shadow-2xl ring-1 ring-black/5">
            <div className="flex items-center justify-between px-5 sm:px-6 pt-5 sm:pt-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Admin Login</h3>
                <p className="mt-0.5 text-xs text-gray-500">Use your admin credentials to continue</p>
              </div>
              <button onClick={() => setShowAdmin(false)} className="text-gray-500 hover:text-gray-700 p-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500">
                <span className="sr-only">Close</span>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-5 sm:px-6 pb-5 sm:pb-6">
              {adminError && (
                <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{adminError}</div>
              )}
              <form className="space-y-4" onSubmit={handleAdminSignIn}>
                <div>
                  <label htmlFor="admin-username" className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                  <input
                    id="admin-username"
                    type="text"
                    placeholder="admin"
                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="admin-password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <div className="relative">
                    <input
                      id="admin-password"
                      type={showAdminPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className="block w-full pr-10 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPassword(v => !v)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-gray-700 focus:outline-none"
                      aria-label={showAdminPassword ? 'Hide password' : 'Show password'}
                      title={showAdminPassword ? 'Hide password' : 'Show password'}
                    >
                      {showAdminPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9.27-3.11-11-8 0-1.21.32-2.35.9-3.33" />
                          <path d="M3 3l18 18" />
                          <path d="M10.58 10.58a3 3 0 0 0 4.24 4.24" />
                          <path d="M9.88 4.12A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8-.45 1.23-1.1 2.36-1.9 3.33" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full flex justify-center py-2.5 px-4 text-sm font-medium rounded-lg text-white bg-[#2563EB] hover:bg-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#2563EB]"
                >
                  Sign in as Admin
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
