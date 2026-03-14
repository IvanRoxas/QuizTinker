import React, { createContext, useContext, useState, useEffect } from 'react';
import axiosClient from '../api/axiosClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState(null);

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
                    // Session expired or unauthorized
                    setUser(null);
                    sessionStorage.removeItem('token');
                    sessionStorage.removeItem('user');

                    // If we are actively submitting a quiz, don't force a redirect yet.
                    if (window.isSubmittingQuiz) {
                        console.warn('[AUTH) 401 detected during quiz submission. Suppressing hard redirect.');
                        return Promise.reject(error);
                    }

                    // Force redirect, depending on routing setup
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

    const login = async (email, password) => {
        const response = await axiosClient.post('/api/login', { email, password });
        const { user, token } = response.data;
        
        sessionStorage.setItem('token', token);
        sessionStorage.setItem('user', JSON.stringify(user));
        setUser(user);
    };

    const register = async (data) => {
        const response = await axiosClient.post('/api/register', data);
        const { user, token } = response.data;
        
        // We log them in directly now that we have the token
        sessionStorage.setItem('token', token);
        sessionStorage.setItem('user', JSON.stringify(user));
        setUser(user);
    };

    const logout = async () => {
        await axiosClient.post('/api/logout').catch(() => {});
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        setUser(null);
    };

    const [friendsVersion, setFriendsVersion] = useState(0);

    const bumpFriendsVersion = () => setFriendsVersion(prev => prev + 1);

    return (
        <AuthContext.Provider value={{
            user, loading, login, register, logout,
            updateUserContext, showToast,
            friendsVersion, bumpFriendsVersion
        }}>
            {children}
            {toast && (
                <div style={{
                    position: 'fixed', bottom: '20px', right: '20px',
                    background: toast.type === 'error' ? '#E53935' : '#4CAF50',
                    color: 'white', padding: '15px 25px', borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 9999,
                    fontWeight: 'bold', fontSize: '0.9rem',
                    animation: 'fadeIn 0.3s ease-out'
                }}>
                    {toast.message}
                </div>
            )}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
