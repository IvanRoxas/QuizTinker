import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchQuizToTake, startQuizAttempt } from '../../../api/quizStudentApi';
import './QuizIntroPage.css';
import mediaUrl from '../../../utils/mediaUrl';

const QuizIntroPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    
    const [quiz, setQuiz] = useState(null);
    const [attemptsTaken, setAttemptsTaken] = useState(0);
    const [hasOpenAttempt, setHasOpenAttempt] = useState(false);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState(null);
    const [latestAttemptId, setLatestAttemptId] = useState(null);
    const [starting, setStarting] = useState(false);

    useEffect(() => {
        loadQuiz();
    }, [id]);

    const loadQuiz = async () => {
        try {
            setLoading(true);
            const data = await fetchQuizToTake(id);
            if (data.quiz) {
                setQuiz(data.quiz);
                setAttemptsTaken(data.attempts_taken || 0);
                setHasOpenAttempt(data.has_open_attempt || false);
            }
        } catch (err) {
            console.error(err);
            if (err.response && err.response.data) {
                setErrorMsg(err.response.data.message || 'Failed to load quiz details.');
                if (err.response.data.max_attempts_reached && err.response.data.latest_attempt_id) {
                    setLatestAttemptId(err.response.data.latest_attempt_id);
                }
            } else {
                setErrorMsg('Failed to load quiz details.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleStartQuiz = async () => {
        // Block attempt if deadline has passed and late submissions are disabled
        if (quiz && quiz.deadline && !quiz.allow_late_submissions) {
            if (new Date() > new Date(quiz.deadline)) {
                setErrorMsg('This quiz is closed. The deadline has passed and late submissions are not accepted.');
                return;
            }
        }
        try {
            setStarting(true);
            const data = await startQuizAttempt(id);
            if (data.attempt_id) {
                // Navigate to the active taking page
                navigate(`/quizzes/${id}/take`, { state: { attemptId: data.attempt_id } });
            }
        } catch (err) {
            console.error(err);
            if (err.response && err.response.data && err.response.data.message) {
                setErrorMsg(err.response.data.message);
            } else {
                setErrorMsg('Failed to start quiz.');
            }
            setStarting(false);
        }
    };

    if (loading) {
        return (
            <div className="student-view-container">
                <div className="neo-intro-card loading-card">
                    <h2>Loading Quiz...</h2>
                </div>
            </div>
        );
    }

    if (errorMsg && !quiz) {
        return (
            <div className="student-view-container">
                <div className="neo-intro-card error-card">
                    <h1>ACCESS DENIED</h1>
                    <p>{errorMsg}</p>
                    <div style={{ display: 'flex', gap: '16px', marginTop: '24px', justifyContent: 'center' }}>
                        {latestAttemptId && (
                            <button className="neo-btn blue" style={{ padding: '12px 24px' }} onClick={() => navigate(`/quizzes/${id}/results/${latestAttemptId}`)}>
                                VIEW RESULTS
                            </button>
                        )}
                        <button className="neo-btn white" onClick={() => navigate('/dashboard')}>
                            BACK TO DASHBOARD
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!quiz) return null;

    const maxAttempts = quiz.attempts_allowed;
    // Deadline-passed check (frontend guard before network call)
    const isDeadlinePassed = !!(quiz.deadline && !quiz.allow_late_submissions && new Date() > new Date(quiz.deadline));
    const isLocked = (maxAttempts > 0 && attemptsTaken >= maxAttempts) || !!errorMsg || isDeadlinePassed;



    return (
        <div className="student-view-container">
            <div className="neo-intro-card">

                {/* ── HERO ROW: Title + Thumbnail ── */}
                <div className="intro-hero-row">
                    <div className="intro-hero-text">
                        <div className="intro-header">
                            <h1 className="intro-title">{quiz.title}</h1>
                            {quiz.subtitle && <h3 className="intro-subtitle">{quiz.subtitle}</h3>}
                            <div className="intro-author">By {quiz.author_name}</div>
                        </div>

                        <div className="intro-description">
                            {quiz.description || "No description provided."}
                        </div>
                    </div>

                    {quiz.preview_image && (
                        <div className="intro-thumbnail-wrap">
                            <img
                                src={mediaUrl(quiz.preview_image)}
                                alt="Quiz Cover"
                                className="intro-thumbnail"
                                onError={(e) => {
                                    e.target.onerror = null;
                                    e.target.src = "https://placehold.co/120x120/f0f0f0/999?text=Quiz";
                                }}
                            />
                        </div>
                    )}
                </div>

                {/* ── STATS ROW ── */}
                <div className="intro-meta-stats">
                    <div className="meta-pill">
                        <span className="pill-label">TIME LIMIT</span>
                        <span className="pill-value">{quiz.time_limit_minutes ? `${quiz.time_limit_minutes} MINS` : 'NONE'}</span>
                    </div>
                    {maxAttempts > 0 && (
                        <div className="meta-pill">
                            <span className="pill-label">ATTEMPTS</span>
                            <span className="pill-value">{attemptsTaken} / {maxAttempts}</span>
                        </div>
                    )}
                    {quiz.deadline && (
                        <div className="meta-pill">
                            <span className="pill-label">DUE</span>
                            <span className="pill-value">{new Date(quiz.deadline).toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                    )}
                </div>

                {errorMsg && <div className="intro-error-text">{errorMsg}</div>}

                {/* ── ACTION BUTTON ── */}
                <div className="intro-action">
                    {isLocked ? (
                        <button className="neo-btn giant disabled" disabled>
                            {isDeadlinePassed ? 'DEADLINE PASSED' : (maxAttempts > 0 && attemptsTaken >= maxAttempts ? 'MAX ATTEMPTS REACHED' : 'QUIZ UNAVAILABLE')}
                        </button>
                    ) : (
                        <button
                            className={`neo-btn giant ${hasOpenAttempt ? 'blue' : 'orange'}`}
                            onClick={handleStartQuiz}
                            disabled={starting}
                        >
                            {starting ? (hasOpenAttempt ? 'RESUMING...' : 'STARTING...') : (hasOpenAttempt ? 'RESUME QUIZ' : 'START QUIZ')}
                        </button>
                    )}
                </div>

            </div>
        </div>
    );
};

export default QuizIntroPage;
