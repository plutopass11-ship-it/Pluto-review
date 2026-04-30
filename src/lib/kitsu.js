import { formatUtcDateTime } from '@/lib/datetime';

// Internal config — not exported to avoid credential exposure
const kitsuConfig = {
  apiUrl: process.env.KITSU_API_URL || 'http://localhost:3002/api',
  email: process.env.KITSU_EMAIL,
  password: process.env.KITSU_PASSWORD,
};

// Expose only the API URL for use in proxy routes
export function getKitsuApiUrl() {
  return kitsuConfig.apiUrl;
}

let cachedToken = null;
let tokenPromise = null; // dedup concurrent auth fetches
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

/**
 * Authenticate with the Kitsu Zou API and retrieve a JWT token
 */
export async function getKitsuToken() {
  if (cachedToken) return cachedToken;

  // Deduplicate concurrent token fetches — reuse the in-flight promise
  if (tokenPromise) return tokenPromise;

  tokenPromise = (async () => {
    try {
      const res = await fetch(`${kitsuConfig.apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: kitsuConfig.email, password: kitsuConfig.password }),
      });

      if (!res.ok) throw new Error(`Kitsu authentication failed: ${res.status} ${res.statusText}`);

      const data = await res.json();
      if (data.login === false || !data.access_token) {
        throw new Error('Kitsu authentication failed. Check email/password in .env.local');
      }

      cachedToken = data.access_token;
      return cachedToken;
    } catch (error) {
      console.error('Error logging into Kitsu:', error);
      throw error;
    } finally {
      tokenPromise = null; // clear so next failure can retry
    }
  })();

  return tokenPromise;
}

/**
 * Fetch generic data from Kitsu with auth headers.
 * @param {string} endpoint
 * @param {boolean} isRetry
 * @param {RequestInit} [cacheOptions] - e.g. { next: { revalidate: 300 } } for stable data
 */
export async function fetchKitsuData(endpoint, isRetry = false, cacheOptions = { cache: 'no-store' }) {
  const token = await getKitsuToken();
  const res = await fetch(`${kitsuConfig.apiUrl}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...cacheOptions
  });

  if (res.status === 401 && !isRetry) {
    console.log("Kitsu token expired (401), refreshing token...");
    cachedToken = null;
    return fetchKitsuData(endpoint, true, cacheOptions);
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch ${endpoint} from Kitsu API: ${res.status}`);
  }

  return res.json();
}

/**
 * Get all active projects
 */
export async function getProjects() {
  const [projects, statuses] = await Promise.all([
    fetchKitsuData('/data/projects'),
    fetchKitsuData('/data/project-status', false, { next: { revalidate: 300 } }).catch(() => [])
  ]);

  const statusMap = {};
  statuses.forEach(s => statusMap[s.id] = s.name.toLowerCase());

  // Filter out 'closed' or 'archived'
  return projects.filter(p => {
    const statusName = statusMap[p.project_status_id] || '';
    return statusName !== 'closed' && statusName !== 'archived';
  });
}

/**
 * Get a single project by ID (much cheaper than fetching all projects)
 */
export async function getProjectById(projectId) {
  try {
    return await fetchKitsuData(`/data/projects/${projectId}`);
  } catch (e) {
    console.error(`Failed to fetch project ${projectId}:`, e);
    return null;
  }
}

/**
 * Get the "Client Review" task type ID
 */
export async function getClientReviewTaskType() {
  if (!cachedTaskTypes) {
    // Task types are stable — cache them server-side for 10 minutes
    cachedTaskTypes = await fetchKitsuData('/data/task-types', false, { next: { revalidate: 600 } });
  }
  const clientReviewType = cachedTaskTypes.find(t => t.name === 'Client Review');
  if (!clientReviewType) {
    throw new Error("Task Type 'Client Review' not found in Kitsu configuration");
  }
  return clientReviewType;
}

/**
 * Get tasks of type "Client Review" for a specific project
 * Joins with Shots and Sequences for accurate naming
 */
export async function getClientReviewTasks(projectId) {
  // Start task-types fetch and task-statuses in parallel — don't await task-types before starting other requests
  const [reviewTaskType, taskStatuses] = await Promise.all([
    getClientReviewTaskType(),
    fetchKitsuData('/data/task-status', false, { next: { revalidate: 60 } }).catch(() => [])
  ]);

  // Now fetch only Client Review tasks (already filtered server-side)
  let clientTasks = [];
  try {
    clientTasks = await fetchKitsuData(`/data/tasks?project_id=${projectId}&task_type_id=${reviewTaskType.id}`) || [];
  } catch (e) {
    console.error("Error fetching client tasks:", e);
  }

  if (clientTasks.length === 0) return [];

  const [shotsRes, allPreviews] = await Promise.all([
    // Fetch all shots for the project in one call (includes sequence_name)
    fetchKitsuData(`/data/shots?project_id=${projectId}`).catch(() => []),
    // Fetch all preview files for the project in one call
    fetchKitsuData(`/data/preview-files?project_id=${projectId}`).catch(() => [])
  ]);

  // Build shot/entity map from targeted results
  const shotMap = {};
  shotsRes.forEach(s => {
    shotMap[s.id] = { name: s.name, sequenceName: s.sequence_name || 'Uncategorized' };
  });

  // Build preview map: task_id -> best playable preview and version count
  const taskPreviewMap = {};
  allPreviews.forEach(p => {
    if (!taskPreviewMap[p.task_id]) {
      taskPreviewMap[p.task_id] = { previews: [p], count: 1 };
    } else {
      taskPreviewMap[p.task_id].count += 1;
      taskPreviewMap[p.task_id].previews.push(p);
    }
  });

  // Status map
  const statusMap = {};
  taskStatuses.forEach(s => statusMap[s.id] = { name: s.name, short_name: s.short_name });

  return clientTasks.map(task => {
    const shotData = shotMap[task.entity_id] || { name: task.entity_name || 'Unknown', sequenceName: 'Uncategorized' };
    const previewData = taskPreviewMap[task.id] || { previews: [], count: 0 };
    const latestPreview = getBestPreviewForPlayback(previewData.previews);
    const statusInfo = statusMap[task.task_status_id] || {};
    return {
      ...task,
      entity_name: shotData.name,
      sequence_name: shotData.sequenceName,
      thumbnail_url: latestPreview ? `/api/proxy-thumbnail?id=${latestPreview.id}` : null,
      version_count: previewData.count,
      task_status_name: statusInfo.name || task.task_status_name || 'Unknown',
      task_status_short: statusInfo.short_name || ''
    };
  });
}

/**
 * Update task status
 */
export async function updateTaskStatus(taskId, statusName, commentText = "") {
  // 1. Get the task status ID
  const token = await getKitsuToken();
  const taskStatuses = await fetchKitsuData('/data/task-status');

  // Zou task statuses are usually localized or simply named "Done", "Retake", etc.
  const targetStatus = taskStatuses.find(s => s.name.toLowerCase() === statusName.toLowerCase() || s.short_name.toLowerCase() === statusName.toLowerCase());

  if (!targetStatus) {
    throw new Error(`Status ${statusName} not found in Kitsu`);
  }

  // 2. Add comment and update status
  const res = await fetch(`${kitsuConfig.apiUrl}/data/tasks/${taskId}/comments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      task_status_id: targetStatus.id,
      text: commentText
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to update task status: ${res.status}`);
  }

  return res.json();
}

/**
 * Get all required data for the Review player
 */
export async function getTaskData(taskId) {
  try {
    // Fetch task, previews, comments, task-statuses and persons all in parallel
    const [task, previews, comments, taskStatuses, persons] = await Promise.all([
      fetchKitsuData(`/data/tasks/${taskId}`).catch(() => null),
      fetchKitsuData(`/data/preview-files?task_id=${taskId}`).catch(() => []),
      fetchKitsuData(`/data/tasks/${taskId}/comments`).catch(() => []),
      fetchKitsuData('/data/task-status', false, { next: { revalidate: 60 } }).catch(() => []),
      // Persons are stable — cache for 5 minutes
      fetchKitsuData('/data/persons', false, { next: { revalidate: 300 } }).catch(() => [])
    ]);

    if (!task) return null;

    // Entity name — use task.entity_name if available, else do a targeted lookup
    let entityName = task.entity_name || 'Unknown Shot';
    if (!entityName || entityName === 'Unknown Shot') {
      try {
        const ent = await fetchKitsuData(`/data/entities/${task.entity_id}`);
        if (ent?.name) entityName = ent.name;
      } catch (e) { }
    }

    // Build versions list (newest first)
    const baseUrl = kitsuConfig.apiUrl.replace(/\/api\/?$/, '');
    const versions = sortPreviewsByRevisionDesc(previews)
      .map(p => ({
        id: p.id,
        previewId: p.id,
        url: `/api/proxy-video?id=${p.id}&ext=${p.extension || 'mp4'}`,
        directUrl: `${baseUrl}/movies/originals/preview-files/${p.id}.${p.extension || 'mp4'}`,
        name: `Iteration v${String(p.revision).padStart(2, '0')}`,
        created_at: p.created_at,
        status: p.status,
        is_playable: isPreviewReady(p)
      }));

    // Build persons map
    const personsMap = {};
    persons.forEach(p => personsMap[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim());

    // Build comments list
    const commentsList = comments
      .filter(c => c.text?.trim())
      .map(c => {
        return {
          id: c.id,
          user: personsMap[c.person_id] || 'User',
          text: c.text,
          time: formatUtcDateTime(c.created_at),
          frame: null
        };
      });

    // Resolve status
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
  } catch (error) {
    console.error(`Error in getTaskData:`, error);
    return null;
  }
}

/**
 * Get the current user's name for the watermark
 */
export async function getCurrentUser() {
  try {
    if (!cachedPersons) {
      cachedPersons = await fetchKitsuData('/data/persons', false, { next: { revalidate: 300 } });
    }
    const me = cachedPersons.find(p => p.email?.toLowerCase() === kitsuConfig.email?.toLowerCase());
    return me ? `${me.first_name} ${me.last_name}` : 'Current User';
  } catch (e) {
    return 'Current User';
  }
}

/**
 * Get all task statuses — useful for dynamic filter building
 */
export async function getTaskStatuses() {
  if (!cachedTaskStatuses) {
    cachedTaskStatuses = await fetchKitsuData('/data/task-status', false, { next: { revalidate: 120 } }).catch(() => []);
  }
  return cachedTaskStatuses || [];
}

/**
 * Get active projects enhanced with stats (total shots and approved shots)
 */
export async function getProjectsWithStats() {
  // Fetch projects, statuses, and task type all in parallel
  const [projects, taskStatuses, reviewTaskType] = await Promise.all([
    getProjects(),
    fetchKitsuData('/data/task-status', false, { next: { revalidate: 120 } }).catch(() => []),
    getClientReviewTaskType().catch(() => null)
  ]);

  if (!cachedTaskStatuses) cachedTaskStatuses = taskStatuses;

  const statusMap = {};
  taskStatuses.forEach(s => statusMap[s.id] = s.short_name || '');

  const projectsWithStats = await Promise.all(projects.map(async (project) => {
    let tasks = [];
    try {
      // Filter by task_type_id server-side to avoid fetching thousands of irrelevant tasks
      if (reviewTaskType) {
        tasks = await fetchKitsuData(`/data/tasks?project_id=${project.id}&task_type_id=${reviewTaskType.id}`) || [];
      }
    } catch (e) {
      console.error(`Error fetching tasks for stats in project ${project.id}:`, e);
    }

    // Filter out "Todo" tasks
    const activeTasks = tasks.filter(t => {
      const shortName = (statusMap[t.task_status_id] || '').toLowerCase();
      return shortName !== 'todo';
    });

    const approvedTasks = activeTasks.filter(t => {
      const shortName = (statusMap[t.task_status_id] || '').toLowerCase();
      return shortName === 'done' || shortName === 'approved';
    });

    return {
      ...project,
      total_shots: activeTasks.length,
      approved_shots: approvedTasks.length,
      completion_percentage: activeTasks.length > 0 ? (approvedTasks.length / activeTasks.length) * 100 : 0
    };
  }));

  return projectsWithStats;
}

/**
 * Get all data needed for the playlist player — shots with video URLs, thumbnails, status, comments
 */
export async function getPlaylistData(projectId) {
  // Fetch task-type and task-statuses in parallel
  const [reviewTaskType, taskStatuses] = await Promise.all([
    getClientReviewTaskType(),
    fetchKitsuData('/data/task-status', false, { next: { revalidate: 60 } }).catch(() => [])
  ]);

  // Fetch only Client Review tasks (filtered server-side)
  let clientTasks = [];
  try {
    clientTasks = await fetchKitsuData(`/data/tasks?project_id=${projectId}&task_type_id=${reviewTaskType.id}`) || [];
  } catch (e) {
    console.error("Error fetching playlist tasks:", e);
  }

  if (clientTasks.length === 0) return [];

  const [shotsRes, allPreviews] = await Promise.all([
    // Fetch all shots for the project in one call (includes sequence_name)
    fetchKitsuData(`/data/shots?project_id=${projectId}`).catch(() => []),
    // Fetch all preview files for the project in one call
    fetchKitsuData(`/data/preview-files?project_id=${projectId}`).catch(() => [])
  ]);

  // Build shot/entity map
  const shotMap = {};
  shotsRes.forEach(s => {
    shotMap[s.id] = { name: s.name, sequenceName: s.sequence_name || 'Uncategorized' };
  });

  const statusMap = {};
  taskStatuses.forEach(s => statusMap[s.id] = { name: s.name, short_name: s.short_name });

  // Group previews by task (newest first)
  const taskPreviewsMap = {};
  allPreviews.forEach(p => {
    if (!taskPreviewsMap[p.task_id]) taskPreviewsMap[p.task_id] = [];
    taskPreviewsMap[p.task_id].push(p);
  });
  Object.values(taskPreviewsMap).forEach(arr => arr.sort((a, b) => b.revision - a.revision));

  return clientTasks
    .map(task => {
      const shotData = shotMap[task.entity_id] || { name: task.entity_name || 'Unknown', sequenceName: 'Uncategorized' };
      const statusInfo = statusMap[task.task_status_id] || {};
      const previews = taskPreviewsMap[task.id] || [];
      const latest = getBestPreviewForPlayback(previews);
      return {
        id: task.id,
        entity_name: shotData.name,
        sequence_name: shotData.sequenceName,
        task_status_name: statusInfo.name || 'Unknown',
        task_status_short: statusInfo.short_name || '',
        thumbnail_url: latest ? `/api/proxy-thumbnail?id=${latest.id}` : null,
        video_url: latest ? `/api/proxy-video?id=${latest.id}&ext=${latest.extension || 'mp4'}` : null,
        preview_id: latest?.id || null,
        version_label: latest ? `v${String(latest.revision).padStart(2, '0')}` : 'v01',
        project_id: task.project_id,
        preview_status: latest?.status || null,
      };
    })
    .filter(item => (item.task_status_short || '').toLowerCase() !== 'todo');
}
