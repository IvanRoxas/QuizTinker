import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Bell, User as UserIcon, LogOut, Layout, BookOpen, Award, Camera, Edit2, ChevronLeft, ChevronRight, ChevronUp, Search } from 'lucide-react';
import ImageCropModal from './ImageCropModal';
import axiosClient from '../../api/axiosClient';
import { getDisplayName } from '../../utils/userUtils';
import './Profile.css';

const Profile = () => {
    const { user, logout, updateUserContext, showToast } = useAuth();
    const navigate = useNavigate();

    // Data States
    const [profileData, setProfileData] = useState(null);
    const [friends, setFriends] = useState([]);
    const [loading, setLoading] = useState(true);

    // Edit Modes
    const [isEditingDetails, setIsEditingDetails] = useState(false);
    const [isEditingSecurity, setIsEditingSecurity] = useState(false);

    // Form States
    const [detailsForm, setDetailsForm] = useState({ name: '', first_name: '', last_name: '', status: '', bio: '' });
    const [securityForm, setSecurityForm] = useState({ email: '', current_password: '', new_password: '', new_password_confirmation: '' });

    // UI States & Errors
    const [detailsUpdating, setDetailsUpdating] = useState(false);
    const [securityUpdating, setSecurityUpdating] = useState(false);
    const [validationErrors, setValidationErrors] = useState({});

    // Crop Modal States
    const [cropModalOpen, setCropModalOpen] = useState(false);
    const [cropImageSrc, setCropImageSrc] = useState(null);
    const [cropType, setCropType] = useState('avatar'); // 'avatar' or 'banner'
    const [cropSelectedFile, setCropSelectedFile] = useState(null);

    // Delete Modal State
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    // Remove Friend Confirm State
    const [removeFriendTarget, setRemoveFriendTarget] = useState(null);
    const [friendsPage, setFriendsPage] = useState(0);
    const FRIENDS_PER_PAGE = 4;

    // Calendar State
    const [currentDate, setCurrentDate] = useState(new Date());

    useEffect(() => {
        fetchProfile();

        // Apply global background to the layout container for full screen bleed
        const layoutEl = document.querySelector('.dashboard-layout');
        if (layoutEl) {
            layoutEl.style.backgroundImage = "url('/Backgrounds/bg1.jpg')";
            layoutEl.style.backgroundSize = 'cover';
            layoutEl.style.backgroundPosition = 'center';
            layoutEl.style.backgroundAttachment = 'fixed';
            layoutEl.style.backgroundRepeat = 'no-repeat';
        }

        return () => {
            // Cleanup on unmount so other pages aren't affected unless they set their own
            if (layoutEl) {
                layoutEl.style.backgroundImage = '';
                layoutEl.style.backgroundSize = '';
                layoutEl.style.backgroundPosition = '';
                layoutEl.style.backgroundAttachment = '';
                layoutEl.style.backgroundRepeat = '';
            }
        };
    }, []);

    const fetchProfile = async () => {
        try {
            const response = await axiosClient.get('/api/profile');
            const data = response.data;
            setProfileData(data.user);
            setFriends(data.friends);
            setDetailsForm({
                name: data.user.name || '',
                first_name: data.user.first_name || '',
                last_name: data.user.last_name || '',
                status: data.user.status || '',
                bio: data.user.bio || ''
            });
            setSecurityForm(prev => ({ ...prev, email: data.user.email || '' }));
            setLoading(false);
        } catch (error) {
            console.error("Error fetching profile", error);
            setLoading(false);
        }
    };



    const handleLogout = async () => {
        try {
            await logout();
            navigate('/auth');
        } catch (error) {
            console.error('Logout failed', error);
        }
    };

    const handleDeleteAccount = () => {
        setIsDeleteModalOpen(true);
    };

    const confirmDeleteAccount = async () => {
        try {
            await axiosClient.delete('/api/profile');
            await logout();
            navigate('/auth');
            showToast("Account deleted successfully.");
        } catch (error) {
            console.error("Failed to delete account", error);
            showToast("Error deleting account.", "error");
        } finally {
            setIsDeleteModalOpen(false);
        }
    };

    // --- Detail Updates ---
    const handleDetailsUpdate = async (e) => {
        e.preventDefault();
        setDetailsUpdating(true);
        setValidationErrors({});
        try {
            const response = await axiosClient.put('/api/profile/details', detailsForm);
            setProfileData(response.data.user);
            updateUserContext({
                first_name: response.data.user.first_name,
                last_name: response.data.user.last_name,
                name: response.data.user.name
            });
            // Update detailsForm with new values so view mode renders them immediately
            setDetailsForm({
                name: response.data.user.name || '',
                first_name: response.data.user.first_name || '',
                last_name: response.data.user.last_name || '',
                status: response.data.user.status || '',
                bio: response.data.user.bio || ''
            });
            showToast("Profile credentials updated successfully!");
            setIsEditingDetails(false);
        } catch (error) {
            if (error.response?.status === 422) {
                setValidationErrors(error.response.data.errors);
            } else {
                showToast("Error updating profile.", "error");
            }
        } finally {
            setDetailsUpdating(false);
        }
    };

    const cancelDetailsEdit = () => {
        setDetailsForm({
            name: profileData.name || '',
            first_name: profileData.first_name || '',
            last_name: profileData.last_name || '',
            status: profileData.status || '',
            bio: profileData.bio || ''
        });
        setValidationErrors({});
        setIsEditingDetails(false);
    };

    // --- Security Updates ---
    const handleSecurityUpdate = async (e) => {
        e.preventDefault();
        setValidationErrors({});
        setSecurityUpdating(true);

        try {
            await axiosClient.put('/api/profile/security', securityForm);
            showToast("Security settings updated successfully!");
            setSecurityForm(prev => ({ ...prev, current_password: '', new_password: '', new_password_confirmation: '' }));
            setIsEditingSecurity(false);
        } catch (error) {
            if (error.response?.status === 422) {
                setValidationErrors(error.response.data.errors);
            } else if (error.response?.status === 429) {
                showToast("Too many attempts. Please try again later.", "error");
            } else {
                showToast("Failed to update security settings.", "error");
            }
        } finally {
            setSecurityUpdating(false);
        }
    };

    const cancelSecurityEdit = () => {
        setSecurityForm({ email: profileData?.email || '', current_password: '', new_password: '', new_password_confirmation: '' });
        setValidationErrors({});
        setIsEditingSecurity(false);
    };

    // --- Image Upload & Cropping ---
    const onSelectFile = (e, type) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            setCropSelectedFile(file);
            setCropType(type);
            setCropImageSrc(URL.createObjectURL(file));
            setCropModalOpen(true);
        }
    };

    const handleCropSave = async (cropData) => {
        if (!cropSelectedFile) return;

        const formData = new FormData();
        formData.append(cropType, cropSelectedFile);

        // Append crop coordinates based on type
        if (cropType === 'avatar') {
            formData.append('crop', JSON.stringify(cropData));
        } else {
            formData.append('banner_crop', JSON.stringify(cropData));
        }

        try {
            const response = await axiosClient.post('/api/profile/images', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setProfileData(response.data.user);
            updateUserContext({
                avatar_url: response.data.user.avatar_url,
                banner_url: response.data.user.banner_url
            });
            showToast(`${cropType === 'avatar' ? 'Avatar' : 'Banner'} updated!`);
        } catch (error) {
            console.error("Image upload failed", error);
            showToast(`Failed to upload ${cropType}.`, "error");
        } finally {
            // Cleanup object URL
            if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
            setCropImageSrc(null);
            setCropSelectedFile(null);
        }
    };

    // --- Friends ---
    const handleRemoveFriend = async (friendId) => {
        setRemoveFriendTarget(null);
        // Optimistic UI update
        const previousFriends = [...friends];
        const newFriends = friends.filter(f => f.id !== friendId);
        setFriends(newFriends);
        // Reset page if current page is now out of bounds
        const maxPage = Math.max(0, Math.ceil(newFriends.length / FRIENDS_PER_PAGE) - 1);
        if (friendsPage > maxPage) setFriendsPage(maxPage);

        try {
            await axiosClient.delete(`/api/friends/${friendId}`);
            showToast("Friend removed.");
        } catch (error) {
            console.error("Failed to remove friend", error);
            showToast("Failed to remove friend.", "error");
            // Revert on failure
            setFriends(previousFriends);
        }
    };

    // --- Calendar Navigation ---
    const shiftMonth = (offset) => {
        const newDate = new Date(currentDate);
        newDate.setMonth(newDate.getMonth() + offset);
        setCurrentDate(newDate);
    };

    // --- Hash Navigation Listener ---
    useEffect(() => {
        if (!loading && window.location.hash === '#friends-section') {
            const el = document.getElementById('friends-section');
            if (el) {
                // Small timeout to ensure DOM layout is fully resolved
                setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
            }
        }
    }, [loading, window.location.hash]);

    if (loading) return (
        <div className="profile-layout loading-skeleton">
            <div className="spinner"></div>
            <h3>Loading Profile...</h3>
        </div>
    );

    const navItems = [
        { icon: <Layout size={24} />, route: '/dashboard' },
        { icon: <UserIcon size={24} />, route: '/profile', active: true },
        { icon: <BookOpen size={24} /> },
        { icon: <Bell size={24} /> },
        { icon: <Award size={24} /> },
    ];

    const avatarUrl = profileData?.avatar_url ? `http://localhost:8000${profileData.avatar_url}` : null;
    const bannerUrl = profileData?.banner_url ? `http://localhost:8000${profileData.banner_url}` : null;

    // Calendar Logic
    const monthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
    const daysArr = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    // Very rudimentary calendar days for mockup purposes
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const datesArr = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const isCurrentMonth = new Date().getMonth() === currentDate.getMonth() && new Date().getFullYear() === currentDate.getFullYear();

    const fullName = profileData?.first_name || profileData?.last_name ? `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() : (profileData?.name || 'FULL NAME');
    const joinDate = new Date(profileData?.created_at || Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const joinDateShort = new Date(profileData?.created_at || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    return (
        <div className="profile-wrapper">
            {/* Center Content Only */}
            <main className="profile-main-content">
                <header className="profile-header" style={{ borderBottom: '2px solid var(--charcoal)', paddingBottom: '1.5rem', marginBottom: '2rem' }}>
                    <h1> Your Profile</h1>
                </header>

                <div className="profile-scroll-area">
                    {/* Cover Photo / Banner Card */}
                    <div className="profile-card banner-card" style={{
                        backgroundImage: bannerUrl ? `url("${bannerUrl}")` : 'none',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        height: '280px',
                        minHeight: '280px'
                    }}>
                        {!bannerUrl && <Camera size={120} className="banner-placeholder-icon" />}

                        <label className="btn-edit absolute-bottom-right" style={{ background: 'var(--white)' }}>
                            Edit Banner <Edit2 size={16} />
                            <input type="file" hidden accept="image/*" onChange={(e) => onSelectFile(e, 'banner')} />
                        </label>
                    </div>

                    {/* Personal Details Card */}
                    <div className="profile-card details-card">
                        <div className="details-header-section">
                            <div className="main-avatar-container">
                                {avatarUrl ? <img src={avatarUrl} alt="Avatar" className="main-avatar" /> : <div className="main-avatar-placeholder"><UserIcon size={80} /></div>}
                                <label className="avatar-camera-btn">
                                    <Camera size={16} color="var(--charcoal)" />
                                    <input type="file" hidden accept="image/*" onChange={(e) => onSelectFile(e, 'avatar')} />
                                </label>
                            </div>
                            <div className="main-name-info">
                                <h2>@{profileData?.name || 'USERNAME'}</h2>
                                <p>Joined since {joinDate}</p>
                            </div>
                        </div>

                        <form onSubmit={handleDetailsUpdate} className="details-form mt-4">
                            <div className="form-header-row">
                                <h3 className="section-title">Personal Details</h3>
                                {!isEditingDetails ? (
                                    <button type="button" className="btn-edit" onClick={() => setIsEditingDetails(true)}>
                                        Edit Details <Edit2 size={16} />
                                    </button>
                                ) : (
                                    <div className="action-group">
                                        <button type="button" className="btn-cancel" onClick={cancelDetailsEdit} disabled={detailsUpdating}>Cancel</button>
                                        <button type="submit" className="btn-save" disabled={detailsUpdating}>
                                            {detailsUpdating ? 'Saving...' : 'Save Changes'} <Check size={16} />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="form-grid">
                                <div className="input-group">
                                    <label>Username</label>
                                    {isEditingDetails ? (
                                        <input type="text" value={detailsForm.name} onChange={e => setDetailsForm({ ...detailsForm, name: e.target.value })} placeholder="Enter Username..." />
                                    ) : (
                                        <div className="view-text-input">@{profileData?.name || 'Username'}</div>
                                    )}
                                    {validationErrors.name && <span className="error-text">{validationErrors.name[0]}</span>}
                                </div>
                                <div className="input-group">
                                    <label>Status</label>
                                    {isEditingDetails ? (
                                        <input type="text" value={detailsForm.status} onChange={e => setDetailsForm({ ...detailsForm, status: e.target.value })} placeholder="Enter Status..." />
                                    ) : (
                                        <div className="view-text-input">{profileData?.status || 'No Status'}</div>
                                    )}
                                    {validationErrors.status && <span className="error-text">{validationErrors.status[0]}</span>}
                                </div>
                                <div className="input-group">
                                    <label>First Name</label>
                                    {isEditingDetails ? (
                                        <input type="text" value={detailsForm.first_name} onChange={e => setDetailsForm({ ...detailsForm, first_name: e.target.value })} placeholder="Enter First Name..." />
                                    ) : (
                                        <div className="view-text-input">{profileData?.first_name || 'No First Name'}</div>
                                    )}
                                    {validationErrors.first_name && <span className="error-text">{validationErrors.first_name[0]}</span>}
                                </div>
                                <div className="input-group">
                                    <label>Last Name</label>
                                    {isEditingDetails ? (
                                        <input type="text" value={detailsForm.last_name} onChange={e => setDetailsForm({ ...detailsForm, last_name: e.target.value })} placeholder="Enter Last Name..." />
                                    ) : (
                                        <div className="view-text-input">{profileData?.last_name || 'No Last Name'}</div>
                                    )}
                                    {validationErrors.last_name && <span className="error-text">{validationErrors.last_name[0]}</span>}
                                </div>
                                <div className="input-group full-width">
                                    <label>Bio</label>
                                    {isEditingDetails ? (
                                        <textarea value={detailsForm.bio} onChange={e => setDetailsForm({ ...detailsForm, bio: e.target.value })} placeholder="Enter Bio..."></textarea>
                                    ) : (
                                        <div className="view-text-textarea">{profileData?.bio || 'No Bio'}</div>
                                    )}
                                    {validationErrors.bio && <span className="error-text">{validationErrors.bio[0]}</span>}
                                </div>
                            </div>
                        </form>
                    </div>

                    {/* Friend List Card */}
                    <div id="friends-section" className="profile-card friendlist-card">
                        <div className="friendlist-header">
                            <h3 className="section-title" style={{ textTransform: 'uppercase' }}>Friend List</h3>
                            <span className="friend-count-badge">{friends.length}</span>
                        </div>
                        <div className="friends-container">
                            {friends.slice(friendsPage * FRIENDS_PER_PAGE, (friendsPage + 1) * FRIENDS_PER_PAGE).map(friend => (
                                <div key={friend.id} className="friend-card">
                                    <div className="friend-avatar-wrapper">
                                        <img src={friend.avatar_url ? `http://localhost:8000${friend.avatar_url}` : "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?q=80&w=200&auto=format&fit=crop"} alt={getDisplayName(friend)} className="friend-card-avatar" />
                                    </div>
                                    <h4 className="friend-card-name">{getDisplayName(friend)}</h4>
                                    <div className="friend-card-actions">
                                        <button className="btn-friend-remove" onClick={() => setRemoveFriendTarget(friend)}>Remove</button>
                                        <button className="btn-friend-view" onClick={() => navigate(`/profile/${friend.id}`)}>View</button>
                                    </div>
                                </div>
                            ))}
                            {friends.length === 0 && <p className="no-friends">No friends added yet.</p>}
                        </div>
                        {friends.length > FRIENDS_PER_PAGE && (
                            <div className="friends-pagination">
                                <button
                                    className="friends-page-btn"
                                    onClick={() => setFriendsPage(p => p - 1)}
                                    disabled={friendsPage === 0}
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <span className="friends-page-indicator">
                                    {friendsPage + 1} / {Math.ceil(friends.length / FRIENDS_PER_PAGE)}
                                </span>
                                <button
                                    className="friends-page-btn"
                                    onClick={() => setFriendsPage(p => p + 1)}
                                    disabled={(friendsPage + 1) * FRIENDS_PER_PAGE >= friends.length}
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Account Settings Card */}
                    <div className="profile-card settings-card">
                        <form onSubmit={handleSecurityUpdate}>
                            <div className="form-header-row">
                                <h3 className="section-title">Account Settings</h3>
                                {!isEditingSecurity ? (
                                    <button type="button" className="btn-edit" onClick={() => setIsEditingSecurity(true)}>
                                        Edit Credentials <Edit2 size={16} />
                                    </button>
                                ) : (
                                    <div className="action-group">
                                        <button type="button" className="btn-cancel" onClick={cancelSecurityEdit} disabled={securityUpdating}>Cancel</button>
                                        <button type="submit" className="btn-save" disabled={securityUpdating}>
                                            {securityUpdating ? 'Saving...' : 'Save Changes'} <Check size={16} />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="settings-grid">
                                <div className="settings-row">
                                    <label>E-mail Account</label>
                                    {!isEditingSecurity ? (
                                        <div className="view-text disabled-text">{profileData?.email || ''}</div>
                                    ) : (
                                        <div className="input-wrapper">
                                            <input type="email" value={securityForm.email} onChange={e => setSecurityForm({ ...securityForm, email: e.target.value })} required />
                                            {validationErrors.email && <span className="error-text">{validationErrors.email[0]}</span>}
                                        </div>
                                    )}
                                </div>

                                {isEditingSecurity && (
                                    <>
                                        <div className="settings-row editing-row">
                                            <label>Current Password</label>
                                            <div className="input-wrapper">
                                                <input type="password" value={securityForm.current_password} onChange={e => setSecurityForm({ ...securityForm, current_password: e.target.value })} placeholder="••••••••••••" required />
                                                {validationErrors.current_password && <span className="error-text">{validationErrors.current_password[0]}</span>}
                                            </div>
                                        </div>
                                        <div className="settings-row editing-row">
                                            <label>New Password (Optional)</label>
                                            <div className="input-wrapper">
                                                <input type="password" value={securityForm.new_password} onChange={e => setSecurityForm({ ...securityForm, new_password: e.target.value })} placeholder="••••••••••••" />
                                                {validationErrors.new_password && <span className="error-text">{validationErrors.new_password[0]}</span>}
                                            </div>
                                        </div>
                                        <div className="settings-row editing-row">
                                            <label>Confirm New Password</label>
                                            <div className="input-wrapper">
                                                <input type="password" value={securityForm.new_password_confirmation} onChange={e => setSecurityForm({ ...securityForm, new_password_confirmation: e.target.value })} placeholder="••••••••••••" />
                                            </div>
                                        </div>
                                    </>
                                )}
                                {!isEditingSecurity && (
                                    <div className="settings-row">
                                        <label>Password</label>
                                        <div className="view-text disabled-text">••••••••••••</div>
                                    </div>
                                )}
                            </div>
                            {!isEditingSecurity && (
                                <div className="settings-row danger-zone" style={{ marginTop: '3rem', display: 'flex', justifyContent: 'flex-start' }}>
                                    <button type="button" className="btn-delete-account" onClick={handleDeleteAccount}>
                                        DELETE ACCOUNT
                                    </button>
                                </div>
                            )}
                        </form>
                    </div>
                </div>
            </main>

            {/* Crop Modal */}
            <ImageCropModal
                isOpen={cropModalOpen}
                onClose={() => {
                    setCropModalOpen(false);
                    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
                    setCropSelectedFile(null);
                }}
                imageSrc={cropImageSrc}
                aspect={cropType === 'avatar' ? 1 : 1200 / 400}
                title={`Crop your ${cropType}`}
                onSave={handleCropSave}
            />

            {/* Delete Account Modal */}
            {isDeleteModalOpen && (
                <div className="delete-modal-overlay">
                    <div className="delete-modal-content">
                        <h2>Delete Account</h2>
                        <p>Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently removed.</p>
                        <div className="delete-modal-actions">
                            <button className="btn-delete-cancel" onClick={() => setIsDeleteModalOpen(false)}>Cancel</button>
                            <button className="btn-delete-confirm" onClick={confirmDeleteAccount}>Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Remove Friend Confirmation Modal */}
            {removeFriendTarget && (
                <div className="delete-modal-overlay">
                    <div className="delete-modal-content">
                        <h2>Remove Friend</h2>
                        <p>Are you sure you want to remove <strong>{getDisplayName(removeFriendTarget)}</strong> from your friends?</p>
                        <div className="delete-modal-actions">
                            <button className="btn-delete-cancel" onClick={() => setRemoveFriendTarget(null)}>Cancel</button>
                            <button className="btn-delete-confirm" onClick={() => handleRemoveFriend(removeFriendTarget.id)}>Remove</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Profile;

// Dummy Check Icon for buttons
const Check = ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
);
