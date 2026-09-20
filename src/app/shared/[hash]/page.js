import { getClientReviewTasks, getPrevisRequirementsTasks, getProjectById } from '@/lib/kitsu';
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

export default async function SharedRoot(props) {
    const params = await props.params;
    const { hash: id } = params;

    let tasks = [];
    let previsTasks = [];
    try {
        [tasks, previsTasks] = await Promise.all([
            getClientReviewTasks(id),
            getPrevisRequirementsTasks(id).catch(err => {
                console.error(`Failed to load previs tasks for project ${id}:`, err);
                return [];
            })
        ]);
    } catch (error) {
        console.error(`Failed to load tasks for project ${id}:`, error);
    }

    let projectName = 'Project';
    try {
        const project = await getProjectById(id);
        if (project) projectName = project.name;
    } catch (error) { }

    const settings = await getProjectSettings(id);

    return (
        <ProjectClient 
            tasks={tasks} 
            previsTasks={previsTasks} 
            projectName={projectName} 
            projectId={id} 
            isClientView={true} 
            showFinalDeliveries={settings.showFinalDeliveries} 
        />
    );
}

