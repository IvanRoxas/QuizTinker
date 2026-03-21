from django.urls import path
from . import views

urlpatterns = [
    path('chat/',    views.chat_view,    name='chatbot-chat'),
    path('upload/',  views.upload_view,  name='chatbot-upload'),
    path('history/', views.history_view, name='chatbot-history'),
    path('sessions/', views.sessions_list_view, name='chatbot-sessions'),
    path('keywords/', views.keywords_view, name='chatbot-keywords'),

    path("session/<str:session_id>/",      views.delete_view,        name="delete_session"),
    path("message/<int:message_id>/",      views.delete_view,        name="delete_message"),
]
