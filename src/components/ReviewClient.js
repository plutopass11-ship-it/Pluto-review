'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { formatUtcDate } from '@/lib/datetime';
import {
    ChevronLeft, Play, Pause, Download, CheckCircle, XCircle, SkipBack, SkipForward,
    MessageSquare, Send, Maximize, Loader2, GitMerge, Repeat, MousePointer2, PenTool, Type, Eraser, Spline, X, Volume2, VolumeX
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import './ReviewClient.css';

export default function ReviewClient({ taskId, taskData, currentUser = 'Current User' }) {
    const [selectedVersion, setSelectedVersion] = useState(taskData?.versions?.[0] || null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [isLooping, setIsLooping] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [activeTool, setActiveTool] = useState('cursor');
    const [statusName, setStatusName] = useState(taskData?.status_name || 'Pending Review');
    const [statusShort, setStatusShort] = useState(taskData?.status_short || '');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);

    // Compare mode state
    const [compareMode, setCompareMode] = useState(false);
    const [compareA, setCompareA] = useState(taskData?.versions?.[0] || null);
    const [compareB, setCompareB] = useState(taskData?.versions?.[1] || null);
    const [sliderPos, setSliderPos] = useState(50);
    const compareContainerRef = useRef(null);
    const videoARef = useRef(null);
    const videoBRef = useRef(null);
    const isDragging = useRef(false);

    // Drawing state
    const [drawColor, setDrawColor] = useState('#06b6d4');
    const isDrawing = useRef(false);
    const lastPoint = useRef(null);

    // Task statuses cache
    const [taskStatuses, setTaskStatuses] = useState([]);

    // Real comments from Kitsu
    const [comments, setComments] = useState(taskData?.comments || []);
    const [newComment, setNewComment] = useState('');
    const [commentSubmitting, setCommentSubmitting] = useState(false);
    const [watermarkDate, setWatermarkDate] = useState('');

    // Mark shot as read on mount
    useEffect(() => {
        if (taskId) {
            fetch('/api/read-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shotId: taskId })
            }).catch(() => {});
        }
    }, [taskId]);

    // Fetch task statuses on mount
    useEffect(() => {
        fetch('/api/task-statuses')
            .then(r => r.json())
            .then(data => { if (Array.isArray(data)) setTaskStatuses(data); })
            .catch(() => { });
    }, []);

    useEffect(() => {
        setWatermarkDate(formatUtcDate(new Date()));
    }, []);

    // Reload video when version changes
    useEffect(() => {
        if (videoRef.current && selectedVersion?.url) {
            videoRef.current.load();
            setIsPlaying(false);
            setCurrentTime(0);
        }
    }, [selectedVersion]);

    // Listen for arrow keys to step frame-by-frame
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
            if (videoRef.current) {
                if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    videoRef.current.currentTime = Math.min(videoRef.current.duration, videoRef.current.currentTime + (1 / 24));
                    setCurrentTime(videoRef.current.currentTime);
                } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - (1 / 24));
                    setCurrentTime(videoRef.current.currentTime);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // ── Drawing/Annotation Canvas ──
    const setupCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const wrapper = canvas.parentElement;

        // Save existing drawing data before resize
        const ctx = canvas.getContext('2d');
        let imageData = null;
        if (canvas.width > 0 && canvas.height > 0) {
            imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }

        canvas.width = wrapper.clientWidth;
        canvas.height = wrapper.clientHeight;

        // Restore drawing data
        if (imageData) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = imageData.width;
            tempCanvas.height = imageData.height;
            tempCanvas.getContext('2d').putImageData(imageData, 0, 0);
            ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
        }
    }, []);

    useEffect(() => {
        if (activeTool !== 'cursor') {
            setupCanvas();
            window.addEventListener('resize', setupCanvas);
            return () => window.removeEventListener('resize', setupCanvas);
        }
    }, [activeTool, setupCanvas]);

    const startDraw = (e) => {
        if (activeTool === 'cursor' || !canvasRef.current) return;
        isDrawing.current = true;
        const rect = canvasRef.current.getBoundingClientRect();
        lastPoint.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const draw = (e) => {
        if (!isDrawing.current || !canvasRef.current || !lastPoint.current) return;
        const ctx = canvasRef.current.getContext('2d');
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (activeTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = 20;
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = drawColor;
            ctx.lineWidth = 3;
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
        ctx.lineTo(x, y);
        ctx.stroke();
        lastPoint.current = { x, y };
    };

    const stopDraw = () => {
        isDrawing.current = false;
        lastPoint.current = null;
    };

    const clearCanvas = () => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    };

    const togglePlay = () => {
        if (compareMode) {
            if (isPlaying) {
                videoARef.current?.pause();
                videoBRef.current?.pause();
            } else {
                videoARef.current?.play().catch(() => {});
                videoBRef.current?.play().catch(() => {});
            }
            setIsPlaying(!isPlaying);
            return;
        }
        if (videoRef.current) {
            if (isPlaying) { 
                videoRef.current.pause(); 
            } else { 
                videoRef.current.play().catch(() => {}); 
            }
            setIsPlaying(!isPlaying);
        }
    };

    const handleTimeUpdate = () => {
        if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
    };

    const handleTimelineClick = (e) => {
        if (videoRef.current) {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = x / rect.width;
            const duration = videoRef.current.duration || 10;
            videoRef.current.currentTime = percentage * duration;
            setCurrentTime(percentage * duration);
        }
    };

    // Is the shot currently approved?
    const isApproved = statusShort === 'done' || statusShort === 'approved' || statusName?.toLowerCase() === 'done';

    // ── Approve (Done) ──
    const handleApprove = async () => {
        if (isApproved) return; // Already approved
        setIsSubmitting(true);
        try {
            const doneStatus = taskStatuses.find(s =>
                s.short_name === 'done' || s.name.toLowerCase() === 'done'
            );
            if (!doneStatus) {
                toast.error('Could not find "Done" status');
                setIsSubmitting(false);
                return;
            }

            const res = await fetch('/api/comment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskId,
                    comment: 'Approved by client',
                    taskStatusId: doneStatus.id
                })
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Failed');

            setStatusName('Done');
            setStatusShort('done');
            setComments(prev => [{ id: Date.now(), user: 'Client (You)', text: 'Approved by client', time: 'Just now', frame: null }, ...prev]);
            toast.success('Shot approved');
        } catch (err) {
            toast.error('Error: ' + err.message);
        }
        setIsSubmitting(false);
    };

    // ── Submit Comment → auto Retake ──
    const submitComment = async () => {
        if (!newComment.trim() || commentSubmitting) return;
        setCommentSubmitting(true);

        try {
            // Find Retake status to auto-set when client leaves feedback
            const retakeStatus = taskStatuses.find(s =>
                s.short_name === 'retake' || s.name.toLowerCase() === 'retake'
            );

            const res = await fetch('/api/comment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskId,
                    comment: newComment,
                    taskStatusId: retakeStatus?.id || undefined
                })
            });

            if (!res.ok) throw new Error('Failed to post comment');

            // Auto-set status to Retake (switches Approve button back from 'Approved')
            if (retakeStatus) {
                setStatusName('Retake');
                setStatusShort('retake');
            }

            setComments(prev => [{
                id: Date.now(),
                user: 'Client (You)',
                text: newComment,
                frame: Math.floor(currentTime * 24),
                time: 'Just now'
            }, ...prev]);

            setNewComment('');
            toast.success('Feedback submitted');
        } catch (err) {
            toast.error('Failed to post comment: ' + err.message);
        }
        setCommentSubmitting(false);
    };

    // ── Compare Mode Slider ──
    const handleSliderMove = (e) => {
        if (!compareContainerRef.current) return;
        const rect = compareContainerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
        setSliderPos(pct);
    };

    const handleSliderMouseDown = (e) => {
        e.preventDefault();
        isDragging.current = true;
        handleSliderMove(e);
        const handleMove = (ev) => { if (isDragging.current) handleSliderMove(ev); };
        const handleUp = () => {
            isDragging.current = false;
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
    };

    const openCompare = () => {
        if (!taskData?.versions || taskData.versions.length < 2) {
            toast.error('Need at least 2 versions to compare');
            return;
        }
        setCompareA(taskData.versions[0]);
        setCompareB(taskData.versions[1]);
        setSliderPos(50);
        setCompareMode(true);
    };

    // ── Compare Mode Render ──
    if (compareMode) {
        return (
            <div className="review-container animate-fade-in">
                <header className="review-header glass-panel">
                    <div className="review-header-left">
                        <button onClick={() => setCompareMode(false)} className="back-btn glass-button">
                            <ChevronLeft size={18} /> Back to Player
                        </button>
                        <div className="shot-title"><h2>Compare Versions</h2></div>
                    </div>
                    <div className="review-header-right">
                        <div className="compare-selectors">
                            <label className="compare-label">
                                <span className="compare-tag tag-a">A</span>
                                <select className="glass-select" value={compareA?.id || ''} onChange={(e) => {
                                    const v = taskData.versions.find(v => v.id === e.target.value);
                                    if (v) setCompareA(v);
                                }}>
                                    {taskData.versions.map((v, i) => (
                                        <option key={v.id} value={v.id}>{v.name} {i === 0 ? '(Latest)' : ''}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="compare-label">
                                <span className="compare-tag tag-b">B</span>
                                <select className="glass-select" value={compareB?.id || ''} onChange={(e) => {
                                    const v = taskData.versions.find(v => v.id === e.target.value);
                                    if (v) setCompareB(v);
                                }}>
                                    {taskData.versions.map((v, i) => (
                                        <option key={v.id} value={v.id}>{v.name} {i === 0 ? '(Latest)' : ''}</option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <button onClick={() => setCompareMode(false)} className="glass-button"><X size={16} /> Close</button>
                    </div>
                </header>
                <div className="compare-workspace">
                    <div className="compare-container" ref={compareContainerRef} onMouseDown={handleSliderMouseDown}>
                        <div className="compare-video-layer compare-layer-b">
                            <video ref={videoBRef} className="compare-video" src={compareB?.url || ''} loop={isLooping} muted={isMuted} />
                            <div className="compare-version-label label-b">{compareB?.name || 'Version B'}</div>
                        </div>
                        <div className="compare-video-layer compare-layer-a" style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}>
                            <video ref={videoARef} className="compare-video" src={compareA?.url || ''} loop={isLooping} muted={isMuted} />
                            <div className="compare-version-label label-a">{compareA?.name || 'Version A'}</div>
                        </div>
                        <div className="compare-slider-bar" style={{ left: `${sliderPos}%` }}>
                            <div className="compare-slider-handle"><div className="slider-arrows">◀ ▶</div></div>
                        </div>
                    </div>
                    <div className="compare-controls glass-panel">
                        <button className="icon-btn control-btn play-pause" onClick={togglePlay}>
                            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                        </button>
                        <button className={`icon-btn control-btn ${isLooping ? 'active-tool-btn' : ''}`} onClick={() => setIsLooping(!isLooping)} title="Toggle Loop">
                            <Repeat size={18} />
                        </button>
                        <span className="compare-hint">Drag the slider to compare versions</span>
                    </div>
                </div>
            </div>
        );
    }

    // ── Normal Review Mode ──
    return (
        <div className="review-container animate-fade-in">
            <header className="review-header glass-panel">
                <div className="review-header-left">
                    <Link href={taskData?.project_id ? `/project/${taskData.project_id}` : '/projects'} className="back-btn glass-button">
                        <ChevronLeft size={18} /> Back to Project
                    </Link>
                    <div className="shot-title">
                        <h2>{taskData?.entity_name || `Shot ${taskId}`}</h2>
                        <span className={`status-badge ${statusName?.includes('Done') || statusName?.includes('Approve') ? 'badge-green' : statusName?.includes('Retake') ? 'badge-amber' : 'badge-cyan'}`}>
                            {statusName}
                        </span>
                    </div>
                </div>
                <div className="review-header-right">
                    {taskData?.versions && taskData.versions.length > 0 && (
                        <div className="version-selector">
                            <select className="glass-select" value={selectedVersion?.id || ''} onChange={(e) => {
                                const v = taskData.versions.find(v => v.id === e.target.value);
                                if (v) setSelectedVersion(v);
                            }}>
                                {taskData.versions.map((v, i) => (
                                    <option key={v.id} value={v.id}>{v.name} {i === 0 ? '(Latest)' : ''}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <a
                        href={`/api/download-watermarked?id=${selectedVersion?.previewId || selectedVersion?.id || ''}&name=${encodeURIComponent(taskData?.entity_name || 'shot')}&user=${encodeURIComponent(currentUser)}`}
                        download
                        className="glass-button btn-purple download-shot-btn"
                    >
                        <Download size={16} /> Download
                    </a>
                    <button className="glass-button glass-button-primary" onClick={openCompare}>
                        Compare Versions
                    </button>
                </div>
            </header>

            <div className="review-workspace">
                {/* Left Toolbar */}
                <aside className="tools-sidebar glass-panel">
                    <div className="tool-group">
                        <button className={`tool-btn ${activeTool === 'cursor' ? 'active' : ''}`} onClick={() => setActiveTool('cursor')} title="Select / Move">
                            <MousePointer2 size={20} />
                        </button>
                        <button className={`tool-btn ${activeTool === 'draw' ? 'active' : ''}`} onClick={() => setActiveTool('draw')} title="Draw">
                            <PenTool size={20} />
                        </button>
                        <button className={`tool-btn ${activeTool === 'arrow' ? 'active' : ''}`} onClick={() => setActiveTool('arrow')} title="Arrow">
                            <Spline size={20} />
                        </button>
                        <button className={`tool-btn ${activeTool === 'text' ? 'active' : ''}`} onClick={() => setActiveTool('text')} title="Text Node">
                            <Type size={20} />
                        </button>
                    </div>
                    <div className="tool-divider" />
                    <div className="tool-group">
                        <div className={`color-picker-btn bg-cyan ${drawColor === '#06b6d4' ? 'color-active' : ''}`} onClick={() => setDrawColor('#06b6d4')} />
                        <div className={`color-picker-btn bg-red ${drawColor === '#ef4444' ? 'color-active' : ''}`} onClick={() => setDrawColor('#ef4444')} />
                        <div className={`color-picker-btn bg-amber ${drawColor === '#f59e0b' ? 'color-active' : ''}`} onClick={() => setDrawColor('#f59e0b')} />
                    </div>
                    <div className="tool-divider" />
                    <div className="tool-group">
                        <button className={`tool-btn ${activeTool === 'eraser' ? 'active' : ''}`} onClick={() => setActiveTool('eraser')} title="Erase">
                            <Eraser size={20} />
                        </button>
                    </div>
                </aside>

                {/* Center - Player */}
                <main className="player-section glass-panel">
                    <div className="video-container">
                        <video
                            ref={videoRef}
                            src={selectedVersion?.url || ''}
                            className="main-video"
                            onClick={togglePlay}
                            onTimeUpdate={handleTimeUpdate}
                            loop={isLooping}
                            muted={isMuted}
                        />
                        <div className="watermark-overlay">
                            <span>{currentUser}</span>
                            <span className="watermark-date">{watermarkDate}</span>
                        </div>
                        {/* Drawing Canvas */}
                        {activeTool !== 'cursor' && (
                            <canvas
                                ref={canvasRef}
                                className="canvas-overlay"
                                style={{ cursor: activeTool === 'eraser' ? 'cell' : 'crosshair' }}
                                onMouseDown={startDraw}
                                onMouseMove={draw}
                                onMouseUp={stopDraw}
                                onMouseLeave={stopDraw}
                            />
                        )}
                    </div>

                    <div className="player-controls">
                        <div className="timeline-container">
                            <div className="timeline-track" onClick={handleTimelineClick}>
                                <div className="timeline-progress progress-fill" style={{ width: `${(currentTime / (videoRef.current?.duration || 10)) * 100}%` }} />
                                <div className="timeline-scrubber" style={{ left: `${(currentTime / (videoRef.current?.duration || 10)) * 100}%` }} />
                            </div>
                        </div>
                        <div className="control-bar">
                            <div className="controls-left">
                                <button className="icon-btn control-btn"><SkipBack size={20} /></button>
                                <button className="icon-btn control-btn play-pause" onClick={togglePlay}>
                                    {isPlaying ? <Pause size={24} /> : <Play size={24} className="play-icon-offset" />}
                                </button>
                                <button className="icon-btn control-btn"><SkipForward size={20} /></button>
                                <button className={`icon-btn control-btn ${isLooping ? 'active-tool-btn' : ''}`} onClick={() => setIsLooping(!isLooping)} title="Toggle Loop">
                                    <Repeat size={18} />
                                </button>
                                <button className="icon-btn control-btn" onClick={() => setIsMuted(!isMuted)} title={isMuted ? "Unmute" : "Mute"}>
                                    {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                                </button>
                            </div>
                            <div className="controls-center timecode">
                                <span>{Math.floor(currentTime / 60).toString().padStart(2, '0')}:{(Math.floor(currentTime) % 60).toString().padStart(2, '0')}</span>
                                <span className="text-muted mx-2"> / </span>
                                <span className="text-muted">
                                    {videoRef.current?.duration ?
                                        `${Math.floor(videoRef.current.duration / 60).toString().padStart(2, '0')}:${(Math.floor(videoRef.current.duration) % 60).toString().padStart(2, '0')}`
                                        : '00:00'}
                                </span>
                                <span className="fps-badge">24 FPS</span>
                            </div>
                            <div className="controls-right">
                                {activeTool !== 'cursor' && (
                                    <button className="icon-btn control-btn" onClick={clearCanvas} title="Clear Annotations" style={{ color: 'var(--accent-red)' }}>
                                        <Eraser size={18} />
                                    </button>
                                )}
                                <button className="icon-btn control-btn"><Maximize size={20} /></button>
                            </div>
                        </div>
                    </div>
                </main>

                {/* Right Sidebar */}
                <aside className="review-sidebar glass-panel">
                    <div className="sidebar-section action-panel">
                        <h3>Decision</h3>
                        <div className="action-buttons">
                            {isApproved ? (
                                <button className="action-btn approved-btn" disabled>
                                    <CheckCircle size={18} />
                                    Approved ✓
                                </button>
                            ) : (
                                <button className="action-btn approve-btn" onClick={handleApprove} disabled={isSubmitting}>
                                    {isSubmitting ? <Loader2 size={18} className="spin" /> : <CheckCircle size={18} />}
                                    Approve
                                </button>
                            )}
                        </div>
                        <p className="action-hint">{isApproved ? 'This shot has been approved' : 'Posting feedback will automatically request changes (Retake)'}</p>
                    </div>

                    <div className="sidebar-section messages-panel">
                        <h3><MessageSquare size={16} className="inline-icon" /> Feedback Thread</h3>

                        {/* Input area first (above thread) */}
                        <div className="comment-input-area-top">
                            <div className="input-wrapper">
                                <textarea
                                    placeholder="Write feedback (auto-sends as Retake)..."
                                    value={newComment}
                                    onChange={e => setNewComment(e.target.value)}
                                    rows={3}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            submitComment();
                                        }
                                    }}
                                />
                                <button className="send-btn" onClick={submitComment} disabled={commentSubmitting}>
                                    {commentSubmitting ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                                </button>
                            </div>
                        </div>

                        {/* Thread below */}
                        <div className="comments-list">
                            {comments.map(c => (
                                <div key={c.id} className={`comment-bubble ${c.user.includes('Client') ? 'my-comment' : ''}`}>
                                    <div className="comment-header">
                                        <span className="comment-user">{c.user}</span>
                                        <span className="comment-time">{c.time}</span>
                                    </div>
                                    <p className="comment-text">{c.text}</p>
                                    {c.frame && (
                                        <div className="comment-frame-tag">Frame {c.frame}</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}
