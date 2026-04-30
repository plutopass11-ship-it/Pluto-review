import { getClientReviewTasks, getProjects } from '@/lib/kitsu';
import ProjectClient from '@/components/ProjectClient';

export default async function ProjectPage({ params }) {
    const { id } = await params;

    let tasks = [];
    try {
        tasks = await getClientReviewTasks(id);
    } catch (error) {
        console.error(`Failed to load tasks for project ${id}:`, error);
    }

    // We should fetch the project name too
    let projectName = 'Unknown Project';
    try {
        const projects = await getProjects();
        const p = projects.find(p => p.id === id);
        if (p) projectName = p.name;
    } catch (error) { }

    return <ProjectClient tasks={tasks} projectName={projectName} projectId={id} />;
}
