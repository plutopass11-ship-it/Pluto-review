'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Search, Filter, Play, CheckCircle, EyeOff, ChevronDown, Share2, MessageSquare, Layers, Download } from 'lucide-react';
import { toast } from 'react-hot-toast';
import EmptyState from './shared/EmptyState';
import './ProjectClient.css';

export default function ProjectClient({ tasks, projectName, projectId, isClientView = false, showFinalDeliveries = false }) {
    const router = useRouter();
    const [openedShots, setOpenedShots] = useState([]);
    const [selectedShots, setSelectedShots] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [statusFilters, setStatusFilters] = useState([{ label: 'All', value: 'all' }]);
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
    
    const filterRef = useRef(null);
    const playlistRef = useRef(null);

    // Fetch dynamic task statuses
    useEffect(() => {
        fetch('/api/task-statuses').then(r => r.json()).then(data => {
            if (Array.isArray(data)) {
                const apiFilters = data.map(s => ({ label: s.name, value: s.short_name?.toLowerCase() || s.name.toLowerCase() }));
                setStatusFilters([{ label: 'All', value: 'all' }, ...apiFilters.filter(f => f.value !== 'todo')]);
            }
        }).catch(() => {});
    }, []);

    // Close dropdowns on outside click
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (filterRef.current && !filterRef.current.contains(event.target)) setShowFilterMenu(false);
            if (playlistRef.current && !playlistRef.current.contains(event.target)) setShowPlaylistMenu(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Refresh data when returning to tab
    useEffect(() => {
        const handleFocus = () => router.refresh();
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [router]);

    const copyClientLink = async () => {
        const clientUrl = `${window.location.origin}/shared/${projectId}`;
        try {
            await navigator.clipboard.writeText(clientUrl);
            toast.success('Client link copied to clipboard!');
        } catch (err) {
            console.error('Failed to copy link:', err);
            // Fallback
            prompt("Copy this link to share with clients:", clientUrl);
        }
    };

    useEffect(() => {
        // Fetch read statuses from server
        fetch('/api/read-status')
            .then(res => res.json())
            .then(data => {
                if (data && !data.error) {
                    setOpenedShots(Object.keys(data));
                }
            })
            .catch(() => {
                // Fallback to local storage if API fails
                const stored = JSON.parse(localStorage.getItem('opened_shots') || '[]');
                setOpenedShots(stored);
            });
    }, []);

    const markAsOpened = (taskId) => {
        if (!openedShots.includes(taskId)) {
            const newOpened = [...openedShots, taskId];
            setOpenedShots(newOpened);
            // Update server
            fetch('/api/read-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shotId: taskId })
            }).catch(() => {});
            localStorage.setItem('opened_shots', JSON.stringify(newOpened));
        }
    };

    const markAsUnopened = (e, taskId) => {
        e.preventDefault();
        e.stopPropagation();
        const newOpened = openedShots.filter(id => id !== taskId);
        setOpenedShots(newOpened);
        // Update server
        fetch('/api/read-status', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shotId: taskId })
        }).catch(() => {});
        localStorage.setItem('opened_shots', JSON.stringify(newOpened));
    };

    const handleBatchDownload = async () => {
        const shotsToDownload = tasks.filter(t => selectedShots.includes(t.id));
        toast.success(`Starting download of ${shotsToDownload.length} files...`);
        for (const shot of shotsToDownload) {
            if (shot.video_url) {
                try {
                    const a = document.createElement('a');
                    a.href = shot.video_url + '&download=true'; 
                    a.download = `${shot.entity_name}.mp4`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    await new Promise(r => setTimeout(r, 500));
                } catch (e) {
                    console.error("Download failed for", shot.entity_name);
                }
            }
        }
        setSelectedShots([]);
    };

    // Separate standard review tasks from Final Delivery tasks
    const baseReviewTasks = tasks ? tasks.filter(t => {
        const isFinalDelivery = (t.task_type_name || '').toLowerCase() === 'final delivery';
        if (isFinalDelivery) return false;
        const s = (t.task_status_short || '').toLowerCase();
        return s !== 'todo';
    }) : [];

    const finalDeliveryTasks = tasks ? tasks.filter(t => {
        const isFinalDelivery = (t.task_type_name || '').toLowerCase() === 'final delivery';
        const s = (t.task_status_short || '').toLowerCase();
        return isFinalDelivery && (s === 'done' || s === 'approved');
    }) : [];

    // Get unique sequence names for playlist dropdown
    const sequenceNames = useMemo(() => {
        const names = [...new Set(baseReviewTasks.map(t => t.sequence_name || 'Uncategorized'))];
        return names.sort();
    }, [baseReviewTasks]);

    // Apply search and status filter
    const filteredReviewTasks = useMemo(() => {
        return baseReviewTasks.filter(t => {
            // Search filter: match shot name or sequence name
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const nameMatch = (t.entity_name || '').toLowerCase().includes(q);
                const seqMatch = (t.sequence_name || '').toLowerCase().includes(q);
                if (!nameMatch && !seqMatch) return false;
            }
            // Status filter
            if (statusFilter !== 'all') {
                const s = (t.task_status_short || '').toLowerCase();
                if (s !== statusFilter) return false;
            }
            return true;
        });
    }, [baseReviewTasks, searchQuery, statusFilter]);

    // Apply search filter to final delivery tasks
    const filteredFinalTasks = useMemo(() => {
        return finalDeliveryTasks.filter(t => {
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const nameMatch = (t.entity_name || '').toLowerCase().includes(q);
                const seqMatch = (t.sequence_name || '').toLowerCase().includes(q);
                if (!nameMatch && !seqMatch) return false;
            }
            return true;
        });
    }, [finalDeliveryTasks, searchQuery]);

    // Status-based full card background color
    const getCardClass = (statusShort) => {
        if (!statusShort) return 'card-default';
        const s = statusShort.toLowerCase();
        if (s === 'done' || s === 'approved') return 'card-done';
        if (s === 'retake' || s === 'rejected') return 'card-retake';
        if (s === 'wfa' || s === 'waiting') return 'card-wfa';
        if (s === 'wip') return 'card-wip';
        return 'card-default';
    };

    const getStatusBadgeClass = (statusShort) => {
        if (!statusShort) return 'badge-grey';
        const s = statusShort.toLowerCase();
        if (s === 'done' || s === 'approved') return 'badge-green';
        if (s === 'retake' || s === 'rejected') return 'badge-red';
        return 'badge-grey';
    };

    const unreadTasks = filteredReviewTasks.filter(t => !openedShots.includes(t.id));
    const readTasks = filteredReviewTasks.filter(t => openedShots.includes(t.id));

    const groupTasksBySequence = (taskList) => {
        return taskList.reduce((acc, task) => {
            const seqName = task.sequence_name || 'Sequence 010';
            if (!acc[seqName]) acc[seqName] = [];
            acc[seqName].push(task);
            return acc;
        }, {});
    };

    const renderSection = (title, taskList, isRead) => {
        if (!taskList || taskList.length === 0) return null;
        const grouped = groupTasksBySequence(taskList);

        return (
            <div className="status-section">
                <h2 className="status-header">{title}</h2>
                {Object.entries(grouped).map(([sequenceName, shots]) => (
                    <section key={sequenceName} className="sequence-group">
                        <div className="sequence-header sticky-header glass-panel">
                            <h3 className="sequence-title-purple">{sequenceName}</h3>
                            <span className="shot-count">{shots.length} shots</span>
                        </div>

                        <div className="masonry-grid">
                            {shots.map(shot => {
                                const statusName = shot.task_status_name || 'Pending Review';
                                const statusShort = shot.task_status_short || '';
                                const isOpened = openedShots.includes(shot.id);
                                return (
                                    <Link
                                        href={isClientView ? `/shared/${projectId}/playlist?seq=${encodeURIComponent(shot.sequence_name || '')}&shotId=${shot.id}` : `/project/${projectId}/playlist?seq=${encodeURIComponent(shot.sequence_name || '')}&shotId=${shot.id}`}
                                        key={shot.id}
                                        className={`shot-card ${getCardClass(statusShort)} ${selectedShots.includes(shot.id) ? 'selected-for-download' : ''}`}
                                        onClick={(e) => {
                                            if (e.ctrlKey || e.metaKey) {
                                                e.preventDefault();
                                                setSelectedShots(prev => prev.includes(shot.id) ? prev.filter(id => id !== shot.id) : [...prev, shot.id]);
                                            } else {
                                                markAsOpened(shot.id);
                                            }
                                        }}
                                    >
                                        <div className="thumbnail-container">
                                            {shot.thumbnail_url ? (
                                                <Image
                                                    src={shot.thumbnail_url}
                                                    alt={shot.entity_name}
                                                    className="shot-thumbnail"
                                                    fill
                                                    sizes="(max-width: 768px) 100vw, 300px"
                                                />
                                            ) : (
                                                <div className="video-placeholder">
                                                    <div className="play-overlay">
                                                        <Play size={28} />
                                                    </div>
                                                </div>
                                            )}
                                            <div className="play-overlay-hover">
                                                <Play size={28} />
                                            </div>
                                            <div className={`status-badge floating-badge ${getStatusBadgeClass(statusShort)}`}>
                                                {statusName}
                                            </div>
                                            {shot.version_count > 1 && (
                                                <div className="version-badge floating-badge badge-blue">
                                                    <Layers size={12} /> v{shot.version_count}
                                                </div>
                                            )}
                                            {isOpened && (
                                                <button
                                                    className="mark-unopened-btn"
                                                    onClick={(e) => markAsUnopened(e, shot.id)}
                                                    title="Mark as Unopened"
                                                >
                                                    <EyeOff size={14} />
                                                </button>
                                            )}
                                        </div>

                                        <div className="shot-details glass-panel">
                                            <div className="shot-info">
                                                <h3>{shot.entity_name}</h3>
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </div>
        );
    };

    return (
        <div className="project-container animate-fade-in">
            {selectedShots.length > 0 && (
                <div className="batch-download-bar glass-panel animate-slide-up">
                    <span className="selected-count">{selectedShots.length} shot{selectedShots.length !== 1 ? 's' : ''} selected</span>
                    <div className="batch-actions">
                        <button className="glass-button" onClick={() => setSelectedShots([])}>Cancel</button>
                        <button className="glass-button" style={{ color: '#10b981', borderColor: '#10b98155' }} onClick={handleBatchDownload}>
                            <Download size={16} /> Download
                        </button>
                    </div>
                </div>
            )}
            <header className="project-header">
                {!isClientView && (
                <div className="breadcrumb">
                    <Link href="/dashboard">Dashboard</Link>
                    <span className="separator">/</span>
                    <span className="current">{projectName}</span>
                </div>
                )}

                <div className="header-actions">
                    {!isClientView && (
                        <button className="glass-button" onClick={copyClientLink}>
                            <Share2 size={16} /> Share
                        </button>
                    )}
                    <div className="filter-dropdown-wrapper" ref={playlistRef}>
                        <button className="glass-button playlist-btn" onClick={() => setShowPlaylistMenu(!showPlaylistMenu)}>
                            <Play size={16} /> Playlist <ChevronDown size={14} />
                        </button>
                        {showPlaylistMenu && (
                            <div className="filter-dropdown glass-panel playlist-dropdown">
                                <Link
                                    href={isClientView ? `/shared/${projectId}/playlist` : `/project/${projectId}/playlist`}
                                    className="filter-option playlist-option"
                                    onClick={() => setShowPlaylistMenu(false)}
                                >
                                    ▶ All Sequences
                                </Link>
                                <div className="playlist-dropdown-divider" />
                                {sequenceNames.map(name => (
                                    <Link
                                        key={name}
                                        href={isClientView ? `/shared/${projectId}/playlist?seq=${encodeURIComponent(name)}` : `/project/${projectId}/playlist?seq=${encodeURIComponent(name)}`}
                                        className="filter-option playlist-option"
                                        onClick={() => setShowPlaylistMenu(false)}
                                    >
                                        {name}
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="search-bar glass-panel">
                        <Search size={18} className="icon-muted" />
                        <input
                            type="text"
                            placeholder="Search shots..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="filter-dropdown-wrapper" ref={filterRef}>
                        <button className="glass-button" onClick={() => setShowFilterMenu(!showFilterMenu)}>
                            <Filter size={18} />
                            {statusFilter !== 'all' ? statusFilters.find(f => f.value === statusFilter)?.label || 'Filter' : 'Filter'}
                            <ChevronDown size={14} />
                        </button>
                        {showFilterMenu && (
                            <div className="filter-dropdown glass-panel">
                                {statusFilters.map(f => (
                                    <button
                                        key={f.value}
                                        className={`filter-option ${statusFilter === f.value ? 'active' : ''}`}
                                        onClick={() => { setStatusFilter(f.value); setShowFilterMenu(false); }}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <div className="sequences-container">
                {filteredTasks.length === 0 && (
                    <EmptyState 
                        icon="search" 
                        title="No Shots Found" 
                        description={searchQuery || statusFilter !== 'all' ? 'No shots match your current search or filter criteria.' : 'No client review shots found for this project yet.'} 
                    />
                )}

                {renderSection('New Shots', unreadTasks, false)}

                {readTasks.length > 0 && unreadTasks.length > 0 && <div className="nav-divider"></div>}

                {renderSection('Reviewed Shots', readTasks, true)}

                {showFinalDeliveries && filteredFinalTasks.length > 0 && (
                    <>
                        <div className="nav-divider"></div>
                        {renderSection('Final Deliveries', filteredFinalTasks, true)}
                    </>
                )}
            </div>
        </div>
    );
}
