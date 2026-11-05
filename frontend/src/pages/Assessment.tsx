import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { collection, query, getDocs, doc, getDoc, where, addDoc, updateDoc, serverTimestamp, writeBatch, limit } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useStore } from '../store/useStore';
import defaultQuestionsPool from '../data/questions.json';

interface Question {
  id: string;
  text: string;
  options: string[];
  selectedOpt: number | null;
  correctAnswer?: string;
  correctOption?: number;
  marks?: number;
}

// Fisher-Yates shuffle
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const TOTAL_ASSESSMENT_QUESTIONS = 40;
const DURATION_SECONDS = 45 * 60; // 45 minutes

export default function Assessment() {
  const navigate = useNavigate();
  const { candidateId, candidateName, setSessionId, sessionId } = useStore();
  
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(DURATION_SECONDS);
  const [markedForReview, setMarkedForReview] = useState<Set<number>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (!candidateId) {
      navigate('/');
      return;
    }

    const startAssessment = async () => {
      try {
        let sessionRefId = sessionId || `session_${candidateId}_${Date.now()}`;
        let formattedQuestions: Question[] = [];
        let startTimeMs = Date.now();

        // 1. Check local storage first for an existing active session
        const localSaved = localStorage.getItem(`session_${candidateId}`);
        if (localSaved) {
          try {
            const parsed = JSON.parse(localSaved);
            if (parsed.status === 'COMPLETED') {
              navigate('/result', { state: { score: parsed.score } });
              return;
            }
            if (parsed.status === 'TERMINATED') {
              navigate('/result');
              return;
            }
            if (parsed.questions && parsed.questions.length > 0) {
              formattedQuestions = parsed.questions;
              sessionRefId = parsed.sessionId || sessionRefId;
              startTimeMs = parsed.startTime || startTimeMs;
            }
          } catch (_e) {
            console.warn('Error reading saved session from localStorage:', _e);
          }
        }

        // 2. If no questions from local storage, check Firestore for existing session
        if (formattedQuestions.length === 0) {
          try {
            const existingSessionSnap = await getDocs(
              query(collection(db, 'sessions'), where('candidateId', '==', candidateId), limit(1))
            );

            if (!existingSessionSnap.empty) {
              const sessionDoc = existingSessionSnap.docs[0];
              const existingSession = sessionDoc.data();

              if (existingSession.status === 'COMPLETED') {
                navigate('/result', { state: { score: existingSession.score } });
                return;
              }
              if (existingSession.status === 'TERMINATED') {
                navigate('/result');
                return;
              }

              sessionRefId = sessionDoc.id;
              if (existingSession.startTime?.toDate) {
                startTimeMs = existingSession.startTime.toDate().getTime();
              }

              const answersSnap = await getDocs(
                query(collection(db, 'answers'), where('sessionId', '==', sessionRefId))
              );
              const sortedAnsDocs = answersSnap.docs
                .map(d => d.data())
                .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

              for (const ans of sortedAnsDocs) {
                const questionDoc = await getDoc(doc(db, 'questions', ans.questionId));
                if (questionDoc.exists()) {
                  const q = questionDoc.data();
                  formattedQuestions.push({
                    id: questionDoc.id,
                    text: q.text,
                    options: ans.options || q.options,
                    selectedOpt: ans.selectedOpt ?? null,
                    correctAnswer: q.correctAnswer,
                    correctOption: q.correctOption,
                    marks: q.marks || 1
                  });
                } else {
                  // Fallback to bundled question
                  const matched = defaultQuestionsPool.find(dq => dq.id === ans.questionId);
                  if (matched) {
                    formattedQuestions.push({
                      id: matched.id,
                      text: matched.text,
                      options: ans.options || matched.options,
                      selectedOpt: ans.selectedOpt ?? null,
                      correctAnswer: matched.correctAnswer,
                      correctOption: matched.correctOption,
                      marks: matched.marks || 1
                    });
                  }
                }
              }
            }
          } catch (e: any) {
            console.warn('Firestore session check notice:', e?.message);
          }
        }

        // 3. New Session: select 40 questions in random order from pool, and shuffle options
        if (formattedQuestions.length === 0) {
          let pool = defaultQuestionsPool;

          // Attempt to fetch fresh questions from Firestore if available
          try {
            const allQsSnap = await getDocs(collection(db, 'questions'));
            if (!allQsSnap.empty) {
              pool = allQsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
            }
          } catch (e: any) {
            console.warn('Firestore questions fetch notice, using bundled pool:', e?.message);
          }

          // Shuffle the entire pool of questions
          const shuffledPool = shuffleArray(pool);

          // Select exactly 40 questions (or available pool size)
          const selectedPool = shuffledPool.slice(0, Math.min(TOTAL_ASSESSMENT_QUESTIONS, shuffledPool.length));

          formattedQuestions = selectedPool.map(q => {
            // Randomize option order for each question
            const shuffledOptions = shuffleArray(q.options || []);
            return {
              id: q.id,
              text: q.text,
              options: shuffledOptions,
              selectedOpt: null,
              correctAnswer: q.correctAnswer,
              correctOption: q.correctOption,
              marks: q.marks || 1
            };
          });

          // Save to Firestore if accessible
          try {
            const sessionRef = await addDoc(collection(db, 'sessions'), {
              candidateId,
              status: 'IN_PROGRESS',
              startTime: serverTimestamp(),
              endTime: null,
              score: null,
              deviceInfo: navigator.userAgent || null,
              violationsCount: 0
            });
            sessionRefId = sessionRef.id;

            const batch = writeBatch(db);
            for (let i = 0; i < formattedQuestions.length; i++) {
              const q = formattedQuestions[i];
              const ansRef = doc(collection(db, 'answers'));
              batch.set(ansRef, {
                sessionId: sessionRefId,
                questionId: q.id,
                options: q.options,
                selectedOpt: null,
                orderIndex: i,
                savedAt: serverTimestamp()
              });
            }
            await batch.commit();
          } catch (e: any) {
            console.warn('Firestore new session write notice:', e?.message);
          }

          // Persist in localStorage
          localStorage.setItem(`session_${candidateId}`, JSON.stringify({
            sessionId: sessionRefId,
            candidateId,
            candidateName,
            startTime: startTimeMs,
            status: 'IN_PROGRESS',
            questions: formattedQuestions
          }));
        }

        setSessionId(sessionRefId);
        setQuestions(formattedQuestions);

        const now = Date.now();
        const elapsedSeconds = Math.floor((now - startTimeMs) / 1000);
        const remaining = Math.max(DURATION_SECONDS - elapsedSeconds, 0);
        setTimeLeft(remaining);

        if (remaining <= 0) {
          submitAssessment(sessionRefId, formattedQuestions);
        }
      } catch (error: any) {
        const message = error.message || 'Failed to start assessment';
        setErrorMsg(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    };

    startAssessment();
  }, [candidateId, navigate, setSessionId]);

  // Assessment submission
  const submitAssessment = useCallback(async (sId: string, currentQuestions?: Question[]) => {
    try {
      const qs = currentQuestions || questions;
      let score = 0;

      for (const q of qs) {
        if (q.selectedOpt !== null && q.options && q.options[q.selectedOpt] !== undefined) {
          const selectedText = String(q.options[q.selectedOpt]).trim().toLowerCase();
          const correctText = String(q.correctAnswer || '').trim().toLowerCase();
          if (selectedText === correctText) {
            score += q.marks || 1;
          }
        }
      }

      // Update in localStorage
      const saved = localStorage.getItem(`session_${candidateId}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          parsed.status = 'COMPLETED';
          parsed.endTime = new Date().toISOString();
          parsed.score = score;
          localStorage.setItem(`session_${candidateId}`, JSON.stringify(parsed));
        } catch (_e) {}
      }

      // Update in Firestore
      try {
        await updateDoc(doc(db, 'sessions', sId), {
          status: 'COMPLETED',
          endTime: serverTimestamp(),
          score
        });
      } catch (_e: any) {
        console.warn('Firestore submit update notice:', _e?.message);
      }

      toast.success('Assessment submitted successfully');
      navigate('/result', { state: { score } });
    } catch (_error) {
      toast.error('Failed to submit assessment');
    }
  }, [candidateId, navigate, questions]);

  // Timer countdown
  useEffect(() => {
    if (!loading && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            submitAssessment(sessionId || `session_${candidateId}`);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loading, sessionId, candidateId, submitAssessment]);

  // Violation tracker ref
  const violationCountRef = useRef(0);

  // Anti-Cheating Logic
  useEffect(() => {
    if (loading || timeLeft <= 0) return;

    const MAX_VIOLATIONS = 3;

    const handleViolation = async (reason: string) => {
      violationCountRef.current += 1;
      const currentCount = violationCountRef.current;
      
      try {
        if (sessionId) {
          await addDoc(collection(db, 'violations'), {
            sessionId,
            type: reason,
            timestamp: serverTimestamp(),
            description: 'Frontend violation detected'
          });

          await updateDoc(doc(db, 'sessions', sessionId), {
            violationsCount: currentCount
          });
        }
      } catch (_err) {}

      if (currentCount >= MAX_VIOLATIONS) {
        if (sessionId) {
          try {
            await updateDoc(doc(db, 'sessions', sessionId), {
              status: 'TERMINATED',
              endTime: serverTimestamp()
            });
          } catch (_e) {}
        }
        toast.error('Assessment terminated due to excessive violations.');
        submitAssessment(sessionId || `session_${candidateId}`);
      } else {
        toast.warning(`Warning ${currentCount}/${MAX_VIOLATIONS}: ${reason}. Your assessment will be terminated after 3 warnings.`);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleViolation('Tab switched or minimized');
      }
    };

    const handleBlur = () => {
      handleViolation('Lost focus from the assessment window');
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey && ['c', 'v', 'x', 'p', 's', 'a', 'u'].includes(e.key.toLowerCase())) ||
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(e.key.toLowerCase()))
      ) {
        e.preventDefault();
        toast.warning('Keyboard shortcuts are disabled during the assessment.');
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      toast.warning('Right-click is disabled.');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);

    try {
      document.documentElement.requestFullscreen().catch(() => {});
    } catch (_e) {}

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [loading, sessionId, candidateId, timeLeft, submitAssessment]);

  // Handle option selection
  const handleOptionSelect = async (optIndex: number) => {
    const currentQ = questions[currentIndex];
    const updatedQs = [...questions];
    updatedQs[currentIndex] = { ...currentQ, selectedOpt: optIndex };
    setQuestions(updatedQs);

    // Save in localStorage immediately
    const saved = localStorage.getItem(`session_${candidateId}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        parsed.questions = updatedQs;
        localStorage.setItem(`session_${candidateId}`, JSON.stringify(parsed));
      } catch (_e) {}
    }

    // Save in Firestore if accessible
    if (sessionId) {
      try {
        const ansSnap = await getDocs(
          query(
            collection(db, 'answers'),
            where('sessionId', '==', sessionId),
            where('questionId', '==', currentQ.id),
            limit(1)
          )
        );
        if (!ansSnap.empty) {
          await updateDoc(doc(db, 'answers', ansSnap.docs[0].id), {
            selectedOpt: optIndex,
            savedAt: serverTimestamp()
          });
        }
      } catch (_error) {}
    }
  };

  const toggleReview = () => {
    setMarkedForReview(prev => {
      const newSet = new Set(prev);
      if (newSet.has(currentIndex)) newSet.delete(currentIndex);
      else newSet.add(currentIndex);
      return newSet;
    });
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-secondaryBg">Loading Assessment...</div>;
  if (errorMsg) return <div className="min-h-screen flex items-center justify-center bg-secondaryBg text-error font-bold p-4 text-center">Error: {errorMsg}</div>;
  if (questions.length === 0) return <div className="min-h-screen flex items-center justify-center bg-secondaryBg">No questions available.</div>;

  const currentQ = questions[currentIndex];

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-secondaryBg">
      {/* Main Question Area */}
      <div className="flex-1 flex flex-col p-3 md:p-8 w-full max-w-full">
        {/* Header bar - Sticky */}
        <div className="sticky top-2 z-10 bg-white p-4 rounded-xl shadow-md mb-6 flex justify-between items-center border border-border">
          <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4">
            <div className="font-bold text-textPrimary text-base md:text-lg">
              Question {currentIndex + 1} of {questions.length}
            </div>
            {candidateName && (
              <span className="text-xs md:text-sm text-textSecondary bg-gray-100 px-2.5 py-0.5 rounded-full font-medium">
                Participant: {candidateName}
              </span>
            )}
          </div>
          <div className="text-lg md:text-xl font-mono font-bold text-error flex items-center gap-1 md:gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-6 md:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {formatTime(timeLeft)}
          </div>
        </div>

        {/* Question content */}
        <div className="flex-1 bg-white p-4 md:p-8 rounded-xl shadow-sm border border-border flex flex-col w-full">
          <h2 className="text-lg md:text-xl font-medium text-textPrimary mb-8 leading-relaxed">
            {currentQ.text}
          </h2>

          <div className="space-y-4 flex-1">
            {currentQ.options.map((opt, idx) => (
              <div 
                key={idx}
                onClick={() => handleOptionSelect(idx)}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                  currentQ.selectedOpt === idx 
                    ? 'border-primary bg-blue-50 shadow-sm' 
                    : 'border-border hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${
                    currentQ.selectedOpt === idx ? 'border-primary' : 'border-gray-400'
                  }`}>
                    {currentQ.selectedOpt === idx && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                  </div>
                  <span className="text-textPrimary text-base md:text-lg leading-normal">{opt}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="mt-8 flex flex-wrap justify-between items-center gap-3 pt-6 border-t border-border">
            <button
              onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="flex-1 min-w-[80px] px-3 py-2.5 md:px-6 md:py-2.5 rounded-lg font-medium text-sm md:text-base text-textSecondary bg-gray-100 hover:bg-gray-200 disabled:opacity-40 transition text-center"
            >
              Prev
            </button>
            <button
              onClick={toggleReview}
              className={`flex-[2] min-w-[120px] px-3 py-2.5 md:px-6 md:py-2.5 rounded-lg font-medium text-sm md:text-base transition text-center ${
                markedForReview.has(currentIndex) ? 'bg-warning text-white' : 'bg-gray-100 text-textSecondary hover:bg-gray-200'
              }`}
            >
              {markedForReview.has(currentIndex) ? 'Unmark Review' : 'Mark Review'}
            </button>
            <button
              onClick={() => setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1))}
              disabled={currentIndex === questions.length - 1}
              className="flex-1 min-w-[80px] px-3 py-2.5 md:px-6 md:py-2.5 rounded-lg font-medium text-sm md:text-base text-white bg-primary hover:bg-blue-700 disabled:opacity-40 transition text-center"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Right side Palette */}
      <div className="w-full md:w-80 bg-white p-4 md:p-6 shadow-sm border-l border-border flex flex-col">
        <h3 className="font-bold text-lg mb-4 text-textPrimary">Question Navigator</h3>
        <p className="text-xs text-textSecondary mb-4">40 Randomized Questions</p>
        
        <div className="grid grid-cols-5 gap-2 mb-auto max-h-[360px] md:max-h-[500px] overflow-y-auto pr-1 pb-4">
          {questions.map((q, idx) => {
            let bgColor = 'bg-gray-100';
            let textColor = 'text-textPrimary';
            let borderColor = 'border-transparent';

            if (currentIndex === idx) {
              borderColor = 'border-primary ring-2 ring-primary/30';
            }

            if (q.selectedOpt !== null) {
              bgColor = 'bg-success';
              textColor = 'text-white';
            }
            if (markedForReview.has(idx)) {
              bgColor = 'bg-warning';
              textColor = 'text-white';
            }

            return (
              <button
                key={q.id || idx}
                onClick={() => setCurrentIndex(idx)}
                className={`w-10 h-10 flex items-center justify-center rounded-lg font-semibold text-sm border-2 transition ${bgColor} ${textColor} ${borderColor}`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
        
        {/* Legend */}
        <div className="mt-4 border-t border-border pt-4 text-xs md:text-sm space-y-2 mb-6">
          <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded bg-success"></div> Answered</div>
          <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded bg-warning"></div> Marked for Review</div>
          <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded bg-gray-100 border border-gray-300"></div> Unanswered</div>
        </div>

        <button 
          onClick={() => {
            if (window.confirm('Are you sure you want to submit the assessment?')) {
              submitAssessment(sessionId || `session_${candidateId}`);
            }
          }}
          className="w-full py-3 rounded-xl font-bold text-white bg-error hover:bg-red-700 shadow-md transition"
        >
          Submit Assessment
        </button>
      </div>
    </div>
  );
}
