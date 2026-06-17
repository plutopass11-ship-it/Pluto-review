import Sidebar from '@/components/Sidebar';
import { requireAuth } from '@/lib/auth-guard';

export const metadata = {
  title: 'Internal Dashboard - Kitsu',
  description: 'Manage Kitsu Projects and Client Links',
};

export default async function DashboardLayout({ children }) {
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
