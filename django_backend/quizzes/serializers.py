from django.conf import settings
from rest_framework import serializers
from django.core.exceptions import ValidationError
from django.utils import timezone
from .models import Quiz, QuizItem

class QuizItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuizItem
        fields = '__all__'
        read_only_fields = ['id', 'quiz']

class QuizItemStudentSerializer(serializers.ModelSerializer):
    choices = serializers.SerializerMethodField()
    meta = serializers.SerializerMethodField()

    class Meta:
        model = QuizItem
        fields = ['id', 'question', 'type', 'choices', 'meta', 'points', 'sort_order', 'media']
        
    def get_choices(self, obj):
        # Strip 'is_correct' from choices
        choices = obj.choices or []
        safe_choices = []
        for choice in choices:
            safe_choice = {k: v for k, v in choice.items() if k != 'is_correct'}
            safe_choices.append(safe_choice)
        return safe_choices

    def get_meta(self, obj):
        # Strip right side of pairs and order
        meta = obj.meta or {}
        safe_meta = {}
        if obj.type == 'matching' and 'pairs' in meta:
            safe_meta['pairs'] = [{'left': p.get('left', '')} for p in meta['pairs']]
            
            # Send shuffled rights for the dropdowns
            import random
            rights = [p.get('right', '') for p in meta['pairs'] if p.get('right')]
            random.shuffle(rights)
            safe_meta['rights'] = rights
            
        # For ordering, we don't send the order array.
        if obj.type == 'ordering' and 'order' in meta:
            import random
            shuffled_order = list(meta['order'])
            random.shuffle(shuffled_order)
            safe_meta['order'] = shuffled_order
        return safe_meta

class QuizSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    author_avatar = serializers.SerializerMethodField()
    items = QuizItemSerializer(many=True, read_only=True)
    student_attempts_taken = serializers.SerializerMethodField()
    latest_attempt_id = serializers.SerializerMethodField()

    class Meta:
        model = Quiz
        fields = [
            'id',
            'author',
            'author_name',
            'author_avatar',
            'title',
            'subtitle',
            'description',
            'preview_image',
            'attempts_allowed',
            'time_limit_minutes',
            'deadline',
            'availability',
            'shared_with',
            'allow_late_submissions',
            'can_backtrack',
            'show_answers_at_end',
            'status',
            'generation_type',
            'category',
            'specialization',
            'created_at',
            'updated_at',
            'items',
            'student_attempts_taken',
            'latest_attempt_id',
        ]
        read_only_fields = ['id', 'author', 'created_at', 'updated_at', 'items', 'student_attempts_taken', 'latest_attempt_id']

    def get_author_name(self, obj):
        if obj.author:
             return obj.author.username
        return None

    def get_author_avatar(self, obj):
        if obj.author and hasattr(obj.author, 'avatar_url') and obj.author.avatar_url:
             return f"{settings.BACKEND_URL}{obj.author.avatar_url}"
        elif obj.author and hasattr(obj.author, 'profile') and obj.author.profile.avatar:
             return f"{settings.BACKEND_URL}{obj.author.profile.avatar.url}"
        return None

    def get_student_attempts_taken(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            from .models import QuizAttempt
            return QuizAttempt.objects.filter(quiz=obj, user=request.user, end_time__isnull=False).count()
        return 0

    def get_latest_attempt_id(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            from .models import QuizAttempt
            latest = QuizAttempt.objects.filter(quiz=obj, user=request.user, end_time__isnull=False).order_by('-end_time').first()
            return latest.id if latest else None
        return None

    def validate(self, attrs):
        # Merge validated data with existing instance data to run model clean()
        quiz_attrs = {k: v for k, v in attrs.items() if k != 'shared_with'}
        instance = self.instance or Quiz(**quiz_attrs)
        
        availability = attrs.get('availability', instance.availability)
        shared_with = attrs.get('shared_with', [])
        
        if availability == 'specific_friends' and not shared_with and not (self.instance and self.instance.shared_with.exists()):
             raise serializers.ValidationError({
                 'shared_with': "Please select at least one friend to share with."
             })
             
        # Past-deadline validation removed to allow authors/admins to manage expired quizzes.

        # Call model clean (redundant but safe)
        for attr, value in attrs.items():
            if attr != 'shared_with':
                setattr(instance, attr, value)
        
        try:
            instance.clean()
        except ValidationError as e:
            raise serializers.ValidationError(e.message_dict)

        return attrs

class QuizStudentSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    author_avatar = serializers.SerializerMethodField()
    items = QuizItemStudentSerializer(many=True, read_only=True)
    student_attempts_taken = serializers.SerializerMethodField()
    latest_attempt_id = serializers.SerializerMethodField()

    class Meta:
        model = Quiz
        fields = [
            'id',
            'author',
            'author_name',
            'author_avatar',
            'title',
            'subtitle',
            'description',
            'preview_image',
            'attempts_allowed',
            'time_limit_minutes',
            'deadline',
            'availability',
            'shared_with',
            'allow_late_submissions',
            'can_backtrack',
            'show_answers_at_end',
            'status',
            'generation_type',
            'category',
            'specialization',
            'created_at',
            'updated_at',
            'items',
            'student_attempts_taken',
            'latest_attempt_id',
        ]
        read_only_fields = ['id', 'author', 'created_at', 'updated_at', 'items', 'student_attempts_taken', 'latest_attempt_id']

    def get_author_name(self, obj):
        if obj.author:
             return obj.author.username
        return None

    def get_author_avatar(self, obj):
        if obj.author and hasattr(obj.author, 'avatar_url') and obj.author.avatar_url:
             return f"{settings.BACKEND_URL}{obj.author.avatar_url}"
        elif obj.author and hasattr(obj.author, 'profile') and obj.author.profile.avatar:
             return f"{settings.BACKEND_URL}{obj.author.profile.avatar.url}"
        return None

    def get_student_attempts_taken(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            from .models import QuizAttempt
            return QuizAttempt.objects.filter(quiz=obj, user=request.user, end_time__isnull=False).count()
        return 0

    def get_latest_attempt_id(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            from .models import QuizAttempt
            latest = QuizAttempt.objects.filter(quiz=obj, user=request.user, end_time__isnull=False).order_by('-end_time').first()
            return latest.id if latest else None
        return None

class QuizSubmissionSerializer(serializers.Serializer):
    attempt_id = serializers.IntegerField()
    answers = serializers.DictField()
    time_taken_seconds = serializers.IntegerField(required=False, allow_null=True)
