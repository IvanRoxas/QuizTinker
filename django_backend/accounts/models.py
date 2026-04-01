from django.contrib.auth.models import AbstractUser
from django.db import models
import random, string

class User(AbstractUser):
    """Extended user model with profile fields."""
    username = models.CharField(max_length=150, unique=True, blank=False, null=False)
    first_name = models.CharField(max_length=255, blank=True, default='')
    last_name = models.CharField(max_length=255, blank=True, default='')
    avatar_url = models.CharField(max_length=500, blank=True, null=True)
    banner_url = models.CharField(max_length=500, blank=True, null=True)
    status = models.CharField(max_length=255, blank=True, null=True)
    bio = models.TextField(blank=True, null=True)

    # The 'name' field from Laravel maps to 'username' in Django
    # We keep username as the unique display name

    def friends(self):
        """Get accepted friends (user_id side)."""
        return User.objects.filter(
            id__in=Friendship.objects.filter(
                user=self, status='accepted'
            ).values_list('friend_id', flat=True)
        ).exclude(is_staff=True)

    def sent_friend_requests(self):
        """Pending requests sent by this user."""
        return User.objects.filter(
            id__in=Friendship.objects.filter(
                user=self, status='pending'
            ).values_list('friend_id', flat=True)
        ).exclude(is_staff=True)

    def received_friend_requests(self):
        """Pending requests received by this user."""
        return User.objects.filter(
            id__in=Friendship.objects.filter(
                friend=self, status='pending'
            ).values_list('user_id', flat=True)
        ).exclude(is_staff=True)

    def is_friend_with(self, user_id):
        return Friendship.objects.filter(
            user=self, friend_id=user_id, status='accepted'
        ).exists()

    def has_pending_request_with(self, user_id):
        return (
            Friendship.objects.filter(
                user=self, friend_id=user_id, status='pending'
            ).exists()
            or Friendship.objects.filter(
                user_id=user_id, friend=self, status='pending'
            ).exists()
        )

    class Meta:
        db_table = 'users'


class Friendship(models.Model):
    """Friendship / friend-request record."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='friendships_sent')
    friend = models.ForeignKey(User, on_delete=models.CASCADE, related_name='friendships_received')
    status = models.CharField(max_length=20, default='pending')  # pending | accepted
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'friendships'
        unique_together = ('user', 'friend')


class Notification(models.Model):
    """In-app notification."""
    NOTIFICATION_TYPES = (
        ('friend_request', 'Friend Request'),
        ('friend_accepted', 'Friend Accepted'),
        ('quiz_share', 'Quiz Share'),
        ('system_alert', 'System Alert'),
        ('general', 'General'),
        ('quiz_deadline', 'Quiz Deadline'),
    )
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='app_notifications')
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_notifications')
    notification_type = models.CharField(max_length=50, choices=NOTIFICATION_TYPES, default='general')
    data = models.JSONField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'read_at']),
        ]

class OTPCode(models.Model):
    """
    Stores a one-time password for a user during the 2FA login flow.
    Only one active OTP exists per user at a time (old ones are replaced).
    """
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='otp_code',
    )
    code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
 
    OTP_EXPIRY_SECONDS = 300  # 5 minutes
 
    class Meta:
        db_table = 'otp_codes'
 
    @classmethod
    def generate_for(cls, user):
        """
        Generate a fresh 6-digit OTP for the given user, replacing any
        existing one. Returns the OTPCode instance (code is accessible via
        instance.code).
        """
        code = ''.join(random.choices(string.digits, k=6))
        cls.objects.filter(user=user).delete()
        obj = cls.objects.create(user=user, code=code)
        return obj
 
    def is_valid(self, submitted_code):
        """
        Returns True if the submitted code matches and hasn't expired.
        """
        from django.utils import timezone
        import datetime
 
        age = timezone.now() - self.created_at
        if age.total_seconds() > self.OTP_EXPIRY_SECONDS:
            return False
        return self.code == submitted_code