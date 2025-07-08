const API_BASE = 'https://cdn.evelocore.com';
const fetch = require('node-fetch');

const api = {
    login: async (username, password) => {
        const response = await fetch(`${API_BASE}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        return response.json();
    }
};

api.login('prabhasha', 'prabhasha@2006').then(console.log)