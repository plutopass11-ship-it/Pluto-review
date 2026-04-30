import { getClientReviewTasks, getProjectById } from '@/lib/kitsu';
import ProjectClient from '@/components/ProjectClient';
import SharedHeader from '@/components/shared/SharedHeader';

export default async function SharedShotsPage({ params }) {
    // Using hash as ID for current phase.
    const { hash: id } = await params;

    let tasks = [];
    let projectName = 'Unknown Project';

    try {
        const [loadedTasks, project] = await Promise.all([
            getClientReviewTasks(id),
            getProjectById(id)
        ]);
        tasks = loadedTasks;
        if (project) projectName = project.name;
    } catch (error) {
        console.error(`Failed to load tasks for project ${id}:`, error);
    }

    return (
         <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <SharedHeader projectId={id} projectName={projectName} />
            <div style={{ flex: 1, overflowY: 'auto' }}>
               <ProjectClient tasks={tasks} projectName={projectName} projectId={id} isClientView={true} />
            </div>
        </div>
    );
}
