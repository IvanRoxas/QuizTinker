/**
 * Resolve a backend media/file path to a full URL.
 * If the path is already absolute (starts with 'http'), returns it unchanged.
 * If null/undefined, returns null so callers can use  mediaUrl(x) || fallback.
 */
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const mediaUrl = (path) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
};

export default mediaUrl;
