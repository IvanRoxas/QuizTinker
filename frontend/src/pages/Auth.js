import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import AuthHeader from '../components/AuthHeader';
import AuthFooter from '../components/AuthFooter';
import './Auth.css';

const Auth = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        first_name: '',
        last_name: '',
        email: '',
        password: '',
        password_confirmation: ''
    });
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);

    const { login, register, showToast } = useAuth();
    const navigate = useNavigate();

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        // Clear error when user starts typing
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: null }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setErrors({});

        try {
            if (isLogin) {
                await login(formData.email, formData.password);
                navigate('/dashboard');
            } else {
                await register(formData);
                showToast('Account created! Please log in.');
                setIsLogin(true);
                setFormData({ name: '', first_name: '', last_name: '', email: '', password: '', password_confirmation: '' });
            }
        } catch (error) {
            if (error.response && error.response.status === 422) {
                setErrors(error.response.data.errors);
            } else {
                setErrors({ general: 'Something went wrong. Please try again.' });
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            className="auth-page-wrapper"
            style={{ backgroundImage: `url(${isLogin ? '/Backgrounds/bg1.jpg' : '/Backgrounds/bg2.jpg'})` }}
        >
            <AuthHeader />

            <main className="auth-main">
                <div className="auth-mesh-bg"></div>

                <div className={`auth-card ${isLogin ? 'login-mode' : 'register-mode'}`}>
                    {/* Left Section */}
                    <div className="auth-section left">
                        {isLogin ? (
                            <div className="auth-form-container">
                                <h1 className="auth-title">LOG IN</h1>
                                <form onSubmit={handleSubmit} className="auth-form">
                                    <div className="input-group">
                                        <input
                                            type="email"
                                            name="email"
                                            placeholder="Email"
                                            value={formData.email}
                                            onChange={handleInputChange}
                                            required
                                        />
                                        {errors.email && <span className="error-text">{errors.email[0]}</span>}
                                    </div>

                                    <div className="input-group">
                                        <div className="password-input-wrapper">
                                            <input
                                                type={showPassword ? "text" : "password"}
                                                name="password"
                                                placeholder="Password"
                                                value={formData.password}
                                                onChange={handleInputChange}
                                                required
                                            />
                                            <button
                                                type="button"
                                                className="password-toggle"
                                                onClick={() => setShowPassword(!showPassword)}
                                            >
                                                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                            </button>
                                        </div>
                                        {errors.password && <span className="error-text">{errors.password[0]}</span>}
                                    </div>

                                    {errors.general && <div className="general-error">{errors.general}</div>}

                                    <button
                                        type="submit"
                                        className="auth-submit-btn login-btn"
                                        disabled={submitting}
                                        style={{ opacity: submitting ? 0.6 : 1, transition: 'opacity 0.3s ease' }}
                                    >
                                        {submitting ? 'Logging in...' : 'LOG IN'}
                                    </button>
                                </form>
                                <p className="auth-switch-text">
                                    Don't have an account yet? <span onClick={() => {
                                        setIsLogin(false);
                                        setErrors({});
                                        setFormData({ name: '', first_name: '', last_name: '', email: '', password: '', password_confirmation: '' });
                                    }}>Sign up</span>
                                </p>
                            </div>
                        ) : (
                            <div className="auth-info-panel orange-panel">
                                <h2 className="info-title text-left">CREATE YOUR ACCOUNT</h2>
                            </div>
                        )}
                    </div>

                    {/* Right Section */}
                    <div className="auth-section right">
                        {isLogin ? (
                            <div className="auth-info-panel blue-panel">
                                <h2 className="info-title text-right">Welcome back!</h2>
                            </div>
                        ) : (
                            <div className="auth-form-container">
                                <h1 className="auth-title">SIGN UP</h1>
                                <form onSubmit={handleSubmit} className="auth-form">
                                    <div className="input-group">
                                        <input
                                            type="text"
                                            name="name"
                                            placeholder="Enter Username..."
                                            value={formData.name}
                                            onChange={handleInputChange}
                                            required
                                        />
                                        {errors.name && <span className="error-text">{errors.name[0]}</span>}
                                    </div>

                                    <div className="input-group">
                                        <input
                                            type="text"
                                            name="first_name"
                                            placeholder="Enter First Name..."
                                            value={formData.first_name}
                                            onChange={handleInputChange}
                                            required
                                        />
                                        {errors.first_name && <span className="error-text">{errors.first_name[0]}</span>}
                                    </div>

                                    <div className="input-group">
                                        <input
                                            type="text"
                                            name="last_name"
                                            placeholder="Enter Last Name..."
                                            value={formData.last_name}
                                            onChange={handleInputChange}
                                            required
                                        />
                                        {errors.last_name && <span className="error-text">{errors.last_name[0]}</span>}
                                    </div>

                                    <div className="input-group">
                                        <input
                                            type="email"
                                            name="email"
                                            placeholder="Email"
                                            value={formData.email}
                                            onChange={handleInputChange}
                                            required
                                        />
                                        {errors.email && <span className="error-text">{errors.email[0]}</span>}
                                    </div>

                                    <div className="input-group">
                                        <div className="password-input-wrapper">
                                            <input
                                                type={showPassword ? "text" : "password"}
                                                name="password"
                                                placeholder="Enter Password..."
                                                value={formData.password}
                                                onChange={handleInputChange}
                                                required
                                            />
                                            <button
                                                type="button"
                                                className="password-toggle"
                                                onClick={() => setShowPassword(!showPassword)}
                                            >
                                                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                            </button>
                                        </div>
                                        {errors.password && <span className="error-text">{errors.password[0]}</span>}
                                    </div>

                                    <div className="input-group">
                                        <div className="password-input-wrapper">
                                            <input
                                                type={showPassword ? "text" : "password"}
                                                name="password_confirmation"
                                                placeholder="Enter Confirm Password..."
                                                value={formData.password_confirmation}
                                                onChange={handleInputChange}
                                                required
                                            />
                                        </div>
                                        {errors.password_confirmation && <span className="error-text">{errors.password_confirmation[0]}</span>}
                                    </div>

                                    {errors.general && <div className="general-error">{errors.general}</div>}

                                    <button type="submit" className="auth-submit-btn signup-btn" disabled={submitting}>
                                        {submitting ? 'Creating account...' : 'CREATE ACCOUNT'}
                                    </button>
                                </form>
                                <p className="auth-switch-text green">
                                    Already have an account? <span onClick={() => {
                                        setIsLogin(true);
                                        setErrors({});
                                        setFormData({ name: '', first_name: '', last_name: '', email: '', password: '', password_confirmation: '' });
                                    }}>Log in</span>
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            <AuthFooter />
        </div>
    );
};

export default Auth;
