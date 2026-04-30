import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// We need to implement a dummy fetch or just import from kitsu.js
// Wait, kitsu.js might use Next.js specific things? It uses `process.env` and `fetch`.
// Let's just import it if possible.

// Node 18 has native fetch. Let's write the fetch manually to bypass Next.js module issues.
const apiUrl = process.env.KITSU_API_URL || 'http://localhost:3002/api';
const email = process.env.KITSU_EMAIL;
const password = process.env.KITSU_PASSWORD;

async function run() {
    console.log(`Connecting to ${apiUrl} with ${email}`);
    try {
        const authRes = await fetch(`${apiUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        if (!authRes.ok) throw new Error(`Auth failed: ${authRes.statusText}`);
        const token = (await authRes.json()).access_token;
        console.log('Got token');

        const projRes = await fetch(`${apiUrl}/data/projects`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const projects = await projRes.json();
        console.log(`Found ${projects.length} total projects`);

        const statRes = await fetch(`${apiUrl}/data/project-status`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const statuses = await statRes.json();
        
        const statusMap = {};
        statuses.forEach(s => statusMap[s.id] = s.name.toLowerCase());
        
        const activeProjects = projects.filter(p => {
            const statusName = statusMap[p.project_status_id] || '';
            return statusName !== 'closed' && statusName !== 'archived';
        });
        console.log(`Found ${activeProjects.length} active projects by status filter`);

        // Now test task types
        const typeRes = await fetch(`${apiUrl}/data/task-types`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const types = await typeRes.json();
        console.log(`Found ${types.length} task types`);
        
        const clientReviewType = types.find(t => t.name === 'Client Review');
        if (!clientReviewType) {
            console.log('CRITICAL ERROR: "Client Review" task type not found!');
            // Print out all task types available:
            console.log('Available task types: ', types.map(t => t.name).join(', '));
        } else {
            console.log('Found "Client Review" task type.');
        }

    } catch (err) {
        console.error('Error:', err);
    }
}

run();
