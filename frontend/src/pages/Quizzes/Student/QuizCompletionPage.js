import React from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import './QuizCompletionPage.css';

const QuizCompletionPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();

    const attemptId = location.state?.attemptId;
    const score = location.state?.score;
    const attemptsUsed = location.state?.attemptsUsed;
    const attemptsAllowed = location.state?.attemptsAllowed;
    const isLate = location.state?.isLate;

    const hasRetakes = attemptsAllowed && attemptsUsed < attemptsAllowed;

    return (
        <div className="completion-page">
            <div className="completion-card">
                {/* Confetti-like decorations */}
                <div className="confetti-dot dot-1"></div>
                <div className="confetti-dot dot-2"></div>
                <div className="confetti-dot dot-3"></div>
                <div className="confetti-dot dot-4"></div>
                <div className="confetti-dot dot-5"></div>
                <div className="confetti-dot dot-6"></div>

                <div className="completion-icon">🎉</div>
                <h1 className="completion-title">Quiz Complete!</h1>
                <p className="completion-subtitle">
                    Congrats, you finished the quiz!
                    {isLate && <span className="late-badge"> (Submitted Late)</span>}
                </p>

                {score !== undefined && (
                    <div className="completion-score-preview">
                        <span className="score-label">POINTS EARNED</span>
                        <span className="score-value">{score}</span>
                    </div>
                )}

                {attemptsAllowed && (
                    <div className="completion-attempts-info">
                        Attempt {attemptsUsed} of {attemptsAllowed} used
                    </div>
                )}

                <div className="completion-actions">
                    {attemptId && (
                        <button
                            className="neo-btn giant primary"
                            onClick={() => navigate(`/quizzes/${id}/results/${attemptId}`, { replace: true })}
                        >
                            VIEW RESULTS
                        </button>
                    )}

                    {hasRetakes && (
                        <button
                            className="neo-btn giant retake"
                            onClick={() => navigate(`/quizzes/${id}/intro`, { replace: true })}
                        >
                            RETAKE QUIZ ({attemptsAllowed - attemptsUsed} left)
                        </button>
                    )}

                    <button
                        className="neo-btn giant secondary"
                        onClick={() => navigate('/dashboard', { replace: true })}
                    >
                        BACK TO DASHBOARD
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuizCompletionPage;
