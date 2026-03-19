import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axiosClient from '../../../api/axiosClient';
import { useAuth } from '../../../context/AuthContext';
import { getDisplayName } from '../../../utils/userUtils';
import './QuizResultsPage.css';

const getOrdinalSuffix = (i) => {
    const j = i % 10, k = i % 100;
    if (j === 1 && k !== 11) return i + "st";
    if (j === 2 && k !== 12) return i + "nd";
    if (j === 3 && k !== 13) return i + "rd";
    return i + "th";
};

const getFeedbackRemark = (pct) => {
    if (pct >= 90) return { text: "Phenomenal! You've practically mastered this material.", color: '#22c55e' }; // Green
    if (pct >= 75) return { text: "Great job! You have a very solid understanding of these concepts.", color: '#84cc16' }; // Light Green
    if (pct >= 60) return { text: "Good effort. You passed, but reviewing the feedback below will help solidify your knowledge.", color: '#eab308' }; // Yellow
    if (pct >= 40) return { text: "Not quite there. Review the material closely and try again to improve your score.", color: '#f97316' }; // Orange
    return { text: "Tough break. Maybe take some time to study the correct answers below before your next attempt.", color: '#ef4444' }; // Red
};

const QuizResultsPage = () => {
    const { id, attemptId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [quiz, setQuiz] = useState(null);
    const [attempt, setAttempt] = useState(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState(null);
    const [resultsData, setResultsData] = useState(null);
    const [lightboxImage, setLightboxImage] = useState(null);
    const [showLeaderboard, setShowLeaderboard] = useState(false);

    useEffect(() => {
        const loadResults = async () => {
            try {
                setLoading(true);
                const response = await axiosClient.get(`/api/quizzes/${id}/attempts/${attemptId}/`);
                setResultsData(response.data);
                setQuiz(response.data.quiz);
                setAttempt(response.data.attempt);
                setItems(response.data.quiz.items.sort((a, b) => a.sort_order - b.sort_order));
            } catch (err) {
                console.error(err);
                setErrorMsg(err.response?.data?.message || 'Failed to load results.');
            } finally {
                setLoading(false);
            }
        };

        loadResults();

        // Apply global background to the layout container for full screen bleed
        const layoutEl = document.querySelector('.dashboard-layout');
        if (layoutEl) {
            layoutEl.style.backgroundColor = '#ffffff';
        }

        return () => {
            if (layoutEl) {
                layoutEl.style.backgroundColor = '';
            }
        };
    }, [id, attemptId]);
    if (loading) {
        return (
            <div className="student-view-container">
                <div className="neo-intro-card loading-card">
                    <h2>Calculating Results...</h2>
                </div>
            </div>
        );
    }

    if (errorMsg || !attempt) {
        return (
            <div className="student-view-container">
                <div className="neo-intro-card error-card">
                    <h2>Error</h2>
                    <p>{errorMsg || "Results not found."}</p>
                    <button className="neo-btn white" onClick={() => navigate('/dashboard')}>
                        Back to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    // Calculate totals
    const totalPointsPossible = items.reduce((sum, item) => sum + item.points, 0);
    const score = attempt.score;
    const percentage = totalPointsPossible > 0 ? Math.round((score / totalPointsPossible) * 100) : 0;

    const { attempts_used, attempts_allowed, cheat_prevention_active, analytics } = resultsData;

    // Time Formatting Helper
    const formatTime = (totalSeconds) => {
        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        return `${m}m ${s}s`;
    };

    const timeTakenLabel = formatTime(attempt.time_taken_seconds || 0);
    const timeLimitLabel = quiz.time_limit_minutes ? formatTime(quiz.time_limit_minutes * 60) : null;

    // 1. Calculate Pace (Seconds per Question)
    const questionCount = items.length > 0 ? items.length : 1;
    const paceSeconds = Math.round((attempt.time_taken_seconds || 0) / questionCount);

    // 2. Calculate Attempt Delta (Improvement)
    let deltaUI = "FIRST ATTEMPT";
    let deltaColor = "#64748b"; // neutral gray
    if (analytics && analytics.previous_attempt_score !== null && totalPointsPossible > 0) {
        const prevPercentage = Math.round((analytics.previous_attempt_score / totalPointsPossible) * 100);
        const currentPercentage = percentage;
        const diff = currentPercentage - prevPercentage;

        if (diff > 0) {
            deltaUI = `📈 +${diff}% from last attempt`;
            deltaColor = "#16a34a"; // green
        } else if (diff < 0) {
            deltaUI = `📉 ${diff}% from last attempt`;
            deltaColor = "#dc2626"; // red
        } else {
            deltaUI = `➖ No change`;
        }
    }

    // RENDER FEEDBACK BLOCKS
    const renderFeedback = (item) => {
        const itemResult = attempt.answers[str(item.id)] || {};
        const isCorrect = itemResult.is_correct;
        const studentAns = itemResult.student_answer;
        const ptsEarned = itemResult.points_earned || 0;

        // Fix media URL
        const mediaUrl = item.media ? (item.media.startsWith('http') ? item.media : `http://localhost:8000${item.media}`) : null;

        const boxClass = isCorrect ? 'feedback-box correct' : 'feedback-box incorrect';

        return (
            <div key={item.id} className={`feedback-card ${isCorrect ? 'correct-card' : 'incorrect-card'}`}>
                <div className="feedback-header">
                    <h3>{item.sort_order + 1}. {item.question}</h3>
                    <div className={`feedback-pts ${isCorrect ? 'pts-correct' : 'pts-incorrect'}`}>
                        {ptsEarned} / {item.points} PTS
                    </div>
                </div>

                {mediaUrl && (
                    <img
                        src={mediaUrl}
                        alt="Question Media"
                        className="feedback-media clickable"
                        onClick={() => setLightboxImage(mediaUrl)}
                    />
                )}

                {item.global_accuracy !== undefined && (
                    <div className="global-accuracy-badge">
                        GLOBAL ACCURACY: {item.global_accuracy}%
                    </div>
                )}

                <div className="feedback-comparison">
                    <div className="feedback-column">
                        <div className="feedback-label">YOUR ANSWER</div>
                        <div className={boxClass}>
                            {formatAnswer(item, studentAns, true)}
                        </div>
                    </div>

                    {!isCorrect && (
                        quiz.show_answers_at_end !== false ? (
                            <div className="feedback-column print-hide">
                                <div className="feedback-label">CORRECT ANSWER</div>
                                {cheat_prevention_active ? (
                                    <div className="cheat-warning-box">
                                        CORRECT ANSWER HIDDEN UNTIL ALL ATTEMPTS ARE USED.
                                    </div>
                                ) : (
                                    <div className="feedback-box ideal">
                                        {formatAnswer(item, getCorrectAnswer(item), false)}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="feedback-column print-hide">
                                <div className="feedback-label">CORRECT ANSWER</div>
                                <div className="feedback-box hidden-answer" style={{ background: '#ffe5e5', color: '#d32f2f', padding: '12px', borderRadius: '0.5rem', border: '2px solid #d32f2f', fontWeight: 'bold', boxShadow: '3px 3px 0 #d32f2f' }}>
                                    Hidden by instructor
                                </div>
                            </div>
                        )
                    )}
                </div>
            </div>
        );
    };

    const getCorrectAnswer = (item) => {
        if (item.type === 'identification') return item.correct_answer;
        if (item.type === 'single_choice') {
            const correctChoice = item.choices.find(c => c.is_correct);
            return correctChoice ? correctChoice.text : 'N/A';
        }
        if (item.type === 'multiple_answer') {
            const corrects = item.choices.map((c, i) => c.is_correct ? c.text : null).filter(c => c);
            return corrects;
        }
        if (item.type === 'true_false') return item.tf_correct ? 'TRUE' : 'FALSE';
        if (item.type === 'matching') {
            return item.meta?.pairs?.reduce((acc, p) => { acc[p.left] = p.right; return acc; }, {});
        }
        if (item.type === 'ordering') {
            return item.meta?.order;
        }
        return 'N/A';
    };

    const formatAnswer = (item, val, isStudent) => {
        const type = item.type;
        if (val === null || val === undefined || val === '') return <em>No Answer</em>;

        if (type === 'single_choice' && isStudent) {
            // Find choice by index
            const choice = item?.choices?.[val];
            return choice ? choice.text : String(val);
        }

        if (type === 'multiple_answer' || type === 'ordering') {
            let arr = val;
            if (isStudent && type === 'multiple_answer') {
                if (Array.isArray(val)) {
                    return (
                        <ul className="feedback-list">
                            {val.map((index, i) => {
                                const choice = item?.choices?.[index];
                                return <li key={i}>{choice ? choice.text : String(index)}</li>;
                            })}
                        </ul>
                    );
                }
                return String(val);
            }
            if (Array.isArray(arr)) {
                return (
                    <ol className="feedback-list ordered">
                        {arr.map((v, i) => <li key={i}>{v}</li>)}
                    </ol>
                );
            }
        }
        if (type === 'matching') {
            if (typeof val === 'object') {
                return (
                    <ul className="feedback-list">
                        {Object.entries(val).map(([left, right], i) => (
                            <li key={i}><strong>{left}</strong> -&gt; {right}</li>
                        ))}
                    </ul>
                );
            }
        }
        if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
        if (typeof val === 'object') return JSON.stringify(val);

        return String(val);
    };

    // Note: JS `str()` map equivalent is just converting id to string
    function str(val) { return String(val); }

    return (
        <div className="results-page" style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
        }}>
            <h1 className="print-report-header">QuizTinker Official Report</h1>

            <div className="results-container results-page-wrapper">
                {/* ── HERO SCOREBOARD ── */}
                {(() => {
                    const rawUrl = quiz.image_url || quiz.preview_image;
                    const hasImage = rawUrl &&
                        typeof rawUrl === 'string' &&
                        rawUrl.trim() !== "" &&
                        rawUrl !== "null" &&
                        !rawUrl.includes("undefined");

                    const finalUrl = hasImage ? (rawUrl.startsWith('http') ? rawUrl : `http://localhost:8000${rawUrl}`) : null;

                    return (
                        <div className="hero-scoreboard">
                            {/* Left Column: Context */}
                            <div className="hero-left">
                                <div className="hero-main-info">
                                    <div className="hero-image-container" style={{
                                        flexShrink: 0,
                                        width: '80px',
                                        height: '80px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '8px',
                                        overflow: 'hidden',
                                        backgroundColor: '#f1f5f9'
                                    }}>
                                        {hasImage ? (
                                            <img
                                                src={finalUrl}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                alt="Quiz"
                                                onError={(e) => {
                                                    e.target.style.display = 'none';
                                                    e.target.parentElement.style.background = 'linear-gradient(135deg, #FFD6A5, #CAFFBF, #A8DADC, #BDB2FF)'; // Vibrant neo-brutalist gradient fallback
                                                }}
                                            />
                                        ) : (
                                            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #FFD6A5, #CAFFBF, #A8DADC, #BDB2FF)' }} />
                                        )}
                                    </div>
                                    <div className="hero-text-content">
                                        <h1 className="hero-title">{quiz.title}</h1>
                                        <div className="hero-meta-row">
                                            <div className="hero-author"><strong>Created By:</strong> {quiz.author_name}</div>
                                            <div className="hero-student"><strong>Student:</strong> {getDisplayName(user)}</div>
                                        </div>
                                        <div className="hero-date"><strong>Date Completed:</strong> {new Date(attempt.end_time).toLocaleString()}</div>
                                    </div>
                                </div>

                                {/* Instructor Remarks Box */}
                                {(() => {
                                    const remark = getFeedbackRemark(percentage);
                                    return (
                                        <div className="feedback-summary-box" style={{
                                            marginTop: '32px',
                                            marginBottom: 'auto',
                                            padding: '20px',
                                            backgroundColor: '#f8fafc',
                                            borderRadius: '8px',
                                            borderLeft: `6px solid ${remark.color}`
                                        }}>
                                            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800 }}>QuizTinker Says:</h4>
                                            <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#0f172a', lineHeight: 1.5 }}>
                                                {remark.text}
                                            </p>
                                        </div>
                                    );
                                })()}

                                <img 
                                    src="/Brand Images/QT-header.png" 
                                    className="print-only-header" 
                                    alt="QT Header" 
                                />

                                {analytics?.leaderboard && analytics.leaderboard.length > 0 && (
                                    <button
                                        className="leaderboard-full-btn print-hide"
                                        onClick={() => setShowLeaderboard(true)}
                                    >
                                        VIEW CLASS LEADERBOARD
                                    </button>
                                )}

                                {/* Action Buttons - Moved here */}
                                <div className="hero-actions print-hide">
                                    <div className="hero-action-group">
                                        {(!attempts_allowed || attempts_allowed === 0 || attempts_used < attempts_allowed) ? (
                                            <button className="neo-btn small retake" onClick={() => navigate(`/quizzes/${id}/intro`)}>
                                                RETAKE QUIZ
                                            </button>
                                        ) : (
                                            <button className="neo-btn small disabled" disabled title={`You have used all ${attempts_allowed} attempts.`}>
                                                MAX ATTEMPTS
                                            </button>
                                        )}
                                    </div>
                                    <button className="neo-btn small print" onClick={() => window.print()}>
                                        Print Results
                                    </button>
                                    <button className="neo-btn small dashboard" onClick={() => navigate('/dashboard')}>
                                        Back to Dashboard
                                    </button>
                                </div>
                            </div>

                            {/* Right Column: Stats */}
                            <div className="hero-right">
                                {(() => {
                                    const radius = 40;
                                    const circumference = 2 * Math.PI * radius;
                                    const strokeDashoffset = circumference - (percentage / 100) * circumference;
                                    const circleColor = percentage >= 60 ? '#22c55e' : '#ef4444'; // Green if passed, Red if failed

                                    return (
                                        <>
                                            <div className="score-visual-block" style={{ display: 'flex', alignItems: 'center', gap: '32px', marginBottom: '24px', width: '100%' }}>
                                                <div className="svg-container" style={{ position: 'relative', width: '160px', height: '160px', flexShrink: 0 }}>
                                                    <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)', overflow: 'visible', width: '100%', height: '100%' }}>
                                                        {/* Background Track */}
                                                        <circle cx="50" cy="50" r={radius} stroke="#e2e8f0" strokeWidth="8" fill="none" />
                                                        {/* Progress Ring */}
                                                        <circle cx="50" cy="50" r={radius} stroke={circleColor} strokeWidth="8" fill="none"
                                                            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round"
                                                            style={{ transition: 'stroke-dashoffset 1s ease-in-out' }} />
                                                    </svg>
                                                    {/* Text Inside Circle */}
                                                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                                        <span style={{ fontSize: '3.5rem', fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{score}</span>
                                                        <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600, marginTop: '2px' }}>Points</span>
                                                    </div>
                                                </div>
                                                <div className="out-of-text" style={{ fontSize: '1.2rem', fontWeight: 700, color: '#475569' }}>
                                                    Out of {totalPointsPossible} pts
                                                </div>
                                            </div>

                                            {(() => {
                                                const letPercentage = totalPointsPossible > 0 ? Math.round(50 + 50 * (score / totalPointsPossible)) : 50;
                                                return (
                                                    <div className="let-percentage-container" style={{ textAlign: 'center', marginBottom: '16px', width: '100%' }}>
                                                        <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>
                                                            You scored {letPercentage}%
                                                        </span>
                                                    </div>
                                                );
                                            })()}

                                            {analytics && analytics.total_students > 1 && totalPointsPossible > 0 && (
                                                <div className="distribution-slider" style={{ position: 'relative', width: '100%', height: '50px', marginBottom: '20px' }}>
                                                    {/* Base Horizontal Line */}
                                                    <div style={{ position: 'absolute', top: '20px', left: 0, right: 0, height: '4px', backgroundColor: '#e2e8f0', borderRadius: '2px' }} />

                                                    {/* Ticks & Labels */}
                                                    {[
                                                        { label: 'Low', val: analytics.class_low },
                                                        { label: 'Mean', val: Math.round(analytics.class_mean) },
                                                        { label: 'High', val: analytics.class_high }
                                                    ].map((stat, idx) => {
                                                        const leftPct = (stat.val / totalPointsPossible) * 100;
                                                        return (
                                                            <div key={idx} style={{ position: 'absolute', left: `${leftPct}%`, top: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', transform: 'translateX(-50%)' }}>
                                                                <div style={{ width: '2px', height: '10px', backgroundColor: '#94a3b8' }} />
                                                                <span style={{ fontSize: '0.6rem', color: '#64748b', marginTop: '4px', whiteSpace: 'nowrap', fontWeight: 700 }}>{stat.label}: {stat.val}</span>
                                                            </div>
                                                        );
                                                    })}

                                                    {/* Current Score Marker (The Dot) */}
                                                    <div style={{
                                                        position: 'absolute',
                                                        left: `${percentage}%`,
                                                        top: '20px',
                                                        width: '14px',
                                                        height: '14px',
                                                        backgroundColor: circleColor,
                                                        borderRadius: '50%',
                                                        transform: 'translate(-50%, -5px)',
                                                        boxShadow: '0 0 0 3px #fff',
                                                        zIndex: 2
                                                    }} title={`Your Score: ${score}`} />
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}

                                <div className="hero-stats-row">
                                    <div className="neo-stat-box">
                                        <span className="stat-label">POINTS</span>
                                        <span className="stat-value">{score} / {totalPointsPossible}</span>
                                    </div>

                                    <div className={`neo-stat-box ${percentage >= 60 ? 'passed' : 'failed'}`}>
                                        <span className="stat-label">STATUS</span>
                                        <span className="stat-value">{percentage >= 60 ? 'PASSED' : 'FAILED'}</span>
                                    </div>
                                </div>

                                <div className={`time-spent-block ${attempt.is_late ? 'late' : ''}`}>
                                    <span className="stat-label">TIME</span>: {timeTakenLabel} {timeLimitLabel && `/ ${timeLimitLabel}`}
                                    {attempt.is_late && <span className="late-badge"> [LATE]</span>}
                                </div>

                                {/* --- Analytics Ribbon - Moved inside hero-right --- */}
                                <div className="analytics-ribbon-mini">
                                    <div className="ribbon-stat">
                                        <span className="ribbon-label">RANK</span>
                                        <span className="ribbon-value">
                                            {analytics?.rank ? `${getOrdinalSuffix(analytics.rank)} of ${analytics.total_students}` : '--'}
                                        </span>
                                    </div>
                                    <div className="ribbon-stat">
                                        <span className="ribbon-label">CLASS AVG</span>
                                        <span className="ribbon-value">
                                            {analytics?.class_mean != null ? `${Math.round(analytics.class_mean)} pts` : '--'}
                                        </span>
                                    </div>
                                    <div className="ribbon-stat">
                                        <span className="ribbon-label">AVG PACE</span>
                                        <span className="ribbon-value">
                                            {Math.round((attempt.time_taken_seconds || 0) / (items.length || 1))}s / q
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* --- Standalone Action Buttons Removed --- */}

                {/* ── DETAILED FEEDBACK ── */}
                <div className="feedback-section print-hide no-print">
                    <h2 className="feedback-section-title">DETAILED FEEDBACK</h2>
                    <div className="feedback-list-container">
                        {items.map(renderFeedback)}
                    </div>
                </div>
            </div>

            <div className="print-footer">
                QuizTinker Official Student Progress Report • Generated on {new Date().toLocaleDateString()}
            </div>

            {/* LIGHTBOX MODAL */}
            {lightboxImage && (
                <div className="neo-modal-overlay lightbox" onClick={() => setLightboxImage(null)}>
                    <div className="lightbox-content" onClick={e => e.stopPropagation()}>
                        <button className="lightbox-close" onClick={() => setLightboxImage(null)}>&times;</button>
                        <img src={lightboxImage} alt="Fullscreen" />
                    </div>
                </div>
            )}

            {/* LEADERBOARD MODAL */}
            {showLeaderboard && analytics?.leaderboard && (
                <div className="neo-modal-overlay" onClick={() => setShowLeaderboard(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="neo-modal-content" onClick={e => e.stopPropagation()} style={{ backgroundColor: '#fff', border: '4px solid #000', borderRadius: '12px', boxShadow: '8px 8px 0px #000', width: '95%', maxWidth: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ padding: '20px', borderBottom: '2px solid #000', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
                            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900 }}>Class Leaderboard</h2>
                            <button onClick={() => setShowLeaderboard(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', fontWeight: 900 }}>&times;</button>
                        </div>
                        <div style={{ padding: '10px 0', overflowY: 'auto', flex: 1 }}>
                            {analytics.leaderboard.map((entry) => (
                                <div key={entry.rank} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '12px 20px',
                                    borderBottom: '1px solid #e2e8f0',
                                    backgroundColor: entry.student_name === user?.username ? '#fef08a' : 'transparent',
                                    fontWeight: entry.student_name === user?.username ? 800 : 500
                                }}>
                                    <div style={{ width: '45px', fontSize: '1.1rem', color: '#64748b', fontWeight: 800 }}>#{entry.rank}</div>
                                    <div style={{ flex: 1, fontSize: '1.1rem', color: '#0f172a' }}>{entry.student_name}</div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '1.1rem', color: '#0f172a', fontWeight: 800 }}>{entry.score} pts</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                                            {(() => {
                                                const mins = Math.floor((entry.time_taken || 0) / 60);
                                                const secs = (entry.time_taken || 0) % 60;
                                                return `${mins}m ${secs}s`;
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* FORCE BOTTOM GAP */}
            <div className="results-bottom-spacer" />
        </div>
    );
};

export default QuizResultsPage;
