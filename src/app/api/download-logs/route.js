import { NextResponse } from 'next/server';
import { getDownloadLogs, getLogProjects } from '@/lib/download-logger';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const projectId = searchParams.get('project') || null;
        const limit = parseInt(searchParams.get('limit') || '100', 10);
        
        const [logs, projects] = await Promise.all([
            getDownloadLogs(projectId, limit),
            getLogProjects(),
        ]);
        
        return NextResponse.json({ logs, projects });
    } catch (error) {
        console.error('Failed to fetch download logs:', error);
        return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }
}
