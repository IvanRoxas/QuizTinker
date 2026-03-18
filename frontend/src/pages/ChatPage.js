import React, { useState, useEffect, useRef, useCallback } from 'react';
import axiosClient from '../api/axiosClient';
import { Send, Paperclip, Trash2, Bot, User, FileText, X, ChevronDown } from 'lucide-react';
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

/** Very simple markdown-to-JSX: bolds **text**, renders bullet lists */
function renderMarkdown(text) {
    if (!text) return null;
    const lines = text.split('\n');
    const elements = [];
    let listItems = [];

    const flushList = () => {
        if (listItems.length > 0) {
            elements.push(
                <ul key={`ul-${elements.length}`} className="chat-list">
                    {listItems.map((li, i) => <li key={i}>{renderInline(li)}</li>)}
                </ul>
            );
            listItems = [];
        }
    };

    lines.forEach((line, idx) => {
        const bulletMatch = line.match(/^[\s]*[-•*]\s+(.+)/);
        const numberedMatch = line.match(/^[\s]*\d+\.\s+(.+)/);
        const headingMatch = line.match(/^#{1,3}\s+(.+)/);

        if (bulletMatch) {
            listItems.push(bulletMatch[1]);
        } else if (numberedMatch) {
            listItems.push(numberedMatch[1]);
        } else {
            flushList();
            if (headingMatch) {
                elements.push(
                    <p key={idx} className="chat-md-heading">{renderInline(headingMatch[1])}</p>
                );
            } else if (line.trim() === '') {
                elements.push(<br key={idx} />);
            } else {
                elements.push(<p key={idx}>{renderInline(line)}</p>);
            }
        }
    });
    flushList();
    return elements;
}

function renderInline(text) {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={i} className="chat-inline-code">{part.slice(1, -1)}</code>;
        }
        return part;
    });
}

// ---------------------------------------------------------------------------
// Message Bubble
// ---------------------------------------------------------------------------
const MessageBubble = ({ msg }) => {
    const isUser = msg.role === 'user';
    return (
        <div className={`chat-bubble-row ${isUser ? 'user-row' : 'bot-row'}`}>
            {!isUser && (
                <div className="chat-avatar bot-avatar">
                    <Bot size={16} />
                </div>
            )}
            <div className={`chat-bubble ${isUser ? 'user-bubble' : 'bot-bubble'}`}>
                <div className="bubble-content">
                    {isUser ? <p>{msg.content}</p> : renderMarkdown(msg.content)}
                </div>
                <span className="bubble-time">
                    {msg.created_at
                        ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : 'Now'}
                </span>
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
// ---------------------------------------------------------------------------
const FileResultCard = ({ fileName, summary, explanation, onDismiss }) => (
    <div className="file-result-card">
        <div className="file-result-header">
            <FileText size={18} className="file-result-icon" />
            <span className="file-result-name">{fileName}</span>
            <button className="file-result-dismiss" onClick={onDismiss} title="Dismiss">
                <X size={14} />
            </button>
        </div>
        <div className="file-result-body">
            <div className="file-result-section">
                <h4>📋 Summary</h4>
                <div className="file-result-text">{renderMarkdown(summary)}</div>
            </div>
            <div className="file-result-section">
                <h4>💡 Explanation</h4>
                <div className="file-result-text">{renderMarkdown(explanation)}</div>
            </div>
        </div>
    </div>
);

// ---------------------------------------------------------------------------
// Main ChatPage
// ---------------------------------------------------------------------------
const ChatPage = () => {
    const [sessionId] = useState(() => uuidv4());
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [fileResult, setFileResult] = useState(null); // { fileName, summary, explanation }
    const [error, setError] = useState('');
    const [isClearing, setIsClearing] = useState(false);
    const [showScrollBtn, setShowScrollBtn] = useState(false);

    const messagesEndRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const fileInputRef = useRef(null);
    const textareaRef = useRef(null);

    // Scroll to bottom
    const scrollToBottom = useCallback((behavior = 'smooth') => {
        messagesEndRef.current?.scrollIntoView({ behavior });
    }, []);

    // Track scroll position to show/hide scroll-down button
    const handleScroll = () => {
        const el = messagesContainerRef.current;
        if (!el) return;
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        setShowScrollBtn(distFromBottom > 120);
    };

    // Load history on mount
    useEffect(() => {
        const loadHistory = async () => {
            setIsLoadingHistory(true);
            try {
                const res = await axiosClient.get(`/api/chatbot/history/?session_id=${sessionId}`);
                setMessages(res.data.messages || []);
            } catch {
                // New session — no history, that's fine
                setMessages([]);
            } finally {
                setIsLoadingHistory(false);
            }
        };
        loadHistory();
    }, [sessionId]);

    // Auto-scroll when messages array changes
    useEffect(() => {
        scrollToBottom('smooth');
    }, [messages, scrollToBottom]);

    // Auto-resize textarea
    const handleInputChange = (e) => {
        setInput(e.target.value);
        const ta = textareaRef.current;
        if (ta) {
            ta.style.height = 'auto';
            ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
        }
    };

    // Send text message
    const handleSend = async () => {
        const trimmed = input.trim();
        if (!trimmed || isSending) return;

        const optimistic = {
            id: `opt-${Date.now()}`,
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
                id: `bot-${Date.now()}`,
                role: 'assistant',
                content: res.data.reply,
                created_at: new Date().toISOString(),
            };
            setMessages(prev => [...prev, botMsg]);
        } catch (err) {
            const errText = err.response?.data?.error || 'Failed to get a response. Please try again.';
            setError(errText);
            // Remove optimistic message on failure
            setMessages(prev => prev.filter(m => m.id !== optimistic.id));
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

    // Upload file
    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // Reset input so same file can be re-uploaded
        e.target.value = '';

        setIsUploading(true);
        setError('');
        setFileResult(null);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('session_id', sessionId);

        try {
            const res = await axiosClient.post('/api/chatbot/upload/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setFileResult({
                fileName: res.data.file_name,
                summary: res.data.summary,
                explanation: res.data.explanation,
            });
        } catch (err) {
            const errText = err.response?.data?.error || 'Failed to process the file. Please try again.';
            setError(errText);
        } finally {
            setIsUploading(false);
        }
    };

    // Clear session
    const handleClear = async () => {
        if (isClearing || messages.length === 0) return;
        setIsClearing(true);
        try {
            await axiosClient.delete('/api/chatbot/clear/', {
                data: { session_id: sessionId },
            });
            setMessages([]);
            setFileResult(null);
            setError('');
        } catch {
            setError('Failed to clear chat. Please try again.');
        } finally {
            setIsClearing(false);
        }
    };

    // Welcome state
    const showWelcome = !isLoadingHistory && messages.length === 0 && !fileResult;

    return (
        <main className="chat-page">
            {/* Header */}
            <div className="chat-header">
                <div className="chat-header-left">
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
                    disabled={isClearing || messages.length === 0}
                    title="Clear conversation"
                >
                    {isClearing ? (
                        <span className="chat-spinner" style={{ width: 16, height: 16 }} />
                    ) : (
                        <Trash2 size={16} />
                    )}
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
                        <div className="chat-dots">
                            <span /><span /><span />
                        </div>
                        <p>Loading conversation…</p>
                    </div>
                ) : showWelcome ? (
                    <div className="chat-welcome">
                        <div className="chat-welcome-avatar">
                            <Bot size={40} />
                        </div>
                        <h2>Hey there! I'm TinkerBot 🎓</h2>
                        <p>
                            I'm your academic study assistant. Ask me anything about your studies,
                            quiz results, or upload a document for a summary.
                        </p>
                        <div className="chat-welcome-chips">
                            {[
                                'Explain photosynthesis',
                                'What is Newton\'s 3rd law?',
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
                    <>
                        {messages.map(msg => (
                            <MessageBubble key={msg.id || msg.created_at} msg={msg} />
                        ))}
                    </>
                )}

                {/* Typing indicator */}
                {isSending && (
                    <div className="chat-bubble-row bot-row">
                        <div className="chat-avatar bot-avatar"><Bot size={16} /></div>
                        <div className="chat-bubble bot-bubble typing-bubble">
                            <div className="chat-dots">
                                <span /><span /><span />
                            </div>
                        </div>
                    </div>
                )}

                {/* Uploading indicator */}
                {isUploading && (
                    <div className="chat-bubble-row bot-row">
                        <div className="chat-avatar bot-avatar"><Bot size={16} /></div>
                        <div className="chat-bubble bot-bubble typing-bubble">
                            <div className="chat-dots">
                                <span /><span /><span />
                            </div>
                            <p style={{ marginLeft: 8, fontSize: 13, color: 'var(--text-secondary, #888)' }}>Analyzing document…</p>
                        </div>
                    </div>
                )}

                {/* File result card */}
                {fileResult && (
                    <div className="chat-file-result-wrapper">
                        <FileResultCard
                            fileName={fileResult.fileName}
                            summary={fileResult.summary}
                            explanation={fileResult.explanation}
                            onDismiss={() => setFileResult(null)}
                        />
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
                    {isUploading ? (
                        <span className="chat-spinner" style={{ width: 18, height: 18 }} />
                    ) : (
                        <Paperclip size={20} />
                    )}
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
                    {isSending ? (
                        <span className="chat-spinner" style={{ width: 18, height: 18, borderColor: '#fff #fff transparent transparent' }} />
                    ) : (
                        <Send size={18} />
                    )}
                </button>
            </div>
        </main>
    );
};

export default ChatPage;
