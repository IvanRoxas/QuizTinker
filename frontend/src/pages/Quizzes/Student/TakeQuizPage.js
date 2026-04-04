import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { fetchQuizToTake, submitQuizAttempt } from '../../../api/quizStudentApi';
import './TakeQuizPage.css';
import mediaUrl from '../../../utils/mediaUrl';

const TakeQuizPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();

    // Attempt ID from previous page
    const attemptId = location.state?.attemptId;

    const [quiz, setQuiz] = useState(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState(null);

    // State: { [item_id]: student_answer }
    const [answers, setAnswers] = useState({});
    const [currentStep, setCurrentStep] = useState(0);
    const [attemptsTakenAtStart, setAttemptsTakenAtStart] = useState(0);

    // Timeout States
    const [showTimeoutModal, setShowTimeoutModal] = useState(false);
    const [finishedUrl, setFinishedUrl] = useState(null);

    // Timer state
    const [timeLeft, setTimeLeft] = useState(null); // in seconds
    const timerRef = useRef(null);

    // Modals
    const [showSubmitModal, setShowSubmitModal] = useState(false);
    const [lightboxImage, setLightboxImage] = useState(null);

    useEffect(() => {
        if (!attemptId) {
            navigate(`/quizzes/${id}/intro`);
            return;
        }
        loadQuiz();
    }, [id, attemptId]);

    const loadQuiz = async () => {
        try {
            setLoading(true);
            const data = await fetchQuizToTake(id);
            if (data.quiz) {
                setQuiz(data.quiz);
                setAttemptsTakenAtStart(data.attempts_taken || 0);
                const sortedItems = data.quiz.items.sort((a, b) => a.sort_order - b.sort_order);
                setItems(sortedItems);

                // Load saved answers from session storage to prevent accidental data loss
                const savedAnswers = sessionStorage.getItem(`quiz_${attemptId}_answers`);
                if (savedAnswers) {
                    setAnswers(JSON.parse(savedAnswers));
                }

                // Setup timer
                if (data.quiz.time_limit_minutes) {
                    // Check if we already started a timer in a previous refresh
                    const startTimeStr = sessionStorage.getItem(`quiz_${attemptId}_start_time`);
                    const now = Date.now();
                    let startMs = now;

                    if (startTimeStr) {
                        startMs = parseInt(startTimeStr, 10);
                    } else {
                        sessionStorage.setItem(`quiz_${attemptId}_start_time`, now.toString());
                    }

                    const elapsedMs = now - startMs;
                    const limitMs = data.quiz.time_limit_minutes * 60 * 1000;
                    const remainingMs = limitMs - elapsedMs;

                    if (remainingMs > 0) {
                        setTimeLeft(Math.floor(remainingMs / 1000));
                    } else {
                        setTimeLeft(0);
                    }
                }

                // Strict Bouncer Checks
                const completedAttempts = data.attempts_taken || 0;
                const limit = data.quiz.attempts_allowed || 1;

                // If they have naturally maxed their attempts and somehow forced navigation
                if (completedAttempts >= limit && !data.has_open_attempt) {
                    navigate(`/quizzes/${id}/intro`, { replace: true });
                    return;
                }

                // If deadline expired and late submissions not allowed
                if (data.quiz.deadline && !data.quiz.allow_late_submissions) {
                    const now = new Date();
                    const deadlineDate = new Date(data.quiz.deadline);
                    if (now > deadlineDate) {
                        navigate(`/quizzes/${id}/intro`, { replace: true });
                        return;
                    }
                }
            }
        } catch (err) {
            console.error(err);
            setErrorMsg('Failed to load quiz content.');
        } finally {
            setLoading(false);
        }
    };

    // ACCIDENTAL EXIT PROTECTION
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (!submitting) {
                e.preventDefault();
                e.returnValue = ''; // Required for some browsers
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [submitting]);

    // TIMER LOGIC
    useEffect(() => {
        if (timeLeft === null) return;

        if (timeLeft <= 0) {
            // Time already expired (e.g. loaded as 0) — submit once
            clearInterval(timerRef.current);
            if (!submitGuardRef.current) {
                setShowTimeoutModal(true);
                handleAutoSubmit();
            }
            return;
        }

        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    setShowTimeoutModal(true);
                    handleAutoSubmit();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timerRef.current);
    }, [timeLeft]);

    const formatTime = (seconds) => {
        if (seconds === null) return '--:--';
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    // ANSWER UPDATES
    const updateAnswer = (itemId, val) => {
        const newAnswers = { ...answers, [itemId]: val };
        setAnswers(newAnswers);
        // Persist to session storage
        if (attemptId) {
            sessionStorage.setItem(`quiz_${attemptId}_answers`, JSON.stringify(newAnswers));
        }
    };

    // SUBMISSION
    const submitGuardRef = useRef(false); // Prevent double-submit

    const handleAutoSubmit = async () => {
        submitFinalData(true);
    };

    const handleManualSubmit = () => {
        setShowSubmitModal(true);
    };

    const submitFinalData = async (isAuto = false) => {
        // Guard: prevent double-submit
        if (submitGuardRef.current) return;
        submitGuardRef.current = true;

        // PART 2: Instantly close modal and show loading state
        setShowSubmitModal(false);
        setSubmitting(true);
        window.isSubmittingQuiz = true; // Global flag for AuthContext

        try {
            const totalTimeLimitSeconds = quiz?.time_limit_minutes ? quiz.time_limit_minutes * 60 : 0;
            const timeTaken = totalTimeLimitSeconds > 0
                ? Math.floor(totalTimeLimitSeconds - (timeLeft || 0))
                : 0;

            const payload = {
                attempt_id: attemptId,
                answers: answers,
                time_taken_seconds: Math.max(0, timeTaken)
            };
            console.log('[SUBMIT] Sending payload:', payload);
            const response = await submitQuizAttempt(id, payload);
            console.log('[SUBMIT] Response received:', response);

            // Clean up session storage
            sessionStorage.removeItem(`quiz_${attemptId}_answers`);
            sessionStorage.removeItem(`quiz_${attemptId}_start_time`);

            // PART 1: Redirect path directly to Results Page
            const submitAttemptId = response?.attempt_id || response?.data?.attempt?.id || attemptId;
            console.log(`[SUBMIT] Navigating to results: /quizzes/${id}/results/${submitAttemptId}`);

            if (!isAuto) {
                navigate(`/quizzes/${id}/results/${submitAttemptId}`, { replace: true });
            } else {
                setFinishedUrl(`/quizzes/${id}/results/${submitAttemptId}`);
            }
        } catch (err) {
            console.error('[SUBMIT ERROR] Full error:', err);
            
            // If the backend confirmed it was already submitted, recover gracefully
            if (err.response?.data?.already_submitted || err.response?.data?.message?.toLowerCase().includes('already been submitted')) {
                sessionStorage.removeItem(`quiz_${attemptId}_answers`);
                sessionStorage.removeItem(`quiz_${attemptId}_start_time`);
                const fallbackAttemptId = err.response?.data?.attempt_id || attemptId;
                navigate(`/quizzes/${id}/results/${fallbackAttemptId}`, { replace: true });
                return;
            }

            // PART 3: Catching 401 Unauthorized gracefully
            if (err.response && err.response.status === 401) {
                alert("Your session expired. Please log in again to save your results.");
                navigate('/auth', { replace: true });
            } else {
                alert("Failed to submit quiz. Please try again.");
                setErrorMsg(err.response?.data?.message || 'Failed to submit quiz.');
            }
            submitGuardRef.current = false; // Allow retry on real errors
        } finally {
            setSubmitting(false);
            window.isSubmittingQuiz = false;
        }
    };

    // STEP NAV
    const handleNext = () => {
        if (quiz?.can_backtrack === false && !isQuestionAnswered(items[currentStep])) {
            setErrorMsg("You must answer this question before proceeding.");
            return;
        }
        setErrorMsg(null);
        if (currentStep < items.length - 1) setCurrentStep(c => c + 1);
    };
    const handlePrev = () => {
        if (quiz?.can_backtrack === false) return; // Locked
        if (currentStep > 0) setCurrentStep(c => c - 1);
    };

    const isQuestionAnswered = (item) => {
        const val = answers[item.id];
        if (item.type === 'identification') return !!(val && val.trim());
        if (item.type === 'single_choice') return val !== undefined;
        if (item.type === 'multiple_answer') return Array.isArray(val) && val.length > 0;
        if (item.type === 'true_false') return val !== undefined;
        if (item.type === 'matching') {
            const pairs = item.meta?.pairs || [];
            if (!val || Object.keys(val).length === 0) return false;
            return pairs.every(p => val[p.left]);
        }
        if (item.type === 'ordering') {
            const options = item.meta?.order || [];
            return Array.isArray(val) ? val.length === options.length : true; // default order counts as answered if they didn't touch it
        }
        return false;
    };

    // RENDER SPECIFIC INPUTS

    const renderIdentification = (item) => {
        const val = answers[item.id] || '';
        return (
            <div className="input-wrap">
                <input
                    type="text"
                    className="take-input giant"
                    value={val}
                    onChange={(e) => updateAnswer(item.id, e.target.value)}
                    placeholder="Type your answer here..."
                />
            </div>
        );
    };

    const renderSingleChoice = (item) => {
        const val = answers[item.id];
        return (
            <div className="choice-grid">
                {item.choices.map((choice, idx) => (
                    <button
                        key={idx}
                        className={`take-choice-btn ${val === idx ? 'selected' : ''}`}
                        onClick={() => updateAnswer(item.id, idx)}
                    >
                        {choice.text}
                    </button>
                ))}
            </div>
        );
    };

    const renderMultipleAnswer = (item) => {
        const valArray = Array.isArray(answers[item.id]) ? answers[item.id] : [];
        return (
            <div className="choice-grid">
                {item.choices.map((choice, idx) => {
                    const isSelected = valArray.includes(idx);
                    return (
                        <button
                            key={idx}
                            className={`take-choice-btn multi ${isSelected ? 'selected' : ''}`}
                            onClick={() => {
                                let newArr = [...valArray];
                                if (isSelected) {
                                    newArr = newArr.filter(i => i !== idx);
                                } else {
                                    newArr.push(idx);
                                }
                                updateAnswer(item.id, newArr);
                            }}
                        >
                            <span className="checkbox-indicator">{isSelected ? '✓' : ''}</span>
                            {choice.text}
                        </button>
                    );
                })}
            </div>
        );
    };

    const renderTrueFalse = (item) => {
        const val = answers[item.id];
        return (
            <div className="tf-grid">
                <button
                    className={`take-tf-btn true-btn ${val === true || val === 'true' ? 'selected' : ''}`}
                    onClick={() => updateAnswer(item.id, true)}
                >
                    TRUE
                </button>
                <button
                    className={`take-tf-btn false-btn ${val === false || val === 'false' ? 'selected' : ''}`}
                    onClick={() => updateAnswer(item.id, false)}
                >
                    FALSE
                </button>
            </div>
        );
    };

    const renderMatching = (item) => {
        const valObj = answers[item.id] || {};
        const pairs = item.meta?.pairs || [];

        // Use pairs mapping. Note: student API stripped correct right values and did not send them shuffled currently.
        // We will need to update QuizItemStudentSerializer to send `rights` in a shuffled order for the select dropdown.
        // For now, assume it's coming from meta.rights
        const rightOptions = item.meta?.rights || [];

        return (
            <div className="matching-grid">
                {pairs.map((p, idx) => (
                    <div key={idx} className="matching-row">
                        <div className="matching-left">{p.left}</div>
                        <div className="matching-arrow">-&gt;</div>
                        <select
                            className="take-select"
                            value={valObj[p.left] || ''}
                            onChange={(e) => {
                                const newObj = { ...valObj, [p.left]: e.target.value };
                                updateAnswer(item.id, newObj);
                            }}
                        >
                            <option value="">-- Select Match --</option>
                            {rightOptions.map((ro, jdx) => (
                                <option key={jdx} value={ro}>{ro}</option>
                            ))}
                        </select>
                    </div>
                ))}
            </div>
        );
    };

    const renderOrdering = (item) => {
        const options = item.meta?.order || [];
        const currentOrder = Array.isArray(answers[item.id]) && answers[item.id].length > 0
            ? answers[item.id]
            : [...options];

        const moveUp = (idx) => {
            if (idx === 0) return;
            const newArr = [...currentOrder];
            [newArr[idx - 1], newArr[idx]] = [newArr[idx], newArr[idx - 1]];
            updateAnswer(item.id, newArr);
        };

        const moveDown = (idx) => {
            if (idx === currentOrder.length - 1) return;
            const newArr = [...currentOrder];
            [newArr[idx + 1], newArr[idx]] = [newArr[idx], newArr[idx + 1]];
            updateAnswer(item.id, newArr);
        };

        // Instead of useEffect here, we just use a fallback in the UI
        // If answers[item.id] is empty, currentOrder is used. We don't need to force an immediate save to state
        // just to display it. It will be saved when they move an item or submit.

        return (
            <div className="ordering-list">
                {currentOrder.map((stepStr, idx) => (
                    <div key={idx} className="order-item-student">
                        <div className="order-rank">{idx + 1}</div>
                        <div className="order-text">{stepStr}</div>
                        <div className="order-controls">
                            <button className="neo-btn arrow" disabled={idx === 0} onClick={() => moveUp(idx)}>[UP]</button>
                            <button className="neo-btn arrow" disabled={idx === currentOrder.length - 1} onClick={() => moveDown(idx)}>[DOWN]</button>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    if (loading) return <div className="take-message">Preparing Quiz...</div>;
    if (errorMsg) return <div className="take-message error">{errorMsg}</div>;
    if (items.length === 0) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#f8f7f2', gap: '0.5rem' }}>
                <p style={{ fontSize: '1.8rem', fontWeight: 900, color: '#1E1E1E', margin: 0 }}>No questions in this quiz.</p>
                <button className="neo-btn primary" onClick={() => navigate('/dashboard')} style={{ padding: '16px 32px', fontSize: '1.25rem', marginTop: '1.5rem', cursor: 'pointer' }}>
                    Back to Dashboard
                </button>
            </div>
        );
    }

    const currentItem = items[currentStep];
    const isFirst = currentStep === 0;
    const isLast = currentStep === items.length - 1;
    const timerClass = (timeLeft !== null && timeLeft <= 60) ? 'sticky-timer danger pulse' : 'sticky-timer';

    return (
        <div className="take-quiz-page">

            <div className="sticky-header">
                <div className="quiz-title-small">{quiz.title}</div>
                {timeLeft !== null && (
                    <div className={timerClass}>
                        [TIME] {formatTime(timeLeft)}
                    </div>
                )}
            </div>

            <div className="take-main-content">
                <div className="question-counter">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span>Question {currentStep + 1} of {items.length}</span>
                        {currentItem.bloom_level && (
                            <span style={{ 
                                fontSize: '0.75rem', 
                                padding: '0.2rem 0.6rem', 
                                background: 'var(--blue)', 
                                color: 'white', 
                                borderRadius: '0.4rem',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                border: '2px solid var(--charcoal)'
                            }}>
                                {currentItem.bloom_level.replace('_', ' ')}
                            </span>
                        )}
                    </div>
                    <div className="points-label">{currentItem.points} pts</div>
                </div>

                <div className="active-question-card">
                    <h2 className="take-question-text">{currentItem.question}</h2>
                    {(() => {
                        const itemMediaUrl = mediaUrl(currentItem.media);
                        if (!itemMediaUrl) return null;
                        return (
                            <img
                                src={itemMediaUrl}
                                alt="Question media"
                                className="take-question-media clickable"
                                onClick={() => setLightboxImage(itemMediaUrl)}
                            />
                        );
                    })()}

                    <div className="take-input-area">
                        {currentItem.type === 'identification' && renderIdentification(currentItem)}
                        {currentItem.type === 'single_choice' && renderSingleChoice(currentItem)}
                        {currentItem.type === 'multiple_answer' && renderMultipleAnswer(currentItem)}
                        {currentItem.type === 'true_false' && renderTrueFalse(currentItem)}
                        {currentItem.type === 'matching' && renderMatching(currentItem)}
                        {currentItem.type === 'ordering' && renderOrdering(currentItem)}
                    </div>
                </div>

                <div className="take-navigation">
                    {quiz?.can_backtrack !== false && (
                        <button
                            className="neo-btn giant white nav-btn"
                            onClick={handlePrev}
                            disabled={isFirst || submitting}
                            style={{ visibility: isFirst ? 'hidden' : 'visible' }}
                        >
                            &lt; PREVIOUS
                        </button>
                    )}

                    {isLast ? (
                        <button
                            className="neo-btn giant success nav-btn"
                            onClick={handleManualSubmit}
                            disabled={submitting || (quiz?.can_backtrack === false && !isQuestionAnswered(currentItem))}
                        >
                            {submitting ? 'SUBMITTING...' : 'SUBMIT QUIZ'}
                        </button>
                    ) : (
                        <button
                            className="neo-btn giant white nav-btn"
                            onClick={handleNext}
                            disabled={submitting || (quiz?.can_backtrack === false && !isQuestionAnswered(currentItem))}
                        >
                            NEXT &gt;
                        </button>
                    )}
                </div>
            </div>

            {showSubmitModal && (
                <div className="neo-modal-overlay">
                    <div className="neo-modal">
                        <h2>Ready to submit?</h2>
                        <p>You cannot change your answers after submitting.</p>
                        <div className="modal-actions">
                            <button className="neo-btn success" onClick={() => submitFinalData(false)}>YES, SUBMIT</button>
                            <button className="neo-btn white" onClick={() => setShowSubmitModal(false)}>CANCEL</button>
                        </div>
                    </div>
                </div>
            )}

            {showTimeoutModal && (
                <div className="neo-modal-overlay">
                    <div className="neo-modal error-card">
                        <h2>TIME'S UP!</h2>
                        <p>Your time limit has been reached.</p>
                        <p>Your answers have been automatically submitted.</p>
                        <div className="modal-actions">
                            <button
                                className="neo-btn giant success"
                                disabled={submitting || !finishedUrl}
                                onClick={() => {
                                    if (finishedUrl) navigate(finishedUrl, { replace: true });
                                }}
                            >
                                {submitting ? 'Submitting...' : 'VIEW RESULTS'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {submitting && (
                <div className="neo-modal-overlay submitting-overlay" style={{ zIndex: 9999 }}>
                    <div className="neo-modal submitting-modal" style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚙️</div>
                        <h2>Submitting...</h2>
                        <p>Please do not close this page.</p>
                    </div>
                </div>
            )}

            {/* LIGHTBOX MODAL */}
            {lightboxImage && (
                <div className="neo-modal-overlay lightbox" onClick={() => setLightboxImage(null)}>
                    <div className="lightbox-content" onClick={e => e.stopPropagation()}>
                        <button className="lightbox-close" onClick={() => setLightboxImage(null)}>&times;</button>
                        <img src={lightboxImage} alt="Fullscreen" />
                    </div>
                </div>
            )}

        </div>
    );
};

export default TakeQuizPage;
