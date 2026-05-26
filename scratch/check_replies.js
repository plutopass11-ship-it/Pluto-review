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

async function checkComments() {
  const loginRes = await fetch(`${KITSU_API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  
  const { access_token } = await loginRes.json();
  const headers = { Authorization: `Bearer ${access_token}` };
  
  const projectsRes = await fetch(`${KITSU_API_URL}/data/projects`, { headers });
  const projects = await projectsRes.json();
  const projectId = projects[0].id;
  
  const tasksRes = await fetch(`${KITSU_API_URL}/data/tasks?project_id=${projectId}`, { headers });
  const tasks = await tasksRes.json();
  
  let foundWithReplies = false;
  for (const task of tasks) {
    const commentsRes = await fetch(`${KITSU_API_URL}/data/tasks/${task.id}/comments`, { headers });
    const comments = await commentsRes.json();
    const withReplies = comments.filter(c => c.replies && c.replies.length > 0);
    if (withReplies.length > 0) {
      foundWithReplies = true;
      console.log(`\nFound comment with replies on task: ${task.entity_name} (Task ID: ${task.id})`);
      console.log('Original comment ID:', withReplies[0].id);
      console.log('Original comment text:', withReplies[0].text);
      console.log('Replies structure:');
      console.log(JSON.stringify(withReplies[0].replies, null, 2));
      break;
    }
  }
  
  if (!foundWithReplies) {
    console.log('No comments found with replies. We will check the general fields.');
  }
}

checkComments().catch(console.error);
