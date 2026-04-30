import { getProjectsWithStats } from '@/lib/kitsu';
import DashboardClient from '@/components/DashboardClient';

export default async function Dashboard() {
  let projects = [];
  try {
    console.log('Fetching projects for dashboard...');
    projects = await getProjectsWithStats();
    console.log(`Successfully fetched ${projects.length} projects.`);
  } catch (error) {
    console.error('Failed to load projects:', error);
  }

  return <DashboardClient projects={projects} />;
}

