import fs from 'fs/promises';
import { join } from 'path';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const DB_FILE = join(process.cwd(), 'data', 'read-status.json');

async function getReadStatus() {
  try {
    const data = await fs.readFile(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

async function saveReadStatus(readStatus) {
  const { mkdir } = fs;
  await mkdir(join(process.cwd(), 'data'), { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(readStatus, null, 2), 'utf-8');
}

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) {
      return Response.json({}, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
        }
      });
    }

    const readStatus = await getReadStatus();
    return Response.json(readStatus[session.email] || {}, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
      }
    });
  } catch (error) {
    return Response.json({ error: 'Failed to read status' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { shotId } = await request.json();
    if (!shotId) {
      return Response.json({ error: 'shotId is required' }, { status: 400 });
    }

    const readStatus = await getReadStatus();
    if (!readStatus[session.email]) readStatus[session.email] = {};
    readStatus[session.email][shotId] = true;

    await saveReadStatus(readStatus);
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: 'Failed to update read status' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const session = await getSession();
    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { shotId } = await request.json();
    if (!shotId) {
      return Response.json({ error: 'shotId is required' }, { status: 400 });
    }

    const readStatus = await getReadStatus();
    if (readStatus[session.email]) {
      delete readStatus[session.email][shotId];
    }

    await saveReadStatus(readStatus);
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: 'Failed to update read status' }, { status: 500 });
  }
}
