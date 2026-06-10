import { promises as fs } from 'fs';
import { join } from 'path';

const SETTINGS_FILE = join(process.cwd(), 'data', 'project-settings.json');

async function getProjectSettings() {
    try {
        const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') return {};
        throw error;
    }
}

async function saveProjectSettings(data) {
    await fs.mkdir(join(process.cwd(), 'data'), { recursive: true });
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function validatePin(request) {
    return request.headers.get('x-admin-pin') === '9801';
}

export async function GET(request) {
    if (!validatePin(request)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const projectId = searchParams.get('projectId');

        if (!projectId) {
            return Response.json({ error: 'Missing projectId' }, { status: 400 });
        }

        const allSettings = await getProjectSettings();
        const settings = allSettings[projectId] || { approvalMode: 'single', assignedApprovers: [] };
        return Response.json(settings);
    } catch (error) {
        console.error('Project settings GET error:', error);
        return Response.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
}

export async function POST(request) {
    if (!validatePin(request)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { projectId, approvalMode, assignedApprovers, showFinalDeliveries } = await request.json();

        if (!projectId) {
            return Response.json({ error: 'Missing projectId' }, { status: 400 });
        }

        const allSettings = await getProjectSettings();
        const current = allSettings[projectId] || { approvalMode: 'single', assignedApprovers: [], showFinalDeliveries: false };

        if (approvalMode !== undefined) current.approvalMode = approvalMode;
        if (assignedApprovers !== undefined) current.assignedApprovers = assignedApprovers;
        if (showFinalDeliveries !== undefined) current.showFinalDeliveries = showFinalDeliveries;

        allSettings[projectId] = current;
        await saveProjectSettings(allSettings);

        return Response.json(current);
    } catch (error) {
        console.error('Project settings POST error:', error);
        return Response.json({ error: 'Failed to save settings' }, { status: 500 });
    }
}
