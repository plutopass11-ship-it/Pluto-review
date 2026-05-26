import { createOrUpdateUser, getDisplayName } from '@/lib/user-store';
import { createSession } from '@/lib/session';

export async function POST(request) {
    try {
        const { idToken } = await request.json();
        if (!idToken) {
            return Response.json({ error: 'Missing idToken' }, { status: 400 });
        }

        const tokenRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
        if (!tokenRes.ok) {
            return Response.json({ error: 'Invalid Google token' }, { status: 401 });
        }

        const tokenData = await tokenRes.json();
        const { email, name, picture } = tokenData;

        if (!email) {
            return Response.json({ error: 'No email in token' }, { status: 401 });
        }

        const user = await createOrUpdateUser({ email, name: name || email, picture: picture || null });
        await createSession(email);

        return Response.json({
            success: true,
            status: user.status,
            user: {
                email: user.email,
                name: getDisplayName(user),
                picture: user.picture
            }
        });
    } catch (error) {
        console.error('Google auth error:', error);
        return Response.json({ error: 'Authentication failed' }, { status: 500 });
    }
}
