import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, X, Trash2, Settings, ExternalLink, Search, Check, User as UserIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { createQuiz, updateQuiz } from '../api/quizApi';
import axiosClient from '../api/axiosClient';
import './CreateQuizModal.css';
 
// Helper to convert UTC ISO string to local YYYY-MM-DDTHH:mm for datetime-local input
const formatToLocalDatetime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    
    const pad = (n) => n.toString().padStart(2, '0');
    const Y = date.getFullYear();
    const M = pad(date.getMonth() + 1);
    const D = pad(date.getDate());
    const h = pad(date.getHours());
    const m = pad(date.getMinutes());
    return `${Y}-${M}-${D}T${h}:${m}`;
};

const CreateQuizModal = ({ isOpen, onClose, quizData, onSaved }) => {
    const navigate = useNavigate();
    const { showToast, user } = useAuth();
    const fileRef = useRef(null);

    // ── Form state (persisted across Manual/AI tab switches) ──
    const [title, setTitle] = useState('');
    const [subtitle, setSubtitle] = useState('');
    const [attemptsAllowed, setAttemptsAllowed] = useState(1);
    const [availability, setAvailability] = useState('private');
    const [description, setDescription] = useState('');
    const [generationType, setGenerationType] = useState('manual');
    const [deadline, setDeadline] = useState('');
    const [allowLateSubmissions, setAllowLateSubmissions] = useState(false);
    const [selectedFriends, setSelectedFriends] = useState([]);
    const [authorName, setAuthorName] = useState('');
    const [authorAvatar, setAuthorAvatar] = useState('');

    // Targeted Sharing UI state
    const [friends, setFriends] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loadingFriends, setLoadingFriends] = useState(false);

    // Image state
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);

    // UI state
    const [activeTab, setActiveTab] = useState('manual');
    const [savingDraft, setSavingDraft] = useState(false);
    const [continuing, setContinuing] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const isEditing = !!quizData;
    const isAuthor = quizData ? (Number(quizData.author) === Number(user?.id)) : true;
    const viewOnly = isEditing && !isAuthor;

    // Timezone 
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tzAbbr = new Date().toLocaleTimeString('en-us', { timeZoneName: 'short' }).split(' ').pop();

    // ── Pre-fill when editing ──
    useEffect(() => {
        if (quizData) {
            setTitle(quizData.title || '');
            setSubtitle(quizData.subtitle || '');
            setAttemptsAllowed(quizData.attempts_allowed ?? 1);
            setAvailability(quizData.availability || 'private');
            setDescription(quizData.description || '');
            setGenerationType(quizData.generation_type || 'manual');
            setActiveTab(quizData.generation_type || 'manual');
            setDeadline(formatToLocalDatetime(quizData.deadline));
            setAllowLateSubmissions(quizData.allow_late_submissions || false);
            setSelectedFriends(quizData.shared_with || []);
            setAuthorName(quizData.author_name || '');
            setAuthorAvatar(quizData.author_avatar || '');

            if (quizData.preview_image) {
                const url = quizData.preview_image.startsWith('http')
                    ? quizData.preview_image
                    : `http://localhost:8000${quizData.preview_image}`;
                setImagePreview(url);
            }
        } else {
            // Reset for create mode
            setTitle('');
            setSubtitle('');
            setAttemptsAllowed(1);
            setAvailability('private');
            setDescription('');
            setGenerationType('manual');
            setActiveTab('manual');
            setDeadline('');
            setAllowLateSubmissions(false);
            setSelectedFriends([]);
            setImageFile(null);
            setImagePreview(null);
            setAuthorName('');
            setAuthorAvatar('');
        }
    }, [quizData, isOpen]);

    // Fetch friends for targeted sharing
    useEffect(() => {
        if (isOpen && availability === 'specific_friends') {
            const fetchFriendsList = async () => {
                setLoadingFriends(true);
                try {
                    const res = await axiosClient.get('/api/friends');
                    // Ensure we handle consistent format: res.data.friends or res.data
                    setFriends(res.data.friends || res.data || []);
                } catch (err) {
                    console.error('Failed to fetch friends', err);
                } finally {
                    setLoadingFriends(false);
                }
            };
            fetchFriendsList();
        }
    }, [isOpen, availability]);

    // Filter friends list
    const filteredFriends = useMemo(() => {
        return friends.filter(friend => {
            const searchVal = searchQuery.toLowerCase();
            const username = (friend?.username || '').toLowerCase();
            const name = (friend?.name || '').toLowerCase();
            return username.includes(searchVal) || name.includes(searchVal);
        });
    }, [friends, searchQuery]);

    const handleToggleFriend = (friendId) => {
        setSelectedFriends(prev =>
            prev.includes(friendId)
                ? prev.filter(id => id !== friendId)
                : [...prev, friendId]
        );
    };

    // ── Image handling ──
    const handleImageSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
    };

    // ── Build FormData ──
    const buildUpdateData = (statusValue) => {
        if (imageFile) {
            const fd = new FormData();
            fd.append('title', title.trim());
            fd.append('subtitle', subtitle.trim());
            fd.append('description', description.trim());
            fd.append('attempts_allowed', attemptsAllowed);
            fd.append('availability', availability);
            fd.append('status', statusValue);
            fd.append('generation_type', activeTab);
            
            if (deadline) {
                fd.append('deadline', new Date(deadline).toISOString());
            }
            fd.append('allow_late_submissions', allowLateSubmissions);

            if (availability === 'specific_friends') {
                selectedFriends.forEach(id => {
                    fd.append('shared_with', id);
                });
            }
            fd.append('preview_image', imageFile);
            return fd;
        } else {
            // Return plain object for JSON
            const data = {
                title: title.trim(),
                subtitle: subtitle.trim(),
                description: description.trim(),
                attempts_allowed: attemptsAllowed,
                availability: availability,
                status: statusValue,
                generation_type: activeTab,
                allow_late_submissions: allowLateSubmissions
            };
            if (deadline) {
                data.deadline = new Date(deadline).toISOString();
            }
            if (availability === 'specific_friends') {
                data.shared_with = selectedFriends;
            }
            return data;
        }
    };

    // ── Save as Draft ──
    const handleSaveDraft = async () => {
        if (!title.trim()) return;
        setSavingDraft(true);
        try {
            const targetStatus = (isEditing && quizData.status === 'published') ? 'published' : 'draft';
            const data = buildUpdateData(targetStatus);
            const saved = await (isEditing ? updateQuiz(quizData.id, data) : createQuiz(data));
            
            const successMsg = isEditing 
                ? (quizData.status === 'published' ? 'Changes saved!' : 'Draft updated!')
                : 'Draft saved!';
                
            showToast(successMsg);
            onSaved && onSaved(saved, isEditing ? 'update' : 'create');
            onClose();
        } catch (err) {
            console.error(err);
            showToast(err.response?.data?.message || 'Failed to save draft.', 'error');
        } finally {
            setSavingDraft(false);
        }
    };

    // ── Continue (save draft then redirect) ──
    const handleContinue = async () => {
        if (!title.trim()) return;
        setContinuing(true);
        try {
            const data = buildUpdateData('draft');
            let saved;
            if (isEditing) {
                saved = await updateQuiz(quizData.id, data);
            } else {
                saved = await createQuiz(data);
            }
            onSaved && onSaved(saved, isEditing ? 'update' : 'create');
            onClose();
            navigate(`/quizzes/edit/${saved.id}`);
        } catch (err) {
            console.error(err);
            showToast(err.response?.data?.message || 'Failed to save.', 'error');
        } finally {
            setContinuing(false);
        }
    };

    // ── Publish ──
    const handlePublish = async () => {
        if (!title.trim()) return;
        if (availability === 'specific_friends' && selectedFriends.length === 0) {
            showToast('Please select at least one friend to share with.', 'error');
            return;
        }

        setPublishing(true);
        try {
            const data = buildUpdateData('published');
            const saved = await updateQuiz(quizData.id, data);
            showToast('Quiz published successfully!');
            onSaved && onSaved(saved, 'update');
            onClose();
        } catch (err) {
            console.error(err);
            showToast(err.response?.data?.message?.[0] || err.response?.data?.message || 'Failed to publish.', 'error');
        } finally {
            setPublishing(false);
        }
    };

    // ── Delete ──
    const handleDelete = async () => {
        setDeleting(true);
        try {
            const { deleteQuiz } = await import('../api/quizApi');
            await deleteQuiz(quizData.id);
            showToast('Quiz deleted.');
            onSaved && onSaved({ id: quizData.id }, 'delete'); // We need to handle 'delete' action in Dashboard
            onClose();
        } catch (err) {
            console.error(err);
            showToast('Failed to delete quiz.', 'error');
        } finally {
            setDeleting(false);
            setShowDeleteConfirm(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            document.body.classList.add('modal-open');
        } else {
            document.body.classList.remove('modal-open');
        }
        return () => document.body.classList.remove('modal-open');
    }, [isOpen]);

    if (!isOpen) return null;

    const isBusy = savingDraft || continuing || publishing || deleting;
    const isTitleEmpty = !title.trim();

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="quiz-modal" onClick={(e) => e.stopPropagation()}>
                {/* Close button */}
                <button className="modal-close-btn" onClick={onClose} title="Close">
                    <X size={20} />
                </button>


                {/* Generation Type Toggle (Hidden when editing) */}
                {!isEditing && (
                    <div className="generation-type-toggle">
                        <button
                            className={`gen-type-btn ${activeTab === 'manual' ? 'active' : ''}`}
                            onClick={() => setActiveTab('manual')}
                        >
                            Manual
                        </button>
                        <button
                            className={`gen-type-btn ${activeTab === 'ai' ? 'active' : ''}`}
                            onClick={() => setActiveTab('ai')}
                        >
                            AI
                        </button>
                    </div>
                )}

                {/* ── Tab Content ── */}
                {activeTab === 'ai' ? ( // Use activeTab state
                    <div className="ai-placeholder">
                        <div className="ai-placeholder-icon"></div>
                        <p>AI Quiz Generation</p>
                        <span>Coming soon…</span>
                    </div>
                ) : (
                    <>
                        <div className="modal-body scrollable-modal-body">
                            {/* Left Column — Inputs */}
                            <div className="modal-form-left">
                                {/* Title & Status Badge */}
                                <div className="modal-title-container">
                                    <div className="form-group title-group-nested">
                                        {viewOnly ? (
                                            <h1 className="view-title">{title || 'Untitled'}</h1>
                                        ) : (
                                            <input
                                                type="text"
                                                className="title-input"
                                                placeholder="Untitled"
                                                value={title}
                                                onChange={(e) => setTitle(e.target.value)}
                                            />
                                        )}
                                        {!viewOnly && <span className="required-asterisk">*</span>}
                                    </div>
                                    
                                    {/* Status Badge */}
                                    <div className={`status-badge ${quizData?.status || 'draft'}`}>
                                        {quizData?.status === 'published' ? 'Published' : 'Draft'}
                                    </div>
                                </div>

                                {/* Author Context (View Mode Only) */}
                                {viewOnly && authorName && (
                                    <div className="author-context-row">
                                        <div className="author-mini-avatar">
                                            {authorAvatar ? (
                                                <img src={authorAvatar} alt="" />
                                            ) : (
                                                <UserIcon size={14} />
                                            )}
                                        </div>
                                        <span className="author-tagline">Created by <strong>@{authorName}</strong></span>
                                    </div>
                                )}

                                {/* Row: Subtitle, Attempts, Availability (Admin Settings - Hidden in View Mode) */}
                                {!viewOnly && (
                                    <div className="form-row-three">
                                        <div className="form-group">
                                            <label>Subtitle</label>
                                            <input
                                                type="text"
                                                className="neo-input"
                                                placeholder="Enter sub-header here..."
                                                value={subtitle}
                                                onChange={(e) => setSubtitle(e.target.value)}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Attempts</label>
                                            <select
                                                className="neo-select"
                                                value={attemptsAllowed}
                                                onChange={(e) => setAttemptsAllowed(Number(e.target.value))}
                                            >
                                                {[1, 2, 3, 4, 5, 10].map(n => (
                                                    <option key={n} value={n}>{n}</option>
                                                ))}
                                                <option value={0}>Unlimited</option>
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label>Availability</label>
                                            <select
                                                className="neo-select"
                                                value={availability}
                                                onChange={(e) => setAvailability(e.target.value)}
                                            >
                                                <option value="private">Private</option>
                                                <option value="all_friends">All Friends</option>
                                                <option value="specific_friends">Specific Friends</option>
                                            </select>
                                        </div>
                                    </div>
                                )}

                                {/* Meta Pills (View Mode Only) */}
                                {viewOnly && (
                                    <div className="view-meta-pills">
                                        <div className="view-meta-pill">
                                            Due: {deadline ? new Date(deadline).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'No deadline'}
                                        </div>
                                        <div className="view-meta-pill">
                                            Attempts: {attemptsAllowed === 0 ? 'Unlimited' : attemptsAllowed}
                                        </div>
                                    </div>
                                )}

                                {/* LMS Row: Deadline & Late Toggle (Hidden in View Mode) */}
                                {!viewOnly && (
                                    <div className="form-row-two lms-row">
                                        <div className="form-group">
                                            <label>Deadline ({tzAbbr})</label>
                                            <input 
                                                type="datetime-local" 
                                                className="neo-input"
                                                value={deadline}
                                                onChange={(e) => setDeadline(e.target.value)}
                                            />
                                        </div>
                                        <div className="form-group checkbox-group">
                                            <label className="neo-checkbox-label">
                                                <input 
                                                    type="checkbox" 
                                                    checked={allowLateSubmissions}
                                                    onChange={(e) => setAllowLateSubmissions(e.target.checked)}
                                                />
                                                Allow Late Submissions
                                            </label>
                                        </div>
                                    </div>
                                )}

                                {/* Targeted Sharing Interface */}
                                {availability === 'specific_friends' && !viewOnly && (
                                    <div className="friend-sharing-interface">
                                        <label>Select Friends to Share With</label>
                                        <div className="neo-search-box">
                                            <Search size={16} />
                                            <input 
                                                type="text" 
                                                placeholder="Search friends..." 
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                            />
                                        </div>
                                        <div className="friends-checklist">
                                            {loadingFriends ? (
                                                <div className="neo-loading">Loading friends...</div>
                                            ) : filteredFriends.length > 0 ? (
                                                filteredFriends.map(friend => (
                                                    <div 
                                                        key={friend.id} 
                                                        className={`friend-check-item ${selectedFriends.includes(friend.id) ? 'checked' : ''}`}
                                                        onClick={() => handleToggleFriend(friend.id)}
                                                    >
                                                        <div className="neo-checkbox-custom">
                                                            {selectedFriends.includes(friend.id) && <Check size={14} />}
                                                        </div>
                                                        <img 
                                                            src={friend.avatar_url 
                                                                ? (friend.avatar_url.startsWith('http') ? friend.avatar_url : `http://localhost:8000${friend.avatar_url}`) 
                                                                : '/default-avatar.png'
                                                            } 
                                                            alt={friend.name || friend.username || 'User'} 
                                                        />
                                                         <span>{friend.name || friend.username}</span>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="no-friends-msg">No friends found.</div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Description */}
                                <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    {!viewOnly && <label>Description</label>}
                                    {viewOnly ? (
                                        <p className="view-description-text">
                                            {description || 'No description provided.'}
                                        </p>
                                    ) : (
                                        <textarea
                                            className="neo-textarea"
                                            placeholder="Write a description for your quiz..."
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            style={{ flex: 1 }}
                                        />
                                    )}
                                </div>

                                {/* Massive CTA Button (View Mode Only) */}
                                {viewOnly && (
                                    <button 
                                        className="take-quiz-cta-massive"
                                        onClick={() => {
                                            onClose();
                                            navigate(`/quizzes/${quizData.id}/intro`);
                                        }}
                                    >
                                        Take Quiz Now
                                    </button>
                                )}

                            </div>

                            {/* Right Column — Image */}
                            <div className="modal-form-right">
                                <div
                                    className={`image-preview-box ${viewOnly ? 'view-only-image' : ''}`}
                                    style={imagePreview ? { backgroundImage: `url(${imagePreview})` } : {}}
                                    onClick={() => !viewOnly && fileRef.current?.click()}
                                >
                                    {!imagePreview && <div className="image-placeholder-gradient" />}
                                    {!viewOnly && (
                                        <button className="camera-btn" type="button">
                                            <Camera size={22} />
                                        </button>
                                    )}
                                </div>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    onChange={handleImageSelect}
                                />
                            </div>
                        </div>

                        {/* ── Action Buttons ── */}
                        <div className="modal-actions">
                            {/* Trash Icon (Only when editing, moved to bottom left) */}
                            {isAuthor && isEditing && (
                                <div className="footer-delete-wrapper">
                                    <button
                                        className="modal-delete-btn"
                                        onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
                                        title="Delete Quiz"
                                    >
                                        <Trash2 size={24} />
                                    </button>
                                    {showDeleteConfirm && (
                                        <div className="neo-confirm-popup popup-up">
                                            <p>Delete this quiz permanently?</p>
                                            <div className="confirm-actions">
                                                <button
                                                    className="confirm-yes"
                                                    onClick={handleDelete}
                                                    disabled={deleting}
                                                >
                                                    {deleting ? 'Deleting...' : 'Yes'}
                                                </button>
                                                <button
                                                    className="confirm-no"
                                                    onClick={() => setShowDeleteConfirm(false)}
                                                >
                                                    No
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="modal-actions-right">
                                {!viewOnly && (
                                    isEditing ? (
                                        <>
                                            <button
                                                className="manage-btn"
                                                onClick={() => navigate(`/quizzes/edit/${quizData.id}`)}
                                                title="Manage Quiz Content"
                                            >
                                                <Settings size={18} />
                                                <span>Manage Content</span>
                                            </button>

                                            {quizData.status === 'draft' && (
                                                <button
                                                    className="publish-btn"
                                                    onClick={handlePublish}
                                                    disabled={isTitleEmpty || isBusy}
                                                >
                                                    <ExternalLink size={18} />
                                                    <span>Publish Quiz</span>
                                                </button>
                                            )}

                                            <button
                                                className="draft-btn"
                                                onClick={handleSaveDraft}
                                                disabled={isTitleEmpty || isBusy}
                                            >
                                                {savingDraft ? 'Saving...' : (quizData?.status === 'published' ? 'Save Changes' : 'Save Draft')}
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                className="draft-btn"
                                                onClick={handleSaveDraft}
                                                disabled={isTitleEmpty || isBusy}
                                            >
                                                {savingDraft ? 'Saving...' : 'Save as Draft'}
                                            </button>
                                            <button
                                                className="continue-btn"
                                                onClick={handleContinue}
                                                disabled={isTitleEmpty || isBusy}
                                            >
                                                {continuing ? 'Processing...' : (activeTab === 'ai' ? 'Next' : 'Continue')}
                                            </button>
                                        </>
                                    )
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default CreateQuizModal;
