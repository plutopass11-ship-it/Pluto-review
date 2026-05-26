import { promises as fs } from 'fs';
import { join } from 'path';
import { getSession } from '@/lib/session';
import { getUserByEmail, getDisplayName } from '@/lib/user-store';

const APPROVALS_FILE = join(process.cwd(), 'data', 'project-approvals.json');
const SETTINGS_FILE = join(process.cwd(), 'data', 'project-settings.json');

async function getApprovals() {
    try {
        const data = await fs.readFile(APPROVALS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') return {};
        throw error;
    }
}

async function saveApprovals(data) {
    await fs.mkdir(join(process.cwd(), 'data'), { recursive: true });
    await fs.writeFile(APPROVALS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

async function getProjectSettings() {
    try {
        const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') return {};
        throw error;
    }
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const taskId = searchParams.get('taskId');
        const projectId = searchParams.get('projectId');

        if (!taskId || !projectId) {
            return Response.json({ error: 'Missing taskId or projectId' }, { status: 400 });
        }

        const allSettings = await getProjectSettings();
        const settings = allSettings[projectId] || { approvalMode: 'single', assignedApprovers: [] };

        const approvals = await getApprovals();
        const taskApprovals = approvals[taskId] || [];

        const assignedApproversWithNames = await Promise.all(
            settings.assignedApprovers.map(async (email) => {
                const user = await getUserByEmail(email);
                return {
                    email,
                    name: user ? getDisplayName(user) : email,
                    hasApproved: taskApprovals.some(e => e.toLowerCase() === email.toLowerCase())
                };
            })
        );

        const isFullyApproved = settings.approvalMode === 'single'
            ? taskApprovals.length > 0
            : settings.assignedApprovers.length > 0 && settings.assignedApprovers.every(email => 
                taskApprovals.some(e => e.toLowerCase() === email.toLowerCase())
              );

        return Response.json({
            mode: settings.approvalMode,
            assignedApprovers: assignedApproversWithNames,
            approvedBy: taskApprovals,
            isFullyApproved
        });
    } catch (error) {
        console.error('Approvals GET error:', error);
        return Response.json({ error: 'Failed to fetch approvals' }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const session = await getSession();
        if (!session) {
            return Response.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const user = await getUserByEmail(session.email);
        if (!user || user.status !== 'approved') {
            return Response.json({ error: 'User not approved' }, { status: 401 });
        }

        const { taskId, projectId } = await request.json();
        if (!taskId || !projectId) {
            return Response.json({ error: 'Missing taskId or projectId' }, { status: 400 });
        }

        const allSettings = await getProjectSettings();
        const settings = allSettings[projectId] || { approvalMode: 'single', assignedApprovers: [] };

        const approvals = await getApprovals();
        if (!approvals[taskId]) approvals[taskId] = [];

        if (!approvals[taskId].some(e => e.toLowerCase() === session.email.toLowerCase())) {
            approvals[taskId].push(session.email);
        }

        await saveApprovals(approvals);

        const isFullyApproved = settings.approvalMode === 'single'
            ? true
            : settings.assignedApprovers.length > 0 && settings.assignedApprovers.every(email => 
                approvals[taskId].some(e => e.toLowerCase() === email.toLowerCase())
              );

        return Response.json({
            isFullyApproved,
            approvedBy: approvals[taskId],
            totalRequired: settings.assignedApprovers.length
        });
    } catch (error) {
        console.error('Approvals POST error:', error);
        return Response.json({ error: 'Failed to submit approval' }, { status: 500 });
    }
}
