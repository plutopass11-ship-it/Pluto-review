"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import EmptyState from './shared/EmptyState';
import './DashboardClient.css';

const DASHBOARD_PIN = '9801';
const PIN_STORAGE_KEY = 'pluto_dashboard_auth';

export default function DashboardClient({ projects, serverError }) {
    const [pinVerified, setPinVerified] = useState(false);
    const [pinInput, setPinInput] = useState('');
    const [pinError, setPinError] = useState(false);

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
            </div>
        </div>
    );
}
