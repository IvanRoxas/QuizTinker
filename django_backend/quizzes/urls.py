from django.urls import path

from . import views

urlpatterns = [
    path('quizzes/', views.quiz_list_create_view, name='quiz-list-create'),
    path('quizzes/<int:quiz_id>/', views.quiz_detail_view, name='quiz-detail'),
    path('quizzes/<int:quiz_id>/take/', views.quiz_take_view, name='quiz-take'),
    path('quizzes/<int:quiz_id>/start/', views.quiz_start_view, name='quiz-start'),
    path('quizzes/<int:quiz_id>/submit/', views.quiz_submit_view, name='quiz-submit'),
    path('quizzes/<int:quiz_id>/attempts/<int:attempt_id>/', views.quiz_attempt_result_view, name='quiz-attempt-result'),
    path('quizzes/<int:quiz_id>/attempts/<int:attempt_id>/save/', views.quiz_attempt_patch_view, name='quiz-attempt-patch'),
    path('quizzes/<int:quiz_id>/unpublish/', views.quiz_unpublish_view, name='quiz-unpublish'),
    path('quizzes/<int:quiz_id>/items/', views.quiz_item_list_create_view, name='quiz-item-list-create'),
    path('quizzes/<int:quiz_id>/items/<int:item_id>/', views.quiz_item_detail_view, name='quiz-item-detail'),
    path('quizzes/<int:quiz_id>/items/reorder/', views.quiz_item_reorder_view, name='quiz-item-reorder'),
]
