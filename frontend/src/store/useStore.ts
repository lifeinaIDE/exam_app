import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CandidateState {
  candidateId: string | null;
  candidateName: string | null;
  setCandidateId: (id: string) => void;
  setCandidateName: (name: string) => void;
  sessionId: string | null;
  setSessionId: (id: string) => void;
  clearSession: () => void;
}

export const useStore = create<CandidateState>()(
  persist(
    (set) => ({
      candidateId: null,
      candidateName: null,
      setCandidateId: (id) => set({ candidateId: id }),
      setCandidateName: (name) => set({ candidateName: name }),
      sessionId: null,
      setSessionId: (id) => set({ sessionId: id }),
      clearSession: () => set({ candidateId: null, candidateName: null, sessionId: null })
    }),
    {
      name: 'success-squad-storage',
    }
  )
);
