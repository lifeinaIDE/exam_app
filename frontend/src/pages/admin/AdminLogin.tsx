import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../config/firebase';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // Store token (Firebase handles its own tokens, but we can store a flag or token if needed by logic)
      const token = await userCredential.user.getIdToken();
      localStorage.setItem('adminToken', token);
      
      toast.success('Login successful!');
      navigate('/admin/dashboard');
    } catch (error: any) {
      toast.error(error.message || 'Login failed. Invalid credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-secondaryBg md:p-4">
      <div className="bg-white p-8 md:rounded-2xl md:shadow-xl w-full max-w-md md:border border-border min-h-screen md:min-h-0 flex flex-col justify-center">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-primary mb-2">Admin Portal</h1>
          <p className="text-textSecondary">Sign in to manage the assessment</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-1">Email</label>
            <input 
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-border focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
              placeholder="Enter email"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-textPrimary mb-1">Password</label>
            <input 
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-border focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
              placeholder="Enter password"
              required
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className={`w-full py-3 rounded-lg font-semibold text-white transition-all duration-300 ${
              !loading 
                ? 'bg-primary hover:bg-blue-700 shadow-md hover:shadow-lg' 
                : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
