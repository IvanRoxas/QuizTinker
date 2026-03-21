import React, { useState, useEffect, useRef, useCallback } from 'react';
import axiosClient from '../api/axiosClient';
import { Send, Paperclip, Trash2, Bot, User, FileText, X, ChevronDown, Plus, MessageSquare, Menu } from 'lucide-react';
import './ChatPage.css';

// Inline UUID v4 (avoids adding the 'uuid' npm package)
const uuidv4 = () =>
    typeof crypto?.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CollapsibleList = ({ items }) => {
    const [expanded, setExpanded] = useState(false);
    if (!items || items.length === 0) return null;

    const showMore = items.length > 4;
    const visibleItems = expanded || !showMore ? items : items.slice(0, 4);

    return (
        <div className="chat-collapsible-list">
            <ul className="chat-list">
                {visibleItems.map((li, i) => <li key={i}>{li}</li>)}
            </ul>
            {showMore && (
                <button
                    className="chat-show-more-btn"
                    onClick={() => setExpanded(!expanded)}
                >
                    {expanded ? 'Show less' : `Show ${items.length - 4} more`}
                </button>
            )}
        </div>
    );
};

/** Markdown-to-JSX: renders bullets via CollapsibleList, highlights keywords */
function renderMarkdown(text, keywordsList = []) {
    if (!text) return null;
    const lines = text.split('\n');
    const elements = [];
    let listItems = [];

    const flushList = () => {
        if (listItems.length > 0) {
            elements.push(<CollapsibleList key={`ul-${elements.length}`} items={listItems} />);
            listItems = [];
        }
    };

    lines.forEach((line, idx) => {
        const bulletMatch = line.match(/^[\s]*[-•*]\s+(.+)/);
        const numberedMatch = line.match(/^[\s]*\d+\.\s+(.+)/);
        const headingMatch = line.match(/^#{1,3}\s+(.+)/);

        if (bulletMatch) {
            listItems.push(renderInline(bulletMatch[1], keywordsList));
        } else if (numberedMatch) {
            listItems.push(renderInline(numberedMatch[1], keywordsList));
        } else {
            flushList();
            if (headingMatch) {
                elements.push(
                    <p key={idx} className="chat-md-heading">
                        {renderInline(headingMatch[1], keywordsList)}
                    </p>
                );
            } else if (line.trim() === '') {
                elements.push(<br key={idx} />);
            } else {
                elements.push(<p key={idx}>{renderInline(line, keywordsList)}</p>);
            }
        }
    });
    flushList();
    return elements;
}

function renderInline(text, keywordsList = []) {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={i} className="chat-keyword chat-inline-code">{part.slice(1, -1)}</code>;
        }

        if (part.trim() && keywordsList.length > 0) {
            const escapedKeywords = keywordsList.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            const pattern = new RegExp(`\\b(${escapedKeywords.join('|')})\\b`, 'gi');
            const subParts = part.split(pattern);

            return subParts.map((sub, j) => {
                const subLower = sub.toLowerCase();
                const isKeyword = keywordsList.some(k => k.toLowerCase() === subLower);
                if (isKeyword) {
                    return <span key={`${i}-${j}`} className="chat-keyword">{sub}</span>;
                }
                // Proper noun heuristic — capitalized word mid-sentence
                if (sub.match(/^[A-Z][a-z]{2,}$/) && sub.length > 2) {
                    return <span key={`${i}-${j}`} className="chat-keyword">{sub}</span>;
                }
                return sub;
            });
        }
        return part;
    });
}


// ---------------------------------------------------------------------------
// Message Bubble
// ---------------------------------------------------------------------------
const MessageBubble = ({ msg, keywordsList = [], onDelete }) => {
    const isUser = msg.role === 'user';
    const isFile = msg.role === 'file'; // synthetic file-card message

    if (isFile) {
        return (
            <div className="chat-file-result-wrapper" style={{ animation: 'bubbleFadeIn 0.25s ease' }}>
                <FileResultCard
                    fileName={msg.fileName}
                    summary={msg.summary}
                    explanation={msg.explanation}
                    keywordsList={keywordsList}
                    onDismiss={onDelete ? () => onDelete(msg.id) : msg.onDismiss}
                />
            </div>
        );
    }

    return (
        <div className={`chat-bubble-row ${isUser ? 'user-row' : 'bot-row'}`}>
            {!isUser && (
                <div className="chat-avatar bot-avatar">
                    <Bot size={16} />
                </div>
            )}
            <div className={`chat-bubble ${isUser ? 'user-bubble' : 'bot-bubble'}`}>
                <div className="bubble-content">
                    {isUser
                        ? <p>{msg.content}</p>
                        : renderMarkdown(msg.content, keywordsList)
                    }
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '4px' }}>
                    <span className="bubble-time" style={{ display: 'inline', marginTop: 0 }}>
                        {msg.created_at
                            ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : 'Now'}
                    </span>
                    {onDelete && typeof msg.id === 'number' && (
                        <button
                            onClick={() => onDelete(msg.id)}
                            title="Delete message"
                            style={{
                                background: 'none',
                                border: 'none',
                                color: isUser ? 'rgba(255,255,255,0.7)' : '#94a3b8',
                                cursor: 'pointer',
                                padding: 0,
                                marginLeft: '8px',
                                display: 'flex',
                            }}
                        >
                            <Trash2 size={13} />
                        </button>
                    )}
                </div>
            </div>
            {isUser && (
                <div className="chat-avatar user-avatar">
                    <User size={16} />
                </div>
            )}
        </div>
    );
};


// ---------------------------------------------------------------------------
// File Upload Result Card
// Styled to match .bot-bubble exactly — same font, weight, keyword highlighting
// ---------------------------------------------------------------------------
const FileResultCard = ({ fileName, summary, explanation, keywordsList = [], onDismiss }) => (
    <div className="file-result-card">
        <div className="file-result-header">
            <FileText size={18} className="file-result-icon" />
            <span className="file-result-name">{fileName}</span>
            {onDismiss && (
                <button className="file-result-dismiss" onClick={onDismiss} title="Dismiss">
                    <X size={14} />
                </button>
            )}
        </div>
        <div className="file-result-body">
            {/* Explanation first — overview paragraph(s) */}
            {explanation && (
                <div className="file-result-section">
                    <div className="file-result-text bot-bubble-style">
                        {renderMarkdown(explanation, keywordsList)}
                    </div>
                </div>
            )}
            {/* Summary second — bullet key points */}
            {summary && (
                <div className="file-result-section file-result-summary-section">
                    <div className="file-result-text bot-bubble-style">
                        {renderMarkdown(summary, keywordsList)}
                    </div>
                </div>
            )}
        </div>
    </div>
);


// ---------------------------------------------------------------------------
// Main ChatPage
// ---------------------------------------------------------------------------
const ChatPage = () => {
    const [sessionId, setSessionId] = useState(() => uuidv4());
    // messages array now includes synthetic 'file' role entries so file cards
    // appear in chronological order relative to chat messages
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState('');
    const [isClearing, setIsClearing] = useState(false);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const [sessions, setSessions] = useState([]);
    const [isSessionsLoading, setIsSessionsLoading] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
    const [keywordsList, setKeywordsList] = useState([]);

    const messagesEndRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const fileInputRef = useRef(null);
    const textareaRef = useRef(null);

    // ── Scroll helpers ────────────────────────────────────────────────────
    const scrollToBottom = useCallback((behavior = 'smooth') => {
        messagesEndRef.current?.scrollIntoView({ behavior });
    }, []);

    const handleScroll = () => {
        const el = messagesContainerRef.current;
        if (!el) return;
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        setShowScrollBtn(distFromBottom > 120);
    };

    // ── Keywords fetch ────────────────────────────────────────────────────
    useEffect(() => {
        axiosClient.get('/api/chatbot/keywords/')
            .then(res => setKeywordsList(res.data.keywords || []))
            .catch(console.error);
    }, []);

    // ── Sessions fetch ────────────────────────────────────────────────────
    const fetchSessions = useCallback(async () => {
        setIsSessionsLoading(true);
        try {
            const res = await axiosClient.get('/api/chatbot/sessions/');
            setSessions(res.data.sessions || []);
        } catch (err) {
            console.error('Failed to fetch sessions', err);
        } finally {
            setIsSessionsLoading(false);
        }
    }, []);

    useEffect(() => { fetchSessions(); }, [fetchSessions]);

    // ── Load message history when sessionId changes ───────────────────────
    useEffect(() => {
        const loadHistory = async () => {
            setIsLoadingHistory(true);
            try {
                const res = await axiosClient.get(`/api/chatbot/history/?session_id=${sessionId}`);
                // Parse file messages
                const parsedMessages = (res.data.messages || []).map(m => {
                    if (m.role === 'file' && m.content.startsWith('{')) {
                        try {
                            const parsed = JSON.parse(m.content);
                            return { ...m, ...parsed };
                        } catch (e) {
                            return m;
                        }
                    }
                    return m;
                });
                setMessages(parsedMessages);
            } catch {
                setMessages([]);
            } finally {
                setIsLoadingHistory(false);
            }
        };
        loadHistory();
    }, [sessionId]);

    // ── Auto-scroll on new messages ───────────────────────────────────────
    useEffect(() => { scrollToBottom('smooth'); }, [messages, scrollToBottom]);

    // ── Textarea auto-resize ──────────────────────────────────────────────
    const handleInputChange = (e) => {
        setInput(e.target.value);
        const ta = textareaRef.current;
        if (ta) {
            ta.style.height = 'auto';
            ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
        }
    };

    // ── Send text message ─────────────────────────────────────────────────
    const handleSend = async () => {
        const trimmed = input.trim();
        if (!trimmed || isSending) return;

        const optimisticId = `opt-${Date.now()}`;
        const optimistic = {
            id: optimisticId,
            role: 'user',
            content: trimmed,
            created_at: new Date().toISOString(),
        };

        setMessages(prev => [...prev, optimistic]);
        setInput('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        setIsSending(true);
        setError('');

        try {
            const res = await axiosClient.post('/api/chatbot/chat/', {
                message: trimmed,
                session_id: sessionId,
            });

            const botMsg = {
                id: res.data.bot_message_id || `bot-${Date.now()}`,
                role: 'assistant',
                content: res.data.reply,
                created_at: new Date().toISOString(),
            };

            setMessages(prev => {
                const updated = prev.map(m =>
                    m.id === optimisticId
                        ? { ...m, id: res.data.user_message_id || m.id }
                        : m
                );
                return [...updated, botMsg];
            });

            fetchSessions();
        } catch (err) {
            const errText = err.response?.data?.error || 'Failed to get a response. Please try again.';
            setError(errText);
            setMessages(prev => prev.filter(m => m.id !== optimisticId));
        } finally {
            setIsSending(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // ── File upload ───────────────────────────────────────────────────────
    // Injects the file result card directly into the messages array as a
    // synthetic 'file' role entry so it appears in chronological order,
    // not floating at the bottom of the page below newer messages.
    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = ''; // allow re-upload of same file

        setIsUploading(true);
        setError('');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('session_id', sessionId);

        try {
            const res = await axiosClient.post('/api/chatbot/upload/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            // Build a synthetic message so the card sits in the message flow
            const fileEntry = {
                id: res.data.file_message_id,          // Real database ID!
                role: 'file',                          // synthetic role
                created_at: new Date().toISOString(),
                fileName: res.data.file_name,
                summary: res.data.summary,
                explanation: res.data.explanation,
            };

            setMessages(prev => [...prev, fileEntry]);
            fetchSessions();
        } catch (err) {
            const errText = err.response?.data?.error || 'Failed to process the file. Please try again.';
            setError(errText);
        } finally {
            setIsUploading(false);
        }
    };

    // ── Clear session ─────────────────────────────────────────────────────
    const handleClear = async () => {
        if (isClearing) return;
        setIsClearing(true);
        try {
            await axiosClient.delete(`/api/chatbot/session/${sessionId}/`);
        } catch (err) {
            if (err.response?.status !== 404) {
                setError('Failed to clear chat. Please try again.');
            }
        } finally {
            setMessages([]);
            fetchSessions();
            setIsClearing(false);
        }
    };

    // ── Delete single message ─────────────────────────────────────────────
    const handleDeleteMessage = async (id) => {
        // Synthetic file cards (string IDs) are removed locally only
        if (typeof id === 'string') {
            setMessages(prev => prev.filter(m => m.id !== id));
            return;
        }
        try {
            await axiosClient.delete(`/api/chatbot/message/${id}/`);
            setMessages(prev => prev.filter(m => m.id !== id));
            fetchSessions();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to delete message.');
        }
    };

    // ── Session management ────────────────────────────────────────────────
    const handleNewChat = () => {
        setSessionId(uuidv4());
        setMessages([]);
        setError('');
        if (window.innerWidth <= 768) setIsSidebarOpen(false);
    };

    const handleSessionClick = (id) => {
        if (id === sessionId) return;
        setSessionId(id);
        if (window.innerWidth <= 768) setIsSidebarOpen(false);
    };

    const showWelcome = !isLoadingHistory && messages.length === 0;

    return (
        <main className="chat-page">

            {/* ── Sidebar ─────────────────────────────────────────────── */}
            <div className={`chat-sidebar ${isSidebarOpen ? 'open' : ''}`}>
                <div className="chat-sidebar-header">
                    <h3>Chat History</h3>
                    <button onClick={handleNewChat} className="chat-new-btn" title="New Chat">
                        <Plus size={16} /> New
                    </button>
                    {window.innerWidth <= 768 && (
                        <button
                            onClick={() => setIsSidebarOpen(false)}
                            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', marginLeft: '1rem' }}
                        >
                            <X size={20} />
                        </button>
                    )}
                </div>
                <div className="chat-sidebar-body">
                    {isSessionsLoading ? (
                        <div className="chat-sidebar-skeleton">
                            <div className="skeleton-item" />
                            <div className="skeleton-item" />
                            <div className="skeleton-item" />
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className="chat-sidebar-empty">No previous chats</div>
                    ) : (
                        sessions.map(s => (
                            <div
                                key={s.session_id}
                                className={`chat-session-item ${s.session_id === sessionId ? 'active' : ''}`}
                                onClick={() => handleSessionClick(s.session_id)}
                            >
                                <div className="session-title">
                                    <MessageSquare size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }} />
                                    {s.title}
                                </div>
                                <div className="session-time">
                                    {new Date(s.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* ── Main Content ─────────────────────────────────────────── */}
            <div className="chat-main">

                {/* Header */}
                <div className="chat-header">
                    <div className="chat-header-left">
                        <button
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            style={{ background: 'none', border: 'none', color: '#1a1a2e', cursor: 'pointer', marginRight: '0.75rem', display: 'flex', alignItems: 'center' }}
                        >
                            <Menu size={22} />
                        </button>
                        <div className="chat-header-avatar">
                            <Bot size={22} />
                        </div>
                        <div>
                            <h1 className="chat-header-title">TinkerBot</h1>
                            <p className="chat-header-subtitle">Your Academic Study Assistant</p>
                        </div>
                    </div>
                    <button
                        className="chat-clear-btn"
                        onClick={handleClear}
                        disabled={isClearing}
                        title="Clear conversation"
                    >
                        {isClearing
                            ? <span className="chat-spinner" style={{ width: 16, height: 16 }} />
                            : <Trash2 size={16} />
                        }
                        <span>{isClearing ? 'Clearing…' : 'Clear Chat'}</span>
                    </button>
                </div>

                {/* Messages area */}
                <div
                    className="chat-messages-area"
                    ref={messagesContainerRef}
                    onScroll={handleScroll}
                >
                    {isLoadingHistory ? (
                        <div className="chat-loading">
                            <div className="chat-dots"><span /><span /><span /></div>
                            <p>Loading conversation…</p>
                        </div>
                    ) : showWelcome ? (
                        <div className="chat-welcome">
                            <div className="chat-welcome-avatar"><Bot size={40} /></div>
                            <h2>Hey there! I'm TinkerBot 🎓</h2>
                            <p>
                                I'm your academic study assistant. Ask me anything about your studies,
                                quiz results, or upload a document for a summary.
                            </p>
                            <div className="chat-welcome-chips">
                                {[
                                    'Explain photosynthesis',
                                    "What is Newton's 3rd law?",
                                    'Summarize the water cycle',
                                    'Help me review my quiz',
                                ].map(suggestion => (
                                    <button
                                        key={suggestion}
                                        className="chat-suggestion-chip"
                                        onClick={() => {
                                            setInput(suggestion);
                                            textareaRef.current?.focus();
                                        }}
                                    >
                                        {suggestion}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        // All messages — real and synthetic file cards — render in order
                        messages.map(msg => (
                            <MessageBubble
                                key={msg.id || msg.created_at}
                                msg={msg}
                                keywordsList={keywordsList}
                                onDelete={handleDeleteMessage}
                            />
                        ))
                    )}

                    {/* Typing indicator */}
                    {isSending && (
                        <div className="chat-bubble-row bot-row">
                            <div className="chat-avatar bot-avatar"><Bot size={16} /></div>
                            <div className="chat-bubble bot-bubble typing-bubble">
                                <div className="chat-dots"><span /><span /><span /></div>
                            </div>
                        </div>
                    )}

                    {/* Uploading indicator */}
                    {isUploading && (
                        <div className="chat-bubble-row bot-row">
                            <div className="chat-avatar bot-avatar"><Bot size={16} /></div>
                            <div className="chat-bubble bot-bubble typing-bubble">
                                <div className="chat-dots"><span /><span /><span /></div>
                                <p style={{ marginLeft: 8, fontSize: 13, color: '#888' }}>Analyzing document…</p>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Scroll to bottom button */}
                {showScrollBtn && (
                    <button className="chat-scroll-btn" onClick={() => scrollToBottom('smooth')}>
                        <ChevronDown size={18} />
                    </button>
                )}

                {/* Error banner */}
                {error && (
                    <div className="chat-error-banner">
                        <span>{error}</span>
                        <button onClick={() => setError('')}><X size={14} /></button>
                    </div>
                )}

                {/* Input bar */}
                <div className="chat-input-bar">
                    <button
                        className="chat-attach-btn"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        title="Upload PDF, DOCX, or TXT"
                    >
                        {isUploading
                            ? <span className="chat-spinner" style={{ width: 18, height: 18 }} />
                            : <Paperclip size={20} />
                        }
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.docx,.txt"
                        style={{ display: 'none' }}
                        onChange={handleFileChange}
                    />
                    <textarea
                        ref={textareaRef}
                        className="chat-textarea"
                        placeholder="Ask TinkerBot an academic question…"
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        rows={1}
                        disabled={isSending}
                    />
                    <button
                        className="chat-send-btn"
                        onClick={handleSend}
                        disabled={!input.trim() || isSending}
                        title="Send (Enter)"
                    >
                        {isSending
                            ? <span className="chat-spinner" style={{ width: 18, height: 18, borderColor: '#fff #fff transparent transparent' }} />
                            : <Send size={18} />
                        }
                    </button>
                </div>
            </div>
        </main>
    );
};

export default ChatPage;