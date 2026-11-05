import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { collection, getDocs, doc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';

interface CandidateAnswer {
  qNo: number;
  questionId: string;
  questionText: string;
  selectedOpt: number | null;
  selectedText: string;
  correctAnswer: string;
  isCorrect: boolean;
}

interface Candidate {
  id: string;
  fullName: string;
  createdAt: string;
  answers?: CandidateAnswer[];
  session: {
    status: string;
    score: number | null;
    violationsCount: number;
    startTime: string;
    endTime: string | null;
    answers?: CandidateAnswer[];
  } | null;
}

function isTodayOrRecent(dateStr: string): boolean {
  if (!dateStr) return false;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    const now = new Date();
    // Same calendar date (local)
    const isSameDate = (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
    // Or within last 24 hours
    const diffMs = now.getTime() - d.getTime();
    const isWithin24Hours = diffMs >= 0 && diffMs <= 24 * 60 * 60 * 1000;
    return isSameDate || isWithin24Hours;
  } catch {
    return false;
  }
}

export default function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return Boolean(localStorage.getItem('adminToken'));
  });
  const [passcode, setPasscode] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [viewFilter, setViewFilter] = useState<'today' | 'all'>('today');
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const navigate = useNavigate();

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    setFirestoreError(null);
    const resultsMap = new Map<string, Candidate>();

    // 1. Fetch from Firestore candidates collection
    try {
      const candidatesSnap = await getDocs(collection(db, 'candidates'));
      candidatesSnap.forEach(candidateDoc => {
        const data = candidateDoc.data();
        const candId = candidateDoc.id;
        const createdAt = data.createdAt?.toDate 
          ? data.createdAt.toDate().toISOString() 
          : (data.completedAt?.toDate 
              ? data.completedAt.toDate().toISOString() 
              : (data.submittedAt || new Date().toISOString()));

        resultsMap.set(candId, {
          id: candId,
          fullName: data.fullName || 'Anonymous Candidate',
          createdAt,
          answers: data.answers || undefined,
          session: {
            status: data.status || 'IN_PROGRESS',
            score: typeof data.score === 'number' ? data.score : null,
            violationsCount: data.violationsCount || 0,
            startTime: createdAt,
            endTime: data.completedAt?.toDate ? data.completedAt.toDate().toISOString() : (data.submittedAt || null),
            answers: data.answers || undefined
          }
        });
      });
    } catch (err: any) {
      console.warn('Firestore candidates fetch notice:', err?.message);
      if (err?.message?.includes('permission') || err?.code === 'permission-denied') {
        setFirestoreError('Firebase Firestore security rules are currently restricting access. Remote scores cannot sync until rules are updated to allow read/write.');
      }
    }

    // 2. Fetch from Firestore scores collection
    try {
      const scoresSnap = await getDocs(collection(db, 'scores'));
      scoresSnap.forEach(scDoc => {
        const scData = scDoc.data();
        const candId = scData.candidateId || scDoc.id;
        const existing = resultsMap.get(candId);
        const createdAt = scData.submittedAt?.toDate 
          ? scData.submittedAt.toDate().toISOString() 
          : (scData.dateString || new Date().toISOString());

        if (existing && existing.session) {
          if (typeof scData.score === 'number') {
            existing.session.score = scData.score;
            existing.session.status = scData.status || 'COMPLETED';
          }
          if (scData.answers && scData.answers.length > 0) {
            existing.answers = scData.answers;
            existing.session.answers = scData.answers;
          }
        } else if (!existing) {
          resultsMap.set(candId, {
            id: candId,
            fullName: scData.fullName || 'Candidate',
            createdAt,
            answers: scData.answers || undefined,
            session: {
              status: scData.status || 'COMPLETED',
              score: typeof scData.score === 'number' ? scData.score : null,
              violationsCount: scData.violationsCount || 0,
              startTime: createdAt,
              endTime: createdAt,
              answers: scData.answers || undefined
            }
          });
        }
      });
    } catch (err: any) {}

    // 3. Fetch from Firestore sessions collection in bulk
    try {
      const sessionsSnap = await getDocs(collection(db, 'sessions'));
      sessionsSnap.forEach(sDoc => {
        const sData = sDoc.data();
        const candId = sData.candidateId;
        if (candId && resultsMap.has(candId)) {
          const existing = resultsMap.get(candId)!;
          if (existing.session && typeof sData.score === 'number') {
            existing.session.score = sData.score;
            existing.session.status = sData.status || 'COMPLETED';
          }
          if (sData.answers && sData.answers.length > 0) {
            existing.answers = sData.answers;
            if (existing.session) existing.session.answers = sData.answers;
          }
        }
      });
    } catch (err: any) {}

    // 4. Merge all candidate and session records from localStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('candidate_') || key.startsWith('session_'))) {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw);
            const candId = parsed.id || parsed.candidateId;
            if (!candId) continue;

            const sessRaw = localStorage.getItem(`session_${candId}`);
            const parsedSess = sessRaw ? JSON.parse(sessRaw) : null;

            const candScore = typeof parsed.score === 'number' 
              ? parsed.score 
              : (parsedSess && typeof parsedSess.score === 'number' ? parsedSess.score : null);
            const candStatus = parsed.status || (parsedSess ? parsedSess.status : 'IN_PROGRESS');
            const candViolations = parsed.violationsCount || (parsedSess ? parsedSess.violationsCount : 0);
            const candAnswers = parsed.answers || (parsedSess ? parsedSess.answers : undefined);

            if (resultsMap.has(candId)) {
              const existing = resultsMap.get(candId)!;
              if (existing.session) {
                if ((existing.session.score === null || existing.session.score === undefined) && candScore !== null) {
                  existing.session.score = candScore;
                  existing.session.status = candStatus;
                }
                if (!existing.answers && candAnswers) {
                  existing.answers = candAnswers;
                  existing.session.answers = candAnswers;
                }
              }
            } else {
              resultsMap.set(candId, {
                id: candId,
                fullName: parsed.fullName || parsed.candidateName || 'Participant',
                createdAt: parsed.createdAt || (parsedSess?.startTime ? new Date(parsedSess.startTime).toISOString() : new Date().toISOString()),
                answers: candAnswers,
                session: {
                  status: candStatus,
                  score: candScore,
                  violationsCount: candViolations,
                  startTime: parsedSess?.startTime ? new Date(parsedSess.startTime).toISOString() : new Date().toISOString(),
                  endTime: parsedSess?.endTime || null,
                  answers: candAnswers
                }
              });
            }
          } catch {}
        }
      }
    } catch {}

    // Convert map to array and sort: NEWEST SUBMISSIONS FIRST (today at the top)
    const sorted = Array.from(resultsMap.values()).sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    setCandidates(sorted);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchCandidates();
    }
  }, [isAuthenticated, fetchCandidates]);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = passcode.trim();
    if (clean === 'admin123' || clean === 'admin' || clean === 'quiz2026') {
      localStorage.setItem('adminToken', 'admin_authenticated_' + Date.now());
      setIsAuthenticated(true);
      toast.success('Admin access granted!');
    } else {
      toast.error('Incorrect passcode. Default passcode is: admin123');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    setIsAuthenticated(false);
    navigate('/');
  };

  const handleDeleteCandidate = async (candidateId: string, fullName: string) => {
    if (!window.confirm(`Are you sure you want to remove ${fullName} from the dashboard?`)) {
      return;
    }

    try {
      // Remove from Firestore
      try {
        await deleteDoc(doc(db, 'candidates', candidateId));
      } catch {}
      try {
        await deleteDoc(doc(db, 'scores', candidateId));
      } catch {}

      // Remove from localStorage
      localStorage.removeItem(`candidate_${candidateId}`);
      localStorage.removeItem(`session_${candidateId}`);

      setCandidates(prev => prev.filter(c => c.id !== candidateId));
      toast.success(`Removed ${fullName}`);
    } catch (err: any) {
      toast.error('Failed to delete: ' + err.message);
    }
  };

  const handleClearOldCandidates = async () => {
    const oldCandidates = candidates.filter(c => !isTodayOrRecent(c.createdAt));
    if (oldCandidates.length === 0) {
      toast.info('No old candidates from previous dates to clear.');
      return;
    }

    if (!window.confirm(`Clear ${oldCandidates.length} old submissions from previous dates (August 2026)? Today's submissions will be kept safe.`)) {
      return;
    }

    setLoading(true);
    for (const c of oldCandidates) {
      try {
        await deleteDoc(doc(db, 'candidates', c.id));
      } catch {}
      try {
        await deleteDoc(doc(db, 'scores', c.id));
      } catch {}
      try {
        const sessSnap = await getDocs(query(collection(db, 'sessions'), where('candidateId', '==', c.id)));
        for (const sDoc of sessSnap.docs) {
          await deleteDoc(doc(db, 'sessions', sDoc.id));
        }
      } catch {}
      localStorage.removeItem(`candidate_${c.id}`);
      localStorage.removeItem(`session_${c.id}`);
    }

    setCandidates(prev => prev.filter(c => isTodayOrRecent(c.createdAt)));
    setLoading(false);
    toast.success('Old test submissions purged successfully!');
  };

  const handleExportCSV = () => {
    const dataToExport = displayedCandidates;
    if (dataToExport.length === 0) {
      toast.info('No candidate data to export');
      return;
    }

    const headers = ['Candidate ID', 'Participant Name', 'Date', 'Status', 'Violations', 'Score (out of 40)'];
    const rows = dataToExport.map(c => [
      c.id,
      `"${c.fullName.replace(/"/g, '""')}"`,
      new Date(c.createdAt).toLocaleString(),
      c.session ? c.session.status : 'NOT STARTED',
      c.session ? c.session.violationsCount : 0,
      c.session?.score !== null && c.session?.score !== undefined ? c.session.score : 'N/A'
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `assessment_results_${viewFilter}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Scores exported to CSV successfully!');
  };

  // Filter candidates by today vs all, and by search term
  const todayCandidates = candidates.filter(c => isTodayOrRecent(c.createdAt));
  const displayedCandidates = (viewFilter === 'today' ? todayCandidates : candidates).filter(c =>
    (c.fullName || '').toLowerCase().includes(search.toLowerCase())
  );

  const completedCount = displayedCandidates.filter(c => c.session?.status === 'COMPLETED').length;
  const completedWithScore = displayedCandidates.filter(c => c.session && typeof c.session.score === 'number');
  const avgScore = completedWithScore.length > 0
    ? (completedWithScore.reduce((acc, c) => acc + (c.session?.score || 0), 0) / completedWithScore.length).toFixed(1)
    : '0';

  // If not authenticated, show passcode unlock screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-secondaryBg p-4 font-sans">
        <div className="bg-white p-8 md:p-10 rounded-2xl shadow-xl w-full max-w-md border border-border flex flex-col justify-center">
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-blue-50 text-primary rounded-xl flex items-center justify-center mx-auto mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-primary mb-1">Admin Portal</h1>
            <p className="text-sm text-textSecondary">Enter admin passcode to unlock assessment results</p>
          </div>

          <form onSubmit={handleUnlock} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-textPrimary mb-1.5">Admin Passcode</label>
              <input 
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-border focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition text-base"
                placeholder="Enter passcode (default: admin123)"
                autoFocus
                required
              />
            </div>

            <button 
              type="submit" 
              className="w-full py-3.5 rounded-xl font-semibold text-white bg-primary hover:bg-blue-700 shadow-md hover:shadow-lg transition-all duration-300"
            >
              Unlock Dashboard
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-textSecondary">
            <Link to="/" className="text-primary hover:underline font-medium">← Back to Participant Exam</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondaryBg flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="bg-white border-b border-border px-4 md:px-8 py-4 flex flex-col md:flex-row justify-between items-center gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary text-white rounded-lg flex items-center justify-center font-bold text-lg shadow-sm">
            SS
          </div>
          <div>
            <h1 className="text-xl font-bold text-textPrimary leading-tight">Success Squad Assessment Admin</h1>
            <p className="text-xs text-textSecondary">Participant Scores & Detailed Answers Portal</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full md:w-auto justify-end">
          <button 
            onClick={fetchCandidates}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-textPrimary rounded-lg text-sm font-semibold transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-4 py-2 bg-success text-white hover:bg-green-700 rounded-lg text-sm font-semibold shadow-sm transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export CSV
          </button>

          {candidates.some(c => !isTodayOrRecent(c.createdAt)) && (
            <button 
              onClick={handleClearOldCandidates}
              className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-error border border-red-200 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
              title="Purge past testing data from August"
            >
              🗑️ Clear Old Tests ({candidates.filter(c => !isTodayOrRecent(c.createdAt)).length})
            </button>
          )}

          <button 
            onClick={handleLogout}
            className="px-4 py-2 bg-error hover:bg-red-700 text-white rounded-lg text-sm font-semibold shadow-sm transition"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
        {/* Firestore Notice Banner if permissions blocked */}
        {firestoreError && (
          <div className="mb-6 bg-amber-50 border-2 border-amber-300 rounded-xl p-4 text-amber-900 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div className="flex-1 text-sm">
                <p className="font-bold text-amber-950 mb-1">Firebase Security Rules Notice</p>
                <p className="mb-2 text-amber-800">
                  {firestoreError}
                </p>
                <div className="bg-amber-100 p-2.5 rounded-lg font-mono text-xs text-amber-950 mb-2 border border-amber-200">
                  allow read, write: if true;
                </div>
                <a 
                  href="https://console.firebase.google.com/project/exam-app-ccc1c/firestore/rules" 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-bold text-primary hover:underline text-xs"
                >
                  Open Firebase Rules Console to Publish Update →
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-5 rounded-xl border border-border shadow-sm">
            <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">
              {viewFilter === 'today' ? "Today's Participants" : "Total Participants"}
            </p>
            <p className="text-3xl font-extrabold text-primary">{displayedCandidates.length}</p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-border shadow-sm">
            <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">
              Completed Exams
            </p>
            <p className="text-3xl font-extrabold text-success">{completedCount}</p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-border shadow-sm">
            <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">
              Average Score
            </p>
            <p className="text-3xl font-extrabold text-textPrimary">{avgScore} <span className="text-sm font-normal text-textSecondary">/ 40</span></p>
          </div>
        </div>

        {/* Filter Navigation Tabs */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="inline-flex bg-gray-200/80 p-1 rounded-xl">
            <button
              onClick={() => setViewFilter('today')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
                viewFilter === 'today' 
                  ? 'bg-white text-primary shadow-sm' 
                  : 'text-gray-600 hover:text-textPrimary'
              }`}
            >
              📅 Today's Submissions ({todayCandidates.length})
            </button>
            <button
              onClick={() => setViewFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
                viewFilter === 'all' 
                  ? 'bg-white text-primary shadow-sm' 
                  : 'text-gray-600 hover:text-textPrimary'
              }`}
            >
              🌐 All Submissions ({candidates.length})
            </button>
          </div>

          <div className="w-full sm:w-72">
            <input 
              type="text" 
              placeholder="Search candidate name..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-4 py-2 text-sm rounded-lg border border-border focus:ring-2 focus:ring-primary outline-none transition bg-white"
            />
          </div>
        </div>

        {/* Table Container */}
        <div className="bg-white rounded-xl shadow-sm border border-border flex flex-col overflow-hidden">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex justify-center items-center h-48 text-textSecondary font-medium">Loading Candidates...</div>
            ) : displayedCandidates.length === 0 ? (
              <div className="text-center py-16 text-textSecondary">
                <p className="text-lg font-bold text-textPrimary mb-1">
                  {viewFilter === 'today' ? "No submissions recorded today yet" : "No candidates found"}
                </p>
                <p className="text-sm max-w-md mx-auto">
                  {viewFilter === 'today' && candidates.length > 0 ? (
                    <span>
                      There are {candidates.length} past submissions recorded. Click on <button onClick={() => setViewFilter('all')} className="text-primary font-bold underline">All Submissions</button> to view them.
                    </span>
                  ) : (
                    "When participants complete their assessment, their scores and answers will show up here instantly."
                  )}
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-100 text-textSecondary uppercase text-xs tracking-wider">
                  <tr>
                    <th className="p-4 font-bold">#</th>
                    <th className="p-4 font-bold">Participant Name</th>
                    <th className="p-4 font-bold">Date & Time</th>
                    <th className="p-4 font-bold text-center">Status</th>
                    <th className="p-4 font-bold text-center">Violations</th>
                    <th className="p-4 font-bold text-center">Score (out of 40)</th>
                    <th className="p-4 font-bold text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {displayedCandidates.map((c, idx) => {
                    const scoreVal = c.session?.score;
                    const hasScore = typeof scoreVal === 'number';
                    const hasAnswers = (c.answers && c.answers.length > 0) || (c.session?.answers && c.session.answers.length > 0);

                    return (
                      <tr key={c.id} className="hover:bg-blue-50/40 transition">
                        <td className="p-4 text-textSecondary font-medium">{idx + 1}</td>
                        <td className="p-4">
                          <span className="font-bold text-textPrimary text-base">{c.fullName}</span>
                          <div className="text-xs text-textSecondary font-mono">{c.id}</div>
                        </td>
                        <td className="p-4 text-textSecondary text-xs">
                          {new Date(c.createdAt).toLocaleString()}
                        </td>
                        <td className="p-4 text-center">
                          {!c.session ? (
                            <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-semibold">NOT STARTED</span>
                          ) : c.session.status === 'IN_PROGRESS' ? (
                            <span className="px-2.5 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-semibold">IN PROGRESS</span>
                          ) : c.session.status === 'TERMINATED' ? (
                            <span className="px-2.5 py-1 bg-red-100 text-red-800 rounded-full text-xs font-semibold">TERMINATED</span>
                          ) : (
                            <span className="px-2.5 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">COMPLETED</span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          <span className={`font-semibold ${c.session && c.session.violationsCount > 0 ? 'text-error' : 'text-gray-500'}`}>
                            {c.session ? c.session.violationsCount : 0}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          {hasScore ? (
                            <span className="inline-flex items-center gap-1 font-extrabold text-lg text-primary bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
                              {scoreVal} <span className="text-xs font-normal text-textSecondary">/ 40</span>
                            </span>
                          ) : (
                            <span className="text-gray-400 font-medium">Pending</span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {hasAnswers && (
                              <button
                                onClick={() => setSelectedCandidate(c)}
                                className="px-3 py-1.5 bg-primary/10 hover:bg-primary text-primary hover:text-white rounded-lg text-xs font-bold transition flex items-center gap-1"
                              >
                                👁️ View Answers
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteCandidate(c.id, c.fullName)}
                              className="p-1.5 text-gray-400 hover:text-error rounded-md transition"
                              title="Delete candidate record"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>

      {/* Answers Detail Modal */}
      {selectedCandidate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 md:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in">
            {/* Modal Header */}
            <div className="p-5 border-b border-border bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-textPrimary">{selectedCandidate.fullName} — Answers Sheet</h3>
                <p className="text-xs text-textSecondary">
                  Score: <strong className="text-primary">{selectedCandidate.session?.score ?? 'N/A'} / 40</strong> • 
                  Submitted: {new Date(selectedCandidate.createdAt).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => setSelectedCandidate(null)}
                className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-textSecondary font-bold transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
              {(() => {
                const ans = selectedCandidate.answers || selectedCandidate.session?.answers || [];
                if (ans.length === 0) {
                  return (
                    <div className="text-center py-10 text-textSecondary">
                      No question-level answer breakdown recorded for this candidate.
                    </div>
                  );
                }

                return ans.map((item, i) => (
                  <div 
                    key={i}
                    className={`p-4 rounded-xl border-2 transition ${
                      item.isCorrect 
                        ? 'border-green-200 bg-green-50/40' 
                        : item.selectedOpt === null 
                          ? 'border-gray-200 bg-gray-50' 
                          : 'border-red-200 bg-red-50/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <span className="font-bold text-xs uppercase px-2 py-0.5 rounded bg-white border border-border">
                        Q{item.qNo || (i + 1)}
                      </span>
                      {item.isCorrect ? (
                        <span className="text-xs font-bold text-success flex items-center gap-1 bg-green-100 px-2 py-0.5 rounded-full">
                          ✓ Correct (+1)
                        </span>
                      ) : item.selectedOpt === null ? (
                        <span className="text-xs font-bold text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                          Unanswered (0)
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-error flex items-center gap-1 bg-red-100 px-2 py-0.5 rounded-full">
                          ✗ Incorrect (0)
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-textPrimary text-sm mb-3">
                      {item.questionText}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded bg-white border border-border">
                        <span className="text-textSecondary block font-medium">Candidate's Choice:</span>
                        <span className={`font-bold ${item.isCorrect ? 'text-success' : 'text-error'}`}>
                          {item.selectedText || 'Unanswered'}
                        </span>
                      </div>
                      <div className="p-2 rounded bg-white border border-border">
                        <span className="text-textSecondary block font-medium">Correct Answer:</span>
                        <span className="font-bold text-success">{item.correctAnswer}</span>
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border bg-gray-50 flex justify-end">
              <button
                onClick={() => setSelectedCandidate(null)}
                className="px-5 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition"
              >
                Close Sheet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
