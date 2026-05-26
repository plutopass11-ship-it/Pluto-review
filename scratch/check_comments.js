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
  console.log(`Using Kitsu API: ${KITSU_API_URL}`);
  console.log(`Logging in as: ${EMAIL}`);
  
  const loginRes = await fetch(`${KITSU_API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  
  if (!loginRes.ok) {
    throw new Error(`Login failed with status: ${loginRes.status}`);
  }
  
  const { access_token } = await loginRes.json();
  const headers = { Authorization: `Bearer ${access_token}` };
  
  // Get projects
  const projectsRes = await fetch(`${KITSU_API_URL}/data/projects`, { headers });
  const projects = await projectsRes.json();
  if (projects.length === 0) {
    console.log('No projects found');
    return;
  }
  const projectId = projects[0].id;
  console.log(`Found project: ${projects[0].name} (ID: ${projectId})`);
  
  // Fetch tasks
  const tasksRes = await fetch(`${KITSU_API_URL}/data/tasks?project_id=${projectId}`, { headers });
  const tasks = await tasksRes.json();
  console.log(`Found ${tasks.length} tasks`);
  
  // Find task with comments
  for (const task of tasks) {
    const commentsRes = await fetch(`${KITSU_API_URL}/data/tasks/${task.id}/comments`, { headers });
    const comments = await commentsRes.json();
    if (comments.length > 0) {
      console.log(`\nFound comments on task: ${task.entity_name} (Task ID: ${task.id})`);
      console.log('Sample comment structure:');
      console.log(JSON.stringify(comments[0], null, 2));
      
      // Let's print all comments' text and parent_id
      comments.forEach((c, idx) => {
        console.log(`Comment ${idx + 1}: [ID: ${c.id}] [Parent ID: ${c.parent_id || 'None'}] by Person: ${c.person_id}`);
        console.log(`  Text: "${c.text}"`);
      });
      break;
    }
  }
}

checkComments().catch(console.error);
