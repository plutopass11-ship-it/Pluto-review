import { redirect } from 'next/navigation';
import { fetchKitsuData } from '@/lib/kitsu';

export default async function ReviewPage({ params }) {
    const { taskId } = await params;

    try {
        const task = await fetchKitsuData(`/data/tasks/${taskId}`);
        if (task?.project_id) {
            redirect(`/project/${task.project_id}/playlist?shotId=${taskId}`);
        }
    } catch (error) {
        console.error(`Failed to redirect review route for task ${taskId}:`, error);
    }

    redirect('/dashboard');
}
