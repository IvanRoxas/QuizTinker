from django.conf import settings
from django.db import models


class ChatMessage(models.Model):
    """A single message in an AI chatbot conversation."""

    ROLE_CHOICES = [
        ('user', 'User'),
        ('assistant', 'Assistant'),
        ('system', 'System'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='chat_messages',
    )
    # Groups messages belonging to the same conversation
    session_id = models.CharField(max_length=64, db_index=True)
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    content = models.TextField()
    # Optional: link this message to a quiz (for review sessions)
    quiz_id = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'chatbot_messages'
        ordering = ['created_at']

    def __str__(self):
        return f'[{self.role}] {self.user.username} ({self.session_id[:8]}…): {self.content[:60]}'
