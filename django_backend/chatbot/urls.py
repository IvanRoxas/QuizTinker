from django.urls import path
from . import views

urlpatterns = [
    path('chat/',    views.chat_view,    name='chatbot-chat'),
    path('upload/',  views.upload_view,  name='chatbot-upload'),
    path('history/', views.history_view, name='chatbot-history'),
    path('clear/',   views.clear_view,   name='chatbot-clear'),
]
