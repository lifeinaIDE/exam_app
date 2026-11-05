import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../config/firebase';

export default function AdminLogin() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const trimmedPass = password.trim();

    // Support master password or admin login
    if (trimmedPass === 'admin123' || trimmedPass === 'admin' || trimmedPass === 'quiz2026') {
      localStorage.setItem('adminToken', 'admin_authenticated_' + Date.now());
      toast.success('Welcome Admin!');
      navigate('/admin/dashboard');
      setLoading(false);
      return;
    }

    // Also attempt Firebase Auth if an email format is entered or as fallback
    try {
      const userCredential = await signInWithEmailAndPassword(auth, 'admin@successsquad.com', trimmedPass);
      const token = await userCredential.user.getIdToken();
      localStorage.setItem('adminToken', token);
      toast.success('Login successful!');
      navigate('/admin/dashboard');
    } catch {
      toast.error('Invalid password. Default admin passcode is: admin123');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-secondaryBg p-4">
      <div className="bg-white p-8 md:p-10 rounded-2xl shadow-xl w-full max-w-md border border-border flex flex-col justify-center">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-blue-50 text-primary rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-primary mb-1">Admin Portal</h1>
          <p className="text-sm text-textSecondary">Enter admin passcode to view assessment scores</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-textPrimary mb-1.5">Admin Passcode</label>
            <input 
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-border focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition text-base"
              placeholder="Enter passcode (default: admin123)"
              autoFocus
              required
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className={`w-full py-3.5 rounded-xl font-semibold text-white transition-all duration-300 ${
              !loading 
                ? 'bg-primary hover:bg-blue-700 shadow-md hover:shadow-lg' 
                : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            {loading ? 'Authenticating...' : 'Sign In to Dashboard'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-textSecondary">
          <a href="/" className="text-primary hover:underline font-medium">← Back to Participant Exam</a>
        </div>
      </div>
    </div>
  );
}
