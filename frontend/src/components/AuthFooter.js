import React from 'react';
import './AuthFooter.css';

const AuthFooter = () => {
    return (
        <footer className="auth-footer">
            <div className="footer-column">
                <img src="/Brand Images/QT-Brand.png" className="footer-logo-img" alt="QuizTinker" />
            </div>
            <div className="footer-column about-column">
                <h4 className="footer-heading">About This Project</h4>
                <p className="footer-text">
                    QuizTinker is an AI-powered quiz generation platform. This project was created as a Final Requirement for the Web Systems and Technologies 2 Course by 3rd-year BSIT students.
                </p>
                <p className="footer-school">Technological Institute of the Philippines - Manila</p>
            </div>
            <div className="footer-column team-column">
                <h4 className="footer-heading">Development Team</h4>
                <ul className="footer-team-list">
                    <li><strong>Alexa Nicole Dela Cruz</strong></li>
                    <li><strong>Daniel Aaron Espela</strong></li>
                    <li><strong>Josh Michael Fangonilo</strong></li>
                    <li><strong>Alexandra Pauline Martinez</strong></li>
                    <li><strong>John Ivan Roxas</strong></li>
                </ul>
            </div>
        </footer>
    );
};

export default AuthFooter;
