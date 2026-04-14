import re

file_path = "django_backend/quizzes/views.py"
with open(file_path, "r") as f:
    content = f.read()

start_marker = "def _run_generation("
end_marker = "# ===========================================================================\n# Views"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker, start_idx)

if start_idx == -1 or end_idx == -1:
    print("Markers not found!")
    exit(1)

new_func = """def _run_generation(
    quiz,
    category: str,
    specialization: str,
    topic_focus: str,
    num_questions: int,
    bloom_counts: dict = None,
    reference_material: str = "",
    lang_mode: str = "english",
    has_reference_file: bool = False,
    specialization_confidence: str = "high",
    retry_count: int = 0,
) -> list:
    import json
    import urllib.request
    import random
    from collections import Counter
    
    prompt_str = _build_let_prompt(
        category=category,
        specialization=specialization,
        topic_focus=topic_focus,
        num_questions=num_questions,
        bloom_counts=bloom_counts,
        reference_material=reference_material,
    )

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    generation_config = types.GenerateContentConfig(
        temperature=0.7,
        top_p=0.92,
        top_k=50,
        max_output_tokens=16384,
        response_mime_type="application/json",
    )

    def _parse_response(raw: str) -> list:
        if not raw: return []
        text = raw.strip()
        if not text: return []
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
            cleaned = cleaned.replace("\\n", " ").replace("\\r", " ")
            last_brace = cleaned.rfind("}")
            cleaned = (cleaned[:last_brace + 1] + "]") if last_brace != -1 else (cleaned + "]")
            try:
                return json.loads(cleaned)
            except json.JSONDecodeError as e2:
                logger.error(f"[AI QUIZ] Repair failed: {e2}")
                return []

    def _call_gemini():
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt_str,
            config=generation_config
        )
        return _parse_response(response.text)

    def _call_groq():
        try:
            req = urllib.request.Request(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}", "Content-Type": "application/json"}
            )
            data = json.dumps({
                "model": "llama-3.3-70b-versatile",
                "messages": [{"role": "user", "content": prompt_str}]
            }).encode()
            with urllib.request.urlopen(req, data=data, timeout=30) as response:
                res = json.loads(response.read().decode())
                return _parse_response(res["choices"][0]["message"]["content"])
        except Exception as e:
            logger.error(f"[AI QUIZ] Groq failed: {str(e)}")
            return None

    def _call_openrouter():
        try:
            req = urllib.request.Request(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.OPENROUTER_API_KEY}", "Content-Type": "application/json"}
            )
            data = json.dumps({
                "model": "meta-llama/llama-3-70b-instruct",
                "messages": [{"role": "user", "content": prompt_str}]
            }).encode()
            with urllib.request.urlopen(req, data=data, timeout=30) as response:
                res = json.loads(response.read().decode())
                return _parse_response(res["choices"][0]["message"]["content"])
        except Exception as e:
            logger.error(f"[AI QUIZ] OpenRouter failed: {str(e)}")
            return None

    def _generate_static_fallback():
        topic = (topic_focus or specialization or category).title()
        fallback_data = []
        bloom_mapping = {
            "remembering": "Remember",
            "understanding": "Understand",
            "applying": "Apply",
            "analyzing": "Analyze",
            "evaluating": "Evaluate",
            "creating": "Create"
        }
        
        target_bloom = []
        if bloom_counts:
            for b_key, count in bloom_counts.items():
                target_bloom.extend([bloom_mapping.get(b_key.lower(), "Understand")] * count)
        else:
            target_bloom = ["Understand"] * num_questions
            
        target_bloom = target_bloom[:num_questions]
        while len(target_bloom) < num_questions:
            target_bloom.append("Understand")
            
        for i, b_level in enumerate(target_bloom):
            opts = [
                f"Applying key principles of {topic} efficiently.",
                f"Understanding the core definition of {topic}.",
                f"Analyzing the root causes within {topic}.",
                f"Evaluating outcomes related to {topic}."
            ]
            ans = opts[0]
            random.shuffle(opts)
            fallback_data.append({
                "question": f"Regarding the concept of {topic}, which of the following statements best demonstrates {b_level.lower()} in a professional context?",
                "options": opts,
                "answer": ans,
                "bloom_level": b_level,
                "explanation": f"This option aligns best with {topic} and the required cognitive level."
            })
        return fallback_data

    questions_data = None
    used_provider = None

    if retry_count < 3:
        questions_data = _call_gemini()
        if not questions_data:
            raise Exception("Gemini returned empty or invalid response. Retry required.")
        used_provider = "Gemini"
    else:
        logger.info("[AI QUIZ] Retry limit reached. Entering Fallback Chain.")
        try:
            questions_data = _call_gemini()
            if questions_data: used_provider = "Gemini"
        except Exception:
            questions_data = None
            
        if not questions_data:
            questions_data = _call_groq()
            if questions_data: used_provider = "Groq"
            
        if not questions_data:
            questions_data = _call_openrouter()
            if questions_data: used_provider = "OpenRouter"
            
        if not questions_data:
            logger.warning("[AI QUIZ] All AI providers failed. Using static fallback.")
            questions_data = _generate_static_fallback()
            used_provider = "Static Fallback"
            
    if not isinstance(questions_data, list):
        questions_data = []
    questions_data = [q for q in questions_data if isinstance(q, dict)][:num_questions]
    logger.info(f"[AI QUIZ] Used Provider: {used_provider}, generated {len(questions_data)} / {num_questions} questions")

    # Save provider metadata
    quiz_meta = quiz.meta or {}
    quiz_meta['provider_used'] = used_provider
    quiz.meta = quiz_meta
    quiz.save(update_fields=["meta"])

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

"""

new_content = content[:start_idx] + new_func + content[end_idx:]

with open(file_path, "w") as f:
    f.write(new_content)

print("Patched successfully!")
