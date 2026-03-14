import React from 'react';
import { User as UserIcon, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './QuizCard.css';

const QuizCard = ({ quiz, onClick }) => {
    const navigate = useNavigate();
    const imageUrl = quiz.preview_image
        ? (quiz.preview_image.startsWith('http')
            ? quiz.preview_image
            : `http://localhost:8000${quiz.preview_image}`)
        : null;


    const isDraft = quiz.status === 'draft';
    const completedAttempts = quiz.student_attempts_taken || 0;
    const maxAttempts = quiz.attempts_allowed || 1;
    const isCompleted = !isDraft && completedAttempts >= maxAttempts;

    const cardStyle = {};
    if (isCompleted) {
        cardStyle.backgroundColor = '#f1f5f9';
        cardStyle.filter = 'grayscale(80%)';
        cardStyle.opacity = '0.85';
    }

    const handleActionClick = (e) => {
        e.stopPropagation();
        if (isDraft) {
            if (onClick) onClick(quiz);
        } else if (isCompleted) {
            const latestId = quiz.latest_attempt_id || '';
            navigate(`/quizzes/${quiz.id}/results/${latestId}`);
        } else {
            navigate(`/quizzes/${quiz.id}/intro`);
        }
    };

    return (
        <div
            className="quiz-card-neo"
            style={cardStyle}
            onClick={() => onClick && onClick(quiz)}
        >
            {/* Attempt Badge - Hidden for Drafts */}
            {!isDraft && (
                <div className="quiz-attempt-badge-neo">
                    <span className="badge-count-neo">{completedAttempts}/{maxAttempts}</span>
                    <span className="badge-label-neo">ATTEMPTS</span>
                </div>
            )}

            <div className="quiz-card-image-wrapper">
                {imageUrl ? (
                    <img src={imageUrl} alt={quiz.title} className="quiz-card-img" />
                ) : (
                    <div className="quiz-card-fallback-bg" />
                )}
            </div>

            <div className="quiz-card-body">
                <h4 className="quiz-card-title">{quiz.title}</h4>
                <div className="quiz-card-author">
                    <UserIcon size={14} />
                    <span>{quiz.author_name}</span>
                </div>

                {quiz.deadline && (
                    <div className="quiz-card-deadline">
                        <Calendar size={14} />
                        <span>Deadline: {new Date(quiz.deadline).toLocaleDateString()}</span>
                    </div>
                )}
                
                <button 
                    className={`quiz-card-action-btn ${isDraft ? 'manage-quiz' : (isCompleted ? 'view-results' : 'take-quiz')}`}
                    onClick={handleActionClick}
                >
                    {isDraft ? 'MANAGE QUIZ' : (isCompleted ? 'VIEW RESULTS' : 'TAKE QUIZ')}
                </button>
            </div>
        </div>
    );
};

export default QuizCard;
