import Sidebar from '@/components/Sidebar';

export const metadata = {
  title: 'Project View - Internal Dashboard',
  description: 'Manage Kitsu Projects and Client Links',
};

export default function ProjectLayout({ children }) {
  return (
    <>
      <Sidebar />
      <main className="main-content">
        {children}
      </main>
    </>
  );
}
