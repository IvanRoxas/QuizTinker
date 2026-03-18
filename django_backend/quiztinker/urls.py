"""quiztinker URL Configuration"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

import os

urlpatterns = [
    path(os.getenv('ADMIN_URL', 'qt-secret-portal/'), admin.site.urls),
    path('api/', include('accounts.urls')),
    path('api/', include('quizzes.urls')),
    path('api/chatbot/', include('chatbot.urls')),
]

# Serve media files during development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
