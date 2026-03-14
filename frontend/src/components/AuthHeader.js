import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import './AuthHeader.css';

const AuthHeader = () => {
    const navigate = useNavigate();

    return (
        <header className="auth-header">
            <div className="auth-header-content">
                <img
                    src="/Brand Images/QT-header.png"
                    className="auth-nav-logo"
                    alt="QuizTinker Logo"
                    onClick={() => navigate('/')}
                />
                <button className="auth-back-btn" onClick={() => navigate('/')}>
                    <ArrowLeft size={20} />
                    <span style={{ fontWeight: 'bold', fontSize: '1.5rem' }}>Back to Home</span>
                </button>
            </div>
        </header>
    );
};

export default AuthHeader;
