'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PlaySquare, Grid } from 'lucide-react';
import './SharedHeader.css';

export default function SharedHeader({ projectId, projectName }) {
  const pathname = usePathname();
  
  // Basic active state checking
  const isPlaylist = pathname.includes('/playlist');
  const isGrid = pathname.includes('/shots');

  return (
    <header className="shared-header glass-panel">
      <div className="header-left">
        <div className="logo-placeholder small" />
        <h2 className="project-title">{projectName || 'Project Review'}</h2>
      </div>

      <nav className="header-tabs">
        <Link 
          href={`/shared/${projectId}/playlist`}
          className={`tab-btn ${isPlaylist ? 'active' : ''}`}
        >
          <PlaySquare size={16} />
          <span>Playlist</span>
        </Link>
        <Link 
          href={`/shared/${projectId}/shots`}
          className={`tab-btn ${isGrid ? 'active' : ''}`}
        >
          <Grid size={16} />
          <span>Grid</span>
        </Link>
      </nav>

      <div className="header-right">
        {/* Can add a client logout or profile icon here later */}
        <span className="client-badge">Client View</span>
      </div>
    </header>
  );
}
