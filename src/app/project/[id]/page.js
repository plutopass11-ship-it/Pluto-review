import { getClientReviewTasks, getProjects } from '@/lib/kitsu';
import ProjectClient from '@/components/ProjectClient';
import { promises as fs } from 'fs';
import { join } from 'path';

async function getProjectSettings(projectId) {
    try {
        const data = await fs.readFile(join(process.cwd(), 'data', 'project-settings.json'), 'utf-8');
        const settings = JSON.parse(data);
        return settings[projectId] || {};
    } catch (error) {
        return {};
    }
}

export default async function ProjectPage({ params }) {
    const { id } = await params;

    let tasks = [];
    try {
        tasks = await getClientReviewTasks(id);
    } catch (error) {
        console.error(`Failed to load tasks for project ${id}:`, error);
    }

    let projectName = 'Unknown Project';
    try {
        const projects = await getProjects();
        const p = projects.find(p => p.id === id);
        if (p) projectName = p.name;
    } catch (error) { }

    const settings = await getProjectSettings(id);

    return <ProjectClient tasks={tasks} projectName={projectName} projectId={id} showFinalDeliveries={settings.showFinalDeliveries} />;
}
