// Test script for Truhoom API endpoints
const http = require('http');

const baseUrl = 'http://localhost:3000';

function makeRequest(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      method,
      hostname: 'localhost',
      port: 3000,
      path,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function testHealth() {
  console.log('Testing GET /api/health...');
  const result = await makeRequest('GET', '/api/health');
  console.log(`Status: ${result.statusCode}`);
  console.log(`Body: ${result.body}`);
  console.log('---');
}

async function testSignup() {
  console.log('Testing POST /auth/signup...');
  const result = await makeRequest('POST', '/auth/signup', {
    email: 'test@example.com',
    password: 'password123',
    fullName: 'Test User',
  });
  console.log(`Status: ${result.statusCode}`);
  console.log(`Body: ${result.body}`);
  console.log('---');
}

async function testLogin() {
  console.log('Testing POST /auth/login...');
  const result = await makeRequest('POST', '/auth/login', {
    email: 'test@example.com',
    password: 'password123',
  });
  console.log(`Status: ${result.statusCode}`);
  console.log(`Body: ${result.body.substring(0, 200)}...`);
  console.log('---');
}

async function testMe(accessToken) {
  console.log('Testing GET /auth/me...');
  const result = await makeRequest('GET', '/auth/me', {}, {
    'Authorization': `Bearer ${accessToken}`,
  });
  console.log(`Status: ${result.statusCode}`);
  console.log(`Body: ${result.body.substring(0, 200)}...`);
  console.log('---');
}

async function main() {
  try {
    await testHealth();
    await testSignup();
    const loginResult = await testLogin();
    const body = JSON.parse(loginResult.body);
    const token = body.session?.access_token;
    if (token) {
      await testMe(token);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();