from django.conf import settings
from django.db import models
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.utils import timezone
from django.db.models.signals import post_save, m2m_changed
from django.dispatch import receiver


class ActiveQuizManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(is_active=True)


class Quiz(models.Model):
    """A quiz created by a user — either manually or via AI."""

    AVAILABILITY_CHOICES = [
        ('private', 'Private'),
        ('all_friends', 'All Friends'),
        ('specific_friends', 'Specific Friends'),
    ]

    STATUS_CHOICES = [
        ('generating', 'Generating'),
        ('draft', 'Draft'),
        ('published', 'Published'),
        ('error', 'Error'),
    ]

    GENERATION_TYPE_CHOICES = [
        ('manual', 'Manual'),
        ('ai', 'AI'),
    ]

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='quizzes',
    )
    title = models.CharField(max_length=255)
    subtitle = models.CharField(max_length=255, blank=True, default='')
    description = models.TextField(blank=True, default='')
    preview_image = models.ImageField(
        upload_to='quiz_covers/',
        blank=True,
        null=True,
    )
    attempts_allowed = models.IntegerField(null=True, blank=True, default=1, help_text="Leave blank or set to 0 for unlimited attempts.")
    time_limit_minutes = models.IntegerField(null=True, blank=True, validators=[MinValueValidator(0)])
    deadline = models.DateTimeField(null=True, blank=True)
    availability = models.CharField(
        max_length=20,
        choices=AVAILABILITY_CHOICES,
        default='private',
    )
    shared_with = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name='shared_quizzes'
    )
    allow_late_submissions = models.BooleanField(default=False)
    late_penalty_percentage = models.FloatField(default=0.0, help_text="Percentage to deduct if submitted late (0-100).")
    can_backtrack = models.BooleanField(default=True, help_text="Allow students to navigate back and forth between questions?")
    show_answers_at_end = models.BooleanField(default=True, help_text="Display correct answers to students after they complete the quiz?")
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default='draft',
    )
    generation_type = models.CharField(
        max_length=10,
        choices=GENERATION_TYPE_CHOICES,
        default='manual',
    )
    category = models.CharField(max_length=50, blank=True, null=True, help_text="For AI generated quizzes")
    specialization = models.CharField(max_length=100, blank=True, null=True, help_text="For AI generated quizzes")
    meta = models.JSONField(default=dict, blank=True, help_text="Stores metadata about AI generation like source files, etc.")
    reference_file_1 = models.FileField(upload_to='quiz_references/', blank=True, null=True)
    reference_file_2 = models.FileField(upload_to='quiz_references/', blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = ActiveQuizManager() # Default manager filters by is_active=True
    all_objects = models.Manager() # Explicit manager to get everything

    class Meta:
        db_table = 'quizzes'
        ordering = ['-updated_at']
        verbose_name_plural = 'Quizzes'
        indexes = [
            models.Index(fields=['author', 'status']),
            models.Index(fields=['status', 'availability']),
            models.Index(fields=['-updated_at']),
        ]

    def __str__(self):
        return f'{self.title} (by {self.author.username})'

    def delete(self, *args, **kwargs):
        """Soft delete: mark as inactive instead of removing from DB."""
        self.is_active = False
        self.save()

    def hard_delete(self, *args, **kwargs):
        """Actually remove from DB if needed."""
        super().delete(*args, **kwargs)

    def clean(self):
        super().clean()
        # Deadline validation removed to allow authors/admins to manage expired quizzes and backdate if needed.

    def save(self, *args, **kwargs):
        if self.pk:
            old_instance = Quiz.objects.get(pk=self.pk)
            if old_instance.status == 'published' and self.status == 'draft':
                # Nuke all attempts and results when reverting to draft
                self.attempts.all().delete()
        
        super().save(*args, **kwargs)


class QuizAttempt(models.Model):
    """Record of a user taking a quiz."""
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name='attempts')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='quiz_attempts')
    score = models.IntegerField(default=0)
    is_late = models.BooleanField(default=False)
    start_time = models.DateTimeField(auto_now_add=True)
    end_time = models.DateTimeField(null=True, blank=True)
    time_taken_seconds = models.IntegerField(null=True, blank=True)
    answers = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'quiz_attempts'
        indexes = [
            models.Index(fields=['quiz', 'user', 'end_time']),
            models.Index(fields=['user', '-start_time']),
        ]

    def __str__(self):
        return f'{self.user.username} attempt at {self.quiz.title}'


class QuizItem(models.Model):
    """An individual question or interactive item within a quiz."""
    QUESTION_TYPES = [
        ('identification', 'Identification'),
        ('single_choice', 'Multiple Choice'),
        ('multiple_answer', 'Multiple Answer'),
        ('true_false', 'True/False'),
        ('matching', 'Matching'),
        ('ordering', 'Ordering'),
    ]

    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name='items')
    question = models.TextField()
    type = models.CharField(max_length=20, choices=QUESTION_TYPES)
    choices = models.JSONField(default=list, blank=True)
    correct_answer = models.CharField(max_length=255, blank=True, default='')
    meta = models.JSONField(default=dict, blank=True)
    tf_correct = models.BooleanField(default=True)
    points = models.IntegerField(default=1, validators=[MinValueValidator(1)])
    sort_order = models.IntegerField(default=0)
    bloom_level = models.CharField(max_length=20, blank=True, null=True)
    media = models.ImageField(upload_to='quiz_items/', blank=True, null=True)

    class Meta:
        db_table = 'quiz_items'
        ordering = ['sort_order', 'id']
        indexes = [
            models.Index(fields=['quiz', 'sort_order']),
        ]

    def __str__(self):
        return f'{self.quiz.title} - Item {self.sort_order}: {self.type}'

# --- Signals for Notifications ---

@receiver(m2m_changed, sender=Quiz.shared_with.through)
def quiz_shared_with_changed(sender, instance, action, pk_set, **kwargs):
    """Notify specific friends when added to shared_with list of a published quiz."""
    if action == "post_add" and instance.status == "published":
        from accounts.models import Notification, User
        for user_id in pk_set:
            deadline_str = f" Deadline: {instance.deadline.strftime('%Y-%m-%d %H:%M')}" if instance.deadline else ""
            Notification.objects.get_or_create(
                user_id=user_id,
                sender=instance.author,
                notification_type='quiz_share',
                data__quiz_id=instance.id,
                defaults={
                    'data': {
                        'quiz_id': instance.id,
                        'message': f"A new quiz '{instance.title}' has been shared with you!{deadline_str}"
                    }
                }
            )

@receiver(post_save, sender=Quiz)
def quiz_published_notification(sender, instance, created, **kwargs):
    """Notify friends when a quiz is published."""
    if instance.status == 'published':
        from accounts.models import Notification, User, Friendship
        from django.db.models import Q
        
        deadline_str = f" Deadline: {instance.deadline.strftime('%Y-%m-%d %H:%M')}" if instance.deadline else ""

        if instance.availability == 'all_friends':
            # Get all friends of the author
            friend_ids = Friendship.objects.filter(
                Q(user=instance.author, status='accepted') | Q(friend=instance.author, status='accepted')
            ).values_list('user_id', 'friend_id')
            
            flattened_friends = set()
            for u_id, f_id in friend_ids:
                flattened_friends.add(u_id)
                flattened_friends.add(f_id)
            if instance.author.id in flattened_friends:
                flattened_friends.remove(instance.author.id)
            
            for friend_id in flattened_friends:
                Notification.objects.get_or_create(
                    user_id=friend_id,
                    sender=instance.author,
                    notification_type='quiz_share',
                    data__quiz_id=instance.id,
                    defaults={
                        'data': {
                            'quiz_id': instance.id,
                            'message': f"A new quiz '{instance.title}' has been shared with all friends!{deadline_str}"
                        }
                    }
                )
        elif instance.availability == 'specific_friends':
            # Also notify specific friends if they were already added before publishing
            for user in instance.shared_with.all():
                Notification.objects.get_or_create(
                    user=user,
                    sender=instance.author,
                    notification_type='quiz_share',
                    data__quiz_id=instance.id,
                    defaults={
                        'data': {
                            'quiz_id': instance.id,
                            'message': f"A new quiz '{instance.title}' has been shared with you!{deadline_str}"
                        }
                    }
                )
