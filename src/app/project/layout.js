import Sidebar from '@/components/Sidebar';
import { requireAuth } from '@/lib/auth-guard';

export const metadata = {
  title: 'Project View - Internal Dashboard',
  description: 'Manage Kitsu Projects and Client Links',
};

export default async function ProjectLayout({ children }) {
  await requireAuth();

  return (
    <>
      <Sidebar />
      <main className="main-content">
        {children}
      </main>
    </>
  );
}
