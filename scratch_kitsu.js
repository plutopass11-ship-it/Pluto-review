const fs = require('fs');
const path = require('path');

const envPath = path.resolve('C:\\Projects\\Experiments\\AntiGravityExp\\KitsuClient\\.env.local');
const envStr = fs.readFileSync(envPath, 'utf8');
envStr.split('\\n').forEach(line => {
  const [k, v] = line.split('=');
  if (k && v) process.env[k.trim()] = v.trim();
});

const KITSU_API_URL = process.env.KITSU_API_URL || 'http://localhost:3002/api';
const EMAIL = process.env.KITSU_EMAIL;
const PASSWORD = process.env.KITSU_PASSWORD;

async function test() {
  const loginRes = await fetch(`${KITSU_API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  const { access_token } = await loginRes.json();
  
  const headers = { Authorization: `Bearer ${access_token}` };
  
  // Get a project id
  const projectsRes = await fetch(`${KITSU_API_URL}/data/projects`, { headers });
  const projects = await projectsRes.json();
  const projectId = projects[0].id;
  console.log('Project ID:', projectId);
  
  // Test 1: Fetch all shots for project
  const shotsRes = await fetch(`${KITSU_API_URL}/data/shots?project_id=${projectId}`, { headers });
  const shots = await shotsRes.json();
  console.log(`Fetched ${shots.length} shots using ?project_id=`);
  
  // Test 3: Can we fetch preview files by project_id?
  const previewsRes = await fetch(`${KITSU_API_URL}/data/preview-files?project_id=${projectId}`, { headers });
  const previewsText = await previewsRes.text();
  if (previewsText.startsWith('[')) {
    console.log(`Previews fetched array of length: ${JSON.parse(previewsText).length}`);
  } else {
    console.log('Previews response:', previewsText.slice(0, 100));
  }
}

test().catch(console.error);
