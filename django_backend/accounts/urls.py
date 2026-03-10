from django.urls import path

from . import views

urlpatterns = [
    # CSRF
    path('csrf/', views.csrf_token_view, name='csrf-token'),

    # Auth
    path('register', views.register_view, name='register'),
    path('login', views.login_view, name='login'),
    path('logout', views.logout_view, name='logout'),
    path('user', views.current_user_view, name='current-user'),

    # Profile (GET = view, DELETE = delete account)
    path('profile', views.profile_dispatch_view, name='profile'),
    path('profile/details', views.update_details_view, name='profile-details'),
    path('profile/security', views.update_security_view, name='profile-security'),
    path('profile/images', views.upload_images_view, name='profile-images'),

    # Friends
    path('friends', views.friends_list_view, name='friends-list'),
    path('friends/request/<int:user_id>', views.send_friend_request_view, name='friend-request'),
    path('friends/accept/<int:sender_id>', views.accept_friend_request_view, name='friend-accept'),
    path('friends/reject/<int:sender_id>', views.reject_friend_request_view, name='friend-reject'),
    path('friends/<int:friend_id>', views.remove_friend_view, name='friend-remove'),

    # Notifications
    path('notifications', views.notifications_list_view, name='notifications-list'),
    path('notifications/unread-count', views.unread_count_view, name='notifications-unread'),
    path('notifications/<int:notification_id>/read', views.mark_read_view, name='notification-read'),
    path('notifications/<int:notification_id>', views.delete_notification_view, name='notification-delete'),
    path('notifications/read-all', views.mark_all_read_view, name='notifications-read-all'),

    # User search & public profile
    path('users/search', views.search_users_view, name='users-search'),
    path('users/<int:user_id>/profile', views.public_profile_view, name='user-profile'),
]
