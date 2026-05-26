import { cookies } from 'next/headers';

export const SESSION_COOKIE_NAME = 'parallax_session';

export async function createSession(email) {
  const payload = JSON.stringify({ email, ts: Date.now() });
  const token = Buffer.from(payload).toString('base64');
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30
  });
}

export async function getSession() {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(SESSION_COOKIE_NAME);
    if (!cookie?.value) return null;

    const decoded = Buffer.from(cookie.value, 'base64').toString('utf-8');
    const { email } = JSON.parse(decoded);
    if (!email) return null;
    return { email };
  } catch {
    return null;
  }
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
