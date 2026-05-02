// Triggering hot reload to fix webpack issue
import { getPlaylistData, getCurrentUser, getProjectById, fetchKitsuData } from '@/lib/kitsu';
import { formatUtcDateTime } from '@/lib/datetime';
import PlaylistClient from '@/components/PlaylistClient';

export default async function PlaylistPage(props) {
    const params = await props.params;
    const searchParams = await props.searchParams;
    const { id } = params;
    const shotId = searchParams?.shotId || null;

    let shots = [];
    let currentUser = 'Current User';
    let currentUserId = null;
    let projectName = 'Project';
    let initialComments = [];
    let initialShotId = shotId;

    try {
        const [playlistData, user, project] = await Promise.all([
            getPlaylistData(id),
            getCurrentUser(),
            getProjectById(id)
        ]);
        shots = playlistData;
        currentUser = user.displayName || user;
        currentUserId = user.id || null;
        if (project) projectName = project.name;

        // Fetch initial comments for the shot
        const targetShotId = shotId || (shots.length > 0 ? shots[0].id : null);
        if (targetShotId && !initialShotId) {
            initialShotId = targetShotId;
        }

        if (targetShotId) {
            const [commentsData, personsData] = await Promise.all([
                fetchKitsuData(`/data/tasks/${targetShotId}/comments`).catch(() => []),
                fetchKitsuData('/data/persons', false, { next: { revalidate: 300 } }).catch(() => [])
            ]);

            const personsMap = {};
            if (Array.isArray(personsData)) {
                personsData.forEach(p => personsMap[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim());
            }
            // Replace current user's real name with "Client" in existing comments
            if (currentUserId && personsMap[currentUserId]) {
                personsMap[currentUserId] = 'Client';
            }

            if (Array.isArray(commentsData)) {
                initialComments = commentsData
                    .filter(c => c.text && c.text.trim())
                    .map(c => {
                        return {
                            id: c.id,
                            user: personsMap[c.person_id] || 'User',
                            text: c.text,
                            time: formatUtcDateTime(c.created_at)
                        };
                    });
            }
        }
    } catch (error) {
        console.error('Failed to load playlist data:', error);
    }

    return (
        <PlaylistClient 
            shots={shots} 
            projectId={id} 
            projectName={projectName} 
            currentUser={currentUser} 
            initialComments={initialComments}
            initialShotId={initialShotId}
            isSharedView={false}
        />
    );
}
