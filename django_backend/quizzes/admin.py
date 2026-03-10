from django.contrib import admin
from django.contrib.auth.models import Group
from .models import Quiz, QuizAttempt, QuizItem

admin.site.unregister(Group)

class QuizItemInline(admin.StackedInline):
    model = QuizItem
    fields = ('sort_order', 'type', 'question', 'choices', 'correct_answer', 'tf_correct', 'meta', 'points', 'media')
    extra = 0

@admin.register(Quiz)
class QuizAdmin(admin.ModelAdmin):
    list_display = (
        'title', 'author', 'status', 'availability', 
        'deadline', 'is_active', 'late_penalty_percentage', 'generation_type'
    )
    list_filter = ('status', 'availability', 'deadline', 'is_active', 'generation_type')
    search_fields = ('title', 'author__username')
    filter_horizontal = ('shared_with',)
    inlines = [QuizItemInline]
    actions = ['soft_delete_quizzes', 'hard_delete_quizzes']

    fieldsets = (
        ('General Info', {
            'fields': ('title', 'subtitle', 'description', 'author')
        }),
        ('Settings', {
            'fields': (
                'attempts_allowed', 'time_limit_minutes', 'deadline', 
                'availability', 'shared_with', 'allow_late_submissions', 
                'late_penalty_percentage', 'is_active', 'status', 'generation_type'
            )
        }),
        ('Media', {
            'fields': ('preview_image',)
        }),
    )

    def get_queryset(self, request):
        """Ensure admin sees all quizzes, including soft-deleted ones."""
        return self.model.all_objects.all()

    @admin.action(description="Soft delete selected quizzes")
    def soft_delete_quizzes(self, request, queryset):
        """Custom action to mark quizzes as inactive instead of deleting them."""
        queryset.update(is_active=False)
        self.message_user(request, "Selected quizzes have been marked as inactive.")

    @admin.action(description="PERMANENTLY Delete Selected Quizzes (Cannot be undone)")
    def hard_delete_quizzes(self, request, queryset):
        """Action to permanently delete quizzes from the database."""
        deleted_count, _ = queryset.delete()
        self.message_user(request, f"Successfully permanently deleted {deleted_count} quizzes.")

@admin.register(QuizAttempt)
class QuizAttemptAdmin(admin.ModelAdmin):
    list_display = ('quiz', 'user', 'score', 'is_late', 'time_taken_seconds', 'start_time', 'end_time')
    list_filter = ('is_late', 'start_time', 'end_time')
    search_fields = ('quiz__title', 'user__username')

@admin.register(QuizItem)
class QuizItemAdmin(admin.ModelAdmin):
    list_display = ('quiz', 'sort_order', 'type', 'question', 'points')
    list_filter = ('type', 'quiz')
    search_fields = ('question', 'quiz__title')
    ordering = ('quiz', 'sort_order')

# Disable the default hard-delete action globally for this admin site
admin.site.disable_action('delete_selected')
