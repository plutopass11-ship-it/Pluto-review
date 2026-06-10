import { promises as fs } from 'fs';
import { join } from 'path';
import { getSession } from '@/lib/session';
import { getUserByEmail, getDisplayName } from '@/lib/user-store';
import { fetchKitsuData } from '@/lib/kitsu';

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

        if (!projectId) {
            return Response.json({ error: 'Missing projectId' }, { status: 400 });
        }

        if (!taskId) {
            const allSettings = await getProjectSettings();
            const settings = allSettings[projectId] || { approvalMode: 'single', assignedApprovers: [] };
            const approvals = await getApprovals();
            return Response.json({
                mode: settings.approvalMode,
                assignedApprovers: settings.assignedApprovers,
                approvals
            });
        }

        const allSettings = await getProjectSettings();
        const settings = allSettings[projectId] || { approvalMode: 'single', assignedApprovers: [] };

        const approvals = await getApprovals();
        let taskApprovals = approvals[taskId] || [];

        // --- AUTO-RESET LOGIC FOR NEW VERSIONS ---
        // Fetch current task status from Kitsu to see if it was reset back to WFA/Retake
        const [task, taskStatuses] = await Promise.all([
            fetchKitsuData(`/data/tasks/${taskId}`).catch(() => null),
            fetchKitsuData('/data/task-status').catch(() => [])
        ]);

        if (task) {
            const statusMap = {};
            taskStatuses.forEach(s => statusMap[s.id] = (s.short_name || s.name || '').toLowerCase());
            const currentStatus = statusMap[task.task_status_id] || '';

            // If the status is WFA, Waiting, Retake, or WIP on Kitsu
            const isWaitingOrRetake = ['wfa', 'waiting', 'waiting for approval', 'retake', 'rejected', 'wip'].includes(currentStatus);

            if (isWaitingOrRetake) {
                // If it was previously fully approved under the current settings
                const wasFullyApproved = settings.approvalMode === 'single'
                    ? taskApprovals.length > 0
                    : settings.assignedApprovers.length > 0 && settings.assignedApprovers.every(email => 
                        taskApprovals.some(e => e.toLowerCase() === email.toLowerCase())
                      );

                if (wasFullyApproved) {
                    // Reset approvals in our database
                    approvals[taskId] = [];
                    await saveApprovals(approvals);

                    // Clear read-status for all users so the "NEW" badge shows up again
                    const readStatusFile = join(process.cwd(), 'data', 'read-status.json');
                    try {
                        const data = await fs.readFile(readStatusFile, 'utf-8');
                        const readStatus = JSON.parse(data);
                        Object.keys(readStatus).forEach(email => {
                            if (readStatus[email]) {
                                delete readStatus[email][taskId];
                            }
                        });
                        await fs.writeFile(readStatusFile, JSON.stringify(readStatus, null, 2), 'utf-8');
                    } catch (e) {}

                    // Reset local variable so we return an empty checklist for this request
                    taskApprovals = [];
                }
            }
        }

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
