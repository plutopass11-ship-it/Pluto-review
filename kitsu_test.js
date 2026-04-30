
const EMAIL = 'plutobase@flyingpluto.ai';
const PASSWORD = 'Styx0011';
const API_URL = 'http://192.168.1.60:3002/api';

async function test() {
    try {
        // 1. Auth
        const authRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: EMAIL, password: PASSWORD })
        });
        const authData = await authRes.json();
        console.log("Auth Response:", JSON.stringify(authData));
        const token = authData.access_token;
        console.log("Extracted token length:", token ? token.length : 0);

        const projectsRes = await fetch(`${API_URL}/data/projects`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const projects = await projectsRes.json();
        console.log("Raw Projects response structure:", JSON.stringify(projects).substring(0, 150));
        const projectId = projects[0]?.id;
        console.log("Project ID:", projectId);

        // 3. Fetch Tasks
        const tasksRes = await fetch(`${API_URL}/data/projects/${projectId}/tasks`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        let tasks = await tasksRes.json();
        if (!tasks || tasks.length === 0) {
            const altTasksRes = await fetch(`${API_URL}/data/tasks?project_id=${projectId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            tasks = await altTasksRes.json();
        }

        const taskTypesRes = await fetch(`${API_URL}/data/task-types`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const taskTypes = await taskTypesRes.json();
        console.log("All task types available:", taskTypes.map(t => t.name).join(', '));
        
        const clientReviewType = taskTypes.find(t => t.name === 'Client Review');
        if (!clientReviewType) {
            console.log("NO 'Client Review' TYPE FOUND!");
        }

        // Check project statuses
        const statRes = await fetch(`${API_URL}/data/project-status`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const statuses = await statRes.json();
        console.log("All project statuses:", statuses.map(s => s.name).join(', '));

        // 4. Fetch Comments for Task
        const commentsRes = await fetch(`${API_URL}/data/tasks/${task.id}/comments`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const comments = await commentsRes.json();
        console.log("Comments on task:", JSON.stringify(comments, null, 2));

    } catch (e) {
        console.error("Test Error:", e);
    }
}

test();
