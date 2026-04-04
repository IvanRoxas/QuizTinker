import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosClient from '../../api/axiosClient';
import { useAuth } from '../../context/AuthContext';
import { Search, ChevronLeft, ChevronRight, X, UserIcon, Check } from 'lucide-react';
import { getDisplayName } from '../../utils/userUtils';
import mediaUrl from '../../utils/mediaUrl';
import QuizCalendar from '../../components/QuizCalendar';
import CreateQuizModal from '../../components/CreateQuizModal';
import './NotificationsPage.css';

const NotificationsPage = () => {
    const { showToast, bumpFriendsVersion } = useAuth();
    const navigate = useNavigate();

    const [notifications, setNotifications] = useState([]);
    const [quizzes, setQuizzes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingQuizzes, setLoadingQuizzes] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [pageInfo, setPageInfo] = useState({
        count: 0,
        next: null,
        previous: null,
        current: 1
    });
    const [processingIds, setProcessingIds] = useState([]);
    const [viewingQuiz, setViewingQuiz] = useState(null);
    const [viewModalOpen, setViewModalOpen] = useState(false);

    const fetchQuizzes = async () => {
        setLoadingQuizzes(true);
        try {
            // Fetch quizzes that the user can see (their own + shared)
            const res = await axiosClient.get('/api/quizzes');
            setQuizzes(res.data.quizzes || res.data.results || res.data || []);
        } catch (err) {
            console.error('Failed to fetch quizzes for calendar', err);
        } finally {
            setLoadingQuizzes(false);
        }
    };

    const fetchNotifications = async (url = '/api/notifications?page=1') => {
        setLoading(true);
        try {
            const res = await axiosClient.get(url);
            // Because of pagination, response structure is different
            setNotifications(res.data.results || res.data.notifications || []);

            if (res.data.count !== undefined) {
                // Determine current page from URL
                const urlObj = new URL(url, window.location.origin);
                const pageNum = parseInt(urlObj.searchParams.get('page')) || 1;

                setPageInfo({
                    count: res.data.count,
                    next: res.data.next,
                    previous: res.data.previous,
                    current: pageNum
                });
            }
        } catch (err) {
            console.error('Failed to fetch notifications', err);
            showToast('Failed to load notifications.', 'error');
            setNotifications([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
        fetchQuizzes();
    }, []);

    // Time Ago Helper
    const timeAgo = (dateStr) => {
        const now = new Date();
        const date = new Date(dateStr);
        const diffMs = now - date;
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'Just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr}h ago`;
        const diffDay = Math.floor(diffHr / 24);
        return `${diffDay}d ago`;
    };

    // Actions
    const handleAccept = async (notif) => {
        if (processingIds.includes(notif.id)) return;
        setProcessingIds(prev => [...prev, notif.id]);

        try {
            await axiosClient.post(`/api/friends/accept/${notif.sender_id}`);
            await axiosClient.post(`/api/notifications/${notif.id}/read`);
            showToast('Friend request accepted!');
            bumpFriendsVersion();
            // Optimistic update
            setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read_at: new Date().toISOString() } : n));
        } catch (err) {
            if (err.response?.status === 404) {
                showToast('This friend request is no longer valid.', 'error');
                setNotifications(prev => prev.filter(n => String(n.id) !== String(notif.id)));
            } else {
                showToast('Failed to accept request.', 'error');
            }
        } finally {
            setProcessingIds(prev => prev.filter(id => id !== notif.id));
        }
    };

    const handleReject = async (notif) => {
        if (processingIds.includes(notif.id)) return;
        setProcessingIds(prev => [...prev, notif.id]);

        try {
            await axiosClient.post(`/api/friends/reject/${notif.sender_id}`);
            await axiosClient.post(`/api/notifications/${notif.id}/read`);
            showToast('Friend request rejected.');
            bumpFriendsVersion();
            setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read_at: new Date().toISOString() } : n));
        } catch (err) {
            if (err.response?.status === 404) {
                showToast('This friend request is no longer valid.', 'error');
                setNotifications(prev => prev.filter(n => String(n.id) !== String(notif.id)));
            } else {
                showToast('Failed to reject request.', 'error');
            }
        } finally {
            setProcessingIds(prev => prev.filter(id => id !== notif.id));
        }
    };

    const handleDismiss = async (notif) => {
        if (processingIds.includes(notif.id)) return;
        setProcessingIds(prev => [...prev, notif.id]);

        // Optimistic UI update
        setNotifications(prev => prev.filter(n => n.id !== notif.id));

        try {
            await axiosClient.delete(`/api/notifications/${notif.id}`);
            bumpFriendsVersion();
        } catch (err) {
            showToast('Failed to dismiss notification.', 'error');
            fetchNotifications(); // revert
        } finally {
            setProcessingIds(prev => prev.filter(id => id !== notif.id));
        }
    };

    const handleView = async (notif) => {
        if (notif.notification_type === 'quiz_share' || notif.notification_type === 'quiz_deadline') {
            const quizId = notif.data?.quiz_id;
            if (!quizId) return;
            try {
                const res = await axiosClient.get(`/api/quizzes/${quizId}`);
                setViewingQuiz(res.data.quiz);
                setViewModalOpen(true);
                if (!notif.read_at) {
                    await axiosClient.post(`/api/notifications/${notif.id}/read`);
                    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read_at: new Date().toISOString() } : n));
                }
            } catch (err) {
                console.error('Failed to fetch quiz', err);
                showToast('Failed to load quiz.', 'error');
            }
        } else if (notif.sender_id) {
            navigate(`/profile/${notif.sender_id}`);
        }
    };

    // Filter by search query (client-side for now since API doesn't have it)
    const filteredNotifications = notifications.filter(notif => {
        if (!searchQuery) return true;
        const text = notif.data?.message?.toLowerCase() || '';
        const name = (getDisplayName(notif.sender) || '').toLowerCase();
        const sq = searchQuery.toLowerCase();
        return text.includes(sq) || name.includes(sq);
    });

    // Pagination math
    const pageSize = 10;
    const startItem = ((pageInfo.current - 1) * pageSize) + 1;
    const endItem = Math.min(pageInfo.current * pageSize, pageInfo.count);

    return (
        <div className="notifications-page-wrapper">
            {/* Quiz Calendar Section */}
            {!loadingQuizzes && (
                <QuizCalendar quizzes={quizzes} variant="full" />
            )}

            {/* Header & Search */}
            <div className="dash-search-container neo-search-notif">
                <Search className="search-icon" size={20} />
                <input
                    type="text"
                    placeholder="Search notifications..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
            <div className="notifications-header-row">
                <h1>Notifications</h1>

                {pageInfo.count > 0 && (
                    <div className="neo-pagination">
                        <span className="pagination-text">{startItem}-{endItem} of {pageInfo.count}</span>
                        <div className="pagination-controls">
                            <button
                                className="neo-btn-icon"
                                disabled={!pageInfo.previous}
                                onClick={() => fetchNotifications(pageInfo.previous)}
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <button
                                className="neo-btn-icon"
                                disabled={!pageInfo.next}
                                onClick={() => fetchNotifications(pageInfo.next)}
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className="notifications-list-container">
                {loading ? (
                    <div className="notif-loading">Loading notifications...</div>
                ) : filteredNotifications.length === 0 ? (
                    <div className="notif-empty">
                        <p>{searchQuery ? 'No notifications match your search.' : "You're all caught up! No new notifications."}</p>
                    </div>
                ) : (
                    filteredNotifications.map(notif => {
                        const isProcessing = processingIds.includes(notif.id);

                        return (
                            <div key={notif.id} className="neo-notif-card flex-row">
                                <div className="neo-notif-avatar">
                                    {notif.sender?.avatar_url
                                        ? <img src={mediaUrl(notif.sender.avatar_url)} alt="" />
                                        : <div className="neo-avatar-placeholder"><UserIcon size={24} /></div>
                                    }
                                </div>

                                <div className="neo-notif-content">
                                    <div className="neo-notif-title">
                                        <span className="neo-notif-name">{getDisplayName(notif.sender)}</span>
                                        <span className="neo-notif-time">{timeAgo(notif.created_at)}</span>
                                    </div>
                                    <p className="neo-notif-desc">
                                        {notif.notification_type === 'friend_request' && notif.read_at
                                            ? 'Friend request accepted.'
                                            : notif.data?.message || 'New notification received.'}
                                    </p>
                                </div>

                                <div className="neo-notif-actions">
                                    {notif.notification_type === 'friend_request' && !notif.read_at ? (
                                        <>
                                            <button
                                                className="neo-btn-accept"
                                                disabled={isProcessing}
                                                onClick={() => handleAccept(notif)}
                                            >
                                                <Check size={16} /> Accept
                                            </button>
                                            <button
                                                className="neo-btn-reject"
                                                disabled={isProcessing}
                                                onClick={() => handleReject(notif)}
                                            >
                                                <X size={16} /> Reject
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                className="neo-btn-view"
                                                disabled={isProcessing}
                                                onClick={() => handleView(notif)}
                                            >
                                                View
                                            </button>
                                            <button
                                                className="neo-btn-dismiss neo-btn-icon"
                                                disabled={isProcessing}
                                                onClick={() => handleDismiss(notif)}
                                                title="Dismiss notification"
                                            >
                                                <X size={18} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        )
                    })
                )}
            </div>

            <CreateQuizModal
                isOpen={viewModalOpen}
                onClose={() => { setViewModalOpen(false); setViewingQuiz(null); }}
                quizData={viewingQuiz}
                onSaved={() => {}}
            />
        </div>
    );
};

export default NotificationsPage;
