import { getSession, clearSession } from '@/lib/session';
import { getUserByEmail, getDisplayName } from '@/lib/user-store';

export async function GET() {
    try {
        const session = await getSession();
        if (!session) {
            return Response.json({ authenticated: false });
        }

        const user = await getUserByEmail(session.email);
        if (!user) {
            return Response.json({ authenticated: false });
        }

        return Response.json({
            authenticated: true,
            status: user.status,
            user: {
                email: user.email,
                name: getDisplayName(user),
                picture: user.picture
            }
        });
    } catch (error) {
        console.error('Auth status error:', error);
        return Response.json({ authenticated: false });
    }
}

export async function DELETE() {
    try {
        await clearSession();
        return Response.json({ success: true });
    } catch (error) {
        console.error('Logout error:', error);
        return Response.json({ error: 'Failed to logout' }, { status: 500 });
    }
}
