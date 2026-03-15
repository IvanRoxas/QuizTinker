import json
import logging
import traceback

from django.conf import settings
from django.db.models import Q
from django.forms.models import model_to_dict
from django.utils import timezone

from rest_framework import status
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response

import google.generativeai as genai

from .models import Quiz, QuizAttempt, QuizItem
from .serializers import (
    QuizSerializer,
    QuizItemSerializer,
    QuizStudentSerializer,
    QuizSubmissionSerializer,
)

logger = logging.getLogger(__name__)

_LET_COVERAGE = {
    "GenEd": {
        "description": (
            "General Education — covers English communication, Filipino, Mathematics, "
            "Science & Technology, Social Science, and values/philosophy topics."
        ),
        "question_traits": [
            "STRICT CONSTRAINT: The question stem must be concise, limited to 1–2 sentences only.",
            "Focus on direct measurement of reading comprehension, grammar, and core concepts.",
            "Questions integrate real-world contexts relevant to teaching and Filipino society.",
            "Distractors are plausible near-synonyms; Stems are complete sentences; options are parallel.",
        ],
    },
    "ProfEd": {
        "description": (
            "Professional Education — covers Principles of Teaching, Child & Adolescent "
            "Development, Assessment, Curriculum, and Educational Laws."
        ),
        "question_traits": [
            "STRICT CONSTRAINT: The question stem must be a classroom scenario limited to 1–3 sentences.",
            "Prioritize application/analysis (Bloom's levels 3–4) over pure recall.",
            "References Filipino educational policy (RA 10533, RA 7836, etc.) and pedagogical action.",
            "Distractors are all defensible, but only one is the BEST or MOST appropriate answer.",
        ],
    },
    "Filipino": {
        "description": (
            "Specialisation: Filipino — covers Philippine literature (prose, poetry, drama), "
            "language structure (grammar, syntax, phonology), rhetoric, and the history of "
            "the Filipino language."
        ),
        "question_traits": [
            "Uses authentic literary passages or linguistic examples as stimulus material.",
            "Tests knowledge of literary devices, authors, periods, and regional literatures.",
            "Grammar questions cover Filipino grammar rules (mga panlapi, panghalip, etc.).",
            "At least two questions per set test literary analysis at the evaluative level.",
        ],
    },
    "English": {
        "description": (
            "Specialisation: English — covers literature (British, American, World, Philippine "
            "in English), linguistics, grammar, composition, and communication."
        ),
        "question_traits": [
            "Includes inferential reading-comprehension stems based on short passages.",
            "Grammar questions test error recognition and sentence correction.",
            "Literature questions cover major works, literary devices, and thematic analysis.",
            "Vocabulary questions use the word in context rather than isolated definitions.",
        ],
    },
    "Mathematics": {
        "description": (
            "Specialisation: Mathematics — covers Algebra, Geometry, Trigonometry, "
            "Statistics & Probability, Calculus, Number Theory, and Math teaching methods."
        ),
        "question_traits": [
            "Problems are computation or proof-based; include at least 3 word problems per 10 items.",
            "Distractors for computation items are common computational errors (sign mistake, wrong formula).",
            "Answers are expressed in simplified form; options must be mutually exclusive.",
            "Two items per set test understanding of mathematical concepts or pedagogy.",
        ],
    },
    "Science": {
        "description": (
            "Specialisation: Science — covers Biology, Chemistry, Physics, and Earth Science "
            "as aligned to the K-12 curriculum and LET board coverage."
        ),
        "question_traits": [
            "Integrates the scientific method and data interpretation where applicable.",
            "Includes at least one diagram-description or data-table scenario per 10 items.",
            "Concepts are tied to LET competency codes; Bloom's levels range from knowledge to evaluation.",
            "Distractors exploit common misconceptions (e.g., heavier objects fall faster).",
        ],
    },
    "Social Studies": {
        "description": (
            "Specialisation: Social Studies — covers Philippine History, World History, "
            "Geography, Economics, Political Science, and Sociology."
        ),
        "question_traits": [
            "Includes primary-source analysis or map/graph reading scenarios.",
            "Tests cause-effect reasoning and historical significance.",
            "Philippine topics cover the Spanish, American, Japanese periods and post-independence era.",
            "At least one item per set requires evaluation of multiple historical interpretations.",
        ],
    },
    "MAPEH": {
        "description": (
            "Specialisation: MAPEH — covers Music, Arts, Physical Education, and Health "
            "as defined in the K-12 curriculum."
        ),
        "question_traits": [
            "Balances the four strands; ensure at least 2 items per strand per 10 questions.",
            "Music items reference notation, Philippine folk music, and world music forms.",
            "PE items test principles of fitness, safety guidelines, and game rules.",
            "Health items integrate CHED/DepEd health frameworks and health promotion concepts.",
        ],
    },
    "TLE": {
        "description": (
            "Specialisation: Technology and Livelihood Education — covers Home Economics, "
            "Industrial Arts, Agri-Fishery Arts, and ICT."
        ),
        "question_traits": [
            "Uses practical, hands-on scenario stems aligned to TESDA competency standards.",
            "Tests safety procedures, technical terms, and process sequencing.",
            "ICT items reference current digital tools and online safety principles.",
            "At least two items require process analysis or troubleshooting judgment.",
        ],
    },
    "Values Education": {
        "description": (
            "Specialisation: Values Education / Good Manners and Right Conduct — covers "
            "character formation, Edukasyon sa Pagpapakatao (EsP), and ethics."
        ),
        "question_traits": [
            "Presents moral dilemmas or scenario-based ethical decisions.",
            "References Filipino values (bayanihan, pakikipagkapwa) and universal ethics.",
            "Questions probe application and synthesis, not mere recall of definitions.",
            "Distractors represent partial truths or culturally common but incorrect positions.",
        ],
    },
}

_DEFAULT_COVERAGE = {
    "description": "LET Board Examination — general academic content.",
    "question_traits": [
        "Questions are clear, unambiguous, and at the appropriate cognitive level.",
        "Distractors are plausible and parallel in form.",
        "Stems are stated as problems, not trivia.",
    ],
}

_BLOOM_DISTRIBUTION = """\
Distribute the questions across these Bloom's Taxonomy cognitive levels
(adjust counts proportionally when num_questions ≠ 10):
  • 20 % — Knowledge / Remembering   (recall facts, definitions, dates)
  • 30 % — Comprehension / Understanding (explain, interpret, classify)
  • 30 % — Application / Applying    (use knowledge in a new context or scenario)
  • 20 % — Analysis / Analyzing      (break down, differentiate, compare)\
"""

_GENERAL_LET_RULES = """\
STRICT LET Question-Writing Rules — follow ALL of these without exception:
 1. Each stem is a complete question or incomplete statement — never a trivial
    fill-in-the-blank with the blank at the very start.
 2. Options A–D are mutually exclusive; only ONE is definitively correct.
 3. BANNED options: "All of the above", "None of the above", "Both A and B".
 4. Options must be parallel in grammar and roughly equal in length.
    Do NOT make the correct answer conspicuously longer than the distractors.
 5. Avoid absolute words (always, never, all, none) inside options.
 6. Do NOT repeat key words from the stem verbatim inside the correct answer
    (gives it away).
 7. Each distractor must target a specific misconception or error that real
    Filipino teacher-candidates commonly make.
 8. Questions must be culturally relevant to the Philippine educational context
    where applicable.
 9. Avoid trick questions, double negatives, and ambiguous pronouns.
10. Reading level must match the target board — ProfEd uses more scenario-based
    stems; GenEd uses more direct-knowledge stems.
11. Distractors must represent common student mistakes, not random wrong answers.
12. The correct answer must NOT be the longest option.
13. Options must be conceptually close to each other.
14. If the subject of the request is not related to 'The Life and Works of Rizal' 
    or any 'Filipino' subjects, you must generate all questions and content strictly 
    in English. For Rizal-related or Filipino subjects, you may use Filipino as appropriate.\
"""

def _build_let_prompt(
    category: str,
    specialization: str,
    prompt_text: str,
    num_questions: int = 10,
) -> str:
    """Return a production-grade LET prompt for Gemini."""

    board_info = (
        _LET_COVERAGE.get(specialization)
        or _LET_COVERAGE.get(category)
        or _DEFAULT_COVERAGE
    )

    traits_block = "\n".join(f"  • {t}" for t in board_info["question_traits"])

    return f"""
You are a senior Philippine LET (Licensure Examination for Teachers) board exam
item writer with 15+ years of professional test-development experience.

Your responsibility is to create **high-quality board-exam multiple choice questions**
that meet the psychometric standards of professional licensure examinations.

════════════════════════════════════════════
BOARD COVERAGE
════════════════════════════════════════════

Category: {category}
Specialization: {specialization}

{board_info['description']}

Subject Requirements:
{traits_block}

════════════════════════════════════════════
TOPIC
════════════════════════════════════════════

{prompt_text.strip()}

════════════════════════════════════════════
COGNITIVE DISTRIBUTION (Bloom's Taxonomy)
════════════════════════════════════════════

Distribute the questions approximately as follows:

20%  Knowledge
30%  Comprehension
30%  Application
20%  Analysis

Ensure the distribution is respected as closely as possible.

════════════════════════════════════════════
DISTRACTOR DESIGN RULES
════════════════════════════════════════════

Every incorrect option must represent a **realistic misconception**.

Good distractors include:
• common student misunderstandings
• wrong formulas
• incorrect interpretations
• reversed cause-effect relationships
• plausible but incomplete explanations

Avoid:
• obviously wrong answers
• jokes or absurd responses
• answers that are much shorter/longer than others
• duplicate meaning across options

════════════════════════════════════════════
ANTI-HALLUCINATION RULES
════════════════════════════════════════════

If the prompt lacks sufficient context:

• rely on widely accepted academic knowledge
• avoid fabricating facts
• do NOT invent fake authors, laws, or studies
• avoid highly obscure trivia

Questions must be **factually reliable for teacher certification exams**.

════════════════════════════════════════════
QUALITY CHECK BEFORE OUTPUT
════════════════════════════════════════════

Before returning the final JSON:

1. Verify only ONE correct answer exists.
2. Ensure options are parallel in grammar.
3. Ensure distractors are plausible.
4. Ensure Bloom distribution roughly matches targets.
5. Ensure explanation is concise and accurate.

════════════════════════════════════════════
OUTPUT FORMAT (STRICT)
════════════════════════════════════════════

Return ONLY valid JSON.

DO NOT include:
• markdown
• code blocks
• comments
• explanations outside JSON

Output must start with "[" and end with "]".

Each object must follow EXACTLY this schema:

{{
  "question": "Full question stem",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "answer": "Exact correct option text",
  "bloom_level": "Knowledge|Comprehension|Application|Analysis",
  "explanation": "One sentence explanation without quotation marks"
}}

Additional rules:

• Explanation must be ONE sentence only.
• No quotation marks inside explanation.
• No line breaks inside any string.
• Each string must be on a single line.



Return exactly {num_questions} questions.
"""

def _similarity(a: str, b: str) -> float:
    """Rough 0–1 character-level similarity — used as fuzzy answer fallback."""
    a, b = a.strip().lower(), b.strip().lower()
    if not a or not b:
        return 0.0
    return sum(ca == cb for ca, cb in zip(a, b)) / max(len(a), len(b))

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
        visibility_q = Q(author=request.user)

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

        visibility_q |= Q(status='published', availability='all_friends', author_id__in=flattened_friends)
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

    if (
        quiz.author != request.user
        and not request.user.is_superuser
        and quiz.deadline
        and timezone.now() > quiz.deadline
    ):
        return Response(
            {'message': 'This quiz has expired.', 'expired': True},
            status=status.HTTP_403_FORBIDDEN,
        )

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

@api_view(['POST'])
def ai_generate_quiz(request):
    quiz = None
    try:
        data = request.data

        title            = data.get('title', 'AI Generated Quiz')
        subtitle         = data.get('subtitle', '')
        attempts_allowed = data.get('attempts_allowed', 1)
        availability     = data.get('availability', 'private')
        deadline         = data.get('deadline')
        category         = data.get('category', 'GenEd')
        specialization   = data.get('specialization', 'Filipino')
        prompt_text      = data.get('prompt', '').strip()
        num_questions    = int(data.get('num_questions', 10))

        num_questions = max(5, min(50, num_questions))

        if not prompt_text:
            return Response(
                {'message': 'A topic prompt is required to generate quiz items.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        quiz = Quiz.objects.create(
            author           = request.user,
            title            = title,
            subtitle         = subtitle,
            attempts_allowed = attempts_allowed,
            availability     = availability,
            deadline         = deadline,
            status           = 'draft',
            generation_type  = 'ai',
        )

        prompt_str = _build_let_prompt(
            category       = category,
            specialization = specialization,
            prompt_text    = prompt_text,
            num_questions  = num_questions,
        )

        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel("gemini-2.5-flash")

        generation_config = genai.types.GenerationConfig(
            temperature=0.25,
            top_p=0.9,
            top_k=40,
            max_output_tokens=8192,
            response_mime_type="application/json"
        )

        response = model.generate_content(
            prompt_str,
            generation_config=generation_config
        )

        response_text = response.text.strip()
        if not response_text:
            raise ValueError("Gemini returned an empty response.")

        for fence in ('```json', '```'):
            if response_text.startswith(fence):
                response_text = response_text[len(fence):]
        if response_text.endswith('```'):
            response_text = response_text[:-3]
        response_text = response_text.strip()

        import re
        try:
            questions_data = json.loads(response_text)

        except json.JSONDecodeError:
            logger.warning("[AI QUIZ] Attempting JSON repair")

            cleaned = response_text

            cleaned = cleaned.replace("```json", "")
            cleaned = cleaned.replace("```", "")

            cleaned = re.sub(r",\s*}", "}", cleaned)
            cleaned = re.sub(r",\s*]", "]", cleaned)

            cleaned = cleaned.replace("\n", " ")

            cleaned = cleaned.strip()

            if not cleaned.startswith("["):
                cleaned = "[" + cleaned

            if not cleaned.endswith("]"):
                cleaned = cleaned + "]"

            questions_data = json.loads(cleaned)

        if not isinstance(questions_data, list):
            raise ValueError("Gemini returned invalid JSON structure (expected list).")
        
        questions_data = questions_data[:num_questions]

        from collections import Counter

        levels = [q.get("bloom_level") for q in questions_data if isinstance(q, dict)]
        dist = Counter(levels)

        logger.info(f"[AI QUIZ] Bloom distribution: {dict(dist)}")

        created_items = []
        for i, q in enumerate(questions_data):
            question_text = q.get('question', '').strip()
            options       = q.get('options', [])
            answer_text   = q.get('answer', '').strip()
            explanation   = q.get('explanation', '')
            bloom_level   = q.get('bloom_level', '')

            if not question_text or len(options) != 4:
                logger.warning(f"[AI QUIZ] Skipping malformed question at index {i}: {q}")
                continue

            choices = [
                {'text': opt.strip(), 'is_correct': opt.strip() == answer_text}
                for opt in options
                if opt and opt.strip()
            ]

            # Guard: ensure exactly one correct choice
            correct_count = sum(c['is_correct'] for c in choices)

            if correct_count != 1:

                best = max(
                    choices,
                    key=lambda c: _similarity(c['text'], answer_text)
                )

                for c in choices:
                    c['is_correct'] = False

                best['is_correct'] = True

                logger.warning(
                    f"[AI QUIZ] Fixed incorrect answer mapping at index {i}"
                )

            meta = {}
            if bloom_level:
                meta['bloom_level'] = bloom_level
            if explanation:
                meta['explanation'] = explanation

            create_kwargs = dict(
                quiz       = quiz,
                question   = question_text,
                type       = 'single_choice',
                choices    = choices,
                points     = 1,
                sort_order = i,
            )
            if meta:
                create_kwargs['meta'] = meta

            item = QuizItem.objects.create(**create_kwargs)
            created_items.append(item)

        if not created_items:
            quiz.delete()
            return Response(
                {'message': 'The AI returned no valid questions. Please try a different prompt.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        logger.info(
            f"[AI QUIZ] quiz_id={quiz.id} | {len(created_items)} items created "
            f"| category={category} | specialization={specialization}"
        )

        return Response(
            {
                'id'             : quiz.id,
                'message'        : f'Successfully generated {len(created_items)} LET-ready questions.',
                'questions_count': len(created_items),
            },
            status=status.HTTP_201_CREATED,
        )

    except json.JSONDecodeError as e:
        logger.error(f"[AI QUIZ] JSON parse error: {e}")
        if quiz:
            quiz.delete()
        return Response(
            {'message': 'The AI returned malformed JSON. Please try again.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    except Exception as e:
        traceback.print_exc()
        if quiz:
            try:
                quiz.delete()
            except Exception:
                pass
        return Response(
            {'message': f'Failed to generate AI quiz: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

@api_view(['GET'])
def quiz_take_view(request, quiz_id):
    try:
        quiz = Quiz.objects.get(id=quiz_id)
    except Quiz.DoesNotExist:
        return Response({'message': 'Quiz not found.'}, status=status.HTTP_404_NOT_FOUND)

    if quiz.deadline and timezone.now() > quiz.deadline and not quiz.allow_late_submissions:
        if quiz.author != request.user and not request.user.is_superuser:
            return Response(
                {'message': 'This quiz has expired.', 'expired': True},
                status=status.HTTP_403_FORBIDDEN,
            )

    completed_attempts = QuizAttempt.objects.filter(
        quiz=quiz, user=request.user, end_time__isnull=False
    ).count()
    open_attempt = QuizAttempt.objects.filter(
        quiz=quiz, user=request.user, end_time__isnull=True
    ).first()

    if completed_attempts >= quiz.attempts_allowed and not open_attempt:
        if quiz.author != request.user and not request.user.is_superuser:
            latest = (
                QuizAttempt.objects.filter(quiz=quiz, user=request.user, end_time__isnull=False)
                .order_by('-end_time')
                .first()
            )
            return Response(
                {
                    'message'          : 'You have reached the maximum number of attempts allowed.',
                    'max_attempts_reached': True,
                    'latest_attempt_id': latest.id if latest else None,
                },
                status=status.HTTP_403_FORBIDDEN,
            )

    serializer = QuizStudentSerializer(quiz, context={'request': request})

    return Response(
        {
            'quiz'            : serializer.data,
            'attempts_taken'  : completed_attempts,
            'has_open_attempt': bool(open_attempt),
        }
    )


@api_view(['POST'])
def quiz_start_view(request, quiz_id):
    try:
        quiz = Quiz.objects.get(id=quiz_id)
    except Quiz.DoesNotExist:
        return Response({'message': 'Quiz not found.'}, status=status.HTTP_404_NOT_FOUND)

    open_attempt = QuizAttempt.objects.filter(
        quiz=quiz, user=request.user, end_time__isnull=True
    ).first()
    if open_attempt:
        return Response(
            {'message': 'Resumed existing attempt.', 'attempt_id': open_attempt.id},
            status=status.HTTP_200_OK,
        )

    completed_attempts = QuizAttempt.objects.filter(
        quiz=quiz, user=request.user, end_time__isnull=False
    ).count()
    if completed_attempts >= quiz.attempts_allowed:
        if quiz.author != request.user and not request.user.is_superuser:
            return Response({'message': 'Max attempts reached.'}, status=status.HTTP_403_FORBIDDEN)

    attempt = QuizAttempt.objects.create(quiz=quiz, user=request.user)
    return Response(
        {'message': 'Quiz started.', 'attempt_id': attempt.id},
        status=status.HTTP_201_CREATED,
    )


@api_view(['POST'])
def quiz_submit_view(request, quiz_id):
    logger.warning(
        f"[SUBMIT DEBUG] user={request.user}, "
        f"user_id={request.user.id if request.user.is_authenticated else 'ANON'}, "
        f"quiz_id={quiz_id}"
    )

    try:
        quiz = Quiz.objects.prefetch_related('items').get(id=quiz_id)
    except Quiz.DoesNotExist:
        return Response({'message': 'Quiz not found.'}, status=status.HTTP_404_NOT_FOUND)

    logger.warning(
        f"[SUBMIT DEBUG] quiz.author_id={quiz.author_id}, "
        f"is_author={quiz.author == request.user}, "
        f"is_superuser={request.user.is_superuser if request.user.is_authenticated else False}"
    )

    attempt_id = request.data.get('attempt_id')
    try:
        attempt = QuizAttempt.objects.get(id=attempt_id, quiz=quiz, user=request.user)
    except QuizAttempt.DoesNotExist:
        logger.warning(f"[SUBMIT DEBUG] Attempt not found: attempt_id={attempt_id}")
        return Response({'message': 'Attempt not found or invalid.'}, status=status.HTTP_400_BAD_REQUEST)

    if attempt.end_time:
        logger.warning(f"[SUBMIT DEBUG] Already submitted: attempt_id={attempt_id}, end_time={attempt.end_time}")
        return Response(
            {
                'message'         : 'This attempt has already been submitted.',
                'already_submitted': True,
                'attempt_id'      : attempt.id,
                'score'           : attempt.score,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    is_late = False
    if quiz.deadline and timezone.now() > quiz.deadline:
        if quiz.author == request.user or request.user.is_superuser:
            is_late = True
        elif not quiz.allow_late_submissions:
            return Response(
                {'message': 'The deadline for this quiz has passed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        else:
            is_late = True

    if quiz.attempts_allowed and quiz.attempts_allowed > 0:
        completed_attempts = (
            QuizAttempt.objects.filter(quiz=quiz, user=request.user, end_time__isnull=False)
            .exclude(id=attempt.id)
            .count()
        )
        if completed_attempts >= quiz.attempts_allowed:
            if quiz.author != request.user and not request.user.is_superuser:
                return Response(
                    {'message': 'Maximum attempts reached. Submission rejected.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

    if quiz.time_limit_minutes:
        limit_seconds   = quiz.time_limit_minutes * 60
        elapsed_seconds = (timezone.now() - attempt.start_time).total_seconds()

        if elapsed_seconds > (limit_seconds + 10): 
            if quiz.author == request.user or request.user.is_superuser:
                is_late = True
            elif not quiz.allow_late_submissions:
                return Response(
                    {
                        'error' : 'Submission failed.',
                        'detail': f'Time limit exceeded by {int(elapsed_seconds - limit_seconds)} seconds.',
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            else:
                is_late = True

    serializer = QuizSubmissionSerializer(data=request.data)
    if not serializer.is_valid():
        print("Serializer Errors:", serializer.errors)
        logger.warning(f"[SUBMIT DEBUG] Serializer validation failed: {serializer.errors}")
        return Response(
            {'message': 'Invalid submission payload.', 'errors': serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    student_answers    = serializer.validated_data.get('answers', {})
    time_taken_seconds = serializer.validated_data.get('time_taken_seconds')

    total_score         = 0
    calculated_answers  = {}

    for item in quiz.items.all():
        str_item_id = str(item.id)
        student_ans = student_answers.get(str_item_id)
        is_correct  = False
        points_earned = 0

        if student_ans is not None:
            if item.type == 'identification':
                if str(student_ans).strip().lower() == str(item.correct_answer).strip().lower():
                    is_correct = True

            elif item.type == 'single_choice':
                try:
                    idx = int(student_ans)
                    if 0 <= idx < len(item.choices) and item.choices[idx].get('is_correct'):
                        is_correct = True
                except (ValueError, TypeError):
                    pass

            elif item.type == 'multiple_answer':
                if isinstance(student_ans, list):
                    correct_indices = [i for i, c in enumerate(item.choices) if c.get('is_correct')]
                    if sorted([int(i) for i in student_ans]) == sorted(correct_indices):
                        is_correct = True

            elif item.type == 'true_false':
                if str(student_ans).lower() == str(item.tf_correct).lower():
                    is_correct = True

            elif item.type == 'matching':
                if isinstance(student_ans, dict):
                    correct_pairs = {p.get('left'): p.get('right') for p in item.meta.get('pairs', [])}
                    if student_ans == correct_pairs:
                        is_correct = True

            elif item.type == 'ordering':
                if isinstance(student_ans, list):
                    if student_ans == item.meta.get('order', []):
                        is_correct = True

        if is_correct:
            points_earned = item.points
            total_score  += points_earned

        calculated_answers[str_item_id] = {
            'student_answer': student_ans,
            'is_correct'    : is_correct,
            'points_earned' : points_earned,
        }

    if is_late and quiz.late_penalty_percentage > 0:
        penalty     = (quiz.late_penalty_percentage / 100.0) * total_score
        total_score = max(0, total_score - penalty)

    attempt.score              = total_score
    attempt.is_late            = is_late
    attempt.end_time           = timezone.now()
    attempt.answers            = calculated_answers
    attempt.time_taken_seconds = int((attempt.end_time - attempt.start_time).total_seconds())
    attempt.save()

    return Response(
        {
            'message'   : 'Submission successful!',
            'score'     : total_score,
            'is_late'   : is_late,
            'attempt_id': attempt.id,
        },
        status=status.HTTP_201_CREATED,
    )


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

    elapsed = int((timezone.now() - attempt.start_time).total_seconds())
    attempt.time_taken_seconds = elapsed
    attempt.save()

    return Response({'message': 'Progress saved.', 'time_taken_seconds': elapsed})

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

    attempt_data = model_to_dict(attempt, fields=['id', 'score', 'is_late', 'start_time', 'end_time', 'answers'])

    time_taken_seconds = 0
    if attempt.start_time and attempt.end_time:
        time_taken_seconds = int((attempt.end_time - attempt.start_time).total_seconds())
    attempt_data['time_taken_seconds'] = time_taken_seconds

    attempts_used    = QuizAttempt.objects.filter(quiz=quiz, user=attempt.user, end_time__isnull=False).count()
    attempts_allowed = quiz.attempts_allowed

    deadline_passed = bool(quiz.deadline and timezone.now() > quiz.deadline)
    cheat_prevention_active = (
        (not quiz.show_answers_at_end)
        or ((attempts_used < attempts_allowed) and not deadline_passed)
    )

    quiz_serializer = QuizSerializer(quiz)
    quiz_data       = quiz_serializer.data

    max_possible_score = sum(item.get('points', 1) for item in quiz_data.get('items', []))
    attempt_data['max_score'] = max_possible_score

    if cheat_prevention_active:
        for item in quiz_data.get('items', []):
            item.pop('correct_answer', None)
            item.pop('tf_correct', None)

            for choice in item.get('choices', []):
                choice.pop('is_correct', None)

            if 'meta' in item:
                for pair in item['meta'].get('pairs', []):
                    pair.pop('right', None)
                item['meta'].pop('order', None)
                item['meta'].pop('explanation', None)

    student_ids = (
        QuizAttempt.objects.filter(quiz=quiz, end_time__isnull=False)
        .values_list('user', flat=True)
        .distinct()
    )

    latest_attempts = []
    for sid in student_ids:
        latest_att = (
            QuizAttempt.objects.filter(quiz=quiz, user_id=sid, end_time__isnull=False)
            .order_by('-end_time')
            .first()
        )
        if latest_att and latest_att.score is not None:
            latest_attempts.append(latest_att)

    total_students = len(latest_attempts)

    if total_students > 0:
        latest_scores = [att.score for att in latest_attempts]
        class_high    = max(latest_scores)
        class_low     = min(latest_scores)
        class_mean    = sum(latest_scores) / total_students

        latest_attempts.sort(key=lambda x: (-x.score, x.time_taken_seconds or float('inf')))

        leaderboard_data = []
        rank = None
        for index, att in enumerate(latest_attempts):
            r = index + 1
            leaderboard_data.append(
                {
                    'rank'        : r,
                    'student_name': att.user.username,
                    'score'       : att.score,
                    'time_taken'  : att.time_taken_seconds,
                }
            )
            if att.id == attempt.id:
                rank = r

        if rank is None:
            rank = sum(1 for att in latest_attempts if att.score > (attempt.score or 0)) + 1
    else:
        class_high = class_low = class_mean = rank = None
        leaderboard_data = []

    previous_attempt = (
        QuizAttempt.objects.filter(quiz=quiz, user=attempt.user, end_time__lt=attempt.end_time)
        .order_by('-end_time')
        .first()
    )
    previous_attempt_score = previous_attempt.score if previous_attempt else None

    analytics_data = {
        'total_students'        : total_students,
        'class_mean'            : round(class_mean) if class_mean is not None else None,
        'class_high'            : class_high,
        'class_low'             : class_low,
        'rank'                  : rank,
        'previous_attempt_score': previous_attempt_score,
        'leaderboard'           : leaderboard_data,
    }

    return Response(
        {
            'quiz'                   : quiz_data,
            'attempt'                : attempt_data,
            'attempts_used'          : attempts_used,
            'attempts_allowed'       : attempts_allowed,
            'cheat_prevention_active': cheat_prevention_active,
            'analytics'              : analytics_data,
        }
    )


@api_view(['POST'])
def quiz_unpublish_view(request, quiz_id):
    try:
        quiz = Quiz.objects.get(id=quiz_id, author=request.user)
    except Quiz.DoesNotExist:
        return Response({'message': 'Quiz not found or unauthorized.'}, status=status.HTTP_404_NOT_FOUND)

    quiz.status = 'draft'
    quiz.save()
    return Response({'message': 'Quiz reverted to draft.'})

@api_view(['GET', 'POST'])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def quiz_item_list_create_view(request, quiz_id):
    try:
        quiz = Quiz.objects.get(id=quiz_id)
    except Quiz.DoesNotExist:
        return Response({'message': 'Quiz not found.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        items      = quiz.items.all().order_by('sort_order', 'id')
        serializer = QuizItemSerializer(items, many=True)
        return Response({'items': serializer.data})

    if quiz.author != request.user:
        return Response({'message': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

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

    item_ids  = [str(o.get('id', '')) for o in order_data if o.get('id')]
    items     = list(QuizItem.objects.filter(quiz=quiz, id__in=item_ids))
    item_dict = {str(item.id): item for item in items}

    items_to_update = []
    for obj in order_data:
        str_id = str(obj.get('id'))
        if str_id in item_dict:
            item            = item_dict[str_id]
            item.sort_order = obj.get('sort_order', 0)
            items_to_update.append(item)

    if items_to_update:
        QuizItem.objects.bulk_update(items_to_update, ['sort_order'])

    return Response({'message': 'Order updated successfully.'})