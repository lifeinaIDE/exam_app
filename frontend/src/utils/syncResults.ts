import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Scans localStorage for any completed assessments and syncs them to Firestore.
 * This ensures that even if Firestore rules were previously blocking submissions,
 * re-opening or refreshing the page will immediately upload the participant's
 * name, score, violations, and detailed answers to Firestore.
 */
export async function syncLocalSubmissionsToFirestore(): Promise<number> {
  let syncedCount = 0;
  if (typeof window === 'undefined' || !window.localStorage) return 0;

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      let candId: string | null = null;
      let candData: any = null;
      let sessionData: any = null;

      if (key.startsWith('candidate_')) {
        candId = key.replace('candidate_', '');
        try {
          candData = JSON.parse(localStorage.getItem(key) || '{}');
        } catch {}
        const sessRaw = localStorage.getItem(`session_${candId}`);
        if (sessRaw) {
          try {
            sessionData = JSON.parse(sessRaw);
          } catch {}
        }
      } else if (key.startsWith('session_')) {
        candId = key.replace('session_', '');
        try {
          sessionData = JSON.parse(localStorage.getItem(key) || '{}');
        } catch {}
        const candRaw = localStorage.getItem(`candidate_${candId}`);
        if (candRaw) {
          try {
            candData = JSON.parse(candRaw);
          } catch {}
        }
      }

      if (!candId) continue;

      const fullName = (candData && candData.fullName) || (sessionData && sessionData.candidateName) || 'Participant';
      const score = typeof candData?.score === 'number'
        ? candData.score
        : (typeof sessionData?.score === 'number' ? sessionData.score : null);
      const status = candData?.status || sessionData?.status;
      const violationsCount = candData?.violationsCount || sessionData?.violationsCount || 0;
      const answers = candData?.answers || sessionData?.answers || [];

      // Only sync if completed or has answers/score
      if (status === 'COMPLETED' || typeof score === 'number' || answers.length > 0) {
        const nowIso = new Date().toISOString();
        const submittedTime = candData?.completedAt || sessionData?.endTime || candData?.createdAt || nowIso;

        try {
          // 1. Sync to Firestore candidates collection
          await setDoc(doc(db, 'candidates', candId), {
            fullName,
            status: 'COMPLETED',
            score: score ?? 0,
            violationsCount,
            completedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            submittedAt: submittedTime,
            answers
          }, { merge: true });

          // 2. Sync to Firestore scores collection
          await setDoc(doc(db, 'scores', candId), {
            candidateId: candId,
            fullName,
            score: score ?? 0,
            total: 40,
            status: 'COMPLETED',
            violationsCount,
            submittedAt: serverTimestamp(),
            dateString: submittedTime,
            answers
          }, { merge: true });

          syncedCount++;
        } catch (err: any) {
          console.warn(`Auto-sync notice for candidate ${candId}:`, err?.message);
        }
      }
    }
  } catch (err) {
    console.error('Error in syncLocalSubmissionsToFirestore:', err);
  }

  return syncedCount;
}
