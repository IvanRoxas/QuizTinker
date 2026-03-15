import axiosClient from './axiosClient';

/**
 * Fetch quizzes with optional filter params.
 * @param {Object} params – query string params (status, mine, search, generation_type, availability, author)
 */
export const fetchQuizzes = async (params = {}) => {
    const res = await axiosClient.get('/api/quizzes/', { params });
    return res.data.quizzes;
};

/**
 * Create a new quiz. Accepts a FormData object or local object.
 */
export const createQuiz = async (data) => {
    const res = await axiosClient.post('/api/quizzes/', data, {
        headers: {
            'Content-Type': data instanceof FormData ? 'multipart/form-data' : 'application/json',
        },
    });
    return res.data.quiz;
};

/**
 * Generate a new quiz using AI. Accepts a JSON object.
 */
export const aiGenerateQuiz = async (data) => {
    const res = await axiosClient.post('/api/quizzes/ai-generate/', data);
    return res.data; // Will return { id: quiz_id, questions: [...] } based on spec
};

/**
 * Update an existing quiz.  Accepts a FormData object (PATCH-style partial update).
 */
export const updateQuiz = async (quizId, data) => {
    const res = await axiosClient.put(`/api/quizzes/${quizId}/`, data, {
        headers: {
            'Content-Type': data instanceof FormData ? 'multipart/form-data' : 'application/json',
        },
    });
    return res.data.quiz;
};

/**
 * Delete a quiz by ID.
 */
export const deleteQuiz = async (quizId) => {
    const res = await axiosClient.delete(`/api/quizzes/${quizId}/`);
    return res.data;
};

// --- New Endpoints for ManageQuizContentPage ---

export const fetchQuiz = async (quizId) => {
    const res = await axiosClient.get(`/api/quizzes/${quizId}/`);
    return res.data.quiz;
};

export const autoSaveQuiz = async (quizId, data) => {
    // We send a JSON payload for autosave to be fast, or FormData if needed.
    // Assuming simple JSON is fine since we just save title/desc/settings.
    // If we need multipart, we'd use formData. The backend accepts both.
    const res = await axiosClient.put(`/api/quizzes/${quizId}/`, data, {
        headers: {
            'Content-Type': data instanceof FormData ? 'multipart/form-data' : 'application/json',
        },
    });
    return res.data.quiz;
};

export const unpublishQuiz = async (quizId) => {
    const res = await axiosClient.post(`/api/quizzes/${quizId}/unpublish/`);
    return res.data;
};

// --- QuizItem Endpoints ---

export const createQuizItem = async (quizId, formData) => {
    const res = await axiosClient.post(`/api/quizzes/${quizId}/items/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.item;
};

export const updateQuizItem = async (quizId, itemId, formData) => {
    const res = await axiosClient.put(`/api/quizzes/${quizId}/items/${itemId}/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.item;
};

export const deleteQuizItem = async (quizId, itemId) => {
    const res = await axiosClient.delete(`/api/quizzes/${quizId}/items/${itemId}/`);
    return res.data;
};

export const reorderQuizItems = async (quizId, orderData) => {
    const res = await axiosClient.post(`/api/quizzes/${quizId}/items/reorder/`, orderData);
    return res.data;
};
