import axiosClient from './axiosClient';

/**
 * Fetch quizzes with optional filter params.
 * @param {Object} params – query string params (status, mine, search, generation_type, availability, author)
 */
export const fetchQuizzes = async (params = {}) => {
    const res = await axiosClient.get('/api/quizzes/', { params });
    return res.data.quizzes;
};

export const createQuiz = async (data) => {
    const res = await axiosClient.post('/api/quizzes/', data, {
        headers: {
            'Content-Type': data instanceof FormData ? 'multipart/form-data' : 'application/json',
        },
    });
    return res.data.quiz;
};

export const aiGenerateQuiz = async (data) => {
    const res = await axiosClient.post('/api/quizzes/ai-generate/', data, {
        headers: {
            'Content-Type': data instanceof FormData ? 'multipart/form-data' : 'application/json',
        },
    });
    return res.data; 
};

export const updateQuiz = async (quizId, data) => {
    const res = await axiosClient.put(`/api/quizzes/${quizId}/`, data, {
        headers: {
            'Content-Type': data instanceof FormData ? 'multipart/form-data' : 'application/json',
        },
    });
    return res.data.quiz;
};

export const deleteQuiz = async (quizId) => {
    const res = await axiosClient.delete(`/api/quizzes/${quizId}/`);
    return res.data;
};

export const fetchQuiz = async (quizId) => {
    const res = await axiosClient.get(`/api/quizzes/${quizId}/`);
    return res.data.quiz;
};

export const autoSaveQuiz = async (quizId, data) => {
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
