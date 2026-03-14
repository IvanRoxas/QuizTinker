import axiosClient from './axiosClient';

/**
 * Fetch the clean quiz payload (answers stripped).
 */
export const fetchQuizToTake = async (quizId) => {
    const response = await axiosClient.get(`/api/quizzes/${quizId}/take/`);
    return response.data;
};

/**
 * Log the start of an attempt.
 */
export const startQuizAttempt = async (quizId) => {
    const response = await axiosClient.post(`/api/quizzes/${quizId}/start/`);
    return response.data;
};

/**
 * Submit the final answers payload.
 * payload: { attempt_id: int, answers: { str(item_id): student_answer } }
 */
export const submitQuizAttempt = async (quizId, payload) => {
    const response = await axiosClient.post(`/api/quizzes/${quizId}/submit/`, payload);
    return response.data;
};
