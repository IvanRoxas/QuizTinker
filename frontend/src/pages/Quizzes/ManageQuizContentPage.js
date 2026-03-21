import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    fetchQuiz, autoSaveQuiz, unpublishQuiz, updateQuiz,
    createQuizItem, updateQuizItem, deleteQuizItem, reorderQuizItems
} from '../../api/quizApi';
import { useAuth } from '../../context/AuthContext';
import './ManageQuizContentPage.css';

const ManageQuizContentPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    // ── STATE ──
    const [quiz, setQuiz] = useState(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Editor state: { [itemId]: { ...draftValues } }
    const [editing, setEditing] = useState({});
    const [lightboxImage, setLightboxImage] = useState(null);

    // Custom states
    const [toastMsg, setToastMsg] = useState(null); // { message: '', action: fn }
    const [isDirty, setIsDirty] = useState(false);
    const [showUnpublishModal, setShowUnpublishModal] = useState(false);

    // Refs
    const dragItem = useRef(null);
    const dragOverItem = useRef(null);
    const stepDragItem = useRef(null);
    const stepDragOverItem = useRef(null);
    const undoTimeouts = useRef({});
    const stepBackups = useRef({});

    useEffect(() => {
        loadData();
    }, [id]);

    const loadData = async () => {
        try {
            setLoading(true);
            const q = await fetchQuiz(id);
            setQuiz(q);
            setItems(q.items || []);
        } catch (err) {
            console.error('Failed to load quiz', err);
            showToast('Failed to load quiz.');
        } finally {
            setLoading(false);
        }
    };

    // ── POLLING FOR GENERATING STATE ──
    useEffect(() => {
        let pollInterval;
        let timeoutId;
        
        if (quiz?.status === 'generating') {
            showToast('AI is generating your quiz in the background...');
            pollInterval = setInterval(() => {
                loadData();
            }, 3000);
            
            timeoutId = setTimeout(() => {
                if (pollInterval) clearInterval(pollInterval);
                setQuiz(prev => ({ ...prev, status: 'error' }));
                showToast('Generation timed out. Please try again.');
            }, 5 * 60 * 1000); // 5 minutes
        }
        
        return () => {
            if (pollInterval) clearInterval(pollInterval);
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [quiz?.status, id]);

    // ── AUTOSAVE & BEFOREUNLOAD ──
    const quizRef = useRef(quiz);
    useEffect(() => {
        quizRef.current = quiz;
    }, [quiz]);

    useEffect(() => {
        if (!id || (quizRef.current && quizRef.current.status === 'published')) return;

        console.log('Autosave interval started.');
        const interval = setInterval(async () => {
            const currentQuiz = quizRef.current;
            if (!currentQuiz || currentQuiz.status === 'published') return;

            try {
                // Use a plain object (JSON) for settings to avoid FormData string-coercion bugs
                const payload = {
                    title: currentQuiz.title || '',
                    description: currentQuiz.description || '',
                    show_answers_at_end: currentQuiz.show_answers_at_end !== false,
                    can_backtrack: currentQuiz.can_backtrack !== false,
                    time_limit_minutes: currentQuiz.time_limit_minutes || null
                };

                await autoSaveQuiz(id, payload);
                console.log('Autosaved settings:', payload);
            } catch (err) {
                console.error('Autosave failed:', err);
            }
        }, 10000);

        return () => {
            console.log('Autosave interval cleared.');
            clearInterval(interval);
        };
    }, [id]); // Only restart if ID changes

    useEffect(() => {
        if (quiz?.status === 'published' && isDirty) {
            const handleBeforeUnload = (e) => {
                e.preventDefault();
                e.returnValue = '';
            };
            window.addEventListener('beforeunload', handleBeforeUnload);
            return () => window.removeEventListener('beforeunload', handleBeforeUnload);
        }
    }, [quiz, isDirty]);

    // ── HELPERS ──
    const showToast = (message, action = null) => {
        setToastMsg({ message, action });
        setTimeout(() => setToastMsg(null), 6000);
    };

    const markDirty = () => {
        if (quiz?.status === 'published') {
            setIsDirty(true);
        }
    };

    // ── QUIZ LEVEL ACTIONS ──
    const handleQuizChange = (field, value) => {
        setQuiz({ ...quiz, [field]: value });
        markDirty();
    };

    const handleManualSave = async () => {
        try {
            setSaving(true);
            const payload = {
                title: quiz.title || '',
                description: quiz.description || '',
                show_answers_at_end: quiz.show_answers_at_end !== false,
                can_backtrack: quiz.can_backtrack !== false,
                time_limit_minutes: quiz.time_limit_minutes || null
            };

            await updateQuiz(id, payload);
            setIsDirty(false);
            showToast(quiz.status === 'published' ? 'Changes saved.' : 'Draft saved.');
        } catch (err) {
            showToast('Failed to save.');
        } finally {
            setSaving(false);
        }
    };

    const handlePublish = async () => {
        if (items.length === 0) {
            showToast('Cannot publish a quiz with 0 questions.');
            return;
        }
        try {
            setSaving(true);
            const formData = new FormData();
            formData.append('status', 'published');
            await updateQuiz(id, formData);
            setQuiz({ ...quiz, status: 'published' });
            showToast('Quiz published!');
        } catch (err) {
            showToast('Failed to publish.');
        } finally {
            setSaving(false);
        }
    };

    const handleUnpublishConfirm = async () => {
        try {
            setSaving(true);
            await unpublishQuiz(id);
            setQuiz({ ...quiz, status: 'draft' });
            setShowUnpublishModal(false);
            showToast('Quiz reverted to draft.');
        } catch (err) {
            showToast('Failed to unpublish.');
        } finally {
            setSaving(false);
        }
    };

    // ── ITEM ACTIONS ──
    const handleAddItem = async () => {
        try {
            const formData = new FormData();
            formData.append('question', '');
            formData.append('type', 'identification');
            formData.append('sort_order', items.length);
            const newItem = await createQuizItem(id, formData);
            setItems([...items, newItem]);
            startEditing(newItem.id, newItem);
        } catch (err) {
            showToast('Failed to add question.');
        }
    };

    const handleDeleteItem = async (itemId) => {
        if (!window.confirm('Delete this question?')) return;
        try {
            await deleteQuizItem(id, itemId);
            setItems(items.filter(it => it.id !== itemId));
            // Cleanup editing
            const newEditing = { ...editing };
            delete newEditing[itemId];
            setEditing(newEditing);
            // Re-order remaining? It's fine to leave gaps in sort_order.
        } catch (err) {
            showToast('Failed to delete question.');
        }
    };

    const startEditing = (itemId, item) => {
        // Deep copy to prevent mutating state directly
        setEditing({
            ...editing,
            [itemId]: JSON.parse(JSON.stringify(item))
        });
        markDirty();
    };

    const cancelEditing = (itemId) => {
        const newEditing = { ...editing };
        delete newEditing[itemId];
        setEditing(newEditing);
    };

    const saveEditing = async (itemId) => {
        const draft = editing[itemId];
        try {
            const formData = new FormData();
            formData.append('question', draft.question || '');
            formData.append('type', draft.type || 'identification');
            formData.append('points', draft.points || 1);

            // Format type specific data
            if (['single_choice', 'multiple_answer'].includes(draft.type)) {
                formData.append('choices', JSON.stringify(draft.choices || []));
            } else if (draft.type === 'identification') {
                formData.append('correct_answer', draft.correct_answer || '');
            } else if (draft.type === 'true_false') {
                formData.append('tf_correct', draft.tf_correct === true || draft.tf_correct === 'true');
            } else if (['matching', 'ordering'].includes(draft.type)) {
                formData.append('meta', JSON.stringify(draft.meta || {}));
            }

            // Note: Images are handled separately via handleImageUpload

            const updatedItem = await updateQuizItem(id, itemId, formData);
            setItems(items.map(it => it.id === itemId ? updatedItem : it));
            cancelEditing(itemId);
        } catch (err) {
            showToast('Failed to save question.');
        }
    };

    const handleImageUpload = async (itemId, file) => {
        if (file.size > 2 * 1024 * 1024) {
            showToast('Image must be under 2MB.');
            return;
        }

        try {
            const formData = new FormData();
            formData.append('media', file);
            const updatedItem = await updateQuizItem(id, itemId, formData);
            setItems(items.map(it => it.id === itemId ? updatedItem : it));

            // If currently editing, update draft as well
            if (editing[itemId]) {
                setEditing({
                    ...editing,
                    [itemId]: { ...editing[itemId], media: updatedItem.media }
                });
            }
        } catch (err) {
            showToast('Failed to upload image.');
        }
    };

    const handleRemoveImage = async (itemId) => {
        try {
            const formData = new FormData();
            formData.append('media', ''); // Passing empty string to clear the file field
            const updatedItem = await updateQuizItem(id, itemId, formData);
            setItems(items.map(it => it.id === itemId ? updatedItem : it));

            if (editing[itemId]) {
                setEditing({
                    ...editing,
                    [itemId]: { ...editing[itemId], media: null }
                });
            }
        } catch (err) {
            showToast('Failed to remove image.');
        }
    };

    // ── OUTER DRAG & DROP ──
    const handleOuterDragStart = (e, idx) => {
        dragItem.current = idx;
    };

    const handleOuterDragEnter = (e, idx) => {
        dragOverItem.current = idx;
    };

    const handleOuterDragEnd = async () => {
        if (dragItem.current === null || dragOverItem.current === null) return;
        if (dragItem.current !== dragOverItem.current) {
            const copy = [...items];
            const dragged = copy[dragItem.current];
            copy.splice(dragItem.current, 1);
            copy.splice(dragOverItem.current, 0, dragged);

            // Update sort_order locally
            const reordered = copy.map((it, idx) => ({ ...it, sort_order: idx }));
            setItems(reordered);
            markDirty();

            // Silently sync with backend
            const payload = reordered.map(it => ({ id: it.id, sort_order: it.sort_order }));
            reorderQuizItems(id, payload).catch(err => {
                console.error('Failed to sync reorder', err);
            });
        }
        dragItem.current = null;
        dragOverItem.current = null;
    };

    // ── INNER DRAG & DROP (ORDERING) ──
    const handleInnerDragStart = (e, idx) => {
        e.stopPropagation(); // Prevent outer drag
        stepDragItem.current = idx;
    };

    const handleInnerDragEnter = (e, idx) => {
        e.stopPropagation();
        stepDragOverItem.current = idx;
    };

    const handleInnerDrop = (e, itemId) => {
        e.stopPropagation();
        if (stepDragItem.current === null || stepDragOverItem.current === null) return;
        if (stepDragItem.current !== stepDragOverItem.current) {
            const draft = editing[itemId];
            const meta = draft.meta || {};
            const orderList = [...(meta.order || [])];

            // Backup for Undo
            stepBackups.current[itemId] = JSON.parse(JSON.stringify(orderList));

            const dragged = orderList[stepDragItem.current];
            orderList.splice(stepDragItem.current, 1);
            orderList.splice(stepDragOverItem.current, 0, dragged);

            setEditing({
                ...editing,
                [itemId]: { ...draft, meta: { ...meta, order: orderList } }
            });

            triggerUndoToast(itemId);
        }
        stepDragItem.current = null;
        stepDragOverItem.current = null;
    };

    const triggerUndoToast = (itemId) => {
        if (undoTimeouts.current[itemId]) {
            clearTimeout(undoTimeouts.current[itemId]);
        }
        showToast('Question reordered.', () => {
            // Undo action
            const draft = editing[itemId];
            if (draft && stepBackups.current[itemId]) {
                setEditing({
                    ...editing,
                    [itemId]: { ...draft, meta: { ...(draft.meta || {}), order: stepBackups.current[itemId] } }
                });
            }
            setToastMsg(null);
        });
        undoTimeouts.current[itemId] = setTimeout(() => {
            delete stepBackups.current[itemId];
        }, 6000);
    };

    const handleShuffleOrdering = (itemId) => {
        const draft = editing[itemId];
        const meta = draft.meta || {};
        const orderList = [...(meta.order || [])];
        stepBackups.current[itemId] = JSON.parse(JSON.stringify(orderList));

        // Fisher-Yates shuffle
        for (let i = orderList.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [orderList[i], orderList[j]] = [orderList[j], orderList[i]];
        }
        setEditing({
            ...editing,
            [itemId]: { ...draft, meta: { ...meta, order: orderList } }
        });
        triggerUndoToast(itemId);
    };

    // ── RENDERERS ──

    const renderChoiceEditing = (itemId, draft) => {
        const choices = draft.choices || [];
        const isMulti = draft.type === 'multiple_answer';

        return (
            <div className="choices-editor">
                {choices.map((c, i) => (
                    <div key={i} className="choice-row">
                        <input
                            type="checkbox"
                            className="neo-checkbox"
                            checked={c.is_correct || false}
                            onChange={(e) => {
                                const checked = e.target.checked;
                                const newChoices = [...choices];
                                if (!isMulti && checked) {
                                    newChoices.forEach(nc => nc.is_correct = false);
                                }
                                newChoices[i].is_correct = checked;
                                setEditing({ ...editing, [itemId]: { ...draft, choices: newChoices } });
                            }}
                        />
                        <input
                            type="text"
                            className="neo-input flex-1"
                            value={c.text || ''}
                            onChange={(e) => {
                                const newChoices = [...choices];
                                newChoices[i].text = e.target.value;
                                setEditing({ ...editing, [itemId]: { ...draft, choices: newChoices } });
                            }}
                            placeholder="Choice text..."
                        />
                        <button className="neo-btn sm remove-btn" onClick={() => {
                            const newChoices = choices.filter((_, idx) => idx !== i);
                            setEditing({ ...editing, [itemId]: { ...draft, choices: newChoices } });
                        }}>✖</button>
                    </div>
                ))}
                <button className="neo-btn sm mt-2" onClick={() => {
                    setEditing({ ...editing, [itemId]: { ...draft, choices: [...choices, { text: '', is_correct: false }] } });
                }}>+ Add Choice</button>
            </div>
        );
    };

    const renderMatchingEditing = (itemId, draft) => {
        const pairs = (draft.meta || {}).pairs || [];
        return (
            <div className="matching-editor">
                {pairs.map((p, i) => (
                    <div key={i} className="pair-row">
                        <input
                            type="text"
                            className="neo-input"
                            value={p.left || ''}
                            onChange={(e) => {
                                const newPairs = [...pairs];
                                newPairs[i].left = e.target.value;
                                setEditing({ ...editing, [itemId]: { ...draft, meta: { ...draft.meta, pairs: newPairs } } });
                            }}
                            placeholder="Prompt..."
                        />
                        <span className="arrow">→</span>
                        <input
                            type="text"
                            className="neo-input"
                            value={p.right || ''}
                            onChange={(e) => {
                                const newPairs = [...pairs];
                                newPairs[i].right = e.target.value;
                                setEditing({ ...editing, [itemId]: { ...draft, meta: { ...draft.meta, pairs: newPairs } } });
                            }}
                            placeholder="Match..."
                        />
                        <button className="neo-btn sm remove-btn" onClick={() => {
                            const newPairs = pairs.filter((_, idx) => idx !== i);
                            setEditing({ ...editing, [itemId]: { ...draft, meta: { ...draft.meta, pairs: newPairs } } });
                        }}>✖</button>
                    </div>
                ))}
                <button className="neo-btn sm mt-2" onClick={() => {
                    const newPairs = [...pairs, { left: '', right: '' }];
                    setEditing({ ...editing, [itemId]: { ...draft, meta: { ...draft.meta, pairs: newPairs } } });
                }}>+ Add Pair</button>
            </div>
        );
    };

    const renderOrderingEditing = (itemId, draft) => {
        const orderList = (draft.meta || {}).order || [];
        return (
            <div className="ordering-editor">
                {orderList.map((step, i) => (
                    <div
                        key={i}
                        className="order-step"
                        draggable
                        onDragStart={(e) => handleInnerDragStart(e, i)}
                        onDragEnter={(e) => handleInnerDragEnter(e, i)}
                        onDragEnd={(e) => handleInnerDrop(e, itemId)}
                    >
                        <span className="drag-handle">☰</span>
                        <input
                            type="text"
                            className="neo-input unstyled"
                            value={step || ''}
                            onChange={(e) => {
                                const newOrder = [...orderList];
                                newOrder[i] = e.target.value;
                                setEditing({ ...editing, [itemId]: { ...draft, meta: { ...draft.meta, order: newOrder } } });
                            }}
                            placeholder="Step description..."
                        />
                        <button className="neo-btn sm remove-btn" onClick={() => {
                            const newOrder = orderList.filter((_, idx) => idx !== i);
                            setEditing({ ...editing, [itemId]: { ...draft, meta: { ...draft.meta, order: newOrder } } });
                        }}>✖</button>
                    </div>
                ))}
                <div className="ordering-actions mt-2">
                    <button className="neo-btn sm" onClick={() => {
                        const newOrder = [...orderList, ''];
                        setEditing({ ...editing, [itemId]: { ...draft, meta: { ...draft.meta, order: newOrder } } });
                    }}>+ Add Step</button>
                    <button className="neo-btn sm" onClick={() => handleShuffleOrdering(itemId)}>Shuffle</button>
                </div>
            </div>
        );
    };

    if (loading) return <div className="manage-message">Loading Quiz Content...</div>;
    if (!quiz) return <div className="manage-message error">Quiz not found.</div>;

    if (quiz.status === 'generating') {
        return (
            <div className="manage-message">
                <style>{`
                    .generating-container {
                        display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px;
                        gap: 1rem; color: var(--charcoal);
                    }
                    .generating-spinner {
                        border: 4px solid #f3f3f3; border-top: 4px solid var(--blue); border-radius: 50%;
                        width: 40px; height: 40px; animation: spin 1s linear infinite;
                    }
                    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                `}</style>
                <div className="generating-container">
                    <div className="generating-spinner"></div>
                    <h2>Generating your quiz...</h2>
                    <p>This may take a few minutes. You can safely leave this page and come back later.</p>
                </div>
            </div>
        );
    }

    if (quiz.status === 'error') {
        return (
            <div className="manage-message">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <h2 style={{ color: '#E53935' }}>Generation Failed</h2>
                    <p>There was an error generating your quiz, or it timed out.</p>
                    <button className="neo-btn" onClick={() => navigate('/dashboard')}>Return to Dashboard</button>
                </div>
            </div>
        );
    }

    const isPublished = quiz.status === 'published';
    const isAIGenerated = quiz.generation_type === 'ai';

    return (
        <div className="manage-quiz-page">

            {/* Header / Configuration Card */}
            <div className="manage-header">
                {/* Action Bar (Top Row) */}
                <div className="header-action-bar">
                    <div className="action-bar-left">
                        <h1>{quiz.title}</h1>
                        <span className={`status-badge ${isPublished ? 'published' : 'draft'}`}>
                            {quiz.status.toUpperCase()}
                        </span>
                    </div>
                    <div className="action-bar-right">
                        {isPublished ? (
                            <>
                                <button className="neo-btn outline-btn" onClick={() => setShowUnpublishModal(true)}>
                                    REVERT TO DRAFT
                                </button>
                                <button
                                    className="neo-btn secondary-btn"
                                    onClick={handleManualSave}
                                    disabled={saving}
                                >
                                    {saving ? 'SAVING...' : 'SAVE CHANGES'}
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    className="neo-btn secondary-btn"
                                    onClick={handleManualSave}
                                    disabled={saving}
                                >
                                    {saving ? 'SAVING...' : 'SAVE DRAFT'}
                                </button>
                                <button className="neo-btn success-btn" disabled={saving} onClick={handlePublish}>
                                    PUBLISH QUIZ
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Control Panel (Bottom Row) */}
                <div className="header-control-panel">
                    <div className="control-group">
                        <label>Time Limit (min)</label>
                        <input
                            type="number"
                            min="0"
                            className="config-number-input"
                            value={quiz.time_limit_minutes || ''}
                            onChange={(e) => handleQuizChange('time_limit_minutes', e.target.value ? parseInt(e.target.value) : null)}
                            disabled={isAIGenerated}
                        />
                    </div>
                    <div className="control-group checkbox-row">
                        <input
                            type="checkbox"
                            id="showAnswers"
                            className="config-checkbox"
                            checked={quiz.show_answers_at_end !== false}
                            onChange={e => handleQuizChange('show_answers_at_end', e.target.checked)}
                            disabled={isAIGenerated}
                        />
                        <label htmlFor="showAnswers">Show Answers at End</label>
                    </div>
                    <div className="control-group checkbox-row">
                        <input
                            type="checkbox"
                            id="allowBacktrack"
                            className="config-checkbox"
                            checked={quiz.can_backtrack !== false}
                            onChange={e => handleQuizChange('can_backtrack', e.target.checked)}
                            disabled={isAIGenerated}
                        />
                        <label htmlFor="allowBacktrack">Allow Backtracking</label>
                    </div>
                </div>
            </div>

            {/* Content List */}
            <div className="quiz-items-container">
                {items.map((item, idx) => {
                    const isEditing = !!editing[item.id];
                    const draft = editing[item.id];

                    return (
                        <div
                            key={item.id}
                            className={`quiz-item-card ${isEditing ? 'editing' : ''}`}
                            draggable={!isEditing && !isAIGenerated}
                            onDragStart={(e) => !isAIGenerated && handleOuterDragStart(e, idx)}
                            onDragEnter={(e) => !isAIGenerated && handleOuterDragEnter(e, idx)}
                            onDragEnd={isAIGenerated ? undefined : handleOuterDragEnd}
                        >
                            <div className="card-header">
                                <div className="card-header-left">
                                    {!isAIGenerated && <span className="drag-handle" title="Drag to reorder">☰</span>}
                                    <span className="question-number">Q{idx + 1}</span>
                                    {isEditing && (
                                        <>
                                            <select
                                                className="neo-select ml-4"
                                                value={draft?.type || 'identification'}
                                                onChange={(e) => setEditing({ ...editing, [item.id]: { ...draft, type: e.target.value } })}
                                            >
                                                <option value="identification">Identification</option>
                                                <option value="single_choice">Multiple Choice</option>
                                                <option value="multiple_answer">Multiple Answer</option>
                                                <option value="true_false">True/False</option>
                                                <option value="matching">Matching</option>
                                                <option value="ordering">Ordering</option>
                                            </select>
                                            <label className="neo-label inline ml-4">
                                                Points:
                                                <input
                                                    type="number"
                                                    min="1"
                                                    className="neo-input ppts-input"
                                                    value={draft?.points || 1}
                                                    onChange={(e) => setEditing({ ...editing, [item.id]: { ...draft, points: parseInt(e.target.value) || 1 } })}
                                                />
                                            </label>
                                        </>
                                    )}
                                </div>
                                <div className="card-header-actions">
                                    {!isEditing && (
                                        <>
                                            <span className="pts-badge">{item.points} pt{item.points > 1 ? 's' : ''}</span>
                                            {!isAIGenerated && (
                                                <button className="neo-btn sm" onClick={() => startEditing(item.id, item)}>Edit</button>
                                            )}
                                        </>
                                    )}
                                    {!isAIGenerated && (
                                        <button className="neo-btn sm danger" onClick={() => handleDeleteItem(item.id)}>Delete</button>
                                    )}
                                </div>
                            </div>

                            <div className="card-body">
                                {isEditing ? (
                                    <>
                                        <textarea
                                            className="neo-textarea w-full"
                                            value={draft.question || ''}
                                            onChange={(e) => setEditing({ ...editing, [item.id]: { ...draft, question: e.target.value } })}
                                            placeholder="Enter a new question..."
                                        />

                                        <div className="media-upload-section">
                                            {draft.media ? (
                                                <div className="media-preview">
                                                    {(() => {
                                                        const mUrl = draft.media ? (draft.media.startsWith('http') ? draft.media : `http://localhost:8000${draft.media}`) : null;
                                                        return mUrl ? (
                                                            <img
                                                                src={mUrl}
                                                                alt="Question Media"
                                                                className="clickable"
                                                                onClick={() => setLightboxImage(mUrl)}
                                                            />
                                                        ) : null;
                                                    })()}
                                                    <button className="neo-btn sm danger mt-2" onClick={() => handleRemoveImage(item.id)}>Remove Image</button>
                                                </div>
                                            ) : (
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="neo-input file"
                                                    onChange={(e) => {
                                                        if (e.target.files && e.target.files[0]) {
                                                            handleImageUpload(item.id, e.target.files[0]);
                                                        }
                                                    }}
                                                />
                                            )}
                                        </div>

                                        <div className="type-specific-editor">
                                            {draft.type === 'identification' && (
                                                <input
                                                    type="text"
                                                    className="neo-input w-full"
                                                    value={draft.correct_answer || ''}
                                                    onChange={(e) => setEditing({ ...editing, [item.id]: { ...draft, correct_answer: e.target.value } })}
                                                    placeholder="Exact correct answer..."
                                                />
                                            )}
                                            {['single_choice', 'multiple_answer'].includes(draft.type) && renderChoiceEditing(item.id, draft)}
                                            {draft.type === 'true_false' && (
                                                <div className="tf-editor">
                                                    <div
                                                        className={`custom-radio ${draft.tf_correct === true || draft.tf_correct === 'true' ? 'selected' : ''}`}
                                                        onClick={() => setEditing({ ...editing, [item.id]: { ...draft, tf_correct: true } })}
                                                    >
                                                        <div className="radio-dot"><div className="radio-inner" /></div>
                                                        <span>True</span>
                                                    </div>
                                                    <div
                                                        className={`custom-radio ${draft.tf_correct === false || draft.tf_correct === 'false' ? 'selected' : ''}`}
                                                        onClick={() => setEditing({ ...editing, [item.id]: { ...draft, tf_correct: false } })}
                                                    >
                                                        <div className="radio-dot"><div className="radio-inner" /></div>
                                                        <span>False</span>
                                                    </div>
                                                </div>
                                            )}
                                            {draft.type === 'matching' && renderMatchingEditing(item.id, draft)}
                                            {draft.type === 'ordering' && renderOrderingEditing(item.id, draft)}
                                        </div>

                                        <div className="card-actions-wrapper">
                                            <button className="neo-btn orange" onClick={() => saveEditing(item.id)}>Save Question</button>
                                            <button className="neo-btn white" onClick={() => cancelEditing(item.id)}>Cancel</button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="readonly-question">{item.question}</div>
                                        {item.media && (
                                            <img
                                                src={item.media.startsWith('http') ? item.media : `http://localhost:8000${item.media}`}
                                                alt="Item Media"
                                                className="readonly-media clickable"
                                                onClick={() => setLightboxImage(item.media.startsWith('http') ? item.media : `http://localhost:8000${item.media}`)}
                                            />
                                        )}
                                        <div className="readonly-type">Type: {item.type.replace('_', ' ')}</div>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}

                {isAIGenerated && (
                    <div className="manage-message" style={{ padding: '2rem', textAlign: 'center', color: '#666', border: '1px dashed #ccc', borderRadius: '8px' }}>
                        This quiz was generated by TinkerBot (AI). The questions and their contents are locked to maintain the AI's intended difficulty and focus. 
                        You can still manage its basic settings from the dashboard.
                    </div>
                )}
                {!isAIGenerated && (
                    <button className="neo-btn primary full-width" onClick={handleAddItem}>
                        + ADD NEW QUESTION
                    </button>
                )}
            </div>

            {/* Unpublish Modal */}
            {showUnpublishModal && (
                <div className="neo-modal-overlay">
                    <div className="neo-modal">
                        <h2>Revert to Draft?</h2>
                        <p>This hides the quiz from students. Are you sure?</p>
                        <div className="modal-actions">
                            <button className="neo-btn danger" onClick={handleUnpublishConfirm}>Yes, Unpublish</button>
                            <button className="neo-btn white" onClick={() => setShowUnpublishModal(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast System */}
            {toastMsg && (
                <div className="neo-toast">
                    {toastMsg.message}
                    {toastMsg.action && (
                        <button className="neo-btn sm bg-black text-white ml-4" onClick={toastMsg.action}>Undo</button>
                    )}
                </div>
            )}
            {/* LIGHTBOX MODAL */}
            {lightboxImage && (
                <div className="neo-modal-overlay lightbox" onClick={() => setLightboxImage(null)}>
                    <div className="lightbox-content" onClick={e => e.stopPropagation()}>
                        <button className="lightbox-close" onClick={() => setLightboxImage(null)}>&times;</button>
                        <img src={lightboxImage} alt="Fullscreen" />
                    </div>
                </div>
            )}
        </div>
    );
};

export default ManageQuizContentPage;
