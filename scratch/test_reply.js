const fs = require('fs');
const path = require('path');

// Read .env.local manually
const envPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envStr = fs.readFileSync(envPath, 'utf8');
  envStr.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const k = parts[0].trim();
      const v = parts.slice(1).join('=').trim();
      if (k && v) process.env[k] = v;
    }
  });
}

const KITSU_API_URL = process.env.KITSU_API_URL || 'http://192.168.1.60:3002/api';
const EMAIL = process.env.KITSU_EMAIL;
const PASSWORD = process.env.KITSU_PASSWORD;

async function testReply() {
  const loginRes = await fetch(`${KITSU_API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  
  const { access_token } = await loginRes.json();
  const headers = { 
    Authorization: `Bearer ${access_token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  const taskId = '3f0587ea-a2aa-4108-88a8-4855fa327559';
  const commentId = 'e392556c-df2d-474e-8093-e7c4cc1f0ed7';
  
  console.log(`Testing reply on Comment ID: ${commentId} on Task ID: ${taskId}`);
  
  const replyUrl = `${KITSU_API_URL}/data/tasks/${taskId}/comments/${commentId}/reply`;
  console.log(`Sending POST to ${replyUrl}`);
  
  const res = await fetch(replyUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      text: "This is a test reply with TEXT field",
      comment: "This is a test reply with COMMENT field"
    })
  });
  
  console.log(`Response status: ${res.status}`);
  const data = await res.json();
  console.log('Response data:', JSON.stringify(data, null, 2));
}

testReply().catch(console.error);
