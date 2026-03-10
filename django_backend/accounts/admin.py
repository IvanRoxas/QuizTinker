from django.contrib import admin
from django import forms
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserCreationForm, UserChangeForm
from .models import User, Friendship, Notification


class CustomUserCreationForm(UserCreationForm):
    first_name = forms.CharField(max_length=255, required=False)
    last_name = forms.CharField(max_length=255, required=False)
    email = forms.EmailField(required=True)

    class Meta(UserCreationForm.Meta):
        model = User
        fields = UserCreationForm.Meta.fields + ('email', 'first_name', 'last_name')


class CustomUserChangeForm(UserChangeForm):
    class Meta:
        model = User
        fields = '__all__'
        field_classes = UserChangeForm.Meta.field_classes


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = CustomUserChangeForm
    add_form = CustomUserCreationForm
    list_display = ('username', 'email', 'first_name', 'last_name', 'is_staff')
    search_fields = ('username', 'email', 'first_name', 'last_name')
    list_filter = ('is_staff', 'is_superuser', 'is_active')
    
    # Base fieldsets for editing
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Profile Extras', {'fields': ('avatar_url', 'banner_url', 'status', 'bio')}),
    )

    # Override add_fieldsets to avoid usable_password field issue
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('username', 'password1', 'password2'),
        }),
        ('Personal Info', {'fields': ('email', 'first_name', 'last_name')}),
    )
    
    def get_form(self, request, obj=None, **kwargs):
        """
        Override get_form to handle the usable_password field issue.
        """
        if obj is None:
            # For add form, use our custom form directly
            kwargs['form'] = self.add_form
            return super().get_form(request, obj, **kwargs)
        else:
            # For change form, use our custom change form
            kwargs['form'] = self.form
            return super().get_form(request, obj, **kwargs)


@admin.register(Friendship)
class FriendshipAdmin(admin.ModelAdmin):
    list_display = ('user', 'friend', 'status', 'created_at')
    search_fields = ('user__username', 'friend__username')
    list_filter = ('status', 'created_at')
    readonly_fields = ('created_at',)


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('user', 'sender', 'notification_type', 'read_at', 'created_at')
    search_fields = ('user__username', 'sender__username', 'notification_type')
    list_filter = ('notification_type', 'created_at', 'read_at')
    readonly_fields = ('created_at',)
