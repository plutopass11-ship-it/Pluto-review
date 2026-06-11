"use client";

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Download, Filter, Globe, Monitor, Clock, UserCheck, UserX, Shield, Users, Edit3 } from 'lucide-react';
import toast from 'react-hot-toast';
import EmptyState from './shared/EmptyState';
import './DashboardClient.css';

const DASHBOARD_PIN = '9801';
const PIN_STORAGE_KEY = 'parallax_dashboard_auth';

function formatLogTime(isoString) {
    const d = new Date(isoString);
    return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
}

export default function DashboardClient({ projects, serverError }) {
    const [pinVerified, setPinVerified] = useState(false);
    const [pinInput, setPinInput] = useState('');
    const [pinError, setPinError] = useState(false);
    
    // Download logs state
    const [logs, setLogs] = useState([]);
    const [logProjects, setLogProjects] = useState([]);
    const [selectedLogProject, setSelectedLogProject] = useState('all');
    const [logsLoading, setLogsLoading] = useState(false);

    // Access Control state
    const [activeTab, setActiveTab] = useState('projects');
    const [adminUsers, setAdminUsers] = useState([]);
    const [adminUsersLoading, setAdminUsersLoading] = useState(false);
    const [projectSettings, setProjectSettings] = useState({});

    useEffect(() => {
        const verified = localStorage.getItem(PIN_STORAGE_KEY) === 'true';
        setPinVerified(verified);
    }, []);

    useEffect(() => {
        if (!pinVerified) return;
        // Troubleshooting: Check Kitsu connection status from the browser
        console.log('--- Client Review Debugging ---');
        console.log('Project data from server:', projects);
        if (serverError) console.error('Server-side Error:', serverError);
        
        fetch('/api/debug-kitsu')
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    console.log('%c✅ Kitsu Connection: SUCCESS', 'color: #10b981; font-weight: bold;', data);
                } else {
                    console.error('❌ Kitsu Connection: FAILED', data);
                }
            })
            .catch(err => console.error('❌ Debug API Error:', err));
    }, [projects, serverError, pinVerified]);
    
    // Fetch download logs
    useEffect(() => {
        if (!pinVerified) return;
        
        const fetchLogs = async () => {
            setLogsLoading(true);
            try {
                const url = selectedLogProject === 'all' 
                    ? '/api/download-logs'
                    : `/api/download-logs?project=${selectedLogProject}`;
                const res = await fetch(url);
                const data = await res.json();
                if (data.logs) setLogs(data.logs);
                if (data.projects) setLogProjects(data.projects);
            } catch (err) {
                console.error('Failed to fetch download logs:', err);
            } finally {
                setLogsLoading(false);
            }
        };
        
        fetchLogs();
        // Refresh every 30 seconds
        const interval = setInterval(fetchLogs, 30000);
        return () => clearInterval(interval);
    }, [pinVerified, selectedLogProject]);

    // Fetch admin users when Access Control tab is activated
    const fetchAdminUsers = useCallback(async () => {
        setAdminUsersLoading(true);
        try {
            const res = await fetch('/api/admin/requests', {
                headers: { 'x-admin-pin': '9801' }
            });
            const data = await res.json();
            setAdminUsers(data.users || data || []);
        } catch (err) {
            console.error('Failed to fetch admin users:', err);
            toast.error('Failed to load user requests');
        } finally {
            setAdminUsersLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'access' && pinVerified) {
            fetchAdminUsers();
        }
    }, [activeTab, pinVerified, fetchAdminUsers]);

    // Fetch project settings when Access Control tab is activated
    useEffect(() => {
        if (activeTab !== 'access' || !pinVerified || !projects?.length) return;
        const fetchAllSettings = async () => {
            const settings = {};
            await Promise.all(projects.map(async (p) => {
                try {
                    const res = await fetch(`/api/admin/project-settings?projectId=${p.id}`, {
                        headers: { 'x-admin-pin': '9801' }
                    });
                    const data = await res.json();
                    settings[p.id] = data;
                } catch (err) {
                    console.error(`Failed to fetch settings for project ${p.id}:`, err);
                }
            }));
            setProjectSettings(settings);
        };
        fetchAllSettings();
    }, [activeTab, pinVerified, projects]);

    const handleUserAction = async (userId, action) => {
        try {
            const res = await fetch('/api/admin/requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-pin': '9801' },
                body: JSON.stringify({ email: userId, action })
            });
            if (res.ok) {
                toast.success(action === 'approve' ? 'User approved!' : 'User rejected');
                fetchAdminUsers();
            } else {
                toast.error('Action failed');
            }
        } catch (err) {
            toast.error('Network error');
        }
    };

    const handleNicknameUpdate = async (userId, nickname) => {
        try {
            const res = await fetch('/api/admin/requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-pin': '9801' },
                body: JSON.stringify({ email: userId, action: 'set-nickname', nickname })
            });
            if (res.ok) {
                toast.success('Nickname updated');
                fetchAdminUsers();
            } else {
                toast.error('Failed to update nickname');
            }
        } catch (err) {
            toast.error('Network error');
        }
    };

    const handleProjectSettingChange = async (projectId, settingData) => {
        try {
            const res = await fetch('/api/admin/project-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-pin': '9801' },
                body: JSON.stringify({ projectId, ...settingData })
            });
            if (res.ok) {
                const updated = await res.json();
                setProjectSettings(prev => ({ ...prev, [projectId]: updated }));
                toast.success('Settings updated');
            } else {
                toast.error('Failed to update settings');
            }
        } catch (err) {
            toast.error('Network error');
        }
    };

    const handlePinSubmit = (e) => {
        e.preventDefault();
        if (pinInput === DASHBOARD_PIN) {
            localStorage.setItem(PIN_STORAGE_KEY, 'true');
            setPinVerified(true);
            setPinError(false);
        } else {
            setPinError(true);
        }
    };

    const approvedUsers = adminUsers.filter(u => u.status === 'approved');
    const pendingUsers = adminUsers.filter(u => u.status === 'pending');
    const rejectedUsers = adminUsers.filter(u => u.status === 'rejected');

    if (!pinVerified) {
        return (
            <div className="pin-overlay">
                <div className="pin-modal glass-panel">
                    <h2>Restricted Access</h2>
                    <p>Enter the 4-digit PIN to access the dashboard.</p>
                    <form onSubmit={handlePinSubmit} className="pin-form">
                        <input
                            type="password"
                            inputMode="numeric"
                            maxLength={4}
                            value={pinInput}
                            onChange={(e) => setPinInput(e.target.value)}
                            placeholder="••••"
                            className={`pin-input ${pinError ? 'pin-error' : ''}`}
                            autoFocus
                        />
                        {pinError && <span className="pin-error-text">Incorrect PIN</span>}
                        <button type="submit" className="pin-submit-btn">Unlock</button>
                    </form>
                </div>
            </div>
        );
    }

    // Compute aggregate stats from real data
    const totalShots = projects.reduce((sum, p) => sum + (p.total_shots || 0), 0);
    const approvedShots = projects.reduce((sum, p) => sum + (p.approved_shots || 0), 0);
    const pendingShots = totalShots - approvedShots;
    const approvalRate = totalShots > 0 ? Math.round((approvedShots / totalShots) * 100) : 0;

    return (
        <div className="dashboard-container animate-fade-in">
            {serverError && (
                <div style={{ padding: '1rem', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #f87171' }}>
                    <strong>Server Error:</strong> {serverError}
                    <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>The NAS failed to fetch data from Kitsu. Check the API URL and credentials.</p>
                </div>
            )}
            <header className="dashboard-header">
                <div>
                    <h1 className="welcome-text">Welcome back.</h1>
                    <p className="subtitle">Here is an overview of your projects.</p>
                </div>
            </header>

            {/* Progress Overview Section */}
            <section className="stats-grid">
                <div className="stat-card glass-panel">
                    <div className="stat-ring ring-blue">
                        <span className="ring-text">{pendingShots}</span>
                    </div>
                    <div className="stat-info">
                        <h3>Pending Review</h3>
                        <p>Shots await your feedback</p>
                    </div>
                </div>

                <div className="stat-card glass-panel">
                    <div className="stat-ring ring-green">
                        <span className="ring-text">{approvalRate}%</span>
                    </div>
                    <div className="stat-info">
                        <h3>Approval Rate</h3>
                        <p>Overall project completion</p>
                    </div>
                </div>

                <div className="stat-card glass-panel">
                    <div className="stat-ring ring-amber">
                        <span className="ring-text">{approvedShots}</span>
                    </div>
                    <div className="stat-info">
                        <h3>Approved</h3>
                        <p>Shots approved by client</p>
                    </div>
                </div>
            </section>

            {/* Tab Navigation */}
            <div className="dashboard-tabs">
                <button
                    className={`dashboard-tab ${activeTab === 'projects' ? 'active' : ''}`}
                    onClick={() => setActiveTab('projects')}
                >
                    <Monitor size={15} /> Projects
                </button>
                <button
                    className={`dashboard-tab ${activeTab === 'access' ? 'active' : ''}`}
                    onClick={() => setActiveTab('access')}
                >
                    <Shield size={15} /> Access Control
                    {pendingUsers.length > 0 && (
                        <span className="pending-badge">{pendingUsers.length}</span>
                    )}
                </button>
            </div>

            {/* Projects Tab */}
            {activeTab === 'projects' && (
                <div className="main-content-grid single-col">
                    <section className="projects-section">
                        <div className="section-header">
                            <h2>Your Projects</h2>
                        </div>
                        <div className="projects-list">
                            {projects && projects.length > 0 ? (
                                projects.map(project => {
                                    const progress = project.completion_percentage || 0;
                                    const total = project.total_shots || 0;
                                    const approved = project.approved_shots || 0;

                                    return (
                                        <Link href={`/project/${project.id}`} key={project.id} className="project-card glass-panel">
                                            <div className="project-card-header">
                                                <h3>{project.name}</h3>
                                            </div>
                                            <div className="project-progress-bar">
                                                <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                                            </div>
                                            <div className="project-card-footer">
                                                <span className="text-sm text-muted">
                                                    {approved} / {total} shots approved
                                                </span>
                                            </div>
                                        </Link>
                                    );
                                })
                            ) : (
                                <EmptyState 
                                    icon="dashboard" 
                                    title="No Active Projects" 
                                    description="You're all caught up! There are no projects currently active or pending your review." 
                                />
                            )}
                        </div>
                    </section>

                    {/* Download Activity Section */}
                    <section className="downloads-section glass-panel">
                        <div className="downloads-header">
                            <div className="downloads-title-row">
                                <Download size={20} />
                                <h2>Download Activity</h2>
                            </div>
                            {logProjects.length > 0 && (
                                <div className="downloads-filter">
                                    <Filter size={14} />
                                    <select 
                                        value={selectedLogProject}
                                        onChange={(e) => setSelectedLogProject(e.target.value)}
                                        className="log-project-select"
                                    >
                                        <option value="all">All Projects</option>
                                        {logProjects.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                        
                        {logsLoading ? (
                            <div className="logs-loading">Loading...</div>
                        ) : logs.length === 0 ? (
                            <div className="logs-empty">
                                <p>No download activity yet</p>
                                <span className="logs-empty-hint">Downloads from the playlist player will appear here</span>
                            </div>
                        ) : (
                            <div className="logs-table-wrapper">
                                <table className="logs-table">
                                    <thead>
                                        <tr>
                                            <th>Time</th>
                                            <th>Project</th>
                                            <th>Sequence</th>
                                            <th>Type</th>
                                            <th>Device</th>
                                            <th>Location</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((log) => (
                                            <tr key={log.id}>
                                                <td className="log-time">
                                                    <Clock size={12} />
                                                    {formatLogTime(log.timestamp)}
                                                </td>
                                                <td className="log-project">{log.projectName}</td>
                                                <td className="log-sequence">{log.sequenceName || '-'}</td>
                                                <td>
                                                    <span className={`log-type-badge type-${log.type}`}>
                                                        {log.type}
                                                    </span>
                                                </td>
                                                <td className="log-device">
                                                    <Monitor size={12} />
                                                    {log.device}
                                                    <span className="log-browser">{log.browser}</span>
                                                </td>
                                                <td className="log-location">
                                                    {log.location ? (
                                                        <>
                                                            <Globe size={12} />
                                                            {log.location.city}{log.location.country ? `, ${log.location.country}` : ''}
                                                        </>
                                                    ) : (
                                                        <span className="log-location-unknown">-</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </div>
            )}

            {/* Access Control Tab */}
            {activeTab === 'access' && (
                <div className="access-tab-content">
                    {/* User Access Requests */}
                    <section className="access-section">
                        <div className="access-header">
                            <Users size={20} />
                            <h2>User Access Requests</h2>
                        </div>

                        {adminUsersLoading ? (
                            <div className="logs-loading">Loading users...</div>
                        ) : (
                            <div className="user-list">
                                {/* Pending Users First */}
                                {pendingUsers.length > 0 && (
                                    <>
                                        <h3 className="user-group-label">Pending Requests</h3>
                                        {pendingUsers.map(user => (
                                            <div key={user.id || user.email} className="user-row glass-panel">
                                                <img src={user.picture} alt={user.name} className="user-avatar" />
                                                <div className="user-info">
                                                    <span className="user-name">{user.name}</span>
                                                    <span className="user-email">{user.email}</span>
                                                </div>
                                                <span className="user-status-badge status-pending">Pending</span>
                                                <input
                                                    type="text"
                                                    className="nickname-input"
                                                    placeholder="Nickname"
                                                    defaultValue={user.nickname || ''}
                                                    onBlur={(e) => handleNicknameUpdate(user.id || user.email, e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                                                />
                                                <div className="user-actions">
                                                    <button
                                                        className="user-action-btn approve"
                                                        onClick={() => handleUserAction(user.id || user.email, 'approve')}
                                                        title="Approve"
                                                    >
                                                        <UserCheck size={16} />
                                                    </button>
                                                    <button
                                                        className="user-action-btn reject"
                                                        onClick={() => handleUserAction(user.id || user.email, 'reject')}
                                                        title="Decline"
                                                    >
                                                        <UserX size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </>
                                )}

                                {/* Resolved Users Dock */}
                                {(approvedUsers.length > 0 || rejectedUsers.length > 0) && (
                                    <div className="resolved-requests-dock">
                                        {/* Approved Users */}
                                        {approvedUsers.length > 0 && (
                                    <>
                                        <h3 className="user-group-label">Approved</h3>
                                        {approvedUsers.map(user => (
                                            <div key={user.id || user.email} className="user-row glass-panel">
                                                <img src={user.picture} alt={user.name} className="user-avatar" />
                                                <div className="user-info">
                                                    <span className="user-name">{user.name}</span>
                                                    <span className="user-email">{user.email}</span>
                                                </div>
                                                <span className="user-status-badge status-approved">Approved</span>
                                                <input
                                                    type="text"
                                                    className="nickname-input"
                                                    placeholder="Nickname"
                                                    defaultValue={user.nickname || ''}
                                                    onBlur={(e) => handleNicknameUpdate(user.id || user.email, e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                                                />
                                                <div className="user-actions">
                                                    <button
                                                        className="user-action-btn reject"
                                                        onClick={() => handleUserAction(user.id || user.email, 'reject')}
                                                        title="Revoke"
                                                    >
                                                        <UserX size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </>
                                )}

                                {/* Rejected Users */}
                                {rejectedUsers.length > 0 && (
                                    <>
                                        <h3 className="user-group-label">Rejected</h3>
                                        {rejectedUsers.map(user => (
                                            <div key={user.id || user.email} className="user-row glass-panel">
                                                <img src={user.picture} alt={user.name} className="user-avatar" />
                                                <div className="user-info">
                                                    <span className="user-name">{user.name}</span>
                                                    <span className="user-email">{user.email}</span>
                                                </div>
                                                <span className="user-status-badge status-rejected">Rejected</span>
                                                <input
                                                    type="text"
                                                    className="nickname-input"
                                                    placeholder="Nickname"
                                                    defaultValue={user.nickname || ''}
                                                    onBlur={(e) => handleNicknameUpdate(user.id || user.email, e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                                                />
                                                <div className="user-actions">
                                                    <button
                                                        className="user-action-btn approve"
                                                        onClick={() => handleUserAction(user.id || user.email, 'approve')}
                                                        title="Re-approve"
                                                    >
                                                        <UserCheck size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </>
                                        )}
                                    </div>
                                )}

                                {adminUsers.length === 0 && (
                                    <div className="logs-empty">
                                        <p>No user requests yet</p>
                                        <span className="logs-empty-hint">Users who sign in with Google will appear here for approval</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </section>

                    {/* Project Approval Settings */}
                    <section className="project-settings-section">
                        <div className="access-header">
                            <Shield size={20} />
                            <h2>Project Approval Settings</h2>
                        </div>

                        {projects && projects.length > 0 ? (
                            projects.map(project => {
                                const settings = projectSettings[project.id] || {};
                                const isMultiple = settings.approvalMode === 'multiple';

                                return (
                                    <div key={project.id} className="project-setting-row glass-panel">
                                        <div className="project-setting-header">
                                            <h3>{project.name}</h3>
                                            <div className="approval-toggle">
                                                <span className={!isMultiple ? 'toggle-label active' : 'toggle-label'}>Single Approver</span>
                                                <button
                                                    className={`toggle-switch ${isMultiple ? 'on' : ''}`}
                                                    onClick={() => handleProjectSettingChange(project.id, {
                                                        approvalMode: isMultiple ? 'single' : 'multiple'
                                                    })}
                                                    aria-label="Toggle approval mode"
                                                >
                                                    <span className="toggle-knob" />
                                                </button>
                                                <span className={isMultiple ? 'toggle-label active' : 'toggle-label'}>Multiple Approvers</span>
                                            </div>
                                            <div className="approval-toggle" style={{ marginTop: '0.75rem' }}>
                                                <span className={!settings.showFinalDeliveries ? 'toggle-label active' : 'toggle-label'}>Hide Final Deliveries</span>
                                                <button
                                                    className={`toggle-switch ${settings.showFinalDeliveries ? 'on' : ''}`}
                                                    onClick={() => handleProjectSettingChange(project.id, {
                                                        showFinalDeliveries: !settings.showFinalDeliveries
                                                    })}
                                                    aria-label="Toggle final deliveries section"
                                                >
                                                    <span className="toggle-knob" />
                                                </button>
                                                <span className={settings.showFinalDeliveries ? 'toggle-label active' : 'toggle-label'}>Show Final Deliveries</span>
                                            </div>
                                        </div>

                                        {isMultiple && approvedUsers.length > 0 && (
                                            <div className="approver-list">
                                                {approvedUsers.map(user => {
                                                    const approvers = settings.assignedApprovers || [];
                                                    const isApprover = approvers.includes(user.email);
                                                    return (
                                                        <label key={user.id || user.email} className="approver-checkbox">
                                                            <input
                                                                type="checkbox"
                                                                checked={isApprover}
                                                                onChange={() => {
                                                                    const newApprovers = isApprover
                                                                        ? approvers.filter(a => a !== user.email)
                                                                        : [...approvers, user.email];
                                                                    handleProjectSettingChange(project.id, {
                                                                        approvalMode: 'multiple',
                                                                        assignedApprovers: newApprovers
                                                                    });
                                                                }}
                                                            />
                                                            <img src={user.picture} alt={user.name} className="user-avatar" style={{ width: 24, height: 24 }} />
                                                            <span>{user.nickname || user.name}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        ) : (
                            <div className="logs-empty">
                                <p>No projects available</p>
                            </div>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
}
