import fs from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';

const DB_FILE = join(process.cwd(), 'data', 'previs-requirements.json');

async function getRequirementsData() {
  try {
    const data = await fs.readFile(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { tasks: {} };
    }
    if (error instanceof SyntaxError) {
      console.error('[previs-requirements] Corrupted JSON file, resetting:', error.message);
      return { tasks: {} };
    }
    throw error;
  }
}

async function saveRequirementsData(data) {
  await fs.mkdir(join(process.cwd(), 'data'), { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    const data = await getRequirementsData();
    const tasks = data.tasks || {};

    if (!projectId) {
      return Response.json(tasks, {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' }
      });
    }

    // Filter by project if provided, otherwise return all
    const filtered = {};
    for (const [taskId, meta] of Object.entries(tasks)) {
      if (!meta.projectId || meta.projectId === projectId) {
        filtered[taskId] = meta;
      }
    }

    return Response.json(filtered, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' }
    });
  } catch (error) {
    console.error('[previs-requirements GET] error:', error);
    return Response.json({ error: 'Failed to read requirements tracking' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { taskId, entityId, projectId } = body;

    if (!taskId) {
      return Response.json({ error: 'taskId is required' }, { status: 400 });
    }

    const data = await getRequirementsData();
    if (!data.tasks) data.tasks = {};

    data.tasks[taskId] = {
      markedAt: new Date().toISOString(),
      entityId: entityId || data.tasks[taskId]?.entityId || null,
      projectId: projectId || data.tasks[taskId]?.projectId || null,
      commentCount: (data.tasks[taskId]?.commentCount || 0) + 1,
    };

    await saveRequirementsData(data);
    return Response.json({ success: true, taskId, meta: data.tasks[taskId] });
  } catch (error) {
    console.error('[previs-requirements POST] error:', error);
    return Response.json({ error: 'Failed to record requirement' }, { status: 500 });
  }
}
