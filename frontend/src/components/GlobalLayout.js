import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axiosClient from '../api/axiosClient';
import {
    Layout, User as UserIcon, BookOpen, Bell, Award, LogOut,
    Search, ChevronLeft, ChevronRight, ChevronUp, UserPlus, Check, X, Users, MessageSquare
} from 'lucide-react';
import { getDisplayName } from '../utils/userUtils';
import QuizCalendar from './QuizCalendar';
import CreateQuizModal from './CreateQuizModal';
import '../pages/Dashboard.css';

// --- Skeleton Loader Components ---
const FriendSkeleton = () => (
    <div className="user-list-item skeleton-item">
        <div className="skeleton-avatar skeleton-pulse"></div>
        <div className="skeleton-info">
            <div className="skeleton-line skeleton-pulse" style={{ width: '70%' }}></div>
            <div className="skeleton-line skeleton-pulse" style={{ width: '50%', height: '8px' }}></div>
        </div>
    </div>
);

const NotificationSkeleton = () => (
    <div className="notification-item" style={{ opacity: 0.5 }}>
        <div className="skeleton-avatar skeleton-pulse" style={{ width: 36, height: 36 }}></div>
        <div className="skeleton-info" style={{ flex: 1 }}>
            <div className="skeleton-line skeleton-pulse" style={{ width: '85%' }}></div>
            <div className="skeleton-line skeleton-pulse" style={{ width: '40%', height: '8px' }}></div>
        </div>
    </div>
);

// --- Subcomponents ---

const Sidebar = ({ isToggled, handleLogout, setIsToggled }) => {
    const navigate = useNavigate();
    const location = useLocation();

    const navItems = [
        { icon: <Layout size={24} />, label: 'Dashboard', route: '/dashboard' },
        { icon: <UserIcon size={24} />, label: 'Profile', route: '/profile' },
        { icon: <Bell size={24} />, label: 'Notifications', route: '/notifications' },
        { icon: <BookOpen size={24} />, label: 'Quizzes', route: '/quizzes' },
        { icon: <MessageSquare size={24} />, label: 'Chat with A.I.', route: '/chat' },
    ];

    return (
        <div style={{ position: 'relative', height: '100vh', display: 'flex' }} className="no-print">
            <aside className={`dash-sidebar ${!isToggled ? 'collapsed' : ''} no-print`}>
                <div className="sidebar-top">
                    <img src="/Brand Images/QT-Brand.png" alt="QuizTinker Logo" className="sidebar-logo" />
                    <nav className="sidebar-nav">
                        {navItems.map((item, index) => {
                            const isActive = location.pathname === item.route;
                            return (
                                <div key={index} className={`nav-item ${isActive ? 'active' : ''}`} onClick={() => item.route && navigate(item.route)}>
                                    <div className="nav-icon">{item.icon}</div>
                                    {isToggled && <span className="nav-label">{item.label}</span>}
                                </div>
                            );
                        })}
                    </nav>
                </div>
                <div className="sidebar-bottom">
                    <div className="nav-item logout-item" onClick={handleLogout}>
                        <div className="nav-icon"><LogOut size={24} /></div>
                        {isToggled && <span className="nav-label">Log Out</span>}
                    </div>
                </div>
            </aside>

            <button
                className={`sidebar-toggle-btn no-print print-hide`}
                onClick={() => setIsToggled(!isToggled)}
                title="Toggle Sidebar"
                style={{ zIndex: 30 }}
            >
                {isToggled ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            </button>
        </div>
    );
};

// --- Notification Dropdown (Portal) ---
const NotificationDropdown = ({ notifications, loadingNotifs, onAccept, onReject, onDelete, onClose, onQuizClick, processingIds, anchorRef }) => {
    const dropdownRef = useRef(null);
    const [pos, setPos] = useState({ top: 0, right: 0 });

    // Calculate position from the bell button
    useEffect(() => {
        if (anchorRef?.current) {
            const rect = anchorRef.current.getBoundingClientRect();
            setPos({
                top: rect.bottom + 8,
                right: Math.max(8, window.innerWidth - rect.right - 20),
            });
        }
    }, [anchorRef]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Cap at 5 most recent
    const safeNotifs = notifications || [];
    const displayedNotifs = safeNotifs.slice(0, 5);
    const hasMore = safeNotifs.length > 5;

    return ReactDOM.createPortal(
        <div className="notification-dropdown-portal" ref={dropdownRef}
            style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 99999 }}>
            <div className="notification-dropdown">
                <div className="notification-dropdown-header">
                    <h4>Notifications</h4>
                </div>
                <div className="notification-dropdown-body">
                    {loadingNotifs ? (
                        <>
                            <NotificationSkeleton />
                            <NotificationSkeleton />
                            <NotificationSkeleton />
                        </>
                    ) : displayedNotifs.length === 0 ? (
                        <div className="notification-empty-state">
                            <Bell size={28} strokeWidth={1.5} />
                            <p>No new notifications right now.</p>
                        </div>
                    ) : (
                        <>
                            {displayedNotifs.map(notif => {
                                const isProcessing = processingIds.includes(notif.id);
                                return (
                                    <div
                                        key={notif.id}
                                        className={`notification-item ${!notif.read_at ? 'unread' : ''} ${(notif.notification_type === 'quiz_share' || notif.notification_type === 'quiz_deadline') ? 'clickable' : ''}`}
                                        onClick={() => (notif.notification_type === 'quiz_share' || notif.notification_type === 'quiz_deadline') && onQuizClick && onQuizClick(notif)}
                                    >
                                        <div className="notification-item-avatar">
                                            {notif.sender?.avatar_url
                                                ? <img src={`http://localhost:8000${notif.sender.avatar_url}`} alt="" />
                                                : <UserIcon size={18} />
                                            }
                                        </div>
                                        <div className="notification-item-content">
                                            <p className="notification-item-text">
                                                {notif.notification_type !== 'quiz_deadline' && <strong>{getDisplayName(notif.sender)}</strong>}
                                                {notif.notification_type === 'friend_request' && ' sent you a friend request.'}
                                                {notif.notification_type === 'friend_accepted' && ' accepted your friend request.'}
                                                {notif.notification_type === 'quiz_share' && (
                                                    <> shared a quiz: <em>{notif.data?.message?.split("'")[1] || 'New Quiz'}</em></>
                                                )}
                                                {notif.notification_type === 'quiz_deadline' && (
                                                    <>{notif.data?.message || 'Deadline Reminder'}</>
                                                )}
                                            </p>
                                            <span className="notification-item-time">
                                                {timeAgo(notif.created_at)}
                                            </span>
                                        </div>
                                        {notif.notification_type === 'friend_request' && !notif.read_at ? (
                                            <div className="notification-item-actions">
                                                <button
                                                    className="notif-accept-btn"
                                                    onClick={() => onAccept(notif)}
                                                    title="Accept"
                                                    disabled={isProcessing}
                                                    style={{ opacity: isProcessing ? 0.5 : 1 }}
                                                >
                                                    {isProcessing ? <span className="btn-spinner"></span> : <Check size={14} />}
                                                </button>
                                                <button
                                                    className="notif-reject-btn"
                                                    onClick={() => onReject(notif)}
                                                    title="Reject"
                                                    disabled={isProcessing}
                                                    style={{ opacity: isProcessing ? 0.5 : 1 }}
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="notification-item-actions">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onDelete(notif); }}
                                                    title="Clear notification"
                                                    disabled={isProcessing}
                                                    style={{
                                                        background: 'transparent', border: 'none', color: '#999',
                                                        cursor: !isProcessing ? 'pointer' : 'default',
                                                        padding: '4px', opacity: isProcessing ? 0.5 : 1, display: 'flex', alignItems: 'center'
                                                    }}
                                                >
                                                    {isProcessing ? <span className="btn-spinner" style={{ width: '12px', height: '12px', borderWidth: '1px' }}></span> : <X size={14} />}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {hasMore && (
                                <p className="notif-view-all">View All Notifications</p>
                            )}
                        </>
                    )}
                </div>
                {/* Global 'See all notifications' link */}
                <div style={{ borderTop: '1px solid #EAEAEA', textAlign: 'center', padding: '1rem', background: '#FAFAFA', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px' }}>
                    <a
                        href="/notifications"
                        onClick={(e) => { e.preventDefault(); onClose(); window.location.href = '/notifications'; }}
                        style={{ fontWeight: 800, color: 'var(--blue)', textDecoration: 'none', display: 'block', width: '100%' }}
                    >
                        See all notifications
                    </a>
                </div>
            </div>
        </div>,
        document.body
    );
};

// Simple time-ago helper
function timeAgo(dateStr) {
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
}

// --- Right Panel ---
const RightPanel = ({ isToggled, setIsToggled }) => {
    const navigate = useNavigate();
    const { user, showToast, friendsVersion, bumpFriendsVersion } = useAuth();

    // Friends state
    const [friends, setFriends] = useState([]);
    const [friendsLoading, setFriendsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    // Notifications state
    const [notifications, setNotifications] = useState([]);
    const [notifsLoading, setNotifsLoading] = useState(true);
    const [unreadCount, setUnreadCount] = useState(0);
    const [showNotifDropdown, setShowNotifDropdown] = useState(false);
    const [processingIds, setProcessingIds] = useState([]);
    const [quizzes, setQuizzes] = useState([]);

    // Global Quiz View Modal (Portal/Context candidate)
    const [viewingQuiz, setViewingQuiz] = useState(null);
    const [viewModalOpen, setViewModalOpen] = useState(false);

    const handleNotificationQuizClick = async (notif) => {
        const quizId = notif.data?.quiz_id;
        if (!quizId) return;

        setShowNotifDropdown(false);
        try {
            const res = await axiosClient.get(`/api/quizzes/${quizId}`);
            setViewingQuiz(res.data.quiz);
            setViewModalOpen(true);

            // Mark as read if not already
            if (!notif.read_at) {
                await axiosClient.post(`/api/notifications/${notif.id}/read`);
                fetchUnreadCount();
                fetchNotifications();
            }
        } catch (err) {
            console.error('Failed to fetch quiz for viewing', err);
            showToast('Failed to load quiz details.', 'error');
        }
    };

    // Notification bell ref (for portal positioning)
    const bellRef = useRef(null);

    // Fetch quizzes
    const fetchQuizzes = useCallback(async () => {
        try {
            const res = await axiosClient.get('/api/quizzes');
            setQuizzes(res.data.quizzes || res.data.results || res.data || []);
        } catch (err) {
            console.error('Failed to fetch quizzes for sidebar calendar', err);
        }
    }, []);

    const avatarUrl = user?.avatar_url ? `http://localhost:8000${user.avatar_url}` : null;

    // Fetch friends
    const fetchFriends = useCallback(async (showLoading = false) => {
        if (showLoading) setFriendsLoading(true);
        try {
            const res = await axiosClient.get('/api/friends');
            setFriends(res.data.friends);
        } catch (err) {
            console.error('Failed to fetch friends', err);
        } finally {
            setFriendsLoading(false);
        }
    }, []);

    // Fetch notifications
    const fetchNotifications = useCallback(async (showLoading = false) => {
        if (showLoading) setNotifsLoading(true);
        try {
            const res = await axiosClient.get('/api/notifications');
            setNotifications(res.data.results || res.data.notifications || []);
        } catch (err) {
            console.error('Failed to fetch notifications', err);
            setNotifications([]);
        } finally {
            setNotifsLoading(false);
        }
    }, []);

    // Fetch unread count
    const fetchUnreadCount = useCallback(async () => {
        try {
            const res = await axiosClient.get('/api/notifications/unread-count');
            setUnreadCount(res.data.count);
        } catch (err) {
            console.error('Failed to fetch unread count', err);
        }
    }, []);

    // Initial fetch + polling
    useEffect(() => {
        fetchFriends(true);
        fetchNotifications(true);
        fetchUnreadCount();
        fetchQuizzes();

        const interval = setInterval(() => {
            fetchUnreadCount();
            fetchNotifications();
            fetchFriends();
            fetchQuizzes();
        }, 30000);

        return () => clearInterval(interval);
    }, [fetchFriends, fetchNotifications, fetchUnreadCount, fetchQuizzes]);

    // Cross-component sync
    useEffect(() => {
        if (friendsVersion > 0) {
            fetchFriends(false);
            fetchNotifications(false);
            fetchUnreadCount();
        }
    }, [friendsVersion, fetchFriends, fetchNotifications, fetchUnreadCount]);

    // Search users with debounce (300ms)
    useEffect(() => {
        if (searchQuery.length < 2) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }
        setIsSearching(true);
        const timeout = setTimeout(async () => {
            try {
                const res = await axiosClient.get(`/api/users/search?q=${encodeURIComponent(searchQuery)}`);
                setSearchResults(res.data.users);
            } catch (err) {
                console.error('Search failed', err);
            } finally {
                setIsSearching(false);
            }
        }, 300);
        return () => clearTimeout(timeout);
    }, [searchQuery]);

    // Send friend request
    const handleAddFriend = async (userId) => {
        setSearchResults(prev => prev.map(u =>
            u.id === userId ? { ...u, friendship_status: 'pending_sent' } : u
        ));
        try {
            await axiosClient.post(`/api/friends/request/${userId}`);
            showToast('Friend request sent!');
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to send request.', 'error');
            setSearchResults(prev => prev.map(u =>
                u.id === userId ? { ...u, friendship_status: 'none' } : u
            ));
        }
    };

    // Accept friend request with loading state
    const handleAcceptRequest = async (notif) => {
        if (processingIds.includes(notif.id)) return;
        setProcessingIds(prev => [...prev, notif.id]);

        // Optimistic
        setNotifications(prev => prev.map(n =>
            n.id === notif.id ? { ...n, read_at: new Date().toISOString() } : n
        ));
        setUnreadCount(prev => Math.max(0, prev - 1));

        try {
            await axiosClient.post(`/api/friends/accept/${notif.sender_id}`);
            await axiosClient.post(`/api/notifications/${notif.id}/read`);
            showToast('Friend request accepted!');
            bumpFriendsVersion();
            // Automatically handled by the useEffect above, but we can leave these just in case or they'll double-fire
            // Actually, best to just let the effect handle it since bumpFriendsVersion() triggers it.
        } catch (err) {
            if (err.response?.status === 404) {
                showToast('This friend request is no longer valid.', 'error');
                setNotifications(prevNotifications =>
                    prevNotifications.filter(notification => String(notification.id) !== String(notif.id))
                );
                fetchNotifications();
                // We don't restore the unreadCount since the request was invalid anyway
            } else {
                showToast('Failed to accept request.', 'error');
                fetchNotifications();
                fetchUnreadCount();
            }
        } finally {
            setProcessingIds(prev => prev.filter(id => id !== notif.id));
        }
    };

    // Reject friend request with loading state
    const handleRejectRequest = async (notif) => {
        if (processingIds.includes(notif.id)) return;
        setProcessingIds(prev => [...prev, notif.id]);

        setNotifications(prev => prev.filter(n => n.id !== notif.id));
        setUnreadCount(prev => Math.max(0, prev - 1));

        try {
            await axiosClient.post(`/api/friends/reject/${notif.sender_id}`);
            await axiosClient.post(`/api/notifications/${notif.id}/read`);
            showToast('Friend request rejected.');
            bumpFriendsVersion();
        } catch (err) {
            if (err.response?.status === 404) {
                showToast('This friend request is no longer valid.', 'error');
                setNotifications(prevNotifications =>
                    prevNotifications.filter(notification => String(notification.id) !== String(notif.id))
                );
                fetchNotifications();
            } else {
                showToast('Failed to reject request.', 'error');
                fetchNotifications();
                fetchUnreadCount();
            }
        } finally {
            setProcessingIds(prev => prev.filter(id => id !== notif.id));
        }
    };

    // Delete a notification manually
    const handleDeleteNotification = async (notif) => {
        if (processingIds.includes(notif.id)) return;
        setProcessingIds(prev => [...prev, notif.id]);

        // Optimistic update: instantly remote it from local UI array
        setNotifications(prevNotifications => prevNotifications.filter(n => n.id !== notif.id));
        if (!notif.read_at) {
            setUnreadCount(prev => Math.max(0, prev - 1));
        }

        try {
            await axiosClient.delete(`/api/notifications/${notif.id}`);
            // Success
        } catch (err) {
            showToast('Failed to delete notification.', 'error');
            fetchNotifications(); // restore on failure
            fetchUnreadCount();
        } finally {
            setProcessingIds(prev => prev.filter(id => id !== notif.id));
        }
    };

    // Toggle notification dropdown
    const handleBellClick = async () => {
        const willOpen = !showNotifDropdown;
        setShowNotifDropdown(willOpen);
        if (willOpen) {
            fetchNotifications();
            // User requested: notifications only disappear when explicitly addressed.
            // Do NOT mark all as read automatically here.
        }
    };

    const showingSearchResults = searchQuery.length >= 2;
    const displayList = showingSearchResults ? searchResults : friends;

    return (
        <div style={{ position: 'relative', height: '100vh', display: 'flex' }}>
            {/* Toggle Arrow */}
            <button
                className="right-panel-toggle-btn no-print print-hide"
                onClick={() => setIsToggled(!isToggled)}
                title="Toggle Right Panel"
                style={{ zIndex: 30 }}
            >
                {isToggled ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>

            <aside className={`dash-right-panel ${!isToggled ? 'collapsed' : ''} no-print`}>
                {isToggled ? (
                    <>
                        <div className="right-top-nav">
                            <div style={{ position: 'relative' }}>
                                <button ref={bellRef} className="notification-btn" onClick={handleBellClick}>
                                    <Bell size={28} />
                                    {unreadCount > 0 && <span className="notification-dot"></span>}
                                </button>
                            </div>
                            <div className="profile-avatar" onClick={() => navigate('/profile')} style={{ cursor: 'pointer', overflow: 'hidden' }}>
                                {avatarUrl ? <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <UserIcon size={32} />}
                            </div>
                        </div>

                        <div className="widget-calendar-v2">
                            <QuizCalendar variant="compact" quizzes={quizzes} />
                        </div>

                        {/* Friends List Widget */}
                        <div className="widget friends-list-widget">
                            <h4>FRIENDS LIST</h4>
                            <div className="widget-search">
                                <Search className="search-icon" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search users..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <div className="users-list">
                                {/* Searching state */}
                                {isSearching && (
                                    <>
                                        <FriendSkeleton />
                                        <FriendSkeleton />
                                        <FriendSkeleton />
                                    </>
                                )}

                                {/* Friends loading skeleton */}
                                {!isSearching && !showingSearchResults && friendsLoading && (
                                    <>
                                        <FriendSkeleton />
                                        <FriendSkeleton />
                                    </>
                                )}

                                {/* Empty states */}
                                {!isSearching && !friendsLoading && displayList.length === 0 && (
                                    <div className="friends-empty-state">
                                        {showingSearchResults ? (
                                            <>
                                                <Search size={24} strokeWidth={1.5} />
                                                <p>No users found.</p>
                                            </>
                                        ) : (
                                            <>
                                                <Users size={24} strokeWidth={1.5} />
                                                <p>You don't have any friends yet.<br />Search for users to connect!</p>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* Actual list */}
                                {!isSearching && displayList.map((u) => (
                                    <div key={u.id} className="user-list-item"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => navigate(`/profile/${u.id}`)}
                                    >
                                        <div className="user-list-avatar">
                                            {u.avatar_url
                                                ? <img src={`http://localhost:8000${u.avatar_url}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                                                : <UserIcon size={20} />
                                            }
                                        </div>
                                        <div className="user-list-info">
                                            <h5>{getDisplayName(u)}</h5>
                                            <p>{u.status || 'No status'}</p>
                                        </div>
                                        {showingSearchResults && (
                                            <div className="user-list-action">
                                                {u.friendship_status === 'none' && (
                                                    <button className="add-friend-btn" onClick={(e) => { e.stopPropagation(); handleAddFriend(u.id); }} title="Add Friend">
                                                        <UserPlus size={14} />
                                                    </button>
                                                )}
                                                {u.friendship_status === 'pending_sent' && (
                                                    <span className="pending-badge">Pending</span>
                                                )}
                                                {u.friendship_status === 'pending_received' && (
                                                    <span className="pending-badge">Respond</span>
                                                )}
                                                {u.friendship_status === 'friends' && (
                                                    <span className="friends-badge">Friends</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {!showingSearchResults && friends.length > 0 && (
                                <a href="#see-all" className="see-all-link" onClick={(e) => { e.preventDefault(); navigate('/profile#friends-section'); }}>See All</a>
                            )}
                        </div>
                    </>
                ) : (
                    // Collapsed state — bell still shows notification dropdown via fixed position
                    <div className="right-panel-collapsed-items">
                        <div className="profile-avatar mini" onClick={() => navigate('/profile')} style={{ cursor: 'pointer', overflow: 'hidden', margin: '0 auto 2rem auto' }}>
                            {avatarUrl ? <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <UserIcon size={32} />}
                        </div>
                        <div style={{ position: 'relative' }}>
                            <button ref={bellRef} className="notification-btn mini" style={{ margin: '0 auto', position: 'relative' }} onClick={handleBellClick}>
                                <Bell size={28} />
                                {unreadCount > 0 && <span className="notification-dot"></span>}
                            </button>
                        </div>
                    </div>
                )}
            </aside>

            {/* Notification dropdown rendered via portal — outside sidebar */}
            {showNotifDropdown && (
                <NotificationDropdown
                    notifications={notifications}
                    loadingNotifs={notifsLoading}
                    onAccept={handleAcceptRequest}
                    onReject={handleRejectRequest}
                    onDelete={handleDeleteNotification}
                    onClose={() => setShowNotifDropdown(false)}
                    onQuizClick={handleNotificationQuizClick}
                    processingIds={processingIds}
                    anchorRef={bellRef}
                />
            )}

            <CreateQuizModal
                isOpen={viewModalOpen}
                onClose={() => { setViewModalOpen(false); setViewingQuiz(null); }}
                quizData={viewingQuiz}
                onSaved={() => { }} // Read-only view mostly
            />
        </div>
    );
};

// --- Main Layout ---

const GlobalLayout = ({ children }) => {
    const { logout } = useAuth();
    const navigate = useNavigate();

    const [leftToggled, setLeftToggled] = useState(true);
    const [rightToggled, setRightToggled] = useState(true);

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/auth');
        } catch (error) {
            console.error('Logout failed', error);
        }
    };

    return (
        <div className="dashboard-layout">
            <Sidebar isToggled={leftToggled} setIsToggled={setLeftToggled} handleLogout={handleLogout} />

            <div className="global-main-container">
                {children}
            </div>

            <RightPanel isToggled={rightToggled} setIsToggled={setRightToggled} />
        </div>
    );
};

export default GlobalLayout;
