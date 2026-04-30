import Sidebar from '@/components/Sidebar';

export const metadata = {
  title: 'Internal Dashboard - Kitsu',
  description: 'Manage Kitsu Projects and Client Links',
};

export default function DashboardLayout({ children }) {
  return (
    <>
      <Sidebar />
      <main className="main-content">
        {children}
      </main>
    </>
  );
}
