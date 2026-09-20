'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import {
    Play, Pause, SkipBack, SkipForward, Repeat, Volume2, VolumeX,
    MessageSquare, Send, Loader2, X, Search, Check, ChevronLeft, ChevronRight,
    PenTool, Eraser, Maximize, Minimize, CheckCircle2, ChevronDown,
    Layers, ArrowUpDown
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import './ShotRequirementsWorkspace.css';

const FPS = 24;

function formatTime(seconds = 0) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

function naturalSort(a, b) {
    const re = /\d+|\D+/g;
    const chunksA = String(a).match(re) || [];
    const chunksB = String(b).match(re) || [];
    const len = Math.max(chunksA.length, chunksB.length);
    for (let i = 0; i < len; i++) {
        const ca = chunksA[i] || '';
        const cb = chunksB[i] || '';
        const na = parseInt(ca, 10);
        const nb = parseInt(cb, 10);
        if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
        const cmp = String(ca).localeCompare(String(cb), undefined, { sensitivity: 'base' });
        if (cmp !== 0) return cmp;
    }
    return 0;
}

export default function ShotRequirementsWorkspace({
    previsTasks = [],
    projectId,
    projectName,
    isClientView = false,
    clientUser = null,
    initialSequence = 'all',
    selectedSequence: propSelectedSequence,
    onSelectSequence
}) {
    // ── Requirements tracking (ONLY from Parallax store) ──
    const [requirementsMeta, setRequirementsMeta] = useState({});

    // ── Sequences & Filtering ──
    const [internalSequence, setInternalSequence] = useState(initialSequence);
    const selectedSequence = propSelectedSequence !== undefined ? propSelectedSequence : internalSequence;
    const setSelectedSequence = useCallback((seq) => {
        if (onSelectSequence) {
            onSelectSequence(seq);
        } else {
            setInternalSequence(seq);
        }
    }, [onSelectSequence]);
    const [showSeqPicker, setShowSeqPicker] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('sequence'); // 'sequence' | 'name'
    const [filterOnlyMarked, setFilterOnlyMarked] = useState(false);
    const [isListCollapsed, setIsListCollapsed] = useState(false);
    const seqPickerRef = useRef(null);

    // Group shots into sequences
    const sequences = useMemo(() => {
        const map = {};
        previsTasks.forEach(shot => {
            const seq = shot.sequence_name || 'Uncategorized';
            if (!map[seq]) map[seq] = [];
            map[seq].push(shot);
        });
        return Object.entries(map).map(([name, shots]) => ({
            name,
            shots: shots.sort((a, b) => naturalSort(a.entity_name || '', b.entity_name || ''))
        })).sort((a, b) => naturalSort(a.name, b.name));
    }, [previsTasks]);

    // Close sequence picker on click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (seqPickerRef.current && !seqPickerRef.current.contains(e.target)) {
                setShowSeqPicker(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filter and sort shots
    const visibleShots = useMemo(() => {
        let list = [...previsTasks];

        // Sequence filter
        if (selectedSequence && selectedSequence !== 'all') {
            list = list.filter(s => (s.sequence_name || 'Uncategorized') === selectedSequence);
        }

        // Search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(s =>
                (s.entity_name || '').toLowerCase().includes(q) ||
                (s.sequence_name || '').toLowerCase().includes(q)
            );
        }

        // Marked only filter
        if (filterOnlyMarked) {
            list = list.filter(s => !!requirementsMeta[s.id]);
        }

        // Sorting
        if (sortBy === 'sequence') {
            list.sort((a, b) => {
                const seqCmp = naturalSort(a.sequence_name || '', b.sequence_name || '');
                if (seqCmp !== 0) return seqCmp;
                return naturalSort(a.entity_name || '', b.entity_name || '');
            });
        } else {
            list.sort((a, b) => naturalSort(a.entity_name || '', b.entity_name || ''));
        }

        return list;
    }, [previsTasks, selectedSequence, searchQuery, filterOnlyMarked, requirementsMeta, sortBy]);

    // Active shot selection
    const [selectedTaskId, setSelectedTaskId] = useState(previsTasks[0]?.id || null);

    useEffect(() => {
        if (!selectedTaskId && visibleShots.length > 0) {
            setSelectedTaskId(visibleShots[0].id);
        } else if (selectedTaskId && !visibleShots.some(s => s.id === selectedTaskId) && visibleShots.length > 0) {
            setSelectedTaskId(visibleShots[0].id);
        }
    }, [visibleShots, selectedTaskId]);

    const currentShot = useMemo(() => {
        return previsTasks.find(s => s.id === selectedTaskId) || visibleShots[0] || null;
    }, [previsTasks, visibleShots, selectedTaskId]);

    const currentIndex = visibleShots.findIndex(s => s.id === currentShot?.id);

    // ── Video Player State (Same robust logic as PlaylistClient) ──
    const videoRef = useRef(null);
    const videoAreaRef = useRef(null);
    const [currentVideoUrl, setCurrentVideoUrl] = useState('');
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isLooping, setIsLooping] = useState(true);
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // ── Annotation State (Same robust logic as PlaylistClient) ──
    const [annotationMode, setAnnotationMode] = useState(false);
    const [activeTool, setActiveTool] = useState('pen'); // 'pen' | 'eraser'
    const [drawColor, setDrawColor] = useState('#ef4444');
    const [hasAnnotation, setHasAnnotation] = useState(false);
    const [queuedAnnotations, setQueuedAnnotations] = useState([]); // [{ frame, imageData }]
    const isDrawing = useRef(false);
    const lastPoint = useRef(null);
    const canvasRef = useRef(null);

    // ── Comments State ──
    const [comments, setComments] = useState([]);
    const [commentsLoading, setCommentsLoading] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);

    const currentFrame = Math.floor(currentTime * FPS);
    const totalFrames = Math.max(1, Math.floor(duration * FPS));

    // Load Parallax requirements tracking on mount
    useEffect(() => {
        let isMounted = true;
        fetch(`/api/previs-requirements?projectId=${projectId}`)
            .then(res => res.json())
            .then(data => {
                if (isMounted && data && !data.error) {
                    setRequirementsMeta(data);
                }
            })
            .catch(err => console.error('Failed to load previs requirements tracking:', err));
        return () => { isMounted = false; };
    }, [projectId]);

    // Canvas context helper
    const getCanvasContext = useCallback((canvas, options = {}) => {
        if (!canvas) return null;
        return canvas.getContext('2d', options);
    }, []);

    const clearCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = getCanvasContext(canvas);
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasAnnotation(false);
    }, [getCanvasContext]);

    // Setup canvas resolution to match video display exactly
    const setupCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;

        const ctx = getCanvasContext(canvas, { willReadFrequently: true });
        if (!ctx) return;

        let imageData = null;
        if (canvas.width > 0 && canvas.height > 0) {
            imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }

        const width = video.clientWidth || video.parentElement?.clientWidth || 800;
        const height = video.clientHeight || video.parentElement?.clientHeight || 450;
        canvas.width = width;
        canvas.height = height;

        if (imageData) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = imageData.width;
            tempCanvas.height = imageData.height;
            const tempCtx = getCanvasContext(tempCanvas, { willReadFrequently: true });
            tempCtx?.putImageData(imageData, 0, 0);
            ctx.drawImage(tempCanvas, 0, 0, width, height);
        }
    }, [getCanvasContext]);

    useEffect(() => {
        if (annotationMode) {
            const rafId = requestAnimationFrame(() => {
                setupCanvas();
            });
            window.addEventListener('resize', setupCanvas);
            if (videoRef.current && isPlaying) {
                videoRef.current.pause();
                setIsPlaying(false);
            }
            return () => {
                cancelAnimationFrame(rafId);
                window.removeEventListener('resize', setupCanvas);
            };
        }
    }, [annotationMode, setupCanvas, isPlaying]);

    // Capture annotation (video frame + canvas composited)
    const captureAnnotation = useCallback(() => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return null;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = video.videoWidth || video.clientWidth;
        tempCanvas.height = video.videoHeight || video.clientHeight;
        const ctx = getCanvasContext(tempCanvas);
        if (!ctx) return null;

        try {
            ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
            ctx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
            return tempCanvas.toDataURL('image/png');
        } catch {
            // Fallback to canvas only if cross-origin restricts video
            return canvas.toDataURL('image/png');
        }
    }, [getCanvasContext]);

    const persistCurrentAnnotation = useCallback(() => {
        if (!hasAnnotation) return false;
        const imageData = captureAnnotation();
        if (!imageData) return false;
        setQueuedAnnotations(prev => {
            const next = prev.filter(item => item.frame !== currentFrame);
            next.push({ frame: currentFrame, imageData });
            return next.sort((a, b) => a.frame - b.frame);
        });
        clearCanvas();
        return true;
    }, [captureAnnotation, clearCanvas, currentFrame, hasAnnotation]);

    // ── When currentShot changes: update video and load comments WITHOUT auto-marking! ──
    useEffect(() => {
        if (!currentShot) return;

        // Set video URL
        setCurrentVideoUrl(currentShot.video_url || '');
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        setAnnotationMode(false);
        setQueuedAnnotations([]);
        clearCanvas();

        // Fetch comments for current shot (DO NOT auto-mark requirements!)
        setCommentsLoading(true);
        fetch(`/api/comment?taskId=${currentShot.id}`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setComments(data);
                } else {
                    setComments([]);
                }
            })
            .catch(err => {
                console.error('Failed to load comments:', err);
                setComments([]);
            })
            .finally(() => setCommentsLoading(false));
    }, [currentShot, clearCanvas]);

    // ── Video Controls ──
    const togglePlay = () => {
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.pause();
            setIsPlaying(false);
        } else {
            const playPromise = videoRef.current.play();
            if (playPromise !== undefined) {
                playPromise.then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
            }
        }
    };

    const stepFrame = (delta) => {
        if (!videoRef.current || !duration) return;
        videoRef.current.pause();
        setIsPlaying(false);
        const frameTime = 1 / FPS;
        const newTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + delta * frameTime));
        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
    };

    const handleTimelineClick = (e) => {
        if (!videoRef.current || !duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        videoRef.current.currentTime = pct * duration;
        setCurrentTime(pct * duration);
    };

    const toggleFullscreen = () => {
        if (!videoAreaRef.current) return;
        if (!document.fullscreenElement) {
            videoAreaRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
        } else {
            document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
        }
    };

    // ── Drawing Events ──
    const getCanvasPoint = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches?.[0]?.clientX ?? e.clientX;
        const clientY = e.touches?.[0]?.clientY ?? e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const startDraw = (e) => {
        if (!annotationMode) return;
        isDrawing.current = true;
        lastPoint.current = getCanvasPoint(e);
    };

    const draw = (e) => {
        if (!isDrawing.current || !canvasRef.current) return;
        const ctx = getCanvasContext(canvasRef.current);
        const pt = getCanvasPoint(e);
        if (!ctx || !pt || !lastPoint.current) return;

        if (activeTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = 20;
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = drawColor;
            ctx.lineWidth = 3.5;
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
        lastPoint.current = pt;
        setHasAnnotation(true);
    };

    const endDraw = () => {
        isDrawing.current = false;
        lastPoint.current = null;
    };

    // ── Submit Requirement ──
    const handleSubmitRequirement = async () => {
        if (!currentShot) return;
        const text = newComment.trim();

        // Capture any pending canvas drawing
        let allAnnotations = [...queuedAnnotations];
        if (hasAnnotation) {
            const currentImg = captureAnnotation();
            if (currentImg && !allAnnotations.some(a => a.frame === currentFrame)) {
                allAnnotations.push({ frame: currentFrame, imageData: currentImg });
            }
        }

        if (!text && allAnnotations.length === 0) {
            toast.error('Please write a requirement note or draw an annotation');
            return;
        }

        setSubmittingComment(true);
        try {
            const frameTags = allAnnotations.length > 0
                ? allAnnotations.map(a => `[Frame ${a.frame}]`).join(' ')
                : `[Frame ${currentFrame}]`;

            const fullComment = text ? `${frameTags} ${text}`.trim() : `${frameTags} Requirement annotation attached`;

            // 1. Post comment to Kitsu without changing status
            const commentRes = await fetch('/api/comment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskId: currentShot.id,
                    comment: fullComment,
                    isRequirement: true,
                    projectId,
                    entityId: currentShot.entity_id
                })
            });

            if (!commentRes.ok) throw new Error('Failed to submit requirement');
            const commentData = await commentRes.json();

            // 2. Upload annotations if present
            if (allAnnotations.length > 0 && commentData.id) {
                await fetch('/api/annotation', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        taskId: currentShot.id,
                        commentId: commentData.id,
                        annotations: allAnnotations
                    })
                }).catch(() => {});
            }

            // 3. Persist requirement tracking to data/previs-requirements.json
            await fetch('/api/previs-requirements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskId: currentShot.id,
                    entityId: currentShot.entity_id,
                    projectId
                })
            }).catch(() => {});

            // 4. Update green outline state immediately
            setRequirementsMeta(prev => ({
                ...prev,
                [currentShot.id]: {
                    markedAt: new Date().toISOString(),
                    entityId: currentShot.entity_id,
                    projectId,
                    commentCount: (prev[currentShot.id]?.commentCount || 0) + 1
                }
            }));

            // 5. Update local comment thread
            setComments(prev => [
                {
                    id: commentData.id || Date.now(),
                    user: clientUser?.name || 'Client (You)',
                    text: fullComment,
                    time: 'Just now',
                    replies: [],
                    attachmentCount: allAnnotations.length
                },
                ...prev
            ]);

            setNewComment('');
            clearCanvas();
            setQueuedAnnotations([]);
            setAnnotationMode(false);
            toast.success('Requirement saved to Previs!');
        } catch (err) {
            console.error('Submit error:', err);
            toast.error(err.message || 'Failed to save requirement');
        } finally {
            setSubmittingComment(false);
        }
    };

    // ── Navigation ──
    const handlePrevShot = () => {
        if (currentIndex > 0) {
            setSelectedTaskId(visibleShots[currentIndex - 1].id);
        }
    };

    const handleNextShot = () => {
        if (currentIndex < visibleShots.length - 1) {
            setSelectedTaskId(visibleShots[currentIndex + 1].id);
        }
    };

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

            if (e.code === 'Space') {
                e.preventDefault();
                togglePlay();
            } else if (e.code === 'ArrowLeft') {
                e.preventDefault();
                stepFrame(-1);
            } else if (e.code === 'ArrowRight') {
                e.preventDefault();
                stepFrame(1);
            } else if (e.code === 'BracketLeft') {
                e.preventDefault();
                handlePrevShot();
            } else if (e.code === 'BracketRight') {
                e.preventDefault();
                handleNextShot();
            } else if (e.key === 'f' || e.key === 'F') {
                e.preventDefault();
                toggleFullscreen();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    });

    const markedCount = Object.keys(requirementsMeta).length;
    const isCurrentMarked = currentShot && !!requirementsMeta[currentShot.id];

    return (
        <div className="requirements-workspace animate-fade-in">
            {/* Top Workspace Bar */}
            <div className="requirements-header glass-panel">
                <div className="req-header-left">
                    <div className="req-header-title-row">
                        <span className="req-badge">Previs Tasks</span>
                        <h2 className="req-title">Shot Requirements</h2>
                    </div>
                    <p className="req-subtitle">
                        Mark requirements and annotate shots for the Previs department.
                    </p>
                </div>

                <div className="req-header-right">
                    {/* Sequence Filter Dropdown */}
                    <div className="seq-dropdown-wrapper" ref={seqPickerRef}>
                        <button
                            className="seq-dropdown-btn glass-panel"
                            onClick={() => setShowSeqPicker(!showSeqPicker)}
                            title="Filter by Sequence"
                        >
                            <Layers size={14} className="icon-purple" />
                            <span>
                                {selectedSequence === 'all'
                                    ? `All Sequences (${previsTasks.length})`
                                    : `${selectedSequence} (${sequences.find(s => s.name === selectedSequence)?.shots.length || 0})`
                                }
                            </span>
                            <ChevronDown size={14} />
                        </button>

                        {showSeqPicker && (
                            <div className="seq-dropdown-menu glass-panel">
                                <button
                                    className={`seq-menu-item ${selectedSequence === 'all' ? 'active' : ''}`}
                                    onClick={() => { setSelectedSequence('all'); setShowSeqPicker(false); }}
                                >
                                    <span>All Sequences</span>
                                    <span className="seq-count-pill">{previsTasks.length}</span>
                                </button>
                                <div className="seq-menu-divider" />
                                {sequences.map(seq => (
                                    <button
                                        key={seq.name}
                                        className={`seq-menu-item ${selectedSequence === seq.name ? 'active' : ''}`}
                                        onClick={() => { setSelectedSequence(seq.name); setShowSeqPicker(false); }}
                                    >
                                        <span>{seq.name}</span>
                                        <span className="seq-count-pill">{seq.shots.length}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="req-stats-pill glass-panel">
                        <span className="req-stat-label">Marked:</span>
                        <span className="req-stat-count">
                            <span className="marked-number">{markedCount}</span> / {previsTasks.length}
                        </span>
                    </div>

                    <button
                        className={`req-filter-pill ${filterOnlyMarked ? 'active' : ''}`}
                        onClick={() => setFilterOnlyMarked(!filterOnlyMarked)}
                        title="Toggle showing only shots with requirements"
                    >
                        <CheckCircle2 size={15} />
                        <span>{filterOnlyMarked ? 'Show All' : 'Only Marked'}</span>
                    </button>
                </div>
            </div>

            {/* Main 3-Column Workspace */}
            <div className="requirements-body">
                {/* ── 1. Left Column: Shots List ── */}
                <aside className={`req-shots-sidebar glass-panel ${isListCollapsed ? 'collapsed' : ''}`}>
                    <div className="req-sidebar-controls">
                        <div className="req-search-box">
                            <Search size={14} className="icon-muted" />
                            <input
                                type="text"
                                placeholder="Search shot or sequence..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
                                    <X size={12} />
                                </button>
                            )}
                        </div>

                        <div className="req-sort-toggle">
                            <button
                                className={`sort-btn ${sortBy === 'sequence' ? 'active' : ''}`}
                                onClick={() => setSortBy('sequence')}
                                title="Sort by sequence"
                            >
                                <ArrowUpDown size={12} /> Sequence
                            </button>
                            <button
                                className={`sort-btn ${sortBy === 'name' ? 'active' : ''}`}
                                onClick={() => setSortBy('name')}
                                title="Sort by shot name"
                            >
                                <ArrowUpDown size={12} /> Name
                            </button>
                        </div>
                    </div>

                    <div className="req-shots-list-container">
                        {visibleShots.length === 0 ? (
                            <div className="req-empty-list">
                                <Search size={20} className="icon-muted" />
                                <span>No matching shots found</span>
                            </div>
                        ) : (
                            visibleShots.map(shot => {
                                const isSelected = shot.id === currentShot?.id;
                                const hasRequirements = !!requirementsMeta[shot.id];

                                return (
                                    <div
                                        key={shot.id}
                                        className={`req-shot-item ${isSelected ? 'selected' : ''} ${hasRequirements ? 'has-requirement' : ''}`}
                                        onClick={() => setSelectedTaskId(shot.id)}
                                    >
                                        <div className="req-shot-thumb">
                                            {shot.thumbnail_url ? (
                                                <Image
                                                    src={shot.thumbnail_url}
                                                    alt={shot.entity_name}
                                                    fill
                                                    sizes="100px"
                                                    className="thumb-img"
                                                />
                                            ) : (
                                                <div className="thumb-placeholder">
                                                    <Play size={14} />
                                                </div>
                                            )}
                                            {hasRequirements && (
                                                <div className="req-marker-badge" title="Requirements submitted through Parallax">
                                                    <Check size={12} strokeWidth={3} />
                                                </div>
                                            )}
                                        </div>

                                        <div className="req-shot-info">
                                            <div className="req-shot-name-row">
                                                <span className="shot-name">{shot.entity_name}</span>
                                                <span className="shot-seq">{shot.sequence_name}</span>
                                            </div>
                                            <div className="req-shot-status-row">
                                                <span className="previs-tag">Ready To Start</span>
                                                {hasRequirements && (
                                                    <span className="marked-tag">Requirements Added</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </aside>

                {/* Collapse / Expand Toggle Tab */}
                <button
                    className="req-collapse-tab glass-panel"
                    onClick={() => setIsListCollapsed(!isListCollapsed)}
                    title={isListCollapsed ? 'Expand shot list' : 'Collapse shot list'}
                >
                    {isListCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>

                {/* ── 2. Center Column: Video Player (Battle-Tested Player Structure) ── */}
                <main className="req-player-column glass-panel" ref={videoAreaRef}>
                    {/* Player Header with Annotate button & steppers */}
                    <div className="req-player-navbar">
                        <div className="req-shot-breadcrumb">
                            <span className="seq-label">{currentShot?.sequence_name || 'Sequence'}</span>
                            <span className="breadcrumb-sep">/</span>
                            <span className="shot-title">{currentShot?.entity_name || 'Shot'}</span>
                            {isCurrentMarked && (
                                <span className="shot-marked-indicator">
                                    <Check size={12} strokeWidth={3} /> Requirements Added
                                </span>
                            )}
                        </div>

                        <div className="req-player-actions">
                            {/* Annotate Toggle Button (Matches Client Review) */}
                            <button
                                className={`pl-annotate-btn ${annotationMode ? 'active' : ''}`}
                                onClick={() => {
                                    if (annotationMode) persistCurrentAnnotation();
                                    setAnnotationMode(!annotationMode);
                                }}
                                title="Draw annotations on frame"
                            >
                                <PenTool size={16} />
                                <span>Annotate</span>
                            </button>

                            <div className="req-nav-steppers">
                                <button
                                    className="nav-step-btn"
                                    onClick={handlePrevShot}
                                    disabled={currentIndex <= 0}
                                    title="Previous Shot ([)"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <span className="shot-index-counter">
                                    {currentIndex + 1} / {visibleShots.length}
                                </span>
                                <button
                                    className="nav-step-btn"
                                    onClick={handleNextShot}
                                    disabled={currentIndex >= visibleShots.length - 1}
                                    title="Next Shot (])"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Video Area (Exact PlaylistClient Video Structure) */}
                    <div className="playlist-video-wrapper">
                        {currentVideoUrl ? (
                            <>
                                <video
                                    ref={videoRef}
                                    key={currentShot?.id}
                                    src={currentVideoUrl}
                                    className="playlist-video"
                                    preload="auto"
                                    playsInline
                                    webkit-playsinline="true"
                                    x5-playsinline="true"
                                    loop={isLooping}
                                    muted={isMuted}
                                    onTimeUpdate={() => {
                                        if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
                                    }}
                                    onLoadedMetadata={() => {
                                        if (videoRef.current) setDuration(videoRef.current.duration || 0);
                                        if (annotationMode) setupCanvas();
                                    }}
                                    onClick={annotationMode ? undefined : togglePlay}
                                    onError={() => setIsPlaying(false)}
                                />

                                {/* Interactive Annotation Canvas (Only when annotationMode is ON) */}
                                {annotationMode && (
                                    <canvas
                                        ref={canvasRef}
                                        className={`annotation-canvas cursor-${activeTool === 'eraser' ? 'cell' : 'crosshair'}`}
                                        onMouseDown={startDraw}
                                        onMouseMove={draw}
                                        onMouseUp={endDraw}
                                        onMouseLeave={endDraw}
                                        onTouchStart={startDraw}
                                        onTouchMove={draw}
                                        onTouchEnd={endDraw}
                                    />
                                )}

                                {/* Big Play Overlay when paused and not annotating */}
                                {!isPlaying && !annotationMode && (
                                    <div className="playlist-play-overlay" onClick={togglePlay}>
                                        <Play size={48} />
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="req-no-video glass-panel">
                                <Play size={48} className="icon-muted" />
                                <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>No preview video available</p>
                                <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>This Previs task does not have a video file yet.</p>
                            </div>
                        )}
                    </div>

                    {/* Annotation Toolbar (When Annotate is Active) */}
                    {annotationMode && (
                        <div className="annotation-toolbar">
                            <span className="anno-label">Draw:</span>
                            <button
                                className={`anno-btn ${activeTool === 'pen' ? 'active' : ''}`}
                                onClick={() => setActiveTool('pen')}
                                title="Pen"
                            >
                                <PenTool size={16} />
                            </button>
                            <button
                                className={`anno-btn ${activeTool === 'eraser' ? 'active' : ''}`}
                                onClick={() => setActiveTool('eraser')}
                                title="Eraser"
                            >
                                <Eraser size={16} />
                            </button>

                            <div className="anno-divider" />

                            <div className="color-palette">
                                {['#ef4444', '#f59e0b', '#06b6d4', '#10b981', '#ffffff'].map(color => (
                                    <div
                                        key={color}
                                        className={`anno-color ${drawColor === color ? 'ring' : ''}`}
                                        style={{ background: color }}
                                        onClick={() => {
                                            setDrawColor(color);
                                            setActiveTool('pen');
                                        }}
                                    />
                                ))}
                            </div>

                            <div className="anno-divider" />

                            <button className="anno-btn" onClick={clearCanvas} title="Clear canvas">
                                <X size={16} />
                            </button>

                            <button
                                className="anno-btn pin-frame-btn"
                                onClick={() => {
                                    if (persistCurrentAnnotation()) {
                                        toast.success(`Pinned annotation to frame ${currentFrame}`);
                                    }
                                }}
                                title="Pin current frame annotation"
                            >
                                <Check size={14} /> Pin Frame
                            </button>

                            {queuedAnnotations.length > 0 && (
                                <span className="anno-saved-hint">
                                    {queuedAnnotations.length} frame{queuedAnnotations.length > 1 ? 's' : ''} pinned
                                </span>
                            )}
                        </div>
                    )}

                    {/* Transport Controls Bar (Matches PlaylistClient) */}
                    <div className="playlist-controls">
                        <div className="playlist-timeline" onClick={handleTimelineClick}>
                            <div
                                className="playlist-timeline-progress"
                                style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                            />
                            {queuedAnnotations.map(a => {
                                const pct = duration > 0 ? (a.frame / (duration * FPS)) * 100 : 0;
                                return (
                                    <div
                                        key={a.frame}
                                        className="timeline-comment-dot"
                                        style={{ left: `${pct}%`, background: '#ef4444' }}
                                        title={`Annotation on Frame ${a.frame}`}
                                    />
                                );
                            })}
                        </div>

                        <div className="playlist-control-bar">
                            <div className="playlist-controls-left">
                                <button className="pl-ctrl-btn" onClick={handlePrevShot} disabled={currentIndex <= 0} title="Previous Shot ([)">
                                    <SkipBack size={18} />
                                </button>
                                <button className="pl-ctrl-btn" onClick={() => stepFrame(-1)} title="Previous Frame (← key)">
                                    <ChevronLeft size={16} />
                                </button>
                                <button className="pl-ctrl-btn pl-play-btn" onClick={togglePlay} title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
                                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                                </button>
                                <button className="pl-ctrl-btn" onClick={() => stepFrame(1)} title="Next Frame (→ key)">
                                    <ChevronRight size={16} />
                                </button>
                                <button className="pl-ctrl-btn" onClick={handleNextShot} disabled={currentIndex >= visibleShots.length - 1} title="Next Shot (])">
                                    <SkipForward size={18} />
                                </button>
                                <span className="pl-shot-counter">
                                    {String(currentIndex + 1).padStart(2, '0')} / {String(visibleShots.length).padStart(2, '0')}
                                </span>
                            </div>

                            <div className="playlist-controls-right">
                                <span className="pl-frame-counter">F{currentFrame}</span>
                                <span className="pl-timecode">{formatTime(currentTime)} / {formatTime(duration)}</span>
                                <button className={`pl-ctrl-btn ${isLooping ? 'pl-active' : ''}`} onClick={() => setIsLooping(!isLooping)} title="Loop">
                                    <Repeat size={16} />
                                </button>
                                <button className="pl-ctrl-btn" onClick={() => {
                                    if (videoRef.current) {
                                        videoRef.current.muted = !isMuted;
                                        setIsMuted(!isMuted);
                                    }
                                }} title={isMuted ? 'Unmute' : 'Mute'}>
                                    {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                                </button>
                                <button className="pl-ctrl-btn" onClick={toggleFullscreen} title={isFullscreen ? 'Exit Fullscreen (f)' : 'Fullscreen (f)'}>
                                    {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                                </button>
                            </div>
                        </div>
                    </div>
                </main>

                {/* ── 3. Right Column: Requirements & Comments Panel ── */}
                <aside className="req-comments-panel glass-panel">
                    <div className="req-panel-header">
                        <div className="req-panel-title">
                            <MessageSquare size={16} />
                            <h3>Requirements & Notes</h3>
                        </div>
                        <span className="previs-tag-sub">Previs Task</span>
                    </div>

                    {/* Requirements input area */}
                    <div className="req-composer-container">
                        <div className="req-composer-meta">
                            <span className="frame-tag-pill">Frame {currentFrame}</span>
                            {(hasAnnotation || queuedAnnotations.length > 0) && (
                                <span className="drawing-tag-pill">
                                    ✓ Drawing attached
                                </span>
                            )}
                        </div>

                        {queuedAnnotations.length > 0 && (
                            <div className="queued-chips-list">
                                {queuedAnnotations.map(a => (
                                    <div key={a.frame} className="annotation-chip">
                                        <span>Frame {a.frame}</span>
                                        <button
                                            type="button"
                                            onClick={() => setQueuedAnnotations(prev => prev.filter(x => x.frame !== a.frame))}
                                        >
                                            <X size={10} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <textarea
                            className="req-textarea"
                            placeholder="Add requirement notes or feedback for this shot..."
                            rows={3}
                            value={newComment}
                            onChange={e => setNewComment(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmitRequirement();
                                }
                            }}
                        />

                        <button
                            className="req-submit-btn"
                            onClick={handleSubmitRequirement}
                            disabled={submittingComment}
                        >
                            {submittingComment ? (
                                <>
                                    <Loader2 size={16} className="spin" />
                                    <span>Saving to Kitsu...</span>
                                </>
                            ) : (
                                <>
                                    <Send size={16} />
                                    <span>Submit Requirement</span>
                                </>
                            )}
                        </button>
                    </div>

                    {/* Existing Requirements / Feedback Thread */}
                    <div className="req-thread-container">
                        <h4 className="req-thread-title">Shot Notes ({comments.length})</h4>

                        {commentsLoading ? (
                            <div className="req-loading-state">
                                <Loader2 size={18} className="spin icon-muted" />
                                <span>Loading notes...</span>
                            </div>
                        ) : comments.length === 0 ? (
                            <div className="req-empty-thread">
                                <MessageSquare size={24} className="icon-muted" />
                                <p>No requirements or notes recorded for this shot yet.</p>
                                <span className="empty-hint">Use the input above to specify requirements.</span>
                            </div>
                        ) : (
                            <div className="req-comments-list">
                                {comments.map(c => (
                                    <div key={c.id} className="req-comment-card glass-panel">
                                        <div className="req-comment-head">
                                            <span className="comment-user">{c.user || 'User'}</span>
                                            <span className="comment-time">{c.time}</span>
                                        </div>
                                        <p className="comment-text">{c.text}</p>
                                        {c.attachmentCount > 0 && (
                                            <span className="comment-attachment-indicator">
                                                📎 {c.attachmentCount} annotation drawing{c.attachmentCount > 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}
