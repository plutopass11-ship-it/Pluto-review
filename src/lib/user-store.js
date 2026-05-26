import { promises as fs } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');
const USERS_FILE = join(DATA_DIR, 'users.json');

export async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function getUsers() {
  try {
    const data = await fs.readFile(USERS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export async function saveUsers(users) {
  await ensureDir();
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

export async function getUserByEmail(email) {
  const users = await getUsers();
  return users.find(u => u.email === email) || null;
}

export async function createOrUpdateUser({ email, name, picture }) {
  const users = await getUsers();
  const existing = users.find(u => u.email === email);

  if (existing) {
    existing.name = name;
    existing.picture = picture;
    await saveUsers(users);
    return existing;
  }

  // Check if user's domain is in the auto-approve list
  const autoApproveDomains = (process.env.AUTO_APPROVE_DOMAINS || '')
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean);
  const userDomain = email.split('@')[1]?.toLowerCase() || '';
  const isAutoApproved = autoApproveDomains.includes(userDomain);

  const newUser = {
    email,
    name,
    nickname: null,
    picture,
    status: isAutoApproved ? 'approved' : 'pending',
    requestedAt: new Date().toISOString(),
    updatedAt: null
  };
  users.push(newUser);
  await saveUsers(users);
  return newUser;
}

export async function updateUserStatus(email, status) {
  const users = await getUsers();
  const user = users.find(u => u.email === email);
  if (!user) return null;

  user.status = status;
  user.updatedAt = new Date().toISOString();
  await saveUsers(users);
  return user;
}

export async function updateUserNickname(email, nickname) {
  const users = await getUsers();
  const user = users.find(u => u.email === email);
  if (!user) return null;

  user.nickname = nickname;
  user.updatedAt = new Date().toISOString();
  await saveUsers(users);
  return user;
}

export function getDisplayName(user) {
  return user.nickname || user.name;
}

export async function getUsersByStatus(status) {
  const users = await getUsers();
  return users.filter(u => u.status === status);
}
