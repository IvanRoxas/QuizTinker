import logging
from quizzes.models import Quiz
from quizzes.views import _run_generation

logger = logging.getLogger(__name__)

def generate_quiz_task(quiz_id, category, specialization, topic_focus, num_questions, bloom_counts, reference_material, lang_mode, has_reference_file, specialization_confidence, retry_count=0):
    try:
        quiz = Quiz.objects.get(id=quiz_id)
        
        created_items = _run_generation(
            quiz=quiz,
            category=category,
            specialization=specialization,
            topic_focus=topic_focus,
            num_questions=num_questions,
            bloom_counts=bloom_counts,
            reference_material=reference_material,
            lang_mode=lang_mode,
            has_reference_file=has_reference_file,
            specialization_confidence=specialization_confidence,
            retry_count=retry_count,
        )
        
        if created_items:
            quiz.status = "published"
            quiz.save(update_fields=["status"])
            logger.info(f"[AI QUIZ] Background task finished successfully. Quiz {quiz_id} published.")
        else:
            quiz.status = "error"
            quiz.save(update_fields=["status"])
            logger.error(f"[AI QUIZ] Background task returned no items. Quiz {quiz_id} marked as error.")
            
    except Exception as e:
        logger.error(f"[AI QUIZ] Background task failed for quiz {quiz_id}: {str(e)}")
        try:
            quiz = Quiz.objects.get(id=quiz_id)
            meta = quiz.meta or {}
            meta['error_message'] = str(e)
            quiz.meta = meta
            quiz.status = "error"
            quiz.save(update_fields=["status", "meta"])
        except Exception:
            pass
