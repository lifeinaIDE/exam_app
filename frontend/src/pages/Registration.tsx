import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useStore } from '../store/useStore';

export default function Registration() {
  const navigate = useNavigate();
  const { setCandidateId, setCandidateName, clearSession } = useStore();
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      toast.error('Please enter your full name');
      return;
    }

    if (trimmedName.length < 2) {
      toast.warning('Please enter a valid name (at least 2 characters)');
      return;
    }

    try {
      setLoading(true);
      clearSession();

      let candidateRefId = `cand_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // Attempt to save to Firestore candidates collection
      try {
        const docRef = await addDoc(collection(db, 'candidates'), {
          fullName: trimmedName,
          createdAt: serverTimestamp()
        });
        candidateRefId = docRef.id;
      } catch (err: any) {
        console.warn('Firestore candidate write notice (using local candidate ID):', err?.message);
      }

      setCandidateId(candidateRefId);
      setCandidateName(trimmedName);

      // Save to localStorage as well
      localStorage.setItem(`candidate_${candidateRefId}`, JSON.stringify({
        id: candidateRefId,
        fullName: trimmedName,
        createdAt: new Date().toISOString()
      }));

      navigate('/assessment');
    } catch (error: any) {
      console.error('Error starting assessment:', error);
      toast.error(error.message || 'Something went wrong!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-secondaryBg p-4 md:p-8">
      {/* Top right admin shortcut */}
      <Link 
        to="/admin" 
        className="fixed top-4 right-4 z-50 inline-flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-gray-50 border border-border text-xs font-semibold text-textSecondary hover:text-primary rounded-lg shadow-sm transition"
      >
        <span>🔒</span>
      </Link>

      <div className="bg-white py-10 px-6 md:p-10 md:rounded-2xl md:shadow-xl w-full max-w-lg md:border border-border flex flex-col justify-center">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-50 text-primary rounded-2xl mb-4 shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-primary mb-2">Success Squad Assessment</h1>
          <p className="text-sm md:text-base text-textSecondary">Enter your name to begin your assessment.</p>
        </div>

        {/* Info Badges */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="flex items-center gap-2 p-3 bg-secondaryBg rounded-xl border border-border">
            <span className="text-xl">📝</span>
            <div className="text-xs">
              <p className="font-semibold text-textPrimary">40 Questions</p>
              <p className="text-textSecondary">Randomized pool</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 bg-secondaryBg rounded-xl border border-border">
            <span className="text-xl">⏱️</span>
            <div className="text-xs">
              <p className="font-semibold text-textPrimary">45 Minutes</p>
              <p className="text-textSecondary">Timed assessment</p>
            </div>
          </div>
        </div>

        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-textPrimary mb-2">
              Participant Name *
            </label>
            <input 
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
              autoFocus
              required
              className="w-full px-4 py-3 rounded-xl border-2 border-border focus:ring-2 focus:ring-primary focus:border-primary outline-none transition text-base"
            />
          </div>

          <div className="text-xs text-textSecondary bg-gray-50 p-3 rounded-lg border border-border leading-relaxed">
            ⚠️ <strong>Important:</strong> Please ensure a stable internet connection. Switching tabs or minimizing the browser will be flagged by the anti-cheating monitor.
          </div>

          <button 
            type="submit" 
            disabled={!fullName.trim() || loading}
            className={`w-full py-3.5 rounded-xl font-semibold text-white transition-all duration-300 flex items-center justify-center gap-2 shadow-md ${
              fullName.trim() && !loading 
                ? 'bg-primary hover:bg-blue-700 hover:shadow-lg' 
                : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            {loading ? (
              <span>Starting Assessment...</span>
            ) : (
              <>
                <span>Next</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link to="/admin" className="text-xs text-textSecondary hover:text-primary transition underline font-medium">
            Go to Admin & Scores Portal →
          </Link>
        </div>
      </div>
    </div>
  );
}
