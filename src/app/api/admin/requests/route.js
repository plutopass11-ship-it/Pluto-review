import { getUsers, updateUserStatus, updateUserNickname } from '@/lib/user-store';

function validatePin(request) {
    return request.headers.get('x-admin-pin') === '9801';
}

export async function GET(request) {
    if (!validatePin(request)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const users = await getUsers();
        return Response.json(users);
    } catch (error) {
        console.error('Admin requests GET error:', error);
        return Response.json({ error: 'Failed to fetch users' }, { status: 500 });
    }
}

export async function POST(request) {
    if (!validatePin(request)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { email, action, nickname } = await request.json();

        if (!email || !action) {
            return Response.json({ error: 'Missing email or action' }, { status: 400 });
        }

        if (action === 'approve') {
            await updateUserStatus(email, 'approved');
        } else if (action === 'reject') {
            await updateUserStatus(email, 'rejected');
        } else if (action === 'set-nickname') {
            await updateUserNickname(email, nickname);
        } else {
            return Response.json({ error: 'Invalid action' }, { status: 400 });
        }

        const users = await getUsers();
        return Response.json(users);
    } catch (error) {
        console.error('Admin requests POST error:', error);
        return Response.json({ error: 'Failed to process action' }, { status: 500 });
    }
}
