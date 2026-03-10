from django.db.models import Q
import logging

logger = logging.getLogger(__name__)
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response

from django.utils import timezone
from .models import Quiz, QuizAttempt, QuizItem
from .serializers import QuizSerializer, QuizItemSerializer, QuizStudentSerializer, QuizSubmissionSerializer

@api_view(['GET', 'POST'])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def quiz_list_create_view(request):
    if request.method == 'GET':
        qs = Quiz.objects.select_related('author')
        
        quiz_status = request.query_params.get('status')
        if quiz_status:
            qs = qs.filter(status=quiz_status)

        mine = request.query_params.get('mine')
        if mine and mine.lower() in ('true', '1'):
            qs = qs.filter(author=request.user)

        search = request.query_params.get('search')
        if search:
            qs = qs.filter(title__icontains=search)

        # LMS Visibility Logic:
        # 1. Author can see everything.
        # 2. 'private': only author.
        # 3. 'all_friends': author + any user who is a friend.
        # 4. 'specific_friends': author + users in shared_with.
        
        # We'll build a Q object for complex visibility
        visibility_q = Q(author=request.user)
        
        # Published & All Friends: shown if request.user is a friend of author
        # (Friendship logic usually requires a join or subquery)
        from accounts.models import Friendship
        friend_ids = Friendship.objects.filter(
            Q(user=request.user, status='accepted') | Q(friend=request.user, status='accepted')
        ).values_list('user_id', 'friend_id')
        
        flattened_friends = set()
        for u_id, f_id in friend_ids:
            flattened_friends.add(u_id)
            flattened_friends.add(f_id)
        if request.user.id in flattened_friends:
            flattened_friends.remove(request.user.id)

        # Filter:
        # - Published & Shared with All Friends (if user is friend)
        visibility_q |= Q(status='published', availability='all_friends', author_id__in=flattened_friends)
        # - Published & Shared with Specific Friends (if user is in shared_with)
        visibility_q |= Q(status='published', availability='specific_friends', shared_with=request.user)
        
        qs = qs.filter(visibility_q).distinct()

        serializer = QuizSerializer(qs, many=True, context={'request': request})
        return Response({'quizzes': serializer.data})

    # POST
    serializer = QuizSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save(author=request.user)
    return Response({'quiz': serializer.data}, status=status.HTTP_201_CREATED)

@api_view(['GET', 'PUT', 'DELETE'])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def quiz_detail_view(request, quiz_id):
    try:
        quiz = Quiz.objects.select_related('author').get(id=quiz_id)
    except Quiz.DoesNotExist:
        return Response({'message': 'Quiz not found.'}, status=status.HTTP_404_NOT_FOUND)

    # LMS Access Control: Blocking expired quizzes unless author or superuser
    if quiz.author != request.user and not request.user.is_superuser and quiz.deadline and timezone.now() > quiz.deadline:
        return Response({'message': 'This quiz has expired.', 'expired': True}, status=status.HTTP_403_FORBIDDEN)

    if request.method == 'GET':
        serializer = QuizSerializer(quiz, context={'request': request})
        return Response({'quiz': serializer.data})

    if quiz.author != request.user and not request.user.is_superuser:
        return Response({'message': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    if request.method == 'PUT':
        serializer = QuizSerializer(quiz, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'quiz': serializer.data})

    if request.method == 'DELETE':
        quiz.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

@api_view(['GET'])
def quiz_take_view(request, quiz_id):
    try:
        quiz = Quiz.objects.get(id=quiz_id)
    except Quiz.DoesNotExist:
        return Response({'message': 'Quiz not found.'}, status=status.HTTP_404_NOT_FOUND)

    # Check deadline: Allow author or superuser to bypass
    if quiz.deadline and timezone.now() > quiz.deadline and not quiz.allow_late_submissions:
        if quiz.author != request.user and not request.user.is_superuser:
            return Response({'message': 'This quiz has expired.', 'expired': True}, status=status.HTTP_403_FORBIDDEN)
        
    # Check attempts: Lock them out ONLY if all allowed attempts are fully completed.
    # If they have an open attempt, they should still be able to fetch the quiz payload.
    completed_attempts = QuizAttempt.objects.filter(quiz=quiz, user=request.user, end_time__isnull=False).count()
    open_attempt = QuizAttempt.objects.filter(quiz=quiz, user=request.user, end_time__isnull=True).first()
    
    if completed_attempts >= quiz.attempts_allowed and not open_attempt:
        if quiz.author != request.user and not request.user.is_superuser:
            latest = QuizAttempt.objects.filter(quiz=quiz, user=request.user, end_time__isnull=False).order_by('-end_time').first()
            return Response({
                'message': 'You have reached the maximum number of attempts allowed.',
                'max_attempts_reached': True,
                'latest_attempt_id': latest.id if latest else None
            }, status=status.HTTP_403_FORBIDDEN)

    serializer = QuizStudentSerializer(quiz, context={'request': request})
    
    # Include both completed and total taking context
    total_attempts_taken = completed_attempts + (1 if open_attempt else 0)
    
    return Response({
        'quiz': serializer.data, 
        'attempts_taken': completed_attempts,
        'has_open_attempt': bool(open_attempt)
    })

@api_view(['POST'])
def quiz_start_view(request, quiz_id):
    try:
        quiz = Quiz.objects.get(id=quiz_id)
    except Quiz.DoesNotExist:
        return Response({'message': 'Quiz not found.'}, status=status.HTTP_404_NOT_FOUND)

    # Check for an already open attempt
    open_attempt = QuizAttempt.objects.filter(quiz=quiz, user=request.user, end_time__isnull=True).first()
    if open_attempt:
        return Response({'message': 'Resumed existing attempt.', 'attempt_id': open_attempt.id}, status=status.HTTP_200_OK)

    # Re-verify attempts before creating a brand new start record
    completed_attempts = QuizAttempt.objects.filter(quiz=quiz, user=request.user, end_time__isnull=False).count()
    if completed_attempts >= quiz.attempts_allowed:
        if quiz.author != request.user and not request.user.is_superuser:
            return Response({'message': 'Max attempts reached.'}, status=status.HTTP_403_FORBIDDEN)
        
    # Create the attempt record
    attempt = QuizAttempt.objects.create(
        quiz=quiz,
        user=request.user,
        # score will be updated on submit
    )
    
    return Response({'message': 'Quiz started.', 'attempt_id': attempt.id}, status=status.HTTP_201_CREATED)

@api_view(['POST'])
def quiz_submit_view(request, quiz_id):
    import logging
    logger = logging.getLogger(__name__)
    logger.warning(f"[SUBMIT DEBUG] user={request.user}, user_id={request.user.id if request.user.is_authenticated else 'ANON'}, quiz_id={quiz_id}")

    try:
        quiz = Quiz.objects.prefetch_related('items').get(id=quiz_id)
    except Quiz.DoesNotExist:
        return Response({'message': 'Quiz not found.'}, status=status.HTTP_404_NOT_FOUND)

    logger.warning(f"[SUBMIT DEBUG] quiz.author_id={quiz.author_id}, is_author={quiz.author == request.user}, is_superuser={request.user.is_superuser if request.user.is_authenticated else False}")

    attempt_id = request.data.get('attempt_id')
    try:
        attempt = QuizAttempt.objects.get(id=attempt_id, quiz=quiz, user=request.user)
    except QuizAttempt.DoesNotExist:
         logger.warning(f"[SUBMIT DEBUG] Attempt not found: attempt_id={attempt_id}")
         return Response({'message': 'Attempt not found or invalid.'}, status=status.HTTP_400_BAD_REQUEST)

    if attempt.end_time:
         logger.warning(f"[SUBMIT DEBUG] Already submitted: attempt_id={attempt_id}, end_time={attempt.end_time}")
         return Response({
             'message': 'This attempt has already been submitted.',
             'already_submitted': True,
             'attempt_id': attempt.id,
             'score': attempt.score,
         }, status=status.HTTP_400_BAD_REQUEST)

    # Security: Check deadline (bypass for author/admin)
    is_late = False
    if quiz.deadline and timezone.now() > quiz.deadline:
        if quiz.author == request.user or request.user.is_superuser:
            is_late = True  # Allow but mark as late
        elif not quiz.allow_late_submissions:
            return Response({'message': 'The deadline for this quiz has passed.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            is_late = True

    # Security: Strict Submission Block for max attempts (bypass for author/admin if limit exists)
    if quiz.attempts_allowed and quiz.attempts_allowed > 0:
        completed_attempts = QuizAttempt.objects.filter(quiz=quiz, user=request.user, end_time__isnull=False).exclude(id=attempt.id).count()
        if completed_attempts >= quiz.attempts_allowed:
            if quiz.author != request.user and not request.user.is_superuser:
                return Response({'message': 'Maximum attempts reached. Submission rejected.'}, status=status.HTTP_400_BAD_REQUEST)

    # Security: Time Expiration Block (bypass for author/admin)
    if quiz.time_limit_minutes:
        limit_seconds = quiz.time_limit_minutes * 60
        elapsed_seconds = (timezone.now() - attempt.start_time).total_seconds()
        
        if elapsed_seconds > (limit_seconds + 10): # 10s grace period
            if quiz.author == request.user or request.user.is_superuser:
                is_late = True
            elif not quiz.allow_late_submissions:
                return Response({
                    'error': 'Submission failed.',
                    'detail': f'Time limit exceeded by {int(elapsed_seconds - limit_seconds)} seconds.'
                }, status=status.HTTP_400_BAD_REQUEST)
            else:
                is_late = True

    # Validate payload
    serializer = QuizSubmissionSerializer(data=request.data)
    if not serializer.is_valid():
        print("Serializer Errors:", serializer.errors)  # Debug print as requested
        logger.warning(f"[SUBMIT DEBUG] Serializer validation failed: {serializer.errors}")
        return Response({'message': 'Invalid submission payload.', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

    student_answers = serializer.validated_data.get('answers', {})
    time_taken_seconds = serializer.validated_data.get('time_taken_seconds')
    
    # Calculate score server-side
    total_score = 0
    calculated_answers = {} # Save a detailed breakdown for the DB
    
    for item in quiz.items.all():
        str_item_id = str(item.id)
        student_ans = student_answers.get(str_item_id)
        is_correct = False
        points_earned = 0
        
        if student_ans is not None:
             if item.type == 'identification':
                 # Exact match (case insensitive)
                 if str(student_ans).strip().lower() == str(item.correct_answer).strip().lower():
                     is_correct = True
             elif item.type == 'single_choice':
                 # student_ans should be the index of the choice
                 try:
                     idx = int(student_ans)
                     if 0 <= idx < len(item.choices) and item.choices[idx].get('is_correct'):
                         is_correct = True
                 except (ValueError, TypeError):
                     pass
             elif item.type == 'multiple_answer':
                 # student_ans should be a list of indices
                 if isinstance(student_ans, list):
                     correct_indices = [i for i, c in enumerate(item.choices) if c.get('is_correct')]
                     if sorted([int(i) for i in student_ans]) == sorted(correct_indices):
                         is_correct = True
             elif item.type == 'true_false':
                 # student_ans is boolean
                 if str(student_ans).lower() == str(item.tf_correct).lower():
                     is_correct = True
             elif item.type == 'matching':
                 # student_ans should be dict mapping left -> right
                 if isinstance(student_ans, dict):
                     correct_pairs = {p.get('left'): p.get('right') for p in item.meta.get('pairs', [])}
                     if student_ans == correct_pairs:
                         is_correct = True
             elif item.type == 'ordering':
                 # student_ans is list of strings
                 if isinstance(student_ans, list):
                     if student_ans == item.meta.get('order', []):
                         is_correct = True
                         
        if is_correct:
             points_earned = item.points
             total_score += points_earned
             
        calculated_answers[str_item_id] = {
             'student_answer': student_ans,
             'is_correct': is_correct,
             'points_earned': points_earned
        }
    
    # Update attempt
    if is_late and quiz.late_penalty_percentage > 0:
        penalty = (quiz.late_penalty_percentage / 100.0) * total_score
        total_score = max(0, total_score - penalty)

    attempt.score = total_score
    attempt.is_late = is_late
    attempt.end_time = timezone.now()
    attempt.answers = calculated_answers
    
    # Server-side calculation of time taken
    actual_time_taken = int((attempt.end_time - attempt.start_time).total_seconds())
    attempt.time_taken_seconds = actual_time_taken
    
    attempt.save()
    
    return Response({
        'message': 'Submission successful!',
        'score': total_score,
        'is_late': is_late,
        'attempt_id': attempt.id
    }, status=status.HTTP_201_CREATED)

@api_view(['PATCH'])
def quiz_attempt_patch_view(request, quiz_id, attempt_id):
    """Auto-save answers without submitting the quiz."""
    try:
        attempt = QuizAttempt.objects.get(id=attempt_id, quiz_id=quiz_id, user=request.user)
    except QuizAttempt.DoesNotExist:
        return Response({'message': 'Attempt not found.'}, status=status.HTTP_404_NOT_FOUND)

    if attempt.end_time:
        return Response({'message': 'Cannot update a completed attempt.'}, status=status.HTTP_400_BAD_REQUEST)

    answers = request.data.get('answers')
    if answers is not None:
        attempt.answers = answers
        
    # Always update time_taken_seconds server-side
    elapsed = int((timezone.now() - attempt.start_time).total_seconds())
    attempt.time_taken_seconds = elapsed
    attempt.save()

    return Response({
        'message': 'Progress saved.',
        'time_taken_seconds': elapsed
    }, status=status.HTTP_200_OK)

@api_view(['GET'])
def quiz_attempt_result_view(request, quiz_id, attempt_id):
    try:
        quiz = Quiz.objects.prefetch_related('items').get(id=quiz_id)
    except Quiz.DoesNotExist:
        return Response({'message': 'Quiz not found.'}, status=status.HTTP_404_NOT_FOUND)

    try:
        attempt = QuizAttempt.objects.get(id=attempt_id, quiz=quiz)
    except QuizAttempt.DoesNotExist:
        return Response({'message': 'Attempt not found.'}, status=status.HTTP_404_NOT_FOUND)

    if attempt.user != request.user and quiz.author != request.user:
        return Response({'message': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    from django.forms.models import model_to_dict
    
    # 1. Base Attempt Data & Time Tracking
    attempt_data = model_to_dict(attempt, fields=['id', 'score', 'is_late', 'start_time', 'end_time', 'answers'])
    
    time_taken_seconds = 0
    if attempt.start_time and attempt.end_time:
        time_taken_seconds = int((attempt.end_time - attempt.start_time).total_seconds())
    
    attempt_data['time_taken_seconds'] = time_taken_seconds
    
    # 2. Attempts Math & Cheat Prevention Logic
    attempts_used = QuizAttempt.objects.filter(quiz=quiz, user=attempt.user, end_time__isnull=False).count()
    attempts_allowed = quiz.attempts_allowed
    
    deadline_passed = False
    if quiz.deadline and timezone.now() > quiz.deadline:
        deadline_passed = True
        
    cheat_prevention_active = (not quiz.show_answers_at_end) or ((attempts_used < attempts_allowed) and not deadline_passed)
    
    # We always serialize the full quiz, then aggressively strip correct answers if cheat_prevention_active
    quiz_serializer = QuizSerializer(quiz)
    quiz_data = quiz_serializer.data
    
    max_possible_score = sum(item.get('points', 1) for item in quiz_data.get('items', []))
    attempt_data['max_score'] = max_possible_score
    
    if cheat_prevention_active:
        for item in quiz_data.get('items', []):
            item.pop('correct_answer', None)
            item.pop('tf_correct', None)
            
            if 'choices' in item:
                for choice in item['choices']:
                    choice.pop('is_correct', None)
                    
            if 'meta' in item:
                if 'pairs' in item['meta']:
                    # Remove right side of pairs
                    for pair in item['meta']['pairs']:
                        pair.pop('right', None)
                item['meta'].pop('order', None)
                
    # 3. Advanced Analytics (Latest Attempt per Student)
    from django.db.models import Max
    
    # Get all unique students who have completed at least one attempt for this quiz
    student_ids = QuizAttempt.objects.filter(quiz=quiz, end_time__isnull=False).values_list('user', flat=True).distinct()
    
    latest_attempts = []
    for sid in student_ids:
        latest_att = QuizAttempt.objects.filter(quiz=quiz, user_id=sid, end_time__isnull=False).order_by('-end_time').first()
        if latest_att and latest_att.score is not None:
            latest_attempts.append(latest_att)
            
    total_students = len(latest_attempts)
    
    if total_students > 0:
        latest_scores = [att.score for att in latest_attempts]
        class_high = max(latest_scores)
        class_low = min(latest_scores)
        class_mean = sum(latest_scores) / total_students
        
        # Calculate Rank and Leaderboard among latest scores
        # Sort by Score (Desc) then Time (Asc)
        latest_attempts.sort(key=lambda x: (-x.score, x.time_taken_seconds or float('inf')))
        
        leaderboard_data = []
        rank = None
        for index, att in enumerate(latest_attempts):
            r = index + 1
            leaderboard_data.append({
                'rank': r,
                'student_name': att.user.username,
                'score': att.score,
                'time_taken': att.time_taken_seconds
            })
            if att.id == attempt.id:
                rank = r
        
        # Fallback if the current attempt wasn't the latest for this student
        if rank is None:
            rank = sum(1 for att in latest_attempts if att.score > (attempt.score or 0)) + 1
    else:
        class_high = class_low = class_mean = rank = None
        leaderboard_data = []
    # 4. Previous Attempt Score (for Delta calculation)
    previous_attempt = QuizAttempt.objects.filter(
        quiz=quiz,
        user=attempt.user,
        end_time__lt=attempt.end_time
    ).order_by('-end_time').first()
    previous_attempt_score = previous_attempt.score if previous_attempt else None

    analytics_data = {
        'total_students': total_students,
        'class_mean': round(class_mean) if class_mean is not None else None,
        'class_high': class_high,
        'class_low': class_low,
        'rank': rank,
        'previous_attempt_score': previous_attempt_score,
        'leaderboard': leaderboard_data
    }

    return Response({
        'quiz': quiz_data,
        'attempt': attempt_data,
        'attempts_used': attempts_used,
        'attempts_allowed': attempts_allowed,
        'cheat_prevention_active': cheat_prevention_active,
        'analytics': analytics_data
    })

@api_view(['POST'])
def quiz_unpublish_view(request, quiz_id):
    try:
        quiz = Quiz.objects.get(id=quiz_id, author=request.user)
    except Quiz.DoesNotExist:
        return Response({'message': 'Quiz not found or unauthorized.'}, status=status.HTTP_404_NOT_FOUND)

    quiz.status = 'draft'
    quiz.save()
    return Response({'message': 'Quiz reverted to draft.'})

# --- QuizItem APIs ---

@api_view(['GET', 'POST'])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def quiz_item_list_create_view(request, quiz_id):
    try:
        quiz = Quiz.objects.get(id=quiz_id)
    except Quiz.DoesNotExist:
        return Response({'message': 'Quiz not found.'}, status=status.HTTP_404_NOT_FOUND)
        
    if request.method == 'GET':
        items = quiz.items.all().order_by('sort_order', 'id')
        serializer = QuizItemSerializer(items, many=True)
        return Response({'items': serializer.data})
        
    if quiz.author != request.user:
        return Response({'message': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
        
    # POST
    serializer = QuizItemSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save(quiz=quiz)
    return Response({'item': serializer.data}, status=status.HTTP_201_CREATED)

@api_view(['GET', 'PUT', 'DELETE'])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def quiz_item_detail_view(request, quiz_id, item_id):
    try:
        item = QuizItem.objects.get(id=item_id, quiz_id=quiz_id)
    except QuizItem.DoesNotExist:
        return Response({'message': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)
        
    if request.method == 'GET':
        serializer = QuizItemSerializer(item)
        return Response({'item': serializer.data})
        
    if item.quiz.author != request.user:
        return Response({'message': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
        
    if request.method == 'PUT':
        serializer = QuizItemSerializer(item, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'item': serializer.data})
        
    if request.method == 'DELETE':
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

@api_view(['POST'])
def quiz_item_reorder_view(request, quiz_id):
    try:
        quiz = Quiz.objects.get(id=quiz_id, author=request.user)
    except Quiz.DoesNotExist:
        return Response({'message': 'Quiz not found or unauthorized.'}, status=status.HTTP_404_NOT_FOUND)
        
    order_data = request.data
    if not isinstance(order_data, list):
        return Response({'message': 'Expected a list of objects.'}, status=status.HTTP_400_BAD_REQUEST)
        
    item_ids = [str(o.get('id', '')) for o in order_data if o.get('id')]
    items = list(QuizItem.objects.filter(quiz=quiz, id__in=item_ids))
    
    item_dict = {str(item.id): item for item in items}
    items_to_update = []
    
    for obj in order_data:
        str_id = str(obj.get('id'))
        if str_id in item_dict:
            item = item_dict[str_id]
            item.sort_order = obj.get('sort_order', 0)
            items_to_update.append(item)
            
    if items_to_update:
        QuizItem.objects.bulk_update(items_to_update, ['sort_order'])
        
    return Response({'message': 'Order updated successfully.'})
