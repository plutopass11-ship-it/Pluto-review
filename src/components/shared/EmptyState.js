import React from 'react';
import { FolderOpen, LayoutDashboard, SearchX } from 'lucide-react';
import './EmptyState.css';

const IconMap = {
  folder: FolderOpen,
  dashboard: LayoutDashboard,
  search: SearchX
};

export default function EmptyState({ icon = 'folder', title, description }) {
  const IconComponent = IconMap[icon] || FolderOpen;

  return (
    <div className="empty-state-container glass-panel animate-fade-in">
      <div className="empty-state-icon-wrapper">
        <IconComponent size={48} className="empty-state-icon" />
      </div>
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-description">{description}</p>}
    </div>
  );
}
