import io
import json
import logging
import random
import re
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
import pdfplumber
import docx
import pptx

from .models import Quiz, QuizAttempt, QuizItem
from .serializers import (
    QuizSerializer,
    QuizItemSerializer,
    QuizStudentSerializer,
    QuizSubmissionSerializer,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Bloom's Taxonomy (Revised, 2001) — used consistently throughout
# ---------------------------------------------------------------------------

_BLOOM_LEVELS = (
    "Remember",
    "Understand",
    "Apply",
    "Analyze",
    "Evaluate",
    "Create",
)

_BLOOM_DISTRIBUTION = "15% Remember, 20% Understand, 25% Apply, 20% Analyze, 10% Evaluate, 10% Create"

# ---------------------------------------------------------------------------
# LET Coverage tables
# ---------------------------------------------------------------------------

_LET_COVERAGE = {
    "GenEd": (
        "General Education — English communication, Filipino, Mathematics, "
        "Science & Technology, Social Science, values/philosophy."
    ),
    "ProfEd": (
        "Professional Education — Principles of Teaching, Child & Adolescent "
        "Development, Assessment, Curriculum, and Philippine Educational Laws "
        "(RA 10533, RA 7836, etc.)."
    ),
    "Filipino": (
        "Specialisation: Filipino — Philippine literature (prose, poetry, drama), "
        "language structure (grammar, syntax, phonology), rhetoric, and the history "
        "of the Filipino language."
    ),
    "English": (
        "Specialisation: English — literature (British, American, World, Philippine "
        "in English), linguistics, grammar, composition, and communication."
    ),
    "Mathematics": (
        "Specialisation: Mathematics — Algebra, Geometry, Trigonometry, "
        "Statistics & Probability, Calculus, Number Theory, and Math pedagogy."
    ),
    "Science": (
        "Specialisation: Science — Biology, Chemistry, Physics, Earth Science, "
        "scientific method, and K-12 Science curriculum alignment."
    ),
    "Social Studies": (
        "Specialisation: Social Studies — Philippine History, World History, "
        "Geography, Economics, Political Science, and Sociology."
    ),
    "MAPEH": (
        "Specialisation: MAPEH — Music, Arts, Physical Education, and Health "
        "as defined in the K-12 curriculum. Balance all four strands."
    ),
    "TLE": (
        "Specialisation: Technology and Livelihood Education — Home Economics, "
        "Industrial Arts, Agri-Fishery Arts, and ICT aligned to TESDA standards."
    ),
    "Values Education": (
        "Specialisation: Values Education — character formation, "
        "Edukasyon sa Pagpapakatao (EsP), Filipino values, and ethics."
    ),
}

_DEFAULT_COVERAGE_DESC = "LET Board Examination — general academic content."

# ---------------------------------------------------------------------------
# Specialization normalization
# ---------------------------------------------------------------------------

_ALL_KNOWN_SPECIALIZATIONS = set(_LET_COVERAGE.keys()) | {"Rizal"}

_SPECIALIZATION_ALIASES = {
    "gen ed": "GenEd",
    "general education": "GenEd",
    "gened": "GenEd",
    "prof ed": "ProfEd",
    "professional education": "ProfEd",
    "profd": "ProfEd",
    "math": "Mathematics",
    "maths": "Mathematics",
    "social science": "Social Studies",
    "araling panlipunan": "Social Studies",
    "ap": "Social Studies",
    "values": "Values Education",
    "esp": "Values Education",
    "edukasyon sa pagpapakatao": "Values Education",
    "good manners": "Values Education",
    "gmrc": "Values Education",
    "technology": "TLE",
    "livelihood": "TLE",
    "tech": "TLE",
    "music arts pe health": "MAPEH",
}


def _normalize_specialization(raw: str) -> str:
    if not raw:
        return raw
    stripped = raw.strip()
    if stripped in _ALL_KNOWN_SPECIALIZATIONS:
        return stripped
    lower = stripped.lower()
    for known in _ALL_KNOWN_SPECIALIZATIONS:
        if known.lower() == lower:
            return known
    if lower in _SPECIALIZATION_ALIASES:
        return _SPECIALIZATION_ALIASES[lower]
    for alias, canonical in _SPECIALIZATION_ALIASES.items():
        if alias in lower or lower in alias:
            return canonical
    return stripped


# ---------------------------------------------------------------------------
# Language detection
# ---------------------------------------------------------------------------

_FILIPINO_SPECIALIZATIONS = {"Filipino", "Rizal"}


def _detect_language_mode(specialization: str, nlp_language: str | None = None) -> str:
    if specialization in _FILIPINO_SPECIALIZATIONS:
        return "filipino"
    if nlp_language and nlp_language.lower() in ("filipino", "tagalog"):
        return "filipino"
    return "english"


def _build_language_instruction(lang_mode: str) -> str:
    if lang_mode == "filipino":
        return (
            "LANGUAGE: Write ALL questions, options, and explanations in FILIPINO (Tagalog-based). "
            "Use English only for technical terms with no standard Filipino equivalent. "
            "Never mix languages within a single question."
        )
    return (
        "LANGUAGE: Write ALL questions, options, and explanations strictly in ENGLISH. "
        "Do NOT use Filipino, Tagalog, or any other language — even if the topic involves "
        "Philippine history, DepEd, or Filipino culture. "
        "Never mix languages within a single question."
    )


# ---------------------------------------------------------------------------
# Prompt usefulness classifier
# ---------------------------------------------------------------------------

_FILLER_PHRASES = {
    "ok", "okay", "test", "n/a", "na", "none", "nothing",
    "idk", "i dont know", "i don't know", "asdf", "asdfjkl",
    "hello", "hi", "yes", "no", "lol", "haha", "etc",
    "any", "anything", "random", "general",
}

_QUANTITY_ONLY_RE = re.compile(
    r"^\s*(please\s+)?(generate|make|create|give\s+me|produce)?\s*"
    r"\d+\s+(multiple[\s-]choice\s+)?(questions?|items?|mcq[s]?)\s*[.,!]?\s*$",
    re.IGNORECASE,
)


def _prompt_is_useful(text: str) -> bool:
    if not text:
        return False
    stripped = text.strip()
    if len(stripped) < 8:
        return False
    alpha = sum(1 for c in stripped if c.isalpha())
    if alpha / max(1, len(stripped)) < 0.50:
        return False
    if stripped.lower() in _FILLER_PHRASES:
        return False
    if _QUANTITY_ONLY_RE.match(stripped):
        return False
    return True


# ---------------------------------------------------------------------------
# Question count extractor
# ---------------------------------------------------------------------------

_QUESTION_COUNT_RE = re.compile(
    r"\b(generate|make|create|produce|give\s+me|write)?\s*(\d+)\s+"
    r"(multiple[\s-]choice\s+)?(questions?|items?|mcq[s]?)\b",
    re.IGNORECASE,
)


def _extract_question_count(prompt_text: str, default: int = 5) -> int:
    if not prompt_text:
        return default
    match = _QUESTION_COUNT_RE.search(prompt_text)
    if match:
        return max(5, min(50, int(match.group(2))))
    return default


def _strip_quantity_instructions(prompt_text: str) -> str:
    cleaned = _QUESTION_COUNT_RE.sub("", prompt_text).strip()
    cleaned = re.sub(
        r"^(about|on|regarding|for|of|the|a|an)\s+", "", cleaned, flags=re.IGNORECASE
    )
    return cleaned.strip()


# ---------------------------------------------------------------------------
# Gemini NLP prompt preprocessor
# ---------------------------------------------------------------------------

def _preprocess_prompt_with_gemini(prompt_text: str) -> dict:
    """
    Use a fast Gemini call to extract topic, question count, and language
    from the user's free-text prompt. Falls back to an empty dict on error.
    """
    if not prompt_text or not prompt_text.strip():
        return {}
    try:
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel(
            "gemini-2.5-flash",
            system_instruction=(
                "You are a prompt parser. Extract structured fields from a quiz "
                "generation request. Return ONLY valid JSON, no markdown fences."
            ),
        )
        parse_prompt = (
            f"Parse this quiz request and return JSON with exactly these keys:\n"
            f'  "topic" (string, the subject/focus area),\n'
            f'  "num_questions" (integer or null if not specified),\n'
            f'  "language" (string or null if not specified).\n\n'
            f'Request: "{prompt_text.strip()}"'
        )
        response = model.generate_content(
            parse_prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.0,
                max_output_tokens=256,
                response_mime_type="application/json",
            ),
        )
        result = json.loads(response.text.strip())
        if not isinstance(result, dict):
            return {}
        nq = result.get("num_questions")
        if nq is not None:
            try:
                nq = int(nq)
                result["num_questions"] = max(5, min(50, nq)) if nq > 0 else None
            except (ValueError, TypeError):
                result["num_questions"] = None
        logger.info(f"[AI QUIZ] NLP preprocessor result: {result}")
        return result
    except Exception as e:
        logger.warning(f"[AI QUIZ] NLP preprocessing failed, falling back to regex: {e}")
        return {}


# ---------------------------------------------------------------------------
# Reference material extraction
# ---------------------------------------------------------------------------

_MAX_REFERENCE_CHARS = 8_000


def _truncate_reference(text: str, max_chars: int = _MAX_REFERENCE_CHARS) -> str:
    if not text or len(text) <= max_chars:
        return text.strip()
    return text[:max_chars].strip() + "\n[... document truncated for brevity ...]"


def extract_reference_text(uploaded_file) -> str:
    """Extract plain text from PDF, DOCX, PPTX, or TXT uploads."""
    if not uploaded_file:
        return ""
    file_name = uploaded_file.name.lower()
    text = ""
    try:
        if file_name.endswith(".pdf"):
            with pdfplumber.open(uploaded_file) as pdf:
                for page_num, page in enumerate(pdf.pages, start=1):
                    extracted = page.extract_text()
                    if extracted:
                        text += f"[Page {page_num}]\n{extracted.strip()}\n\n"
        elif file_name.endswith(".docx"):
            doc = docx.Document(uploaded_file)
            text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        elif file_name.endswith(".pptx"):
            prs = pptx.Presentation(uploaded_file)
            for slide_num, slide in enumerate(prs.slides, start=1):
                slide_text = " ".join(
                    shape.text
                    for shape in slide.shapes
                    if hasattr(shape, "text") and shape.text.strip()
                )
                if slide_text:
                    text += f"[Slide {slide_num}] {slide_text}\n"
        elif file_name.endswith(".txt"):
            text = uploaded_file.read().decode("utf-8", errors="ignore")
    except Exception as e:
        logger.warning(f"[AI QUIZ] Failed to extract text from {file_name}: {e}")
    return text.strip()


# ---------------------------------------------------------------------------
# Specialization ↔ reference file subject detector
# ---------------------------------------------------------------------------

_SUBJECT_KEYWORDS = {
    "Mathematics": {
        "algebra", "geometry", "trigonometry", "calculus", "statistics",
        "probability", "equation", "function", "polynomial", "derivative",
        "integral", "matrix", "vector", "theorem", "proof", "arithmetic",
        "number theory", "set theory", "logarithm", "exponent", "quadratic",
    },
    "Science": {
        "biology", "chemistry", "physics", "ecology", "cell", "atom",
        "molecule", "force", "energy", "photosynthesis", "mitosis", "meiosis",
        "periodic table", "element", "compound", "wave", "gravity", "evolution",
        "genetics", "ecosystem", "thermodynamics", "circuit",
    },
    "Social Studies": {
        "history", "geography", "economics", "politics", "culture", "society",
        "colonization", "revolution", "government", "democracy", "constitution",
        "pilipinas", "philippines", "rizal", "commonwealth", "nationalism",
        "migration", "civilization", "trade", "sovereignty", "election",
    },
    "English": {
        "literature", "grammar", "composition", "syntax", "diction",
        "metaphor", "simile", "irony", "narrative", "poetry", "prose",
        "shakespeare", "novel", "short story", "essay", "rhetoric",
        "linguistics", "phonology", "morphology", "semantics",
    },
    "Filipino": {
        "panitikan", "tula", "sanaysay", "dula", "maikling kwento", "akda",
        "panlapi", "unlapi", "hulapi", "pangngalan", "pandiwa", "pang-uri",
        "panghalip", "balagtasan", "talumpati", "retorika", "wikang filipino",
        "baybayin", "haiku", "tanaga", "ambahan",
    },
    "MAPEH": {
        "music", "arts", "physical education", "health", "dance", "rhythm",
        "melody", "fitness", "nutrition", "wellness", "sport", "exercise",
        "visual arts", "painting", "folk dance", "disease prevention",
    },
    "TLE": {
        "technology", "livelihood", "home economics", "industrial arts",
        "agri", "fishery", "ict", "tesda", "cooking", "sewing", "welding",
        "carpentry", "computer", "entrepreneurship", "breadmaking",
    },
    "Values Education": {
        "values", "ethics", "morality", "character", "virtue", "esp",
        "bayanihan", "pakikipagkapwa", "pagpapahalaga", "kabutihang-asal",
        "edukasyon sa pagpapakatao", "gmrc", "good manners", "citizenship",
    },
    "GenEd": {
        "reading comprehension", "communication", "critical thinking",
        "problem solving", "number sense", "science technology",
        "social awareness", "values formation",
    },
    "ProfEd": {
        "teaching", "pedagogy", "curriculum", "assessment", "lesson plan",
        "child development", "adolescent", "classroom management", "deped",
        "ched", "ra 10533", "ra 7836", "bloom", "cognitive", "affective",
        "psychomotor", "instructional design", "formative", "summative",
    },
}


def _detect_reference_subject(text: str) -> str | None:
    if not text:
        return None
    lower = text.lower()
    scores = {}
    for subject, keywords in _SUBJECT_KEYWORDS.items():
        hits = sum(1 for kw in keywords if kw in lower)
        if hits > 0:
            scores[subject] = hits
    if not scores:
        return None
    top_subject = max(scores, key=scores.get)
    top_score = scores[top_subject]
    sorted_scores = sorted(scores.values(), reverse=True)
    runner_up = sorted_scores[1] if len(sorted_scores) > 1 else 0
    if top_score >= 3 and top_score >= runner_up * 1.5:
        return top_subject
    return None


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

def _build_let_prompt(
    category: str,
    specialization: str,
    topic_focus: str,
    num_questions: int = 5,
    reference_material: str = "",
    lang_mode: str = "english",
    **kwargs,
) -> str:
    """
    Build the Gemini generation prompt.

    Key design decisions:
    - Language rule is stated first and with maximum emphasis because Gemini
      tends to follow rules in order of appearance.
    - Bloom's taxonomy uses the revised 2001 levels (Remember → Create).
    - All LET quality rules are inlined here (single source of truth).
      The old _GENERAL_LET_RULES / _BANNED_STEM_PATTERNS constants are gone
      because they were defined but never injected — dead code.
    - Reference material is injected only when present.
    """
    lang_label = "Filipino (Tagalog-based)" if lang_mode == "filipino" else "English"
    lang_rule = _build_language_instruction(lang_mode)

    subject_desc = _LET_COVERAGE.get(specialization, _DEFAULT_COVERAGE_DESC)

    bloom_schema = "|".join(_BLOOM_LEVELS)

    ref_section = ""
    if reference_material and reference_material.strip():
        ref_section = (
            f"\n[REFERENCE MATERIAL]\n"
            f"Base questions on this document. Fill any gaps with your LET subject knowledge.\n"
            f"{reference_material.strip()}\n"
        )

    topic_line = f"Topic focus: {topic_focus.strip()}\n" if topic_focus and topic_focus.strip() else ""

    return (
        f"You are an expert Philippine LET board exam item writer.\n"
        f"Generate exactly {num_questions} four-choice multiple-choice questions in {lang_label}.\n\n"
        f"Category: {category}\n"
        f"Specialization: {specialization} — {subject_desc}\n"
        f"{topic_line}"
        f"{ref_section}\n"
        f"[LANGUAGE RULE — NON-NEGOTIABLE]\n"
        f"{lang_rule}\n\n"
        f"[ITEM-WRITING RULES]\n"
        f"1. One unambiguously correct answer per question. Options A–D must be mutually exclusive.\n"
        f"2. BANNED options: 'All of the above', 'None of the above', 'Both A and B'.\n"
        f"3. Options A–D: parallel grammar, similar length. The correct answer must NOT be the longest.\n"
        f"4. Distractors must target real misconceptions Filipino teacher-candidates commonly make.\n"
        f"5. No trick questions, double negatives, ambiguous pronouns, or opinion-based stems.\n"
        f"6. No absolute words (always, never, all, none) inside options.\n"
        f"7. Do not repeat key words from the stem verbatim inside the correct answer.\n"
        f"8. Stems: maximum 2 sentences / 40 words. ProfEd scenario stems: max 3 sentences / 60 words.\n"
        f"9. Philippine educational context where applicable (DepEd, CHED, K-12, LET competencies).\n\n"
        f"[BLOOM'S TAXONOMY — REVISED 2001]\n"
        f"Use ONLY these six levels: {bloom_schema}\n"
        f"Target distribution: {_BLOOM_DISTRIBUTION}\n"
        f"Spread correct answers across A/B/C/D evenly.\n\n"
        f"[OUTPUT FORMAT]\n"
        f"Return ONLY a valid JSON array — no markdown fences, no preamble, no trailing text.\n"
        f"Each object must follow this exact schema:\n"
        f'{{"question":"...","options":["A text","B text","C text","D text"],'
        f'"answer":"exact text of correct option",'
        f'"bloom_level":"{bloom_schema}",'
        f'"explanation":"one sentence explaining why the answer is correct"}}\n\n'
        f"Return exactly {num_questions} objects. Never truncate the array mid-way.\n"
    )


# ---------------------------------------------------------------------------
# Similarity helper
# ---------------------------------------------------------------------------

def _similarity(a: str, b: str) -> float:
    a, b = a.strip().lower(), b.strip().lower()
    if not a or not b:
        return 0.0
    return sum(ca == cb for ca, cb in zip(a, b)) / max(len(a), len(b))


# ---------------------------------------------------------------------------
# Core Gemini call + QuizItem creation
# ---------------------------------------------------------------------------

def _run_generation(
    quiz,
    category: str,
    specialization: str,
    topic_focus: str,
    num_questions: int,
    reference_material: str = "",
    lang_mode: str = "english",
    has_reference_file: bool = False,
    specialization_confidence: str = "high",
) -> list:
    """Call Gemini, parse the JSON response, persist QuizItems, and return them."""

    prompt_str = _build_let_prompt(
        category=category,
        specialization=specialization,
        topic_focus=topic_focus,
        num_questions=num_questions,
        reference_material=reference_material,
        lang_mode=lang_mode,
    )

    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel("gemini-2.5-flash")

    generation_config = genai.types.GenerationConfig(
        temperature=0.7,
        top_p=0.92,
        top_k=50,
        max_output_tokens=16384,
        response_mime_type="application/json",
    )

    def _parse_response(raw: str) -> list:
        text = raw.strip()
        if not text:
            return []
        for fence in ("```json", "```"):
            if text.startswith(fence):
                text = text[len(fence):]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            logger.warning(f"[AI QUIZ] JSON parse error: {e}. Attempting repair.")
            cleaned = text.strip()
            if not cleaned.startswith("["):
                first_brace = cleaned.find("{")
                cleaned = ("[" + cleaned[first_brace:]) if first_brace != -1 else ("[" + cleaned)
            cleaned = cleaned.replace("\n", " ").replace("\r", " ")
            last_brace = cleaned.rfind("}")
            cleaned = (cleaned[:last_brace + 1] + "]") if last_brace != -1 else (cleaned + "]")
            try:
                return json.loads(cleaned)
            except json.JSONDecodeError as e2:
                logger.error(f"[AI QUIZ] Repair failed: {e2}")
                logger.error(f"[AI QUIZ] Snippet: {text[:300]}")
                return []

    response = model.generate_content(prompt_str, generation_config=generation_config)
    questions_data = _parse_response(response.text)

    if not isinstance(questions_data, list):
        questions_data = []
    questions_data = [q for q in questions_data if isinstance(q, dict)][:num_questions]
    logger.info(f"[AI QUIZ] First call returned {len(questions_data)} / {num_questions} questions")

    if len(questions_data) < num_questions:
        remaining = num_questions - len(questions_data)
        logger.info(f"[AI QUIZ] Truncated. Requesting {remaining} more questions.")
        retry_prompt = _build_let_prompt(
            category=category,
            specialization=specialization,
            topic_focus=topic_focus,
            num_questions=remaining,
            lang_mode=lang_mode,
        )
        try:
            retry_resp = model.generate_content(retry_prompt, generation_config=generation_config)
            retry_data = _parse_response(retry_resp.text)
            if isinstance(retry_data, list):
                retry_data = [q for q in retry_data if isinstance(q, dict)][:remaining]
                questions_data.extend(retry_data)
                logger.info(
                    f"[AI QUIZ] Retry returned {len(retry_data)} more. Total: {len(questions_data)}"
                )
        except Exception as retry_err:
            logger.warning(
                f"[AI QUIZ] Retry failed: {retry_err}. Proceeding with {len(questions_data)}."
            )

    from collections import Counter
    dist = Counter(q.get("bloom_level") for q in questions_data if isinstance(q, dict))
    logger.info(f"[AI QUIZ] Bloom distribution: {dict(dist)}")

    valid_bloom = set(_BLOOM_LEVELS)
    created_items = []
    for i, q in enumerate(questions_data):
        question_text = q.get("question", "").strip()
        options = q.get("options", [])
        answer_text = q.get("answer", "").strip()
        explanation = q.get("explanation", "")
        bloom_level = q.get("bloom_level", "")

        _old_to_new = {
            "knowledge": "Remember",
            "comprehension": "Understand",
            "application": "Apply",
            "analysis": "Analyze",
            "synthesis": "Create",
            "evaluation": "Evaluate",
        }
        if bloom_level and bloom_level.lower() in _old_to_new:
            bloom_level = _old_to_new[bloom_level.lower()]

        if bloom_level not in valid_bloom:
            bloom_level = "Understand"

        if not question_text or len(options) != 4:
            logger.warning(f"[AI QUIZ] Skipping malformed question at index {i}: {q}")
            continue

        choices = [
            {"text": opt.strip(), "is_correct": opt.strip() == answer_text}
            for opt in options
            if opt and opt.strip()
        ]

        correct_count = sum(c["is_correct"] for c in choices)
        if correct_count != 1:
            best = max(choices, key=lambda c: _similarity(c["text"], answer_text))
            for c in choices:
                c["is_correct"] = False
            best["is_correct"] = True
            logger.warning(f"[AI QUIZ] Fixed answer mapping at index {i}")

        meta = {}
        if bloom_level:
            meta["bloom_level"] = bloom_level
        if explanation:
            meta["explanation"] = explanation

        create_kwargs = dict(
            quiz=quiz,
            question=question_text,
            type="single_choice",
            choices=choices,
            points=1,
            sort_order=i,
        )
        if meta:
            create_kwargs["meta"] = meta

        item = QuizItem.objects.create(**create_kwargs)
        created_items.append(item)

    return created_items


# ===========================================================================
# Views
# ===========================================================================

@api_view(["GET", "POST"])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def quiz_list_create_view(request):
    if request.method == "GET":
        qs = Quiz.objects.select_related("author")

        quiz_status = request.query_params.get("status")
        if quiz_status:
            qs = qs.filter(status=quiz_status)

        mine = request.query_params.get("mine")
        if mine and mine.lower() in ("true", "1"):
            qs = qs.filter(author=request.user)

        search = request.query_params.get("search")
        if search:
            qs = qs.filter(title__icontains=search)

        visibility_q = Q(author=request.user)

        from accounts.models import Friendship
        friend_ids = Friendship.objects.filter(
            Q(user=request.user, status="accepted") | Q(friend=request.user, status="accepted")
        ).values_list("user_id", "friend_id")

        flattened_friends = set()
        for u_id, f_id in friend_ids:
            flattened_friends.add(u_id)
            flattened_friends.add(f_id)
        flattened_friends.discard(request.user.id)

        visibility_q |= Q(status="published", availability="all_friends", author_id__in=flattened_friends)
        visibility_q |= Q(status="published", availability="specific_friends", shared_with=request.user)

        qs = qs.filter(visibility_q).distinct()

        serializer = QuizSerializer(qs, many=True, context={"request": request})
        return Response({"quizzes": serializer.data})

    serializer = QuizSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save(author=request.user)
    return Response({"quiz": serializer.data}, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def quiz_detail_view(request, quiz_id):
    try:
        quiz = Quiz.objects.select_related("author").get(id=quiz_id)
    except Quiz.DoesNotExist:
        return Response({"message": "Quiz not found."}, status=status.HTTP_404_NOT_FOUND)

    if (
        quiz.author != request.user
        and not request.user.is_superuser
        and quiz.deadline
        and timezone.now() > quiz.deadline
    ):
        return Response({"message": "This quiz has expired.", "expired": True}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "GET":
        serializer = QuizSerializer(quiz, context={"request": request})
        return Response({"quiz": serializer.data})

    if quiz.author != request.user and not request.user.is_superuser:
        return Response({"message": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "PUT":
        serializer = QuizSerializer(quiz, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"quiz": serializer.data})

    if request.method == "DELETE":
        quiz.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def ai_generate_quiz(request):
    """
    Unified AI quiz generation endpoint.

    Accepts (all optional except quiz metadata):
      prompt           — topic description / focus area (may include "generate N questions")
      reference_file_1 — PDF / DOCX / PPTX / TXT
      reference_file_2 — second file (optional)
      category, specialization, num_questions, title, subtitle, etc.

    Resolution order for num_questions:
      1. NLP-extracted count from Gemini preprocessing
      2. Regex-extracted count from prompt text
      3. num_questions field in request payload
      4. Default: 5

    Resolution order for specialization:
      1. Explicit specialization field (normalized for typos/aliases)
      2. Auto-detected from reference file content
      3. Fallback to category
    """
    quiz = None
    try:
        data = request.data

        title            = data.get("title", "AI Generated Quiz")
        subtitle         = data.get("subtitle", "")
        attempts_allowed = data.get("attempts_allowed", 1)
        availability     = data.get("availability", "private")
        deadline         = data.get("deadline")
        category         = data.get("category", "GenEd")
        raw_specialization = data.get("specialization", "").strip()
        prompt_text      = data.get("prompt", "").strip()

        nlp          = _preprocess_prompt_with_gemini(prompt_text)
        nlp_topic    = nlp.get("topic") or ""
        nlp_count    = nlp.get("num_questions")
        nlp_language = nlp.get("language")

        count_from_nlp    = nlp_count if isinstance(nlp_count, int) and nlp_count > 0 else 0
        count_from_prompt = _extract_question_count(prompt_text, default=0)
        count_from_field  = int(data.get("num_questions", 0))

        if count_from_nlp > 0:
            num_questions = count_from_nlp
        elif count_from_prompt > 0:
            num_questions = count_from_prompt
        elif count_from_field > 0:
            num_questions = count_from_field
        else:
            num_questions = 5

        num_questions = max(5, min(50, num_questions))

        topic_focus = nlp_topic if nlp_topic else (
            _strip_quantity_instructions(prompt_text) if prompt_text else ""
        )

        reference_file_1 = request.FILES.get("reference_file_1")
        reference_file_2 = request.FILES.get("reference_file_2")

        raw_text_1       = extract_reference_text(reference_file_1)
        raw_text_2       = extract_reference_text(reference_file_2)
        combined_raw     = "\n\n".join(filter(None, [raw_text_1, raw_text_2]))
        has_reference_file = bool(combined_raw.strip())

        specialization_confidence = "high"

        if raw_specialization:
            specialization = _normalize_specialization(raw_specialization)
            if specialization not in _ALL_KNOWN_SPECIALIZATIONS:
                logger.warning(
                    f"[AI QUIZ] Unknown specialization '{raw_specialization}' after normalization → "
                    f"attempting auto-detect from reference file."
                )
                specialization = None
        else:
            specialization = None

        if specialization is None:
            if has_reference_file:
                detected = _detect_reference_subject(combined_raw)
                if detected:
                    specialization = detected
                    specialization_confidence = "inferred"
                    logger.info(f"[AI QUIZ] Specialization auto-detected: {specialization}")
                else:
                    specialization = category
                    specialization_confidence = "none"
                    logger.info(
                        f"[AI QUIZ] Specialization undetectable → falling back to category '{category}'"
                    )
            else:
                specialization = category
                specialization_confidence = "none"
                logger.info(
                    f"[AI QUIZ] No specialization and no file → using category '{category}'"
                )

        lang_mode = _detect_language_mode(
            specialization=specialization,
            nlp_language=nlp_language,
        )
        logger.info(
            f"[AI QUIZ] lang={lang_mode} | spec={specialization} "
            f"(confidence={specialization_confidence}) | cat={category} | "
            f"n={num_questions} | has_file={has_reference_file}"
        )

        reference_material = ""
        if combined_raw.strip():
            reference_material = _truncate_reference(combined_raw)
            logger.info(
                f"[AI QUIZ] raw_chars={len(combined_raw)} | injected_chars={len(reference_material)}"
            )

        quiz_meta = {
            "lang_mode": lang_mode,
            "specialization_confidence": specialization_confidence,
        }
        if combined_raw:
            quiz_meta.update({
                "source_material":       combined_raw,
                "source_material_chars": len(combined_raw),
                "source_file_1":         reference_file_1.name if reference_file_1 else None,
                "source_file_2":         reference_file_2.name if reference_file_2 else None,
            })

        quiz = Quiz.objects.create(
            author=request.user,
            title=title,
            subtitle=subtitle,
            description=prompt_text,
            attempts_allowed=attempts_allowed,
            availability=availability,
            deadline=deadline,
            status="draft",
            generation_type="ai",
            category=category,
            specialization=specialization,
            meta=quiz_meta,
        )

        created_items = _run_generation(
            quiz=quiz,
            category=category,
            specialization=specialization,
            topic_focus=topic_focus,
            num_questions=num_questions,
            reference_material=reference_material,
            lang_mode=lang_mode,
            has_reference_file=has_reference_file,
            specialization_confidence=specialization_confidence,
        )

        if not created_items:
            quiz.delete()
            return Response(
                {"message": "The AI returned no valid questions. Please try a different prompt or file."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        logger.info(
            f"[AI QUIZ] quiz_id={quiz.id} | {len(created_items)} items | "
            f"cat={category} | spec={specialization} | lang={lang_mode}"
        )

        return Response(
            {
                "id":                        quiz.id,
                "message":                   f"Successfully generated {len(created_items)} LET-ready questions.",
                "questions_count":           len(created_items),
                "lang_mode":                 lang_mode,
                "specialization":            specialization,
                "specialization_confidence": specialization_confidence,
            },
            status=status.HTTP_201_CREATED,
        )

    except json.JSONDecodeError as e:
        logger.error(f"[AI QUIZ] JSON parse error: {e}")
        if quiz:
            quiz.delete()
        return Response(
            {"message": "The AI returned malformed JSON. Please try again."},
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
            {"message": f"Failed to generate AI quiz: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# ---------------------------------------------------------------------------
# Publish view
# ---------------------------------------------------------------------------

@api_view(["POST"])
def quiz_publish_view(request, quiz_id):
    try:
        quiz = Quiz.objects.get(id=quiz_id, author=request.user)
    except Quiz.DoesNotExist:
        return Response({"message": "Quiz not found or unauthorized."}, status=status.HTTP_404_NOT_FOUND)

    if quiz.items.count() == 0:
        return Response({"message": "Cannot publish a quiz with no questions."}, status=status.HTTP_400_BAD_REQUEST)

    meta = quiz.meta or {}
    meta["published_at"] = timezone.now().isoformat()

    if meta.get("source_material"):
        meta["grounded"]        = True
        meta["grounded_file_1"] = meta.get("source_file_1", "unknown")
        meta["grounded_file_2"] = meta.get("source_file_2")

    quiz.meta   = meta
    quiz.status = "published"
    quiz.save(update_fields=["status", "meta"])

    return Response({
        "message":  "Quiz published successfully.",
        "quiz_id":  quiz.id,
        "grounded": bool(meta.get("grounded")),
    })


# ---------------------------------------------------------------------------
# Remaining views (unchanged)
# ---------------------------------------------------------------------------

@api_view(["GET"])
def quiz_take_view(request, quiz_id):
    try:
        quiz = Quiz.objects.get(id=quiz_id)
    except Quiz.DoesNotExist:
        return Response({"message": "Quiz not found."}, status=status.HTTP_404_NOT_FOUND)

    if quiz.deadline and timezone.now() > quiz.deadline and not quiz.allow_late_submissions:
        if quiz.author != request.user and not request.user.is_superuser:
            return Response({"message": "This quiz has expired.", "expired": True}, status=status.HTTP_403_FORBIDDEN)

    completed_attempts = QuizAttempt.objects.filter(quiz=quiz, user=request.user, end_time__isnull=False).count()
    open_attempt       = QuizAttempt.objects.filter(quiz=quiz, user=request.user, end_time__isnull=True).first()

    if completed_attempts >= quiz.attempts_allowed and not open_attempt:
        if quiz.author != request.user and not request.user.is_superuser:
            latest = (
                QuizAttempt.objects.filter(quiz=quiz, user=request.user, end_time__isnull=False)
                .order_by("-end_time").first()
            )
            return Response(
                {
                    "message":            "You have reached the maximum number of attempts allowed.",
                    "max_attempts_reached": True,
                    "latest_attempt_id":  latest.id if latest else None,
                },
                status=status.HTTP_403_FORBIDDEN,
            )

    serializer = QuizStudentSerializer(quiz, context={"request": request})
    return Response({
        "quiz":             serializer.data,
        "attempts_taken":   completed_attempts,
        "has_open_attempt": bool(open_attempt),
    })


@api_view(["POST"])
def quiz_start_view(request, quiz_id):
    try:
        quiz = Quiz.objects.get(id=quiz_id)
    except Quiz.DoesNotExist:
        return Response({"message": "Quiz not found."}, status=status.HTTP_404_NOT_FOUND)

    open_attempt = QuizAttempt.objects.filter(quiz=quiz, user=request.user, end_time__isnull=True).first()
    if open_attempt:
        return Response({"message": "Resumed existing attempt.", "attempt_id": open_attempt.id}, status=status.HTTP_200_OK)

    completed_attempts = QuizAttempt.objects.filter(quiz=quiz, user=request.user, end_time__isnull=False).count()
    if completed_attempts >= quiz.attempts_allowed:
        if quiz.author != request.user and not request.user.is_superuser:
            return Response({"message": "Max attempts reached."}, status=status.HTTP_403_FORBIDDEN)

    attempt = QuizAttempt.objects.create(quiz=quiz, user=request.user)
    return Response({"message": "Quiz started.", "attempt_id": attempt.id}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
def quiz_submit_view(request, quiz_id):
    logger.warning(f"[SUBMIT DEBUG] user={request.user}, quiz_id={quiz_id}")

    try:
        quiz = Quiz.objects.prefetch_related("items").get(id=quiz_id)
    except Quiz.DoesNotExist:
        return Response({"message": "Quiz not found."}, status=status.HTTP_404_NOT_FOUND)

    attempt_id = request.data.get("attempt_id")
    try:
        attempt = QuizAttempt.objects.get(id=attempt_id, quiz=quiz, user=request.user)
    except QuizAttempt.DoesNotExist:
        return Response({"message": "Attempt not found or invalid."}, status=status.HTTP_400_BAD_REQUEST)

    if attempt.end_time:
        return Response(
            {
                "message":          "This attempt has already been submitted.",
                "already_submitted": True,
                "attempt_id":       attempt.id,
                "score":            attempt.score,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    is_late = False
    if quiz.deadline and timezone.now() > quiz.deadline:
        if quiz.author == request.user or request.user.is_superuser:
            is_late = True
        elif not quiz.allow_late_submissions:
            return Response({"message": "The deadline for this quiz has passed."}, status=status.HTTP_400_BAD_REQUEST)
        else:
            is_late = True

    if quiz.attempts_allowed and quiz.attempts_allowed > 0:
        completed_attempts = (
            QuizAttempt.objects.filter(quiz=quiz, user=request.user, end_time__isnull=False)
            .exclude(id=attempt.id).count()
        )
        if completed_attempts >= quiz.attempts_allowed:
            if quiz.author != request.user and not request.user.is_superuser:
                return Response({"message": "Maximum attempts reached. Submission rejected."}, status=status.HTTP_400_BAD_REQUEST)

    if quiz.time_limit_minutes:
        limit_seconds   = quiz.time_limit_minutes * 60
        elapsed_seconds = (timezone.now() - attempt.start_time).total_seconds()
        if elapsed_seconds > (limit_seconds + 10):
            if quiz.author == request.user or request.user.is_superuser:
                is_late = True
            elif not quiz.allow_late_submissions:
                return Response(
                    {"error": "Submission failed.", "detail": f"Time limit exceeded by {int(elapsed_seconds - limit_seconds)} seconds."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            else:
                is_late = True

    serializer = QuizSubmissionSerializer(data=request.data)
    if not serializer.is_valid():
        logger.warning(f"[SUBMIT DEBUG] Serializer errors: {serializer.errors}")
        return Response({"message": "Invalid submission payload.", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

    student_answers    = serializer.validated_data.get("answers", {})
    total_score        = 0
    calculated_answers = {}

    for item in quiz.items.all():
        str_item_id   = str(item.id)
        student_ans   = student_answers.get(str_item_id)
        is_correct    = False
        points_earned = 0

        if student_ans is not None:
            if item.type == "identification":
                if str(student_ans).strip().lower() == str(item.correct_answer).strip().lower():
                    is_correct = True
            elif item.type == "single_choice":
                try:
                    idx = int(student_ans)
                    if 0 <= idx < len(item.choices) and item.choices[idx].get("is_correct"):
                        is_correct = True
                except (ValueError, TypeError):
                    pass
            elif item.type == "multiple_answer":
                if isinstance(student_ans, list):
                    correct_indices = [i for i, c in enumerate(item.choices) if c.get("is_correct")]
                    if sorted([int(i) for i in student_ans]) == sorted(correct_indices):
                        is_correct = True
            elif item.type == "true_false":
                if str(student_ans).lower() == str(item.tf_correct).lower():
                    is_correct = True
            elif item.type == "matching":   
                if isinstance(student_ans, dict):
                    correct_pairs = {p.get("left"): p.get("right") for p in item.meta.get("pairs", [])}
                    if student_ans == correct_pairs:
                        is_correct = True
            elif item.type == "ordering":
                if isinstance(student_ans, list):
                    if student_ans == item.meta.get("order", []):
                        is_correct = True

        if is_correct:
            points_earned = item.points
            total_score  += points_earned

        calculated_answers[str_item_id] = {
            "student_answer": student_ans,
            "is_correct":     is_correct,
            "points_earned":  points_earned,
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
        {"message": "Submission successful!", "score": total_score, "is_late": is_late, "attempt_id": attempt.id},
        status=status.HTTP_201_CREATED,
    )


@api_view(["PATCH"])
def quiz_attempt_patch_view(request, quiz_id, attempt_id):
    try:
        attempt = QuizAttempt.objects.get(id=attempt_id, quiz_id=quiz_id, user=request.user)
    except QuizAttempt.DoesNotExist:
        return Response({"message": "Attempt not found."}, status=status.HTTP_404_NOT_FOUND)

    if attempt.end_time:
        return Response({"message": "Cannot update a completed attempt."}, status=status.HTTP_400_BAD_REQUEST)

    answers = request.data.get("answers")
    if answers is not None:
        attempt.answers = answers

    elapsed                    = int((timezone.now() - attempt.start_time).total_seconds())
    attempt.time_taken_seconds = elapsed
    attempt.save()

    return Response({"message": "Progress saved.", "time_taken_seconds": elapsed})


@api_view(["GET"])
def quiz_attempt_result_view(request, quiz_id, attempt_id):
    try:
        quiz = Quiz.objects.prefetch_related("items").get(id=quiz_id)
    except Quiz.DoesNotExist:
        return Response({"message": "Quiz not found."}, status=status.HTTP_404_NOT_FOUND)

    try:
        attempt = QuizAttempt.objects.get(id=attempt_id, quiz=quiz)
    except QuizAttempt.DoesNotExist:
        return Response({"message": "Attempt not found."}, status=status.HTTP_404_NOT_FOUND)

    if attempt.user != request.user and quiz.author != request.user:
        return Response({"message": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    attempt_data = model_to_dict(attempt, fields=["id", "score", "is_late", "start_time", "end_time", "answers"])
    time_taken_seconds = 0
    if attempt.start_time and attempt.end_time:
        time_taken_seconds = int((attempt.end_time - attempt.start_time).total_seconds())
    attempt_data["time_taken_seconds"] = time_taken_seconds

    attempts_used    = QuizAttempt.objects.filter(quiz=quiz, user=attempt.user, end_time__isnull=False).count()
    attempts_allowed = quiz.attempts_allowed
    deadline_passed  = bool(quiz.deadline and timezone.now() > quiz.deadline)

    cheat_prevention_active = (
        (not quiz.show_answers_at_end)
        or ((attempts_used < attempts_allowed) and not deadline_passed)
    )

    quiz_serializer    = QuizSerializer(quiz)
    quiz_data          = quiz_serializer.data
    max_possible_score = sum(item.get("points", 1) for item in quiz_data.get("items", []))
    attempt_data["max_score"] = max_possible_score

    if cheat_prevention_active:
        for item in quiz_data.get("items", []):
            item.pop("correct_answer", None)
            item.pop("tf_correct", None)
            for choice in item.get("choices", []):
                choice.pop("is_correct", None)
            if "meta" in item:
                for pair in item["meta"].get("pairs", []):
                    pair.pop("right", None)
                item["meta"].pop("order", None)
                item["meta"].pop("explanation", None)

    student_ids = (
        QuizAttempt.objects.filter(quiz=quiz, end_time__isnull=False)
        .values_list("user", flat=True).distinct()
    )

    latest_attempts = []
    for sid in student_ids:
        latest_att = (
            QuizAttempt.objects.filter(quiz=quiz, user_id=sid, end_time__isnull=False)
            .order_by("-end_time").first()
        )
        if latest_att and latest_att.score is not None:
            latest_attempts.append(latest_att)

    total_students = len(latest_attempts)

    if total_students > 0:
        latest_scores = [att.score for att in latest_attempts]
        class_high    = max(latest_scores)
        class_low     = min(latest_scores)
        class_mean    = sum(latest_scores) / total_students

        latest_attempts.sort(key=lambda x: (-x.score, x.time_taken_seconds or float("inf")))

        leaderboard_data = []
        rank = None
        for index, att in enumerate(latest_attempts):
            r = index + 1
            leaderboard_data.append({
                "rank":         r,
                "student_name": att.user.username,
                "score":        att.score,
                "time_taken":   att.time_taken_seconds,
            })
            if att.id == attempt.id:
                rank = r

        if rank is None:
            rank = sum(1 for att in latest_attempts if att.score > (attempt.score or 0)) + 1
    else:
        class_high = class_low = class_mean = rank = None
        leaderboard_data = []

    previous_attempt = (
        QuizAttempt.objects.filter(quiz=quiz, user=attempt.user, end_time__lt=attempt.end_time)
        .order_by("-end_time").first()
    )
    previous_attempt_score = previous_attempt.score if previous_attempt else None

    return Response({
        "quiz":                    quiz_data,
        "attempt":                 attempt_data,
        "attempts_used":           attempts_used,
        "attempts_allowed":        attempts_allowed,
        "cheat_prevention_active": cheat_prevention_active,
        "analytics": {
            "total_students":         total_students,
            "class_mean":             round(class_mean) if class_mean is not None else None,
            "class_high":             class_high,
            "class_low":              class_low,
            "rank":                   rank,
            "previous_attempt_score": previous_attempt_score,
            "leaderboard":            leaderboard_data,
        },
    })


@api_view(["POST"])
def quiz_unpublish_view(request, quiz_id):
    try:
        quiz = Quiz.objects.get(id=quiz_id, author=request.user)
    except Quiz.DoesNotExist:
        return Response({"message": "Quiz not found or unauthorized."}, status=status.HTTP_404_NOT_FOUND)
    quiz.status = "draft"
    quiz.save()
    return Response({"message": "Quiz reverted to draft."})


@api_view(["GET", "POST"])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def quiz_item_list_create_view(request, quiz_id):
    try:
        quiz = Quiz.objects.get(id=quiz_id)
    except Quiz.DoesNotExist:
        return Response({"message": "Quiz not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        items      = quiz.items.all().order_by("sort_order", "id")
        serializer = QuizItemSerializer(items, many=True)
        return Response({"items": serializer.data})

    if quiz.author != request.user:
        return Response({"message": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    serializer = QuizItemSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save(quiz=quiz)
    return Response({"item": serializer.data}, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def quiz_item_detail_view(request, quiz_id, item_id):
    try:
        item = QuizItem.objects.get(id=item_id, quiz_id=quiz_id)
    except QuizItem.DoesNotExist:
        return Response({"message": "Item not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        serializer = QuizItemSerializer(item)
        return Response({"item": serializer.data})

    if item.quiz.author != request.user:
        return Response({"message": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "PUT":
        serializer = QuizItemSerializer(item, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"item": serializer.data})

    if request.method == "DELETE":
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
def quiz_item_reorder_view(request, quiz_id):
    try:
        quiz = Quiz.objects.get(id=quiz_id, author=request.user)
    except Quiz.DoesNotExist:
        return Response({"message": "Quiz not found or unauthorized."}, status=status.HTTP_404_NOT_FOUND)

    order_data = request.data
    if not isinstance(order_data, list):
        return Response({"message": "Expected a list of objects."}, status=status.HTTP_400_BAD_REQUEST)

    item_ids  = [str(o.get("id", "")) for o in order_data if o.get("id")]
    items     = list(QuizItem.objects.filter(quiz=quiz, id__in=item_ids))
    item_dict = {str(item.id): item for item in items}

    items_to_update = []
    for obj in order_data:
        str_id = str(obj.get("id"))
        if str_id in item_dict:
            item            = item_dict[str_id]
            item.sort_order = obj.get("sort_order", 0)
            items_to_update.append(item)

    if items_to_update:
        QuizItem.objects.bulk_update(items_to_update, ["sort_order"])

    return Response({"message": "Order updated successfully."})