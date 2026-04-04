from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """Public-safe representation of a user.

    Maps Django's `username` to `name` in the JSON output so the React
    frontend can keep using `user.name` everywhere.
    """
    name = serializers.CharField(source='username')

    class Meta:
        model = User
        fields = [
            'id', 'name', 'first_name', 'last_name', 'email',
            'avatar_url', 'banner_url', 'status', 'bio',
            'date_joined', 'is_staff',
        ]
        read_only_fields = ['id', 'date_joined']

    def to_representation(self, instance):
        """Add `created_at` alias for frontend compatibility."""
        data = super().to_representation(instance)
        data['created_at'] = data.pop('date_joined', None)
        return data


class UserPublicSerializer(serializers.ModelSerializer):
    """Minimal user info for friend lists and search results."""
    name = serializers.CharField(source='username')

    class Meta:
        model = User
        fields = ['id', 'name', 'first_name', 'last_name', 'avatar_url', 'status', 'is_staff']


class RegisterSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    first_name = serializers.CharField(max_length=255)
    last_name = serializers.CharField(max_length=255)
    email = serializers.EmailField(max_length=255)
    password = serializers.CharField(min_length=8, write_only=True)
    password_confirmation = serializers.CharField(write_only=True)

    def validate_name(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError('This name is already taken.')
        return value

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('This email is already registered.')
        return value

    def validate(self, data):
        if data['password'] != data['password_confirmation']:
            raise serializers.ValidationError({'password': 'Passwords do not match.'})
        validate_password(data['password'])
        return data


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()


class NotificationSerializer(serializers.ModelSerializer):
    sender = UserPublicSerializer(read_only=True)
    sender_id = serializers.IntegerField(read_only=True)

    class Meta:
        from .models import Notification
        model = Notification
        fields = ['id', 'user_id', 'sender_id', 'sender', 'notification_type', 'data', 'read_at', 'created_at']
