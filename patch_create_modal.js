const fs = require('fs');
const file = '/Users/danieltan/Desktop/QuizTinker/frontend/src/components/CreateQuizModal.js';
let content = fs.readFileSync(file, 'utf8');

const targetReplacement = `
                let aiData;
                const currentRetries = retryCountRef.current || 0;
                if (referenceFiles.length > 0) {
                    aiData = new FormData();
                    aiData.append('title', title.trim());
                    aiData.append('subtitle', subtitle.trim());
                    aiData.append('attempts_allowed', attemptsAllowed);
                    aiData.append('availability', availability);
                    if (deadline) aiData.append('deadline', new Date(deadline).toISOString());
                    aiData.append('category', category);
                    aiData.append('specialization', specialization);
                    aiData.append('prompt', promptText);
                    aiData.append('bloom_distribution', JSON.stringify(distribution));
                    aiData.append('retry_count', currentRetries);

                    referenceFiles.forEach((file, idx) => {
                        aiData.append(\`reference_file_\${idx + 1}\`, file);
                    });
                } else {
                    aiData = {
                        title: title.trim(),
                        subtitle: subtitle.trim(),
                        attempts_allowed: attemptsAllowed,
                        availability: availability,
                        deadline: deadline ? new Date(deadline).toISOString() : null,
                        category: category,
                        specialization: specialization,
                        prompt: promptText,
                        bloom_distribution: distribution,
                        retry_count: currentRetries
                    };
                }
                // Show generating message
                let btnText = "Generating Quiz";
                if (currentRetries === 1) btnText = "Retry 1/3 - Generating Quiz";
                if (currentRetries === 2) btnText = "Retry 2/3 - Generating Quiz";
                if (currentRetries >= 3) btnText = "Switching to backup AI... Generating Quiz";
                setAiGenerating(\`\${title.trim()} - \${btnText}\`);

                // ── AI Generation — single attempt, user-controlled retries ──────
                try {
                    const generatedData = await aiGenerateQuiz(aiData);
                    
                    // Wait for generation to finish by polling the background task
                    const { fetchQuiz } = await import('../api/quizApi');
                    let isGenerating = true;
                    let pollAttempts = 0;
                    let resultData = null;
                    
                    while (isGenerating && pollAttempts < 20) {
                        await new Promise(r => setTimeout(r, 3000)); // wait 3 seconds
                        const currentQuiz = await fetchQuiz(generatedData.id);
                        if (currentQuiz.status === 'published' || currentQuiz.status === 'draft') {
                            isGenerating = false;
                            resultData = currentQuiz;
                        } else if (currentQuiz.status === 'error') {
                            throw new Error(currentQuiz.meta?.error_message || "Generation failed");
                        }
                        pollAttempts++;
                    }
                    
                    if (isGenerating) {
                        throw new Error("Timeout: Generation took too long.");
                    }
                    
                    // Success — reset counter, navigate to editor
                    setAiGenerating(null);
                    retryCountRef.current = 0;
                    onSaved && onSaved(resultData, 'create');
                    resetBloom();
                    onClose();
                    navigate(\`/quizzes/edit/\${resultData.id}\`);
                } catch (aiErr) {
                    console.warn('AI generation attempt failed:', aiErr);
                    setAiGenerating(null);

                    // ── Parse error into user-friendly message ──
                    const rawMsg = aiErr.response?.data?.message || aiErr.response?.data?.error || aiErr.message || 'Unknown error';
                    let friendlyMsg = rawMsg;
                    if (typeof rawMsg === 'string') {
                        const messageMatch = rawMsg.match(/['"]message['"]:\\s*['"]([^'"]+)['"]/);
                        if (messageMatch) {
                            friendlyMsg = messageMatch[1];
                        } else if (rawMsg.includes('UNAVAILABLE') || rawMsg.includes('503')) {
                            friendlyMsg = 'The AI service is experiencing high demand. Please try again shortly.';
                        } else if (rawMsg.includes('RESOURCE_EXHAUSTED') || rawMsg.includes('429')) {
                            friendlyMsg = 'The AI service is currently overloaded. Please wait a moment and try again.';
                        }
                    }

                    // ── Increment retry counter (useRef — no stale-closure issues) ──
                    retryCountRef.current += 1;
                    const nextRetries = retryCountRef.current;

                    // The backend automatically falls back to Groq/OpenRouter/Static if retry_count >= 3.
                    // If it still fails AFTER backend completes all fallbacks (which shouldn't happen for static),
                    // or if it's < 3, we allow the user to click the next button.
                    
                    let overlayBtnText = "Retry 1/3";
                    if (nextRetries === 1) overlayBtnText = "Retry 1/3";
                    if (nextRetries === 2) overlayBtnText = "Retry 2/3";
                    if (nextRetries === 3) overlayBtnText = "Final Attempt";
                    if (nextRetries > 3) overlayBtnText = "Switching to backup AI";

                    // ═══ Show error overlay — user can Retry or go to Dashboard ═══
                    const remainingRetries = Math.max(0, 3 - nextRetries);
                    setAiGenError({
                        message: friendlyMsg,
                        retryCount: currentRetries,
                        remainingRetries,
                        btnText: overlayBtnText,
                        // retryFn uses handleContinueRef to ALWAYS call
                        // the latest handleContinue — never a stale closure.
                        retryFn: () => {
                            setAiGenError(null);
                            setTimeout(() => {
                                if (handleContinueRef.current) {
                                    handleContinueRef.current();
                                }
                            }, 50);
                        },
                    });
                    setContinuing(false);
                    return; // Exit early — don't throw to outer catch
                }
`;

const originalContentRegex = /let aiData;[\s\S]+?return; \/\/ Exit early — don't throw to outer catch\n                \}/;
content = content.replace(originalContentRegex, targetReplacement.trim());

fs.writeFileSync(file, content);
console.log('Done replacement');
