import { getSession } from './session';
import { getUserByEmail } from './user-store';
import { redirect } from 'next/navigation';

/**
 * requireAuth checks if the current request is authenticated and the user is approved.
 * It uses next/navigation's redirect() to halt rendering and forward the user if unauthorized.
 * This should be awaited at the top level of Server Components (like layouts or pages).
 */
export async function requireAuth() {
    const session = await getSession();
    
    // If no active session, send to login
    if (!session || !session.email) {
        redirect('/login');
    }

    // Check the user record in our JSON store
    const user = await getUserByEmail(session.email);
    
    // If user record doesn't exist, send to login
    if (!user) {
        redirect('/login');
    }

    // If the user's access request hasn't been approved yet, send to the pending page
    if (user.status === 'pending') {
        redirect('/pending-approval');
    }

    // If they are explicitly rejected or have an unknown status, kick them to login
    if (user.status !== 'approved') {
        redirect('/login');
    }

    // User is fully authenticated and approved
    return user;
}
