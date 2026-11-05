import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { collection, query, orderBy, getDocs, doc, getDoc, where } from 'firebase/firestore';
import { db } from '../../config/firebase';

interface Candidate {
  id: string;
  fullName: string;
  email: string;
  mobileNumber: string;
  college: string;
  branch: string;
  createdAt: string;
  domains: { domain: { name: string } }[];
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

  const fetchCandidates = async () => {
    setLoading(true);
    try {
      const candidatesSnap = await getDocs(query(collection(db, 'candidates'), orderBy('createdAt', 'desc')));
      const candidatesData = [];
      
      for (const candidateDoc of candidatesSnap.docs) {
        const data = candidateDoc.data();
        
        const domainDetails = [];
        if (data.domainIds && Array.isArray(data.domainIds)) {
          for (const domainId of data.domainIds) {
            const dSnap = await getDoc(doc(db, 'domains', domainId));
            if (dSnap.exists()) {
              domainDetails.push({ domainId, domain: { id: domainId, ...dSnap.data() } });
            }
          }
        }

        const sessionsSnap = await getDocs(query(collection(db, 'sessions'), where('candidateId', '==', candidateDoc.id)));
        const session = !sessionsSnap.empty ? { id: sessionsSnap.docs[0].id, ...sessionsSnap.docs[0].data() } : null;

        // Convert Timestamp to ISO string if needed, or just handle it below.
        const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString();

        candidatesData.push({
          id: candidateDoc.id,
          ...data,
          createdAt,
          domains: domainDetails,
          session
        });
      }
      setCandidates(candidatesData as any);
    } catch (error: any) {
      if (error.code === 'permission-denied') {
        toast.error('Session expired or permission denied. Please login again.');
        localStorage.removeItem('adminToken');
        navigate('/admin/login');
      } else {
        toast.error('Failed to fetch candidates: ' + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) {
      navigate('/admin/login');
      return;
    }
    fetchCandidates();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    navigate('/admin/login');
  };

  const filteredCandidates = candidates.filter(c => 
    (c.fullName || '').toLowerCase().includes(search.toLowerCase()) || 
    (c.email || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-secondaryBg flex flex-col">
      {/* Navbar */}
      <header className="bg-white border-b border-border p-4 md:px-8 flex flex-col md:flex-row justify-between items-center gap-4 md:gap-0 shadow-sm">
        <h1 className="text-xl md:text-2xl font-bold text-primary">Success Squad Admin</h1>
        <div className="flex w-full md:w-auto justify-between md:justify-start gap-2 md:gap-4">
          <button 
            onClick={fetchCandidates}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-textPrimary rounded-lg font-medium transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            Refresh
          </button>
          <button 
            onClick={handleLogout}
            className="px-4 py-2 bg-error hover:bg-red-700 text-white rounded-lg font-medium transition shadow-sm"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-2 md:p-8">
        <div className="bg-white rounded-xl shadow-md border border-border flex flex-col h-full overflow-hidden">
          
          {/* Toolbar */}
          <div className="p-4 border-b border-border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50">
            <h2 className="text-lg font-bold text-textPrimary">Candidates List ({filteredCandidates.length})</h2>
            <div className="relative w-full md:w-72">
              <input 
                type="text" 
                placeholder="Search by name or email..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-border focus:ring-2 focus:ring-primary outline-none transition"
              />
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex justify-center items-center h-64 text-textSecondary font-medium">Loading Candidates...</div>
            ) : (
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead className="bg-gray-100 text-textSecondary sticky top-0 shadow-sm z-10">
                  <tr>
                    <th className="p-4 font-semibold text-sm">Candidate</th>
                    <th className="p-4 font-semibold text-sm">Contact</th>
                    <th className="p-4 font-semibold text-sm">Education</th>
                    <th className="p-4 font-semibold text-sm">Domains</th>
                    <th className="p-4 font-semibold text-sm text-center">Status</th>
                    <th className="p-4 font-semibold text-sm text-center">Violations</th>
                    <th className="p-4 font-semibold text-sm text-center">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredCandidates.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-textSecondary">No candidates found.</td>
                    </tr>
                  ) : (
                    filteredCandidates.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50 transition">
                        <td className="p-4">
                          <div className="font-bold text-textPrimary">{c.fullName}</div>
                          <div className="text-xs text-textSecondary">{new Date(c.createdAt).toLocaleDateString()}</div>
                        </td>
                        <td className="p-4">
                          <div className="text-sm text-textPrimary">{c.email || '-'}</div>
                          <div className="text-xs text-textSecondary">{c.mobileNumber || '-'}</div>
                        </td>
                        <td className="p-4">
                          <div className="text-sm text-textPrimary truncate max-w-[150px]" title={c.college || '-'}>{c.college || '-'}</div>
                          <div className="text-xs text-textSecondary truncate max-w-[150px]" title={c.branch || '-'}>{c.branch || '-'}</div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-1">
                            {(c.domains && c.domains.length > 0) ? (
                              c.domains.map((d, i) => (
                                <span key={i} className="px-2 py-1 bg-blue-100 text-blue-800 text-[10px] font-bold rounded-full whitespace-nowrap">
                                  {d.domain?.name?.replace(' Team', '') || 'Domain'}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-textSecondary">-</span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          {!c.session ? (
                            <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-bold">NOT STARTED</span>
                          ) : c.session.status === 'IN_PROGRESS' ? (
                            <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold">IN PROGRESS</span>
                          ) : c.session.status === 'TERMINATED' ? (
                            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">TERMINATED</span>
                          ) : (
                            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">COMPLETED</span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          {c.session ? (
                            <span className={`font-bold ${c.session.violationsCount > 0 ? 'text-error' : 'text-success'}`}>
                              {c.session.violationsCount}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="p-4 text-center">
                          {c.session?.score !== null ? (
                            <span className="font-bold text-lg text-primary">{c.session.score}</span>
                          ) : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
