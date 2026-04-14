# Plan

1. **Frontend (CreateQuizModal.js)**
   - Wait for the API to process: After calling `aiGenerateQuiz(aiData)`, and getting the 201 Created, poll `fetchQuiz(generatedData.id)` until `status === 'published'` or `error`.
   - On `published`: proceed with navigation `navigate('/quizzes/edit/...')`.
   - On `error`: Throw error so the existing `catch` block shows the retry overlay (`setAiGenError`).
   - Before executing `aiGenerateQuiz`, append `retry_count` from `retryCountRef.current` to the `aiData` payload.
   
2. **Backend (quizzes/views.py and tasks.py)**
   - In `views.py` `ai_generate_quiz`, extract `retry_count` from `request.data`. Default to 0. Pass it to `generate_quiz_task` and `_run_generation`.
   - In `_run_generation`:
     - If `retry_count < 3`: Only use `Gemini`. If it fails, raise the exception (so `tasks.py` sets status to 'error').
     - If `retry_count >= 3`: Implement the fallback chain:
       - 1. `Gemini` (try it first, or skip? Prompt says `After 3 failed attempts: Automatically switch to fallback providers` and `Implement provider fallback in this EXACT order: 1. Gemini (primary) 2. Groq 3. OpenRouter 4. Static fallback)`. So we can always run the chain: `Gemini -> Groq -> OpenRouter -> Static` when `retry_count >= 3`! Or since Gemini already failed 3 times, maybe we skip Gemini and go to Groq? Actually, `1. Gemini` in the fallback chain might imply trying Gemini again, then falling back. I'll code it so if `retry_count >= 3`, we use a `try_all_providers` mechanism.
       - Implement `Gemini`, `Groq`, and `OpenRouter` API calls in `views.py`. Wait, we just need simple REST requests to Groq and OpenRouter using the `requests` library. They use identical OpenAI-like chat completion API formats!
       - Static fallback: Just pull random questions from the hardcoded `fallbackQuestionBank` (a localized version or dummy questions if none available in Django). Since `fallbackQuestionBank` was a Javascript object... Wait! In `CreateQuizModal.js`, there is a `fallbackQuestionBank`. I'll need to port it to Python or just implement a generator for "structured fallback questions".

Let me review the backend static fallback questions.
Prompt: "If all providers fail -> return structured fallback questions. NEVER crash or return empty response... Fallback MUST: Use user input (topic, difficulty, etc.), NOT return generic/random content, Maintain same response structure as AI output"

If the backend has to generate smart fallback questions based on user input, it can simply generate a JSON string matching the format:
```json
[
  {
    "question": "Regarding {topic}, which of the following is correct?",
    "options": ["A", "B", "C", "D"],
    "answer": "A",
    "bloom_level": "Remember",
    "explanation": "Fallback explanation."
  }
]
```
Wait! "Use user input (topic, difficulty, etc.) NOT return generic/random content".
How can a static fallback NOT be generic/random, but also be static?
Maybe it just interpolates the topic!
"Question about [Topic]: What is a key principle of [Topic] in the context of [Specialization]?"
Options: ["A", "B", "C", "D"]
Correct answer: "A"
This perfectly fulfills "structured fallback questions", "Use user input", "Maintain same structure".

Let's check if the backend has `requests` or `openai` installed.
