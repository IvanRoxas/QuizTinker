import axios from 'axios';

// Helper: read a cookie by name
function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
}

const axiosClient = axios.create({
    baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8000',
    withCredentials: true,
});

// Attach Auth Token and CSRF token to every mutating request
axiosClient.interceptors.request.use((config) => {
    // 1. Bearer/Token Auth for session isolation
    const token = sessionStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Token ${token}`;
    }

    // 2. CSRF (still good for double protection, though Token Auth is inherently isolated)
    const method = config.method?.toLowerCase();
    if (method && method !== 'get' && method !== 'head' && method !== 'options') {
        const csrfToken = getCookie('csrftoken');
        if (csrfToken) {
            config.headers['X-CSRFToken'] = csrfToken;
        }
    }
    return config;
});

export default axiosClient;
