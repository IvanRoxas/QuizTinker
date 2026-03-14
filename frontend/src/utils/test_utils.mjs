import { getDisplayName } from './userUtils.js';

const mockUsers = [
    { username: 'test_username', first_name: 'John', last_name: 'Doe', email: 'john@example.com' },
    { username: null, first_name: 'John', last_name: 'Doe', email: 'john@example.com' },
    { username: '', name: null, first_name: '', last_name: '', email: 'no_name@example.com' },
    { username: null, first_name: null, last_name: null, email: null },
    { name: 'laravel_name', email: 'laravel@example.com' },
    null
];

console.log('--- Display Name Tests ---');
mockUsers.forEach((user, i) => {
    try {
        console.log(`Test ${i + 1}:`, getDisplayName(user));
    } catch (e) {
        console.log(`Test ${i + 1} FAILED:`, e.message);
    }
});
