// src/context/AuthContext.js  — FULL REPLACEMENT
import React, { createContext, useContext, useState, useEffect } from 'react';
import axiosClient from '../api/axiosClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState(null);
    // aiGenerating holds the quiz title while AI generation is in progress, or null.
    const [aiGenerating, setAiGenerating] = useState(() => {
        return sessionStorage.getItem('aiGenerating') || null;
    });
    const [aiGenError, setAiGenError] = useState(null);

    useEffect(() => {
        if (aiGenerating) {
            sessionStorage.setItem('aiGenerating', aiGenerating);
            
            // Global failsafe: clear aiGenerating after 2 minutes to prevent infinite
            // loading states if the user navigates away from the polling page.
            const failsafeTimer = setTimeout(() => {
                setAiGenerating(null);
            }, 2 * 60 * 1000);
            
            return () => clearTimeout(failsafeTimer);
        } else {
            sessionStorage.removeItem('aiGenerating');
        }
    }, [aiGenerating]);

    // Global Toast helper
    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const updateUserContext = (newData) => {
        setUser(prev => ({ ...prev, ...newData }));
    };

    const checkAuth = async () => {
        const token = sessionStorage.getItem('token');
        if (!token) {
            setLoading(false);
            return;
        }

        try {
            const response = await axiosClient.get('/api/user');
            setUser(response.data);
        } catch (error) {
            setUser(null);
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('user');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const savedUser = sessionStorage.getItem('user');
        if (savedUser) {
            setUser(JSON.parse(savedUser));
        }
        checkAuth();

        const requestInterceptor = axiosClient.interceptors.response.use(
            (response) => response,
            (error) => {
                if (error.response && error.response.status === 401) {
                    setUser(null);
                    sessionStorage.removeItem('token');
                    sessionStorage.removeItem('user');

                    if (window.isSubmittingQuiz) {
                        console.warn('[AUTH] 401 detected during quiz submission. Suppressing hard redirect.');
                        return Promise.reject(error);
                    }

                    if (window.location.pathname !== '/auth' && window.location.pathname !== '/') {
                        window.location.href = '/auth';
                    }
                }
                return Promise.reject(error);
            }
        );

        return () => {
            axiosClient.interceptors.response.eject(requestInterceptor);
        };
    }, []);

    /**
     * login()
     * - If the server returns { otp_required: true }, we return that signal to
     *   Auth.js so it can switch to the OTP screen.
     * - If it returns { user, token } directly (e.g. future bypass), we log in.
     */
    const login = async (email, password) => {
        const response = await axiosClient.post('/api/login', { email, password });

        if (response.data.otp_required) {
            // Signal to the UI that the OTP step is needed
            return { otpRequired: true, email: response.data.email };
        }

        // Direct login (fallback / future use)
        const { user, token } = response.data;
        sessionStorage.setItem('token', token);
        sessionStorage.setItem('user', JSON.stringify(user));
        setUser(user);
        return { otpRequired: false };
    };

    /**
     * otpVerify()
     * Submits the 6-digit OTP. On success, stores the token and sets the user.
     */
    const otpVerify = async (email, otp) => {
        const response = await axiosClient.post('/api/login/verify-otp/', { email, otp });
        const { user, token } = response.data;

        sessionStorage.setItem('token', token);
        sessionStorage.setItem('user', JSON.stringify(user));
        setUser(user);
    };

    const register = async (data) => {
        const response = await axiosClient.post('/api/register', data);
        
        if (response.data.otp_required) {
            return { otpRequired: true, email: response.data.email };
        }

        const { user, token } = response.data;
        sessionStorage.setItem('token', token);
        sessionStorage.setItem('user', JSON.stringify(user));
        setUser(user);
        return { otpRequired: false };
    };

    /**
     * registerOtpVerify()
     * Submits the 6-digit OTP for new account registration.
     */
    const registerOtpVerify = async (email, otp) => {
        const response = await axiosClient.post('/api/register/verify-otp/', { email, otp });
        const { user, token } = response.data;

        sessionStorage.setItem('token', token);
        sessionStorage.setItem('user', JSON.stringify(user));
        setUser(user);
    };

    const logout = async () => {
        await axiosClient.post('/api/logout').catch(() => { });
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        sessionStorage.removeItem('aiGenerating');
        setAiGenerating(null);
        setAiGenError(null);
        setUser(null);
    };

    const [friendsVersion, setFriendsVersion] = useState(0);
    const bumpFriendsVersion = () => setFriendsVersion(prev => prev + 1);

    return (
        <AuthContext.Provider value={{
            user, loading, login, otpVerify, register, registerOtpVerify, logout,
            updateUserContext, showToast,
            friendsVersion, bumpFriendsVersion,
            aiGenerating, setAiGenerating,
            aiGenError, setAiGenError,
        }}>
            {children}

            {/* Persistent AI Generation Toast */}
            {aiGenerating && (
                <div style={{
                    position: 'fixed',
                    bottom: toast ? '80px' : '20px',
                    right: '20px',
                    background: '#ffffff',
                    color: '#1e1e1e',
                    padding: '14px 20px',
                    borderRadius: '12px',
                    boxShadow: '4px 4px 0px #1e1e1e',
                    border: '3px solid #1e1e1e',
                    zIndex: 9998,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    maxWidth: '320px',
                    animation: 'fadeIn 0.3s ease-out',
                }}>
                    <div style={{
                        width: '18px', height: '18px', flexShrink: 0,
                        borderRadius: '50%',
                        border: '3px solid #e2e8f0',
                        borderTopColor: '#5A82E6',
                        animation: 'qt-spin 0.8s linear infinite',
                    }} />
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 900, color: '#5A82E6', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '2px' }}>
                            Generating Quiz
                        </div>
                        <div style={{
                            fontSize: '0.9rem', fontWeight: 700,
                            color: '#1e1e1e',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            {aiGenerating}
                        </div>
                    </div>
                </div>
            )}

            {/* Ephemeral Toast */}
            {toast && (
                <div style={{
                    position: 'fixed', bottom: '20px', right: '20px',
                    background: toast.type === 'error' ? '#E53935' : toast.type === 'warn' ? '#FB8C00' : '#4CAF50',
                    color: 'white', padding: '15px 25px', borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 9999,
                    fontWeight: 'bold', fontSize: '0.9rem',
                    animation: 'fadeIn 0.3s ease-out'
                }}>
                    {toast.message}
                </div>
            )}

            {/* AI Generation Error Overlay */}
            {aiGenError && (
                <div style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(0,0,0,0.45)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 10000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'fadeIn 0.3s ease-out',
                }}>
                    <div style={{
                        background: '#ffffff',
                        border: '3px solid #1e1e1e',
                        boxShadow: '6px 6px 0px #1e1e1e',
                        borderRadius: '16px',
                        padding: '32px 36px',
                        maxWidth: '480px',
                        width: '90%',
                        textAlign: 'center',
                    }}>
                        {/* Error Icon */}
                        <div style={{
                            width: '56px', height: '56px',
                            borderRadius: '50%',
                            background: '#FFF3E0',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 16px auto',
                            border: '2px solid #FB8C00',
                        }}>
                            <span style={{ fontSize: '28px' }}>⚠️</span>
                        </div>

                        <h2 style={{
                            color: '#E53935',
                            fontWeight: 900,
                            fontSize: '1.3rem',
                            marginBottom: '12px',
                            letterSpacing: '-0.01em',
                        }}>Generation Failed</h2>

                        <p style={{
                            color: '#555',
                            fontSize: '0.95rem',
                            lineHeight: '1.5',
                            marginBottom: '8px',
                        }}>
                            {aiGenError.message}
                        </p>

                        {aiGenError.remainingRetries > 0 && (
                            <p style={{
                                color: '#888',
                                fontSize: '0.8rem',
                                marginBottom: '20px',
                            }}>
                                {aiGenError.remainingRetries} {aiGenError.remainingRetries === 1 ? 'retry' : 'retries'} remaining before using offline questions
                            </p>
                        )}

                        <div style={{
                            display: 'flex',
                            gap: '12px',
                            justifyContent: 'center',
                            flexWrap: 'wrap',
                        }}>
                            <button
                                onClick={() => setAiGenError(null)}
                                style={{
                                    padding: '10px 22px',
                                    border: '3px solid #1e1e1e',
                                    borderRadius: '10px',
                                    background: '#ffffff',
                                    color: '#1e1e1e',
                                    fontWeight: 800,
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    boxShadow: '3px 3px 0px #1e1e1e',
                                    transition: 'all 0.15s ease',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.04em',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => aiGenError.retryFn && aiGenError.retryFn()}
                                style={{
                                    padding: '10px 22px',
                                    border: '3px solid #1e1e1e',
                                    borderRadius: '10px',
                                    background: '#5A82E6',
                                    color: '#ffffff',
                                    fontWeight: 800,
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    boxShadow: '3px 3px 0px #1e1e1e',
                                    transition: 'all 0.15s ease',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.04em',
                                }}
                            >
                                {aiGenError.btnText || 'Retry Again'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Keyframe injection */}
            <style>{`
                @keyframes qt-spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);