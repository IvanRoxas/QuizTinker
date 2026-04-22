import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, X, Trash2, Settings, ExternalLink, Search, Check, User as UserIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { createQuiz, updateQuiz, aiGenerateQuiz, createQuizItem } from '../api/quizApi';
import { fallbackQuestionBank } from '../utils/fallbackQuestionBank';
import axiosClient from '../api/axiosClient';
import './CreateQuizModal.css';
import mediaUrl from '../utils/mediaUrl';

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

const truncateFilename = (name, maxLength = 30) => {
    if (!name) return '';
    if (name.length <= maxLength) return name;
    return name.slice(0, maxLength) + '...';
};

const CreateQuizModal = ({ isOpen, onClose, quizData, onSaved }) => {
    const navigate = useNavigate();
    const { showToast, user, aiGenerating, setAiGenerating, setAiGenError } = useAuth();
    const fileRef = useRef(null);
    const referenceFileRef = useRef(null);

    // ── Retry logic refs (stable across re-renders, no stale closures) ──
    const retryCountRef = useRef(0);
    const handleContinueRef = useRef(null);

    // ── Form state (persisted across Manual/AI tab switches) ──
    const [title, setTitle] = useState('');
    const [subtitle, setSubtitle] = useState('');
    const [attemptsAllowed, setAttemptsAllowed] = useState(1);
    const [availability, setAvailability] = useState('private');
    const [description, setDescription] = useState('');
    const [promptText, setPromptText] = useState('');
    const [category, setCategory] = useState('GenEd');
    const bloomLevels = [
        "Remembering",
        "Understanding",
        "Applying",
        "Analyzing",
        "Evaluating",
        "Creating"
    ];
    const [questions, setQuestions] = useState([0, 0, 0, 0, 0, 0]);
    const resetBloom = () => {
        setQuestions([0, 0, 0, 0, 0, 0]);
    };


    const [specialization, setSpecialization] = useState('Filipino');
    const [generationType, setGenerationType] = useState('manual');
    const [deadline, setDeadline] = useState('');
    const [allowLateSubmissions, setAllowLateSubmissions] = useState(false);
    const [selectedFriends, setSelectedFriends] = useState([]);
    const [authorName, setAuthorName] = useState('');
    const [authorAvatar, setAuthorAvatar] = useState('');
    const [referenceFiles, setReferenceFiles] = useState([]);

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

    // Reset retry counter whenever the modal opens fresh
    useEffect(() => {
        if (isOpen) {
            retryCountRef.current = 0;
        }
    }, [isOpen]);

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
            setPromptText(quizData.description || '');
            setCategory(quizData.category || 'GenEd');
            setSpecialization(quizData.specialization || 'Filipino');
            setGenerationType(quizData.generation_type || 'manual');
            setActiveTab(quizData.generation_type || 'manual');
            setDeadline(formatToLocalDatetime(quizData.deadline));
            setAllowLateSubmissions(quizData.allow_late_submissions || false);
            setSelectedFriends(quizData.shared_with || []);
            setAuthorName(quizData.author_name || '');
            setAuthorAvatar(quizData.author_avatar || '');

            if (quizData.preview_image) {
                const url = mediaUrl(quizData.preview_image);
                setImagePreview(url);
            }

            if (quizData.meta && quizData.meta.bloom_distribution) {
                const bd = quizData.meta.bloom_distribution;
                setQuestions([
                    bd.Remember || 0,
                    bd.Understand || 0,
                    bd.Apply || 0,
                    bd.Analyze || 0,
                    bd.Evaluate || 0,
                    bd.Create || 0,
                ]);
            } else {
                setQuestions([0, 0, 0, 0, 0, 0]);
            }
        } else {
            // Reset for create mode
            setTitle('');
            setSubtitle('');
            setAttemptsAllowed(1);
            setAvailability('private');
            setDescription('');
            setPromptText('');
            setCategory('GenEd');
            setSpecialization('Filipino');
            setGenerationType('manual');
            setActiveTab('manual');
            setDeadline('');
            setAllowLateSubmissions(false);
            setSelectedFriends([]);
            setImageFile(null);
            setImagePreview(null);
            setAuthorName('');
            setAuthorAvatar('');
            setReferenceFiles([]);
            setQuestions([1, 1, 1, 1, 1, 1]);
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

    // ── Reference File Handling ──
    const handleReferenceFileSelect = (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        let validFiles = [];
        let limitReached = false;

        for (let file of files) {
            if (referenceFiles.length + validFiles.length >= 2) {
                limitReached = true;
                break;
            }
            if (file.size > 10 * 1024 * 1024) {
                showToast(`${file.name} exceeds the 10MB size limit.`, 'error');
                continue;
            }
            validFiles.push(file);
        }

        if (validFiles.length > 0) {
            setReferenceFiles(prev => [...prev, ...validFiles].slice(0, 2));
        }

        if (limitReached && validFiles.length === 0) {
            showToast('Maximum of 2 reference files reached.', 'error');
        } else if (referenceFiles.length + validFiles.length >= 2) {
            showToast('Maximum of 2 reference files reached.', 'success');
        }

        if (referenceFileRef.current) {
            referenceFileRef.current.value = '';
        }
    };

    const removeReferenceFile = (index) => {
        setReferenceFiles(prev => prev.filter((_, i) => i !== index));
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
            if (activeTab === 'ai') {
                fd.append('category', category);
                if (category === 'Specialization') {
                    fd.append('specialization', specialization);
                }
            }

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
                allow_late_submissions: allowLateSubmissions,
                ...(activeTab === 'ai' && { category }),
                ...(activeTab === 'ai' && category === 'Specialization' && { specialization }),
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
            showToast(err.response?.data?.message || err.response?.data?.error || 'Failed to save draft.', 'error');
        } finally {
            setSavingDraft(false);
        }
    };

    // ── Continue (save draft then redirect) ──
    const handleContinue = async () => {
        if (!title.trim()) return;
        setContinuing(true);
        try {
            if (activeTab === 'ai') {
                // Block if another AI quiz is already being generated
                if (aiGenerating) {
                    showToast('Please wait — another quiz is still being generated.', 'error');
                    setContinuing(false);
                    return;
                }

                const totalQ = questions.reduce((sum, n) => sum + n, 0);
                if (totalQ < 5) {
                    showToast('Minimum of 5 total questions required.', 'error');
                    setContinuing(false);
                    return;
                }
                const nonZeroLevels = questions.filter(n => n > 0).length;
                if (nonZeroLevels < 2) {
                    showToast('Please distribute questions across at least two Bloom levels.', 'error');
                    setContinuing(false);
                    return;
                }

                const distribution = {
                    remembering: questions[0],
                    understanding: questions[1],
                    applying: questions[2],
                    analyzing: questions[3],
                    evaluating: questions[4],
                    creating: questions[5]
                };

                let aiData;
                const currentRetries = retryCountRef.current || 0;
                if (referenceFiles.length > 0) {
                    aiData = new FormData();
                    aiData.append('title', title.trim());
                    aiData.append('subtitle', subtitle.trim());
                    aiData.append('attempts_allowed', attemptsAllowed);
                    aiData.append('availability', availability);
                    if (deadline) aiData.append('deadline', new Date(deadline).toISOString());
                    aiData.append('category', category);
                    aiData.append('specialization', specialization);
                    aiData.append('prompt', promptText);
                    aiData.append('bloom_distribution', JSON.stringify(distribution));
                    aiData.append('retry_count', currentRetries);

                    referenceFiles.forEach((file, idx) => {
                        aiData.append(`reference_file_${idx + 1}`, file);
                    });
                } else {
                    aiData = {
                        title: title.trim(),
                        subtitle: subtitle.trim(),
                        attempts_allowed: attemptsAllowed,
                        availability: availability,
                        deadline: deadline ? new Date(deadline).toISOString() : null,
                        category: category,
                        specialization: specialization,
                        prompt: promptText,
                        bloom_distribution: distribution,
                        retry_count: currentRetries
                    };
                }
                
                // Show generating message with progress
                let btnText = "generating quiz";
                if (currentRetries === 1) btnText = "Retry 1/3 - generating quiz";
                if (currentRetries === 2) btnText = "Retry 2/3 - generating quiz";
                if (currentRetries >= 3) btnText = "Switching to backup AI - generating quiz";
                setAiGenerating(`${title.trim()} - ${btnText}`);

                // ── AI Generation — single attempt, user-controlled retries ──────
                try {
                    const generatedData = await aiGenerateQuiz(aiData);
                    
                    // Wait for generation to finish by polling the background task
                    const { fetchQuiz } = await import('../api/quizApi');
                    let isGenerating = true;
                    let pollAttempts = 0;
                    let resultData = null;
                    
                    while (isGenerating && pollAttempts < 20) {
                        await new Promise(r => setTimeout(r, 3000)); // wait 3 seconds
                        const currentQuiz = await fetchQuiz(generatedData.id);
                        if (currentQuiz.status === 'published' || currentQuiz.status === 'draft') {
                            isGenerating = false;
                            resultData = currentQuiz;
                        } else if (currentQuiz.status === 'error') {
                            throw new Error(currentQuiz.meta?.error_message || "Generation failed");
                        }
                        pollAttempts++;
                    }
                    
                    if (isGenerating) {
                        throw new Error("Timeout: Generation took too long.");
                    }
                    
                    // Success — reset counter, navigate to editor
                    setAiGenerating(null);
                    retryCountRef.current = 0;
                    onSaved && onSaved(resultData, 'create');
                    resetBloom();
                    onClose();
                    navigate(`/quizzes/edit/${resultData.id}`);
                } catch (aiErr) {
                    console.warn('AI generation attempt failed:', aiErr);
                    setAiGenerating(null);

                    // ── Parse error into user-friendly message ──
                    const rawMsg = aiErr.response?.data?.message || aiErr.response?.data?.error || aiErr.message || 'Unknown error';
                    let friendlyMsg = rawMsg;
                    if (typeof rawMsg === 'string') {
                        const messageMatch = rawMsg.match(/['"]message['"]:\s*['"]([^'"]+)['"]/);
                        if (messageMatch) {
                            friendlyMsg = messageMatch[1];
                        } else if (rawMsg.includes('UNAVAILABLE') || rawMsg.includes('503')) {
                            friendlyMsg = 'The AI service is experiencing high demand. Please try again shortly.';
                        } else if (rawMsg.includes('RESOURCE_EXHAUSTED') || rawMsg.includes('429')) {
                            friendlyMsg = 'The AI service is currently overloaded. Please wait a moment and try again.';
                        }
                    }

                    // ── Increment retry counter ──
                    retryCountRef.current += 1;
                    const nextRetries = retryCountRef.current;

                    let overlayBtnText = "Retry 1/3";
                    if (nextRetries === 1) overlayBtnText = "Retry 1/3";
                    if (nextRetries === 2) overlayBtnText = "Retry 2/3";
                    if (nextRetries === 3) overlayBtnText = "Final Attempt";
                    if (nextRetries > 3) overlayBtnText = "Switching to backup AI";

                    // ═══ Show error overlay — user can Retry or go to Dashboard ═══
                    const remainingRetries = Math.max(0, 3 - nextRetries);
                    setAiGenError({
                        message: friendlyMsg,
                        retryCount: currentRetries,
                        remainingRetries,
                        btnText: overlayBtnText,
                        // retryFn uses handleContinueRef to ALWAYS call
                        // the latest handleContinue — never a stale closure.
                        retryFn: () => {
                            setAiGenError(null);
                            // Tiny delay lets React flush the error-state clear
                            setTimeout(() => {
                                if (handleContinueRef.current) {
                                    handleContinueRef.current();
                                }
                            }, 50);
                        },
                    });
                    setContinuing(false);
                    return; // Exit early — don't throw to outer catch
                }
            } else {
                const data = buildUpdateData('draft');
                let saved;
                if (isEditing) {
                    saved = await updateQuiz(quizData.id, data);
                } else {
                    saved = await createQuiz(data);
                }
                onSaved && onSaved(saved, isEditing ? 'update' : 'create');
                resetBloom();
                onClose();
                navigate(`/quizzes/edit/${saved.id}`);
            }
        } catch (err) {
            console.error(err);
            setAiGenerating(null);
            showToast(err.response?.data?.message || err.response?.data?.error || 'Failed to save/generate.', 'error');
        } finally {
            setContinuing(false);
        }
    };

    // ── Always point the ref to the LATEST handleContinue (runs every render) ──
    handleContinueRef.current = handleContinue;

    // ── Publish ──
    const handlePublish = async () => {
        if (!title.trim()) return;
        if (availability === 'specific_friends' && selectedFriends.length === 0) {
            showToast('Please select at least one friend to share with.', 'error');
            return;
        }

        // Block publishing if the deadline is already in the past
        if (deadline) {
            const deadlineDate = new Date(deadline);
            if (deadlineDate < new Date()) {
                showToast('Cannot publish: the deadline is in the past. Please set a future date or clear the deadline field.', 'error');
                return;
            }
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
            showToast(err.response?.data?.message?.[0] || err.response?.data?.message || err.response?.data?.error || 'Failed to publish.', 'error');
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
            showToast(err.response?.data?.message || err.response?.data?.error || 'Failed to delete quiz.', 'error');
        } finally {
            setDeleting(false);
            setShowDeleteConfirm(false);
        }
    };

    const handleQuestionChange = (index, newValue) => {
        let value = parseInt(newValue);

        // Enforce numbers only + minimum
        if (isNaN(value) || value < 0) value = 0;
        if (value > 10) value = 10;

        const updated = [...questions];
        updated[index] = value;

        const total = updated.reduce((sum, num) => sum + num, 0);

        // Enforce total max = 50
        if (total > 60) {
            showToast('Maximum of 60 total questions only.', 'error');
            return;
        }

        setQuestions(updated);
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
    const totalQuestions = questions.reduce((sum, n) => sum + n, 0);

    const summaryParts = [];
    questions.forEach((q, i) => { if (q > 0) summaryParts.push(`${bloomLevels[i]}: ${q}`); });
    const summaryText = summaryParts.length > 0 ? ` — ${summaryParts.join(', ')}` : '';

    return (
        <div
            className="modal-backdrop"
            onClick={() => {
                if (!isBusy) {
                    resetBloom();
                    onClose();
                }
            }}
        >
            <div className="quiz-modal" onClick={(e) => e.stopPropagation()}>
                <button
                    className="modal-close-btn"
                    onClick={() => {
                        if (!isBusy) {
                            resetBloom();
                            onClose();
                        }
                    }}
                    title="Close"
                    disabled={isBusy}
                >                    <X size={20} />
                </button>

                {!isEditing && (
                    <div className="generation-type-toggle" style={isBusy ? { pointerEvents: 'none', opacity: 0.6 } : {}}>
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

                <div className="modal-body scrollable-modal-body" style={isBusy ? { pointerEvents: 'none', opacity: 0.6 } : {}}>
                    <div className="modal-form-left">
                        <div className="modal-title-container">
                            <div className="form-group title-group-nested">
                                {viewOnly ? (
                                    <h1 className="view-title">{title || 'Untitled'}</h1>
                                ) : (
                                    <input
                                        type="text"
                                        className="title-input"
                                        placeholder={quizData?.status === 'published' ? 'Untitled' : '*Insert title here'}
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                    />
                                )}
                            </div>

                            <div className={`status-badge ${quizData?.status || 'draft'}`}>
                                {quizData?.status === 'published' ? 'Published' : 'Draft'}
                            </div>
                        </div>

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
                                                    src={mediaUrl(friend.avatar_url) || '/default-avatar.png'}
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

                        {!viewOnly && activeTab === 'ai' && (
                            <div className="form-row-two">
                                <div className="form-group">
                                    <label>Category</label>
                                    <select
                                        className="neo-select"
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value)}
                                        disabled={isEditing && activeTab === 'ai'}
                                    >
                                        <option value="General Education">General Education</option>
                                        <option value="Professional Education">Professional Education</option>
                                        <option value="Specialization">Specialization</option>
                                    </select>
                                </div>
                                {category === 'Specialization' && (
                                    <div className="form-group">
                                        <label>Specialization Topic</label>
                                        <select
                                            className="neo-select"
                                            value={specialization}
                                            onChange={(e) => setSpecialization(e.target.value)}
                                            disabled={isEditing && activeTab === 'ai'}
                                        >
                                            <option value="English">English</option>
                                            <option value="Filipino">Filipino</option>
                                            <option value="Biological Science">Biological Science</option>
                                            <option value="Physical Science">Physical Science</option>
                                            <option value="Mathematics">Mathematics</option>
                                            <option value="Social Studies">Social Studies</option>
                                            <option value="Values Education">Values Education</option>
                                            <option value="MAPEH">MAPEH</option>
                                            <option value="Agriculture">Agriculture</option>
                                            <option value="TLE">TLE</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                        )}

                        {!viewOnly && activeTab === 'ai' && (
                            <div className="form-group">
                                <label>Number of Questions per Bloom's Level</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {bloomLevels.map((level, index) => (
                                        <div
                                            key={index}
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '0.5rem 0.75rem',
                                                border: '2px solid var(--charcoal)',
                                                borderRadius: '0.6rem',
                                                background: 'white'
                                            }}
                                        >
                                            <span style={{ fontWeight: 800 }}>{level}</span>

                                            <input
                                                type="number"
                                                min={0}
                                                max={10}
                                                value={questions[index]}
                                                onChange={(e) => handleQuestionChange(index, e.target.value)}
                                                style={{
                                                    width: '60px',
                                                    height: '40px',
                                                    textAlign: 'center',
                                                    fontWeight: 800,
                                                    border: '2px solid var(--charcoal)',
                                                    borderRadius: '0.4rem',
                                                    backgroundColor: (isEditing && activeTab === 'ai') ? '#f0f0f0' : 'white'
                                                }}
                                                disabled={(isEditing && activeTab === 'ai') || (totalQuestions >= 60 && questions[index] === 0)}
                                            />
                                        </div>
                                    ))}
                                    <p style={{
                                        marginTop: '0.5rem',
                                        fontWeight: 800,
                                        fontSize: '0.85rem',
                                        color: totalQuestions >= 60 ? 'green' : 'var(--charcoal)'
                                    }}>
                                        Total: {totalQuestions} / 60{summaryText}
                                        {totalQuestions >= 60 && ' (Maximum reached)'}
                                    </p>
                                </div>
                            </div>
                        )}


                        <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            {!viewOnly && <label>{activeTab === 'ai' ? 'Prompt / Description' : 'Description'}</label>}
                            {viewOnly ? (
                                <p className="view-description-text">
                                    {description || 'No description provided.'}
                                </p>
                            ) : activeTab === 'ai' ? (
                                <>
                                    <textarea
                                        className="neo-textarea"
                                        placeholder="Generate LET exam questions about Science focusing on Photosynthesis."
                                        value={promptText}
                                        onChange={(e) => setPromptText(e.target.value)}
                                        disabled={isEditing && activeTab === 'ai'}
                                        style={{ flex: 1, minHeight: '120px' }}
                                    />

                                    <label>Reference Files</label>
                                    <div className="reference-files-container" style={{ flexShrink: 0, marginTop: '0rem', padding: '1rem', border: '2px dashed var(--charcoal)', borderRadius: '0.75rem', background: '#fafafa' }}>
                                        {isEditing && activeTab === 'ai' ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                <label style={{ margin: 0, fontWeight: 800, marginBottom: '0.5rem' }}>Saved Reference Files</label>
                                                {quizData?.reference_file_1 ? (
                                                    <a href={mediaUrl(quizData.reference_file_1)} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', background: 'white', border: '2px solid var(--charcoal)', borderRadius: '0.5rem', textDecoration: 'none', color: 'var(--charcoal)', fontWeight: 700 }}>
                                                        <ExternalLink size={16} /> Reference File 1
                                                    </a>
                                                ) : null}
                                                {quizData?.reference_file_2 ? (
                                                    <a href={mediaUrl(quizData.reference_file_2)} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', background: 'white', border: '2px solid var(--charcoal)', borderRadius: '0.5rem', textDecoration: 'none', color: 'var(--charcoal)', fontWeight: 700 }}>
                                                        <ExternalLink size={16} /> Reference File 2
                                                    </a>
                                                ) : null}
                                                {!quizData?.reference_file_1 && !quizData?.reference_file_2 && (
                                                    <span style={{ fontSize: '0.85rem' }}>No reference files uploaded.</span>
                                                )}
                                            </div>
                                        ) : (
                                            <>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: referenceFiles.length > 0 ? '1rem' : '0' }}>
                                                    <label style={{ margin: 0, fontWeight: 800 }}>Reference Files (Max 2, 10MB each)</label>
                                                    {referenceFiles.length === 0 && (
                                                        <button
                                                            type="button"
                                                            style={{ padding: '0.4rem 1rem', background: 'var(--blue)', color: 'white', borderRadius: '0.5rem', fontWeight: 800, border: '2px solid var(--charcoal)', cursor: 'pointer' }}
                                                            onClick={() => referenceFileRef.current?.click()}
                                                        >
                                                            Upload Reference File
                                                        </button>
                                                    )}
                                                </div>

                                                <input
                                                    type="file"
                                                    ref={referenceFileRef}
                                                    style={{ display: 'none' }}
                                                    accept=".pdf,.docx,.pptx,.txt"
                                                    multiple
                                                    onChange={handleReferenceFileSelect}
                                                />

                                                {referenceFiles.length > 0 && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                        {referenceFiles.map((file, idx) => (
                                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'white', border: '2px solid var(--charcoal)', borderRadius: '0.5rem' }}>
                                                                <span
                                                                    style={{
                                                                        fontSize: '0.85rem',
                                                                        fontWeight: 700,
                                                                        overflow: 'hidden',
                                                                        textOverflow: 'ellipsis',
                                                                        whiteSpace: 'nowrap',
                                                                        flex: 1
                                                                    }}
                                                                >
                                                                    Reference File {idx + 1}: {truncateFilename(file.name)}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeReferenceFile(idx)}
                                                                    style={{ background: 'transparent', border: 'none', color: '#E53935', cursor: 'pointer', padding: '0.2rem' }}
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {referenceFiles.length > 0 && referenceFiles.length < 2 && (
                                                    <button
                                                        type="button"
                                                        style={{ marginTop: '0.75rem', padding: '0.4rem 1rem', background: 'var(--blue)', color: 'white', borderRadius: '0.5rem', fontWeight: 800, border: '2px solid var(--charcoal)', cursor: 'pointer', width: '100%' }}
                                                        onClick={() => referenceFileRef.current?.click()}
                                                    >
                                                        Upload Another File
                                                    </button>
                                                )}

                                                {referenceFiles.length >= 2 && (
                                                    <div style={{ marginTop: '1rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--charcoal)', padding: '0.5rem', background: '#FFD6A5', border: '2px solid var(--charcoal)', borderRadius: '0.5rem', textAlign: 'center' }}>
                                                        Maximum of 2 reference files reached.
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </>
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

               <div className="modal-actions">
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
                                    {activeTab !== 'ai' && (
                                        <button
                                            className="draft-btn"
                                            onClick={handleSaveDraft}
                                            disabled={isTitleEmpty || isBusy}
                                        >
                                            {savingDraft ? 'Saving...' : 'Save as Draft'}
                                        </button>
                                    )}
                                    <button
                                        className="continue-btn"
                                        onClick={handleContinue}
                                        disabled={isTitleEmpty || isBusy || (activeTab === 'ai' && !promptText.trim())}
                                    >
                                        {continuing ? 'Processing...' : (activeTab === 'ai' ? 'Next' : 'Continue')}
                                    </button>
                                </>
                            )
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CreateQuizModal;
