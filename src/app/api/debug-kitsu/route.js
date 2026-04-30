import { getKitsuToken, getKitsuApiUrl } from '@/lib/kitsu';

export async function GET() {
  const apiUrl = getKitsuApiUrl();
  const email = process.env.KITSU_EMAIL;
  
  console.log('--- Kitsu Debug Start ---');
  console.log('API URL:', apiUrl);
  console.log('Email:', email);

  try {
    const startTime = Date.now();
    const token = await getKitsuToken();
    const duration = Date.now() - startTime;
    
    // Fetch raw projects to see what's available
    const [rawProjects, taskTypes, projectStatuses] = await Promise.all([
      fetch(`${apiUrl}/data/projects`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => res.json()),
      fetch(`${apiUrl}/data/task-types`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => res.json()),
      fetch(`${apiUrl}/data/project-status`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => res.json())
    ]);

    const statusMap = {};
    projectStatuses.forEach(s => statusMap[s.id] = s.name);
    
    return Response.json({
      status: 'success',
      message: 'Successfully authenticated with Kitsu',
      apiUrl,
      email,
      authDurationMs: duration,
      projectsCount: rawProjects.length,
      availableProjects: rawProjects.map(p => ({ 
        id: p.id, 
        name: p.name, 
        status: statusMap[p.project_status_id] || `Unknown (${p.project_status_id})` 
      })),
      availableTaskTypes: taskTypes.map(t => t.name),
      tokenPreview: token ? `${token.substring(0, 10)}...` : 'none'
    });
  } catch (error) {
    console.error('Debug Route Error:', error.message);
    
    return Response.json({
      status: 'error',
      message: error.message,
      apiUrl,
      email,
      suggestion: error.message.includes('ECONNREFUSED') 
        ? 'The Kitsu API container is not reachable. Check if it is running on the same NAS and port 3002 is open.'
        : 'Check your credentials in docker-compose.yml'
    }, { status: 500 });
  }
}
