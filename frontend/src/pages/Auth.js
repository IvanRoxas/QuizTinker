// src/pages/Auth.js  — FULL REPLACEMENT
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff } from 'lucide-react';
import AuthHeader from '../components/AuthHeader';
import AuthFooter from '../components/AuthFooter';
import './Auth.css';

// ─── OTP digit input component ────────────────────────────────────────────────
const OTPInput = ({ value, onChange, disabled }) => {
    const digits = value.split('');
    const refs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];

    const handleKey = (index, e) => {
        if (e.key === 'Backspace') {
            e.preventDefault();
            const next = [...digits];
            if (next[index]) {
                next[index] = '';
                onChange(next.join(''));
            } else if (index > 0) {
                next[index - 1] = '';
                onChange(next.join(''));
                refs[index - 1].current?.focus();
            }
            return;
        }

        if (e.key === 'ArrowLeft' && index > 0) {
            refs[index - 1].current?.focus();
            return;
        }
        if (e.key === 'ArrowRight' && index < 5) {
            refs[index + 1].current?.focus();
            return;
        }

        if (/^\d$/.test(e.key)) {
            e.preventDefault();
            const next = [...digits];
            next[index] = e.key;
            onChange(next.join(''));
            if (index < 5) refs[index + 1].current?.focus();
        }
    };

    const handlePaste = (e) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        onChange(pasted.padEnd(6, '').slice(0, 6));
        const focusIdx = Math.min(pasted.length, 5);
        refs[focusIdx].current?.focus();
    };

    return (
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', margin: '8px 0' }}>
            {[0, 1, 2, 3, 4, 5].map(i => (
                <input
                    key={i}
                    ref={refs[i]}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digits[i] || ''}
                    disabled={disabled}
                    onKeyDown={(e) => handleKey(i, e)}
                    onPaste={handlePaste}
                    onChange={() => { }} // controlled via onKeyDown
                    style={{
                        width: '46px',
                        height: '58px',
                        textAlign: 'center',
                        fontSize: '24px',
                        fontWeight: '900', // Made bolder to match your title style
                        fontFamily: "inherit",
                        background: '#ffffff', // Solid white background for the box
                        border: digits[i] ? '3px solid #5A82E6' : '3px solid #1E1E1E', // Charcoal or Blue border
                        borderRadius: '12px',
                        color: '#1E1E1E', // Black/Charcoal text
                        outline: 'none',
                        transition: 'all 0.2s ease',
                        caretColor: 'transparent',
                        cursor: disabled ? 'not-allowed' : 'text',
                    }}
                    onFocus={e => {
                        e.target.style.borderColor = '#5A82E6';
                        e.target.style.boxShadow = '0 0 0 3px rgba(90,130,230,0.25)';
                    }}
                    onBlur={e => {
                        e.target.style.borderColor = digits[i] ? '#5A82E6' : '#1E1E1E';
                        e.target.style.boxShadow = 'none';
                    }}
                />
            ))}
        </div>
    );
};

// ─── Main Auth component ──────────────────────────────────────────────────────
const Auth = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [showPassword, setShowPassword] = useState(false);

    // OTP state
    const [otpStep, setOtpStep] = useState(false);
    const [otpEmail, setOtpEmail] = useState('');
    const [otpValue, setOtpValue] = useState('');
    const [otpResendCooldown, setOtpResendCooldown] = useState(0);
    const [isRegisteringSetup, setIsRegisteringSetup] = useState(false);

    const [formData, setFormData] = useState({
        name: '', first_name: '', last_name: '',
        email: '', password: '', password_confirmation: ''
    });
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);

    const { login, otpVerify, register, registerOtpVerify, showToast } = useAuth();
    const navigate = useNavigate();

    // Countdown timer for "Resend OTP"
    useEffect(() => {
        if (otpResendCooldown <= 0) return;
        const t = setTimeout(() => setOtpResendCooldown(c => c - 1), 1000);
        return () => clearTimeout(t);
    }, [otpResendCooldown]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }));
    };

    // ── Main login / register submit ──────────────────────────────────────────
    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setErrors({});

        try {
            if (isLogin) {
                const result = await login(formData.email, formData.password);

                if (result.otpRequired) {
                    // Transition to OTP screen
                    setOtpEmail(result.email);
                    setIsRegisteringSetup(false);
                    setOtpStep(true);
                    setOtpResendCooldown(60);
                } else {
                    navigate('/dashboard');
                }
            } else {
                const result = await register(formData);
                if (result && result.otpRequired) {
                    setOtpEmail(result.email);
                    setIsRegisteringSetup(true);
                    setOtpStep(true);
                    setOtpResendCooldown(60);
                } else {
                    showToast('Account created! Please log in.');
                    setIsLogin(true);
                    setFormData({ name: '', first_name: '', last_name: '', email: '', password: '', password_confirmation: '' });
                }
            }
        } catch (error) {
            if (error.response?.status === 422) {
                setErrors(error.response.data.errors);
            } else if (error.response?.status === 429) {
                setErrors({ general: error.response.data.detail || 'Too many attempts. Please try again later.' });
            } else if (error.response?.status === 403) {
                setErrors({ general: error.response.data.detail || 'Access forbidden.' });
            } else {
                setErrors({ general: 'Something went wrong. Please try again.' });
            }
        } finally {
            setSubmitting(false);
        }
    };

    // ── OTP verification submit ───────────────────────────────────────────────
    const handleOtpSubmit = async (e) => {
        e.preventDefault();
        if (otpValue.length !== 6) {
            setErrors({ otp: ['Please enter all 6 digits.'] });
            return;
        }
        setSubmitting(true);
        setErrors({});

        try {
            if (isRegisteringSetup) {
                await registerOtpVerify(otpEmail, otpValue);
                showToast('Email verified. Account created successfully!');
            } else {
                await otpVerify(otpEmail, otpValue);
            }
            navigate('/dashboard');
        } catch (error) {
            if (error.response?.status === 422) {
                setErrors(error.response.data.errors || { otp: ['Invalid or expired code.'] });
            } else {
                setErrors({ otp: ['Something went wrong. Please try again.'] });
            }
            setOtpValue('');
        } finally {
            setSubmitting(false);
        }
    };

    // ── Resend OTP ────────────────────────────────────────────────────────────
    const handleResendOtp = async () => {
        if (otpResendCooldown > 0) return;
        setErrors({});
        setOtpValue('');

        try {
            if (isRegisteringSetup) {
                const result = await register(formData);
                if (result && result.otpRequired) {
                    showToast('A new verification code has been sent to your email.');
                    setOtpResendCooldown(60);
                }
            } else {
                const result = await login(formData.email, formData.password);
                if (result && result.otpRequired) {
                    showToast('A new OTP has been sent to your email.');
                    setOtpResendCooldown(60);
                }
            }
        } catch {
            setErrors({ otp: ['Could not resend the code. Please go back and try again.'] });
        }
    };

    // ── Cancel OTP → go back to login form ───────────────────────────────────
    const handleCancelOtp = () => {
        setOtpStep(false);
        setOtpEmail('');
        setOtpValue('');
        setIsRegisteringSetup(false);
        setErrors({});
    };

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div
            className="auth-page-wrapper"
            style={{ backgroundImage: `url(${isLogin ? '/Backgrounds/bg1.jpg' : '/Backgrounds/bg2.jpg'})` }}
        >
            <AuthHeader />

            <main className="auth-main">
                <div className="auth-mesh-bg"></div>

                {/* ── OTP Step ─────────────────────────────────────────── */}
                {otpStep ? (
                    <div className={`auth-card login-mode`}>
                        {/* Left: OTP form */}
                        <div className="auth-section left">
                            <div className="auth-form-container">
                                <h1 className="auth-title" style={{ fontSize: '1.6rem', marginBottom: '6px' }}>
                                    VERIFY EMAIL
                                </h1>
                                <p style={{
                                    color: '#444444',
                                    fontSize: '0.9rem',
                                    marginBottom: '24px',
                                    lineHeight: 1.6,
                                    textAlign: 'center',
                                }}>
                                    We sent a 6-digit code to<br />
                                    <strong style={{ color: '#1E1E1E', fontWeight: 700, textAlign: 'center' }}>{otpEmail}</strong>
                                </p>

                                <form onSubmit={handleOtpSubmit} className="auth-form">
                                    <div className="input-group" style={{ alignItems: 'center' }}>
                                        <OTPInput
                                            value={otpValue}
                                            onChange={setOtpValue}
                                            disabled={submitting}
                                        />
                                        {errors.otp && (
                                            <span className="error-text" style={{ textAlign: 'center', display: 'block', marginTop: '8px' }}>
                                                {errors.otp[0]}
                                            </span>
                                        )}
                                    </div>

                                    {errors.general && <div className="general-error">{errors.general}</div>}

                                    <button
                                        type="submit"
                                        className="auth-submit-btn login-btn"
                                        disabled={submitting || otpValue.length !== 6}
                                        style={{
                                            opacity: (submitting || otpValue.length !== 6) ? 0.5 : 1,
                                            transition: 'opacity 0.3s ease'
                                        }}
                                    >
                                        {submitting ? 'Verifying...' : 'VERIFY CODE'}
                                    </button>
                                </form>

                                {/* Resend + Cancel */}
                                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                                    <button
                                        onClick={handleResendOtp}
                                        disabled={otpResendCooldown > 0}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: otpResendCooldown > 0 ? 'default' : 'pointer',
                                            color: otpResendCooldown > 0 ? '#999999' : '#1E1E1E',
                                            fontSize: '0.9rem',
                                            fontWeight: otpResendCooldown > 0 ? 400 : 600,
                                            padding: '6px 12px',
                                            transition: 'color 0.2s',
                                            textDecoration: otpResendCooldown > 0 ? 'none' : 'underline',
                                        }}
                                    >
                                        {otpResendCooldown > 0
                                            ? `Resend code in ${otpResendCooldown}s`
                                            : 'Resend code'}
                                    </button>

                                    <button
                                        onClick={handleCancelOtp}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            color: '#666666',
                                            fontSize: '0.85rem',
                                            fontWeight: 500,
                                            padding: '6px 12px',
                                            transition: 'color 0.2s',
                                        }}
                                    >
                                        ← Back to login
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Right: info panel (mirrors login-mode style) */}
                        <div className="auth-section right">
                            <div className="auth-info-panel blue-panel" style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: '100%',
                            }}>
                                <h2 className="info-title text-center">Check your inbox!</h2>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* ── Normal Login / Register ───────────────────────── */
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
                                                    type={showPassword ? 'text' : 'password'}
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
                                        Don't have an account yet?{' '}
                                        <span onClick={() => {
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
                                            <input type="text" name="name" placeholder="Enter Username..."
                                                value={formData.name} onChange={handleInputChange} required />
                                            {errors.name && <span className="error-text">{errors.name[0]}</span>}
                                        </div>
                                        <div className="input-group">
                                            <input type="text" name="first_name" placeholder="Enter First Name..."
                                                value={formData.first_name} onChange={handleInputChange} required />
                                            {errors.first_name && <span className="error-text">{errors.first_name[0]}</span>}
                                        </div>
                                        <div className="input-group">
                                            <input type="text" name="last_name" placeholder="Enter Last Name..."
                                                value={formData.last_name} onChange={handleInputChange} required />
                                            {errors.last_name && <span className="error-text">{errors.last_name[0]}</span>}
                                        </div>
                                        <div className="input-group">
                                            <input type="email" name="email" placeholder="Email"
                                                value={formData.email} onChange={handleInputChange} required />
                                            {errors.email && <span className="error-text">{errors.email[0]}</span>}
                                        </div>
                                        <div className="input-group">
                                            <div className="password-input-wrapper">
                                                <input
                                                    type={showPassword ? 'text' : 'password'}
                                                    name="password" placeholder="Enter Password..."
                                                    value={formData.password} onChange={handleInputChange} required />
                                                <button type="button" className="password-toggle"
                                                    onClick={() => setShowPassword(!showPassword)}>
                                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                                </button>
                                            </div>
                                            {errors.password && <span className="error-text">{errors.password[0]}</span>}
                                        </div>
                                        <div className="input-group">
                                            <div className="password-input-wrapper">
                                                <input
                                                    type={showPassword ? 'text' : 'password'}
                                                    name="password_confirmation" placeholder="Enter Confirm Password..."
                                                    value={formData.password_confirmation} onChange={handleInputChange} required />
                                            </div>
                                            {errors.password_confirmation && <span className="error-text">{errors.password_confirmation[0]}</span>}
                                        </div>

                                        {errors.general && <div className="general-error">{errors.general}</div>}

                                        <button type="submit" className="auth-submit-btn signup-btn" disabled={submitting}>
                                            {submitting ? 'Creating account...' : 'CREATE ACCOUNT'}
                                        </button>
                                    </form>
                                    <p className="auth-switch-text green">
                                        Already have an account?{' '}
                                        <span onClick={() => {
                                            setIsLogin(true);
                                            setErrors({});
                                            setFormData({ name: '', first_name: '', last_name: '', email: '', password: '', password_confirmation: '' });
                                        }}>Log in</span>
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )
                }
            </main >

            <AuthFooter />
        </div >
    );
};

export default Auth;