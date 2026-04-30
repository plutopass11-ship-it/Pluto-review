import fs from 'fs/promises';
import path from 'path';

const DB_FILE = path.join(process.cwd(), '.kitsu-read-status.json');

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

export async function GET(request) {
  try {
    const readStatus = await getReadStatus();
    return Response.json(readStatus);
  } catch (error) {
    return Response.json({ error: 'Failed to read status' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { shotId } = await request.json();
    if (!shotId) {
      return Response.json({ error: 'shotId is required' }, { status: 400 });
    }

    const readStatus = await getReadStatus();
    readStatus[shotId] = true;

    await fs.writeFile(DB_FILE, JSON.stringify(readStatus, null, 2), 'utf-8');
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: 'Failed to update read status' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { shotId } = await request.json();
    if (!shotId) {
      return Response.json({ error: 'shotId is required' }, { status: 400 });
    }

    const readStatus = await getReadStatus();
    delete readStatus[shotId];

    await fs.writeFile(DB_FILE, JSON.stringify(readStatus, null, 2), 'utf-8');
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: 'Failed to update read status' }, { status: 500 });
  }
}
