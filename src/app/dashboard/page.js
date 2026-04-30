import { getProjectsWithStats } from '@/lib/kitsu';
import DashboardClient from '@/components/DashboardClient';

export default async function Dashboard() {
  let projects = [];
  let errorMsg = null;
  
  try {
    console.log('Fetching projects for dashboard...');
    projects = await getProjectsWithStats();
    console.log(`Successfully fetched ${projects.length} projects.`);
  } catch (error) {
    console.error('Failed to load projects:', error);
    errorMsg = error.message;
  }

  return <DashboardClient projects={projects} serverError={errorMsg} />;
}

