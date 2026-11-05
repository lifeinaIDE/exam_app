import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { collection, query, orderBy, getDocs, where } from 'firebase/firestore';
import { db } from '../../config/firebase';

interface Candidate {
  id: string;
  fullName: string;
  createdAt: string;
  session: {
    status: string;
    score: number | null;
    violationsCount: number;
    startTime: string;
    endTime: string | null;
  } | null;
}

export default function AdminDashboard() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    const results: Candidate[] = [];

    // 1. Attempt to fetch from Firestore
    try {
      const candidatesSnap = await getDocs(query(collection(db, 'candidates'), orderBy('createdAt', 'desc')));
      for (const candidateDoc of candidatesSnap.docs) {
        const data = candidateDoc.data();
        let sessionData = null;

        try {
          const sessionsSnap = await getDocs(query(collection(db, 'sessions'), where('candidateId', '==', candidateDoc.id)));
          if (!sessionsSnap.empty) {
            const sDoc = sessionsSnap.docs[0].data();
            sessionData = {
              status: sDoc.status || 'IN_PROGRESS',
              score: sDoc.score !== undefined ? sDoc.score : null,
              violationsCount: sDoc.violationsCount || 0,
              startTime: sDoc.startTime?.toDate ? sDoc.startTime.toDate().toISOString() : new Date().toISOString(),
              endTime: sDoc.endTime?.toDate ? sDoc.endTime.toDate().toISOString() : null
            };
          }
        } catch {}

        const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString();
        results.push({
          id: candidateDoc.id,
          fullName: data.fullName || 'Anonymous Candidate',
          createdAt,
          session: sessionData
        });
      }
    } catch (err: any) {
      console.warn('Firestore fetch notice:', err?.message);
    }

    // 2. Also aggregate from localStorage if any candidates took the exam locally
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('candidate_')) {
          const cand = JSON.parse(localStorage.getItem(key) || '{}');
          if (cand.id && !results.some(r => r.id === cand.id)) {
            const sessRaw = localStorage.getItem(`session_${cand.id}`);
            let sessionData = null;
            if (sessRaw) {
              const sess = JSON.parse(sessRaw);
              sessionData = {
                status: sess.status || 'IN_PROGRESS',
                score: sess.score !== undefined ? sess.score : null,
                violationsCount: sess.violationsCount || 0,
                startTime: sess.startTime ? new Date(sess.startTime).toISOString() : new Date().toISOString(),
                endTime: sess.endTime || null
              };
            }
            results.push({
              id: cand.id,
              fullName: cand.fullName || 'Anonymous Candidate',
              createdAt: cand.createdAt || new Date().toISOString(),
              session: sessionData
            });
          }
        }
      }
    } catch {}

    setCandidates(results);
    setLoading(false);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) {
      navigate('/admin/login');
      return;
    }
    fetchCandidates();
  }, [navigate, fetchCandidates]);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    navigate('/admin/login');
  };

  const handleExportCSV = () => {
    if (candidates.length === 0) {
      toast.info('No candidate data to export');
      return;
    }

    const headers = ['Candidate ID', 'Participant Name', 'Date', 'Status', 'Violations', 'Score (out of 40)'];
    const rows = candidates.map(c => [
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
    link.setAttribute('download', `assessment_results_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Scores exported to CSV successfully!');
  };

  const filteredCandidates = candidates.filter(c => 
    (c.fullName || '').toLowerCase().includes(search.toLowerCase())
  );

  const completedCount = candidates.filter(c => c.session?.status === 'COMPLETED').length;
  const completedWithScore = candidates.filter(c => c.session?.status === 'COMPLETED' && typeof c.session.score === 'number');
  const avgScore = completedWithScore.length > 0
    ? (completedWithScore.reduce((acc, c) => acc + (c.session?.score || 0), 0) / completedWithScore.length).toFixed(1)
    : '0';

  return (
    <div className="min-h-screen bg-secondaryBg flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="bg-white border-b border-border px-4 md:px-8 py-4 flex flex-col md:flex-row justify-between items-center gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary text-white rounded-lg flex items-center justify-center font-bold text-lg">
            SS
          </div>
          <div>
            <h1 className="text-xl font-bold text-textPrimary leading-tight">Success Squad Assessment Admin</h1>
            <p className="text-xs text-textSecondary">Participant Scores & Activity Portal</p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto justify-end">
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
        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-5 rounded-xl border border-border shadow-sm">
            <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Total Participants</p>
            <p className="text-3xl font-extrabold text-primary">{candidates.length}</p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-border shadow-sm">
            <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Completed Exams</p>
            <p className="text-3xl font-extrabold text-success">{completedCount}</p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-border shadow-sm">
            <p className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Average Score</p>
            <p className="text-3xl font-extrabold text-textPrimary">{avgScore} <span className="text-sm font-normal text-textSecondary">/ 40</span></p>
          </div>
        </div>

        {/* Table Container */}
        <div className="bg-white rounded-xl shadow-sm border border-border flex flex-col overflow-hidden">
          
          {/* Filter Bar */}
          <div className="p-4 border-b border-border flex flex-col sm:flex-row justify-between items-center gap-3 bg-gray-50">
            <h2 className="font-bold text-textPrimary text-base">Participants List ({filteredCandidates.length})</h2>
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

          {/* Table */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex justify-center items-center h-48 text-textSecondary font-medium">Loading Candidates...</div>
            ) : filteredCandidates.length === 0 ? (
              <div className="text-center py-12 text-textSecondary">
                <p className="text-base font-semibold">No candidates recorded yet</p>
                <p className="text-xs mt-1">Once participants take the assessment, their scores will appear here immediately.</p>
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {filteredCandidates.map((c, idx) => (
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
                        {c.session?.score !== null && c.session?.score !== undefined ? (
                          <span className="font-extrabold text-lg text-primary bg-blue-50 px-3 py-1 rounded-lg border border-blue-100">
                            {c.session.score} <span className="text-xs font-normal text-textSecondary">/ 40</span>
                          </span>
                        ) : (
                          <span className="text-textSecondary">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
