/**
 * Formats a user's display name based on available fields.
 * Priority: 
 * 1. Username
 * 2. First Name + Last Name
 * 3. Email Prefix (before @)
 * 4. "Anonymous User"
 * 
 * @param {Object} user - The user object from the API
 * @returns {string} The formatted display name
 */
export const getDisplayName = (user) => {
    if (!user) return 'Anonymous User';

    // 1. Username
    if (user.name || user.username) {
        return user.name || user.username;
    }

    // 2. First Name + Last Name
    if (user.first_name && user.last_name) {
        return `${user.first_name} ${user.last_name}`;
    }

    // 3. Email Prefix
    if (user.email) {
        return user.email.split('@')[0];
    }

    // 4. Fallback
    return 'Anonymous User';
};
