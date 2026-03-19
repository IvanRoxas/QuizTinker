import json
import uuid

from django.conf import settings
from django.contrib.auth import authenticate, login, logout, get_user_model
from django.db.models import Q
from django.middleware.csrf import get_token
from django.utils import timezone
from PIL import Image as PILImage
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import Friendship, Notification
from .serializers import (
    LoginSerializer,
    NotificationSerializer,
    RegisterSerializer,
    UserPublicSerializer,
    UserSerializer,
)
from rest_framework.authtoken.models import Token

User = get_user_model()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _media_path(*parts):
    """Return the full path to a media sub-directory, creating it if needed."""
    path = settings.MEDIA_ROOT
    for p in parts:
        path = path / p
    path.mkdir(parents=True, exist_ok=True)
    return path


# ═══════════════════════════════════════════════════════════════════════════
#  AUTH
# ═══════════════════════════════════════════════════════════════════════════

@api_view(['GET'])
@permission_classes([AllowAny])
def csrf_token_view(request):
    """Return a CSRF token (replaces /sanctum/csrf-cookie)."""
    token = get_token(request)
    return Response({'csrfToken': token})


@api_view(['POST'])
@permission_classes([AllowAny])
def register_view(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    d = serializer.validated_data

    user = User.objects.create_user(
        username=d['name'],
        email=d['email'],
        password=d['password'],
        first_name=d['first_name'],
        last_name=d['last_name'],
    )
    login(request, user, backend='django.contrib.auth.backends.ModelBackend')
    token, _ = Token.objects.get_or_create(user=user)

    return Response({
        'user': UserSerializer(user).data,
        'token': token.key
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    # Django authenticates by username; look up the username from email.
    user_obj = User.objects.filter(email=serializer.validated_data['email']).first()
    if not user_obj:
        return Response(
            {'errors': {'email': ['The provided credentials do not match our records.']}},
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    user = authenticate(
        request,
        username=user_obj.username,
        password=serializer.validated_data['password'],
    )
    if user is None:
        return Response(
            {'errors': {'email': ['The provided credentials do not match our records.']}},
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    login(request, user, backend='django.contrib.auth.backends.ModelBackend')
    token, _ = Token.objects.get_or_create(user=user)
    return Response({
        'user': UserSerializer(user).data,
        'token': token.key
    })


@api_view(['POST'])
def logout_view(request):
    if hasattr(request.user, 'auth_token'):
        request.user.auth_token.delete()
    logout(request)
    return Response({'message': 'Logged out successfully'})


@api_view(['GET'])
def current_user_view(request):
    return Response(UserSerializer(request.user).data)


# ═══════════════════════════════════════════════════════════════════════════
#  PROFILE
# ═══════════════════════════════════════════════════════════════════════════

@api_view(['GET', 'DELETE'])
def profile_dispatch_view(request):
    """GET → return profile + friends · DELETE → delete account."""
    if request.method == 'DELETE':
        user = request.user
        logout(request)
        user.delete()
        return Response({'message': 'Account deleted successfully.'})

    # GET: return user profile + friends
    user = request.user
    friends = user.friends()
    return Response({
        'user': UserSerializer(user).data,
        'friends': UserPublicSerializer(friends, many=True).data,
        'friend_count': friends.count(),
    })


@api_view(['PUT'])
def update_details_view(request):
    user = request.user
    data = request.data

    if 'name' in data and data['name']:
        if User.objects.filter(username=data['name']).exclude(id=user.id).exists():
            return Response(
                {'errors': {'name': ['This name is already taken.']}},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        user.username = data['name']

    for field in ('first_name', 'last_name', 'status', 'bio'):
        if field in data:
            setattr(user, field, data[field] or '')

    user.save()
    return Response({
        'message': 'Profile details updated successfully.',
        'user': UserSerializer(user).data,
    })


@api_view(['PUT'])
def update_security_view(request):
    user = request.user
    data = request.data

    # Validate current password
    if not user.check_password(data.get('current_password', '')):
        return Response(
            {'errors': {'current_password': ['The current password is incorrect.']}},
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    # Update email
    email = data.get('email', user.email)
    if User.objects.filter(email=email).exclude(id=user.id).exists():
        return Response(
            {'errors': {'email': ['This email is already taken.']}},
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )
    user.email = email

    # Update password if provided
    new_password = data.get('new_password')
    if new_password:
        user.set_password(new_password)

    user.save()

    # Re-login to refresh the session after password change
    if new_password:
        login(request, user)

    return Response({
        'message': 'Security settings updated successfully.',
        'user': UserSerializer(user).data,
    })


def _process_image(file, crop_json, target_size, subfolder):
    """Crop, resize, convert to WebP, save and return the URL path."""
    img = PILImage.open(file)

    # Crop if data is provided
    if crop_json:
        try:
            crop = json.loads(crop_json) if isinstance(crop_json, str) else crop_json
            if all(k in crop for k in ('x', 'y', 'width', 'height')):
                left = int(crop['x'])
                top = int(crop['y'])
                right = left + int(crop['width'])
                bottom = top + int(crop['height'])
                img = img.crop((left, top, right, bottom))
        except (json.JSONDecodeError, TypeError, ValueError):
            pass

    # Resize to cover the target dimensions
    img = img.convert('RGB')
    img = img.resize(target_size, PILImage.LANCZOS)

    # Save as WebP
    filename = f'{uuid.uuid4().hex}.webp'
    save_dir = _media_path(subfolder)
    filepath = save_dir / filename
    img.save(str(filepath), 'WEBP', quality=80)

    return f'/media/{subfolder}/{filename}'


@api_view(['POST'])
def upload_images_view(request):
    user = request.user
    import os

    if 'avatar' in request.FILES:
        # Delete old file
        if user.avatar_url:
            old = settings.MEDIA_ROOT / user.avatar_url.lstrip('/media/')
            if old.exists():
                os.remove(str(old))

        user.avatar_url = _process_image(
            request.FILES['avatar'],
            request.data.get('crop'),
            (400, 400),
            'avatars',
        )

    if 'banner' in request.FILES:
        if user.banner_url:
            old = settings.MEDIA_ROOT / user.banner_url.lstrip('/media/')
            if old.exists():
                os.remove(str(old))

        user.banner_url = _process_image(
            request.FILES['banner'],
            request.data.get('banner_crop'),
            (1200, 400),
            'banners',
        )

    user.save()
    return Response({
        'message': 'Images uploaded successfully.',
        'user': UserSerializer(user).data,
    })


@api_view(['DELETE'])
def delete_account_view(request):
    user = request.user
    logout(request)
    user.delete()
    return Response({'message': 'Account deleted successfully.'})


@api_view(['GET'])
def public_profile_view(request, user_id):
    try:
        target = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({'message': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

    current = request.user
    is_friend = current.is_friend_with(user_id)
    has_pending = current.has_pending_request_with(user_id)

    request_direction = None
    if has_pending:
        # Check if current user sent it or received it
        if Friendship.objects.filter(user=current, friend_id=user_id, status='pending').exists():
            request_direction = 'sent'
        elif Friendship.objects.filter(user_id=user_id, friend=current, status='pending').exists():
            request_direction = 'received'

    # Mutual friends
    current_friend_ids = set(Friendship.objects.filter(
        user=current, status='accepted'
    ).values_list('friend_id', flat=True))

    target_friend_ids = set(Friendship.objects.filter(
        user=target, status='accepted'
    ).values_list('friend_id', flat=True))

    mutual_count = len(current_friend_ids & target_friend_ids)

    # Target's friends
    friends = target.friends()

    return Response({
        'user': UserSerializer(target).data,
        'is_friend': is_friend,
        'has_pending_request': has_pending,
        'request_direction': request_direction,
        'mutual_friends_count': mutual_count,
        'friends': UserPublicSerializer(friends, many=True).data,
    })


# ═══════════════════════════════════════════════════════════════════════════
#  FRIENDS
# ═══════════════════════════════════════════════════════════════════════════

@api_view(['GET'])
def friends_list_view(request):
    friends = request.user.friends()
    return Response({'friends': UserPublicSerializer(friends, many=True).data})


@api_view(['POST'])
def send_friend_request_view(request, user_id):
    user = request.user

    if user.id == user_id:
        return Response({'message': 'Cannot send friend request to yourself.'}, status=422)

    target = User.objects.filter(id=user_id).first()
    if not target:
        return Response({'message': 'User not found.'}, status=404)

    if target.is_staff:
        return Response({'message': 'Cannot send friend requests to staff members.'}, status=422)

    if user.is_friend_with(user_id):
        return Response({'message': 'Already friends with this user.'}, status=422)

    if user.has_pending_request_with(user_id):
        return Response({'message': 'A friend request is already pending.'}, status=422)

    Friendship.objects.create(user=user, friend_id=user_id, status='pending')

    Notification.objects.create(
        user_id=user_id,
        sender=user,
        notification_type='friend_request',
        data={'message': f'{user.first_name} {user.last_name} sent you a friend request.'},
    )

    return Response({'message': 'Friend request sent.'})


@api_view(['POST'])
def accept_friend_request_view(request, sender_id):
    user = request.user

    updated = Friendship.objects.filter(
        user_id=sender_id, friend=user, status='pending'
    ).update(status='accepted', updated_at=timezone.now())

    if not updated:
        return Response({'message': 'No pending friend request found.'}, status=404)

    # Create reciprocal row
    Friendship.objects.get_or_create(
        user=user, friend_id=sender_id,
        defaults={'status': 'accepted'},
    )

    Notification.objects.create(
        user_id=sender_id,
        sender=user,
        notification_type='friend_accepted',
        data={'message': f'{user.first_name} {user.last_name} accepted your friend request.'},
    )

    # Automatically mark the original friend request notification as read
    Notification.objects.filter(
        user=user,
        sender_id=sender_id,
        notification_type='friend_request',
        read_at__isnull=True
    ).update(read_at=timezone.now())

    return Response({'message': 'Friend request accepted.'})


@api_view(['POST'])
def reject_friend_request_view(request, sender_id):
    deleted, _ = Friendship.objects.filter(
        user_id=sender_id, friend=request.user, status='pending'
    ).delete()

    if not deleted:
        return Response({'message': 'No pending friend request found.'}, status=404)

    # Automatically mark the original friend request notification as read
    Notification.objects.filter(
        user=request.user,
        sender_id=sender_id,
        notification_type='friend_request',
        read_at__isnull=True
    ).update(read_at=timezone.now())

    return Response({'message': 'Friend request rejected.'})


@api_view(['DELETE'])
def remove_friend_view(request, friend_id):
    user = request.user
    Friendship.objects.filter(
        Q(user=user, friend_id=friend_id) | Q(user_id=friend_id, friend=user)
    ).delete()

    # Cascade delete any leftover notifications between the two users regarding friendships
    Notification.objects.filter(
        Q(user=user, sender_id=friend_id) | Q(user_id=friend_id, sender=user),
        notification_type__in=['friend_request', 'friend_accepted']
    ).delete()

    return Response({'message': 'Friend removed successfully.'})


@api_view(['GET'])
def search_users_view(request):
    query = request.query_params.get('q', '')
    if len(query) < 2:
        return Response({'users': []})

    current = request.user

    users = User.objects.exclude(id=current.id).exclude(is_staff=True).filter(
        Q(username__icontains=query)
        | Q(first_name__icontains=query)
        | Q(last_name__icontains=query)
        | Q(email__icontains=query)
    )[:10]

    friend_ids = set(current.friends().values_list('id', flat=True))
    sent_ids = set(current.sent_friend_requests().values_list('id', flat=True))
    received_ids = set(current.received_friend_requests().values_list('id', flat=True))

    result = []
    for u in users:
        data = UserPublicSerializer(u).data
        if u.id in friend_ids:
            data['friendship_status'] = 'friends'
        elif u.id in sent_ids:
            data['friendship_status'] = 'pending_sent'
        elif u.id in received_ids:
            data['friendship_status'] = 'pending_received'
        else:
            data['friendship_status'] = 'none'
        result.append(data)

    return Response({'users': result})


# ═══════════════════════════════════════════════════════════════════════════
#  NOTIFICATIONS
# ═══════════════════════════════════════════════════════════════════════════

from rest_framework.pagination import PageNumberPagination

class NotificationPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 50

@api_view(['GET'])
def notifications_list_view(request):
    # Sweep deadlines for reminders
    current_time = timezone.now()
    try:
        from quizzes.models import Quiz, QuizAttempt
        # Resolve visible quizzes with deadlines
        visibility_q = Q()
        from accounts.models import Friendship
        friend_ids = Friendship.objects.filter(
            Q(user=request.user, status="accepted") | Q(friend=request.user, status="accepted")
        ).values_list("user_id", "friend_id")

        flattened_friends = set()
        for u_id, f_id in friend_ids:
            flattened_friends.add(u_id)
            flattened_friends.add(f_id)
        flattened_friends.discard(request.user.id)

        visibility_q |= Q(status="published", availability="all_friends", author_id__in=flattened_friends)
        visibility_q |= Q(status="published", availability="specific_friends", shared_with=request.user)

        visible_quizzes = Quiz.objects.filter(
            visibility_q,
            deadline__isnull=False,
            is_active=True
        ).exclude(author=request.user).distinct()

        for quiz in visible_quizzes:
            has_completed = QuizAttempt.objects.filter(
                quiz=quiz, user=request.user, completed=True
            ).exists()
            if has_completed:
                continue

            time_left = quiz.deadline - current_time
            is_approaching = timezone.timedelta(hours=0) < time_left <= timezone.timedelta(hours=24)
            is_late = current_time > quiz.deadline and quiz.allow_late_submissions

            if is_approaching:
                notif_exists = Notification.objects.filter(
                    user=request.user,
                    notification_type='quiz_deadline',
                    data__quiz_id=quiz.id,
                    data__deadline_type='approaching'
                ).exists()

                if not notif_exists:
                    Notification.objects.create(
                        user=request.user,
                        sender=quiz.author,
                        notification_type='quiz_deadline',
                        data={
                            'message': f'Reminder: "{quiz.title}" is due in less than 24 hours!',
                            'quiz_id': quiz.id,
                            'deadline_type': 'approaching'
                        }
                    )
            elif is_late:
                notif_exists = Notification.objects.filter(
                    user=request.user,
                    notification_type='quiz_deadline',
                    data__quiz_id=quiz.id,
                    data__deadline_type='late'
                ).exists()

                if not notif_exists:
                    Notification.objects.create(
                        user=request.user,
                        sender=quiz.author,
                        notification_type='quiz_deadline',
                        data={
                            'message': f'Notice: "{quiz.title}" is past its deadline, but taking is still open.',
                            'quiz_id': quiz.id,
                            'deadline_type': 'late'
                        }
                    )

    except Exception:
        pass

    notifs_query = Notification.objects.filter(
        user=request.user
    ).select_related('sender').order_by('-created_at')

    # Aggressive Validation: Ensure friend_request notifications still have a valid pending request
    valid_notifs = []
    for n in notifs_query:
        if n.notification_type == 'friend_request' and not n.read_at:
            # Check if the sender actually still has a pending request towards this user
            request_exists = Friendship.objects.filter(
                user_id=n.sender_id, friend=request.user, status='pending'
            ).exists()
            
            if not request_exists:
                # The request is gone (withdrawn, or they are already friends). Delete the ghost notification.
                n.delete()
                continue
                
        valid_notifs.append(n)

    paginator = NotificationPagination()
    # We must paginate the list instead of a queryset since we did a manual filter
    page = paginator.paginate_queryset(valid_notifs, request, view=None)

    if page is not None:
        return paginator.get_paginated_response(NotificationSerializer(page, many=True).data)

    return Response({'notifications': NotificationSerializer(valid_notifs, many=True).data})


@api_view(['GET'])
def unread_count_view(request):
    count = Notification.objects.filter(user=request.user, read_at__isnull=True).count()
    return Response({'count': count})


@api_view(['POST'])
def mark_read_view(request, notification_id):
    try:
        notif = Notification.objects.get(id=notification_id, user=request.user)
    except Notification.DoesNotExist:
        return Response({'message': 'Notification not found.'}, status=404)

    notif.read_at = timezone.now()
    notif.save()
    return Response({'message': 'Notification marked as read.'})


@api_view(['POST'])
def mark_all_read_view(request):
    Notification.objects.filter(
        user=request.user, read_at__isnull=True
    ).update(read_at=timezone.now())

    return Response({'message': 'All notifications marked as read.'})

@api_view(['DELETE'])
def delete_notification_view(request, notification_id):
    try:
        notif = Notification.objects.get(id=notification_id, user=request.user)
        notif.delete()
        return Response({'message': 'Notification deleted.'})
    except Notification.DoesNotExist:
        return Response({'message': 'Notification not found.'}, status=404)
