import Link from 'next/link';
import { Home, FolderOpen, Settings, LogOut, Download } from 'lucide-react';
import './Sidebar.css';

export default function Sidebar() {
    return (
        <aside className="sidebar glass-panel">
            <div className="sidebar-header">
                <div className="logo-placeholder" />
                <h2 className="brand-name">Parallax</h2>
            </div>

            <nav className="sidebar-nav">
                <Link href="/" className="nav-item active">
                    <Home size={20} />
                    <span>Dashboard</span>
                </Link>
            </nav>

            <div className="sidebar-footer">
                <button className="nav-item logout-btn">
                    <LogOut size={20} />
                    <span>Sign Out</span>
                </button>
            </div>
        </aside>
    );
}
