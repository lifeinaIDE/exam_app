import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useStore } from '../store/useStore';
import { syncLocalSubmissionsToFirestore } from '../utils/syncResults';

export default function Result() {
  const location = useLocation();
  const navigate = useNavigate();
  const clearSession = useStore(state => state.clearSession);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);
  
  const score = location.state?.score;

  const triggerSync = async () => {
    try {
      setSyncing(true);
      const count = await syncLocalSubmissionsToFirestore();
      setSynced(true);
      if (count > 0) {
        toast.success('Your assessment results were successfully synced with the instructor!');
      } else {
        toast.info('Results are up to date on the server.');
      }
    } catch {
      toast.error('Sync failed. Please check internet connection.');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    // Automatically upload candidate submission to Firestore
    triggerSync();
    // Clear in-memory session so they can't go back
    clearSession();
  }, [clearSession]);

  if (score === undefined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-secondaryBg p-4">
        <h1 className="text-3xl font-bold text-error mb-4">Assessment Terminated</h1>
        <p className="text-textSecondary mb-6">Your assessment has been submitted or terminated.</p>
        <button onClick={() => navigate('/')} className="px-6 py-2 bg-primary text-white rounded-lg">Return to Home</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-secondaryBg md:p-8">
      <div className="bg-white p-8 md:rounded-2xl md:shadow-xl w-full max-w-md md:border border-border text-center min-h-screen md:min-h-0 flex flex-col justify-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-primary mb-2">Assessment Completed!</h1>
        <p className="text-textSecondary mb-4">
          Thank you for participating in the Success Squad recruitment process. Your responses have been submitted.
        </p>

        {/* Sync Status Banner */}
        <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center justify-between gap-2 text-left">
          <div className="flex items-center gap-2">
            <span className="text-base">{synced ? '✅' : '⏳'}</span>
            <div>
              <p className="font-bold">{synced ? 'Cloud Sync Completed' : 'Syncing with Server...'}</p>
              <p className="text-[11px] text-blue-700">Answers recorded in central portal</p>
            </div>
          </div>
          <button
            onClick={triggerSync}
            disabled={syncing}
            className="px-2.5 py-1.5 bg-primary hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : 'Re-sync'}
          </button>
        </div>

        <button 
          onClick={() => navigate('/')}
          className="w-full py-3 rounded-lg font-semibold text-white bg-primary hover:bg-blue-700 transition"
        >
          Return to Home
        </button>
      </div>
    </div>
  );
}
