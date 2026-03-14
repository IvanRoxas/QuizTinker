const { getDisplayName } = require('./userUtils');

const mockUsers = [
    { username: 'test_username', first_name: 'John', last_name: 'Doe', email: 'john@example.com' },
    { username: null, first_name: 'John', last_name: 'Doe', email: 'john@example.com' },
    { username: '', first_name: '', last_name: '', email: 'no_name@example.com' },
    { username: null, first_name: null, last_name: null, email: null },
    { name: 'laravel_name', email: 'laravel@example.com' },
];

console.log('--- Display Name Tests ---');
mockUsers.forEach((user, i) => {
    console.log(`Test ${i + 1}:`, getDisplayName(user));
});
