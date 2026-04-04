"""quiztinker URL Configuration"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.db import connection
from django.http import JsonResponse
from django.urls import include, path

import os


def health_check(request):
    """Lightweight health probe for load balancers."""
    try:
        connection.ensure_connection()
        return JsonResponse({"status": "ok"})
    except Exception:
        return JsonResponse({"status": "error"}, status=503)


urlpatterns = [
    path('health/', health_check),
    path(os.getenv('ADMIN_URL', 'qt-secret-portal/'), admin.site.urls),
    path('api/', include('accounts.urls')),
    path('api/', include('quizzes.urls')),
    path('api/chatbot/', include('chatbot.urls')),
]

# Serve media files during development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
