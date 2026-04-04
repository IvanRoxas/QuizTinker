import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axiosClient from '../../api/axiosClient';
import { User as UserIcon, ArrowLeft, UserMinus, UserPlus, Users, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { getDisplayName } from '../../utils/userUtils';
import mediaUrl from '../../utils/mediaUrl';
import './UserProfile.css';

// Skeleton for loading state
const ProfileSkeleton = () => (
    <div className="profile-wrapper" style={{ minHeight: '100vh' }}>
        <main className="profile-main-content">
            <header className="profile-header" style={{ borderBottom: '2px solid var(--charcoal)', paddingBottom: '1.5rem', marginBottom: '2rem' }}>
                <div className="skeleton-btn skeleton-pulse" style={{ width: 100, height: 40, borderRadius: 99 }}></div>
                <div className="skeleton-line skeleton-pulse" style={{ width: '50%', height: 28 }}></div>
            </header>
            <div className="profile-scroll-area">
                <div className="up-card up-banner-card" style={{ height: 280, minHeight: 280 }}>
                    <div className="skeleton-pulse" style={{ width: '100%', height: '100%', borderRadius: 27 }}></div>
                </div>
                <div className="up-card up-details-card">
                    <div className="up-details-header">
                        <div className="skeleton-avatar-lg skeleton-pulse" style={{ width: 120, height: 120, borderRadius: '50%' }}></div>
                        <div className="skeleton-info" style={{ flex: 1 }}>
                            <div className="skeleton-line skeleton-pulse" style={{ width: '60%', height: 24 }}></div>
                            <div className="skeleton-line skeleton-pulse" style={{ width: '40%', height: 14, marginTop: 8 }}></div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    </div>
);

const UserProfile = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user: currentUser, showToast, bumpFriendsVersion } = useAuth();

    const [profileData, setProfileData] = useState(null);
    const [isFriend, setIsFriend] = useState(false);
    const [hasPending, setHasPending] = useState(false);
    const [requestDirection, setRequestDirection] = useState(null);
    const [mutualFriendsCount, setMutualFriendsCount] = useState(0);
    const [friendsList, setFriendsList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [removing, setRemoving] = useState(false);
    const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
    const [friendsPage, setFriendsPage] = useState(0);
    const FRIENDS_PER_PAGE = 4;

    useEffect(() => {
        if (currentUser && String(currentUser.id) === String(id)) {
            navigate('/profile', { replace: true });
            return;
        }

        const fetchPublicProfile = async () => {
            try {
                const res = await axiosClient.get(`/api/users/${id}/profile`);
                setProfileData(res.data.user);
                setIsFriend(res.data.is_friend);
                setHasPending(res.data.has_pending_request);
                setRequestDirection(res.data.request_direction || null);
                setMutualFriendsCount(res.data.mutual_friends_count || 0);
                setFriendsList(res.data.friends || []);
                setLoading(false);
            } catch (err) {
                console.error('Failed to fetch profile', err);
                if (err.response?.status === 404) {
                    showToast('User not found.', 'error');
                    navigate(-1);
                }
                setLoading(false);
            }
        };

        fetchPublicProfile();

        // Apply global background to the layout container for full screen bleed
        const layoutEl = document.querySelector('.dashboard-layout');
        if (layoutEl) {
            layoutEl.style.backgroundColor = '#ffffff';
        }

        return () => {
            if (layoutEl) {
                layoutEl.style.backgroundColor = '';
            }
        };
    }, [id, currentUser, navigate, showToast]);

    const handleRemoveFriend = async () => {
        setShowRemoveConfirm(false);
        setRemoving(true);
        try {
            await axiosClient.delete(`/api/friends/${id}`);
            setIsFriend(false);
            showToast('Friend removed.');
            bumpFriendsVersion();
        } catch (err) {
            console.error('Failed to remove friend', err);
            showToast('Failed to remove friend.', 'error');
        } finally {
            setRemoving(false);
        }
    };

    const handleAddFriend = async () => {
        try {
            await axiosClient.post(`/api/friends/request/${id}`);
            setHasPending(true);
            setRequestDirection('sent');
            showToast('Friend request sent!');
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to send request.', 'error');
        }
    };

    const handleAcceptFriend = async () => {
        try {
            await axiosClient.post(`/api/friends/accept/${id}`);
            setIsFriend(true);
            setHasPending(false);
            setRequestDirection(null);
            showToast('Friend request accepted!');
            bumpFriendsVersion();
        } catch (err) {
            showToast('Failed to accept request.', 'error');
        }
    };

    // --- Hash Navigation Listener ---
    useEffect(() => {
        if (!loading && window.location.hash === '#friends-section') {
            const el = document.getElementById('friends-section');
            if (el) {
                setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
            }
        }
    }, [loading, window.location.hash]);

    const handleRejectFriend = async () => {
        try {
            await axiosClient.post(`/api/friends/reject/${id}`);
            setHasPending(false);
            setRequestDirection(null);
            showToast('Friend request rejected.');
        } catch (err) {
            showToast('Failed to reject request.', 'error');
        }
    };

    const handleFriendClick = (friendId) => {
        if (currentUser && String(currentUser.id) === String(friendId)) {
            navigate('/profile');
        } else {
            navigate(`/profile/${friendId}`);
        }
    };

    if (loading) return <ProfileSkeleton />;

    if (!profileData) return (
        <div className="profile-wrapper">
            <div className="user-profile-loading">
                <h3>User not found.</h3>
                <button className="up-back-btn" onClick={() => navigate(-1)}>
                    <ArrowLeft size={16} /> Go Back
                </button>
            </div>
        </div>
    );

    const avatarUrl = profileData.avatar_url ? mediaUrl(profileData.avatar_url) : null;
    const bannerUrl = profileData.banner_url ? mediaUrl(profileData.banner_url) : null;
    const username = profileData.name || 'user';
    const joinDate = new Date(profileData.created_at || Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    return (
        <div className="profile-wrapper">
            <main className="profile-main-content">
                <header className="profile-header" style={{ borderBottom: '2px solid var(--charcoal)', paddingBottom: '1.5rem', marginBottom: '2rem' }}>
                    <button className="up-back-btn" onClick={() => navigate(-1)}>
                        <ArrowLeft size={18} /> Back
                    </button>
                    <h1>{getDisplayName(profileData)}'s Profile</h1>
                </header>

                <div className="profile-scroll-area">
                    {/* Banner */}
                    <div className="up-card up-banner-card" style={{
                        backgroundImage: bannerUrl ? `url("${bannerUrl}")` : 'none',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        height: '280px',
                        minHeight: '280px'
                    }}>
                        {!bannerUrl && (
                            <div className="up-banner-placeholder">
                                <UserIcon size={80} strokeWidth={1} />
                            </div>
                        )}
                    </div>

                    {/* Details */}
                    <div className="up-card up-details-card">
                        <div className="up-details-header">
                            <div className="up-avatar-container">
                                {avatarUrl
                                    ? <img src={avatarUrl} alt="Avatar" className="up-avatar" />
                                    : <div className="up-avatar-placeholder"><UserIcon size={60} /></div>
                                }
                            </div>
                            <div className="up-name-info">
                                <h2>{getDisplayName(profileData)}</h2>
                                <p>Joined since {joinDate}</p>
                            </div>
                        </div>

                        <div className="up-info-grid">
                            <div className="up-info-item">
                                <label>Display Name</label>
                                <div className="up-info-value">{getDisplayName(profileData)}</div>
                            </div>
                            <div className="up-info-item">
                                <label>Status</label>
                                <div className="up-info-value">{profileData.status || 'No status'}</div>
                            </div>
                            <div className="up-info-item up-full-width">
                                <label>Bio</label>
                                <div className="up-info-value up-bio">{profileData.bio || 'No bio'}</div>
                            </div>
                        </div>
                    </div>

                    {/* Mutual Friends Badge */}
                    {mutualFriendsCount > 0 && (
                        <div className="up-card up-mutual-card">
                            <Users size={20} />
                            <span><strong>{mutualFriendsCount}</strong> Mutual Friend{mutualFriendsCount !== 1 ? 's' : ''}</span>
                        </div>
                    )}

                    {/* Friends List Card */}
                    <div id="friends-section" className="up-card up-friends-card">
                        <div className="up-friends-header">
                            <h3 style={{ textTransform: 'uppercase' }}>Friend List</h3>
                            <span className="up-friends-count">{friendsList.length}</span>
                        </div>
                        <div className="up-friends-list">
                            {friendsList.length === 0 ? (
                                <p className="up-no-friends">No friends yet.</p>
                            ) : (
                                friendsList.slice(friendsPage * FRIENDS_PER_PAGE, (friendsPage + 1) * FRIENDS_PER_PAGE).map(friend => (
                                    <div key={friend.id} className="up-friend-item" onClick={() => handleFriendClick(friend.id)}>
                                        <div className="up-friend-avatar">
                                            {friend.avatar_url
                                                ? <img src={mediaUrl(friend.avatar_url)} alt="" />
                                                : <UserIcon size={18} />
                                            }
                                        </div>
                                        <div className="up-friend-info">
                                            <span className="up-friend-name">{getDisplayName(friend)}</span>
                                            <span className="up-friend-status">{friend.status || 'No status'}</span>
                                        </div>
                                        <div className="up-friend-actions">
                                            <button className="up-view-btn">View</button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        {friendsList.length > FRIENDS_PER_PAGE && (
                            <div className="friends-pagination">
                                <button
                                    className="friends-page-btn"
                                    onClick={() => setFriendsPage(p => p - 1)}
                                    disabled={friendsPage === 0}
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <span className="friends-page-indicator">
                                    {friendsPage + 1} / {Math.ceil(friendsList.length / FRIENDS_PER_PAGE)}
                                </span>
                                <button
                                    className="friends-page-btn"
                                    onClick={() => setFriendsPage(p => p + 1)}
                                    disabled={(friendsPage + 1) * FRIENDS_PER_PAGE >= friendsList.length}
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Action Area (no card) */}
                    {!profileData.is_staff && (
                        <div className="up-action-area">
                            {isFriend ? (
                                <button
                                    className="up-remove-friend-btn"
                                    onClick={() => setShowRemoveConfirm(true)}
                                    disabled={removing}
                                >
                                    <UserMinus size={18} />
                                    {removing ? 'Removing...' : 'Remove Friend'}
                                </button>
                            ) : hasPending ? (
                                requestDirection === 'received' ? (
                                    <div className="up-respond-actions">
                                        <button className="up-accept-btn" onClick={handleAcceptFriend}>
                                            <Check size={18} />
                                            Accept
                                        </button>
                                        <button className="up-reject-btn" onClick={handleRejectFriend}>
                                            <X size={18} />
                                            Reject
                                        </button>
                                    </div>
                                ) : (
                                    <button className="up-pending-btn" disabled>
                                        Request Sent
                                    </button>
                                )
                            ) : (
                                <button className="up-add-friend-btn" onClick={handleAddFriend}>
                                    <UserPlus size={18} />
                                    Add Friend
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </main>

            {/* Remove Friend Confirmation Modal */}
            {showRemoveConfirm && (
                <div className="delete-modal-overlay">
                    <div className="delete-modal-content">
                        <h2>Remove Friend</h2>
                        <p>Are you sure you want to remove <strong>@{username}</strong> from your friends?</p>
                        <div className="delete-modal-actions">
                            <button className="btn-delete-cancel" onClick={() => setShowRemoveConfirm(false)}>Cancel</button>
                            <button className="btn-delete-confirm" onClick={handleRemoveFriend}>Remove</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserProfile;
