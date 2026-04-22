import axiosClient from './axiosClient';

export const fetchQuizToTake = async (quizId) => {
    const response = await axiosClient.get(`/api/quizzes/${quizId}/take/`);
    return response.data;
};

export const startQuizAttempt = async (quizId) => {
    const response = await axiosClient.post(`/api/quizzes/${quizId}/start/`);
    return response.data;
};

export const submitQuizAttempt = async (quizId, payload) => {
    const response = await axiosClient.post(`/api/quizzes/${quizId}/submit/`, payload);
    return response.data;
};
