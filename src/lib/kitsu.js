import { formatUtcDateTime } from '@/lib/datetime';

const kitsuConfig = {
  apiUrl: process.env.KITSU_API_URL || 'http://localhost:3002/api',
  email: process.env.KITSU_EMAIL,
  password: process.env.KITSU_PASSWORD,
};

export function getKitsuApiUrl() {
  return kitsuConfig.apiUrl;
}

let cachedToken = null;
let tokenPromise = null;
let cachedTaskTypes = null;
let cachedTaskStatuses = null;
let cachedPersons = null;

function isPreviewReady(preview) {
  if (!preview) return false;
  const status = (preview.status || '').toLowerCase();
  return status !== 'processing' && status !== 'broken' && Number(preview.file_size || 0) > 0;
}

function sortPreviewsByRevisionDesc(previews = []) {
  return [...previews].sort((a, b) => (b.revision || 0) - (a.revision || 0));
}

function getBestPreviewForPlayback(previews = []) {
  const sorted = sortPreviewsByRevisionDesc(previews);
  return sorted.find(isPreviewReady) || sorted[0] || null;
}

export async function getKitsuToken() {
  if (cachedToken) return cachedToken;
  if (tokenPromise) return tokenPromise;

  tokenPromise = (async () => {
    try {
      const res = await fetch(`${kitsuConfig.apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: kitsuConfig.email, password: kitsuConfig.password }),
        cache: 'no-store'
      });

      if (!res.ok) throw new Error(`Kitsu authentication failed: ${res.status}`);

      const data = await res.json();
      if (!data.access_token) throw new Error('Kitsu authentication failed. No token received.');

      cachedToken = data.access_token;
      return cachedToken;
    } catch (error) {
      console.error('Kitsu Login Error:', error.message);
      throw error;
    } finally {
      tokenPromise = null;
    }
  })();

  return tokenPromise;
}

export async function fetchKitsuData(endpoint, isRetry = false) {
  const token = await getKitsuToken();
  const url = `${kitsuConfig.apiUrl}${endpoint}`;
  
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store'
    });

    if (res.status === 401 && !isRetry) {
      cachedToken = null;
      return fetchKitsuData(endpoint, true);
    }

    if (!res.ok) throw new Error(`API Error ${res.status}`);
    return res.json();
  } catch (error) {
    throw new Error(`Fetch failed to ${url}: ${error.message}`);
  }
}

export async function getProjects() {
  const projects = await fetchKitsuData('/data/projects');
  const statuses = await fetchKitsuData('/data/project-status').catch(() => []);

  const statusMap = {};
  statuses.forEach(s => {
    if (s && s.id && s.name) statusMap[s.id] = s.name.toLowerCase();
  });

  return projects.filter(p => {
    const statusName = statusMap[p.project_status_id] || '';
    return statusName !== 'closed' && statusName !== 'archived' && statusName !== 'completed';
  });
}

export async function getProjectById(projectId) {
  return await fetchKitsuData(`/data/projects/${projectId}`).catch(() => null);
}

export async function getClientReviewTaskType() {
  if (!cachedTaskTypes) {
    cachedTaskTypes = await fetchKitsuData('/data/task-types');
  }
  const clientReviewType = cachedTaskTypes.find(t => t.name === 'Client Review');
  if (!clientReviewType) throw new Error("Task Type 'Client Review' not found");
  return clientReviewType;
}

export async function getProjectsWithStats() {
  const projects = await getProjects();
  const taskStatuses = await fetchKitsuData('/data/task-status').catch(() => []);
  const reviewTaskType = await getClientReviewTaskType().catch(() => null);

  const statusMap = {};
  taskStatuses.forEach(s => statusMap[s.id] = (s.short_name || '').toLowerCase());

  const results = [];
  for (const project of projects) {
    let tasks = [];
    if (reviewTaskType) {
      tasks = await fetchKitsuData(`/data/tasks?project_id=${project.id}&task_type_id=${reviewTaskType.id}`).catch(() => []);
    }

    const activeTasks = tasks.filter(t => (statusMap[t.task_status_id] || '') !== 'todo');
    const approvedTasks = activeTasks.filter(t => {
      const s = statusMap[t.task_status_id] || '';
      return s === 'done' || s === 'approved';
    });

    results.push({
      ...project,
      total_shots: activeTasks.length,
      approved_shots: approvedTasks.length,
      completion_percentage: activeTasks.length > 0 ? (approvedTasks.length / activeTasks.length) * 100 : 0
    });
  }

  return results;
}

export async function getClientReviewTasks(projectId) {
  const reviewTaskType = await getClientReviewTaskType();
  const taskStatuses = await fetchKitsuData('/data/task-status').catch(() => []);
  const clientTasks = await fetchKitsuData(`/data/tasks?project_id=${projectId}&task_type_id=${reviewTaskType.id}`).catch(() => []);
  
  if (clientTasks.length === 0) return [];

  const [shotsRes, allPreviews] = await Promise.all([
    fetchKitsuData(`/data/shots?project_id=${projectId}`).catch(() => []),
    fetchKitsuData(`/data/preview-files?project_id=${projectId}`).catch(() => [])
  ]);

  const shotMap = {};
  shotsRes.forEach(s => {
    shotMap[s.id] = { name: s.name, sequenceName: s.sequence_name || 'Uncategorized' };
  });

  const statusMap = {};
  taskStatuses.forEach(s => statusMap[s.id] = { name: s.name, short_name: s.short_name });

  const taskPreviewsMap = {};
  allPreviews.forEach(p => {
    if (!taskPreviewsMap[p.task_id]) taskPreviewsMap[p.task_id] = [];
    taskPreviewsMap[p.task_id].push(p);
  });
  Object.values(taskPreviewsMap).forEach(arr => arr.sort((a, b) => (b.revision || 0) - (a.revision || 0)));

  return clientTasks
    .map(task => {
      const shotData = shotMap[task.entity_id] || { name: task.entity_name || 'Unknown', sequenceName: 'Uncategorized' };
      const statusInfo = statusMap[task.task_status_id] || {};
      const previews = taskPreviewsMap[task.id] || [];
      const latest = getBestPreviewForPlayback(previews);
      return {
        ...task,
        entity_name: shotData.name,
        sequence_name: shotData.sequenceName,
        task_status_name: statusInfo.name || 'Unknown',
        task_status_short: statusInfo.short_name || '',
        thumbnail_url: latest ? `/api/proxy-thumbnail?id=${latest.id}` : null,
        video_url: latest ? `/api/proxy-video?id=${latest.id}&ext=${latest.extension || 'mp4'}` : null,
        preview_id: latest?.id || null,
        version_label: latest ? `v${String(latest.revision).padStart(2, '0')}` : 'v01',
        version_count: previews.length,
        project_id: task.project_id,
        preview_status: latest?.status || null,
      };
    });
}

// Keep getPlaylistData for compatibility if used elsewhere, aliasing to getClientReviewTasks
export const getPlaylistData = getClientReviewTasks;

export async function getTaskData(taskId) {
  const task = await fetchKitsuData(`/data/tasks/${taskId}`).catch(() => null);
  if (!task) return null;

  const [previews, comments, taskStatuses, persons] = await Promise.all([
    fetchKitsuData(`/data/preview-files?task_id=${taskId}`).catch(() => []),
    fetchKitsuData(`/data/tasks/${taskId}/comments`).catch(() => []),
    fetchKitsuData('/data/task-status').catch(() => []),
    fetchKitsuData('/data/persons').catch(() => [])
  ]);

  let entityName = task.entity_name || 'Unknown Shot';
  const baseUrl = kitsuConfig.apiUrl.replace(/\/api\/?$/, '');
  const versions = sortPreviewsByRevisionDesc(previews).map(p => ({
    id: p.id,
    previewId: p.id,
    url: `/api/proxy-video?id=${p.id}&ext=${p.extension || 'mp4'}`,
    directUrl: `${baseUrl}/movies/originals/preview-files/${p.id}.${p.extension || 'mp4'}`,
    name: `Iteration v${String(p.revision).padStart(2, '0')}`,
    created_at: p.created_at,
    status: p.status,
    is_playable: isPreviewReady(p)
  }));

  const personsMap = {};
  persons.forEach(p => personsMap[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim());

  const commentsList = comments
    .filter(c => c.text?.trim())
    .map(c => ({
      id: c.id,
      user: personsMap[c.person_id] || 'User',
      text: c.text,
      time: formatUtcDateTime(c.created_at),
      frame: null
    }));

  const statusObj = taskStatuses.find(s => s.id === task.task_status_id);

  return {
    id: task.id,
    entity_name: entityName,
    status_name: statusObj?.name || task.task_status_name || 'Pending Review',
    status_short: statusObj?.short_name || '',
    project_id: task.project_id,
    versions,
    comments: commentsList
  };
}

export async function updateTaskStatus(taskId, statusName, commentText = "") {
  const token = await getKitsuToken();
  const taskStatuses = await fetchKitsuData('/data/task-status');
  const targetStatus = taskStatuses.find(s => s.name.toLowerCase() === statusName.toLowerCase() || s.short_name.toLowerCase() === statusName.toLowerCase());

  if (!targetStatus) throw new Error(`Status ${statusName} not found`);

  const res = await fetch(`${kitsuConfig.apiUrl}/data/tasks/${taskId}/comments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ task_status_id: targetStatus.id, text: commentText }),
  });

  if (!res.ok) throw new Error(`Failed to update status: ${res.status}`);
  return res.json();
}

export async function getCurrentUser() {
  const persons = await fetchKitsuData('/data/persons').catch(() => []);
  const me = persons.find(p => p.email?.toLowerCase() === kitsuConfig.email?.toLowerCase());
  return me ? `${me.first_name} ${me.last_name}` : 'Current User';
}

export async function getTaskStatuses() {
  return await fetchKitsuData('/data/task-status').catch(() => []);
}
