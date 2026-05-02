'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
    Play, Pause, SkipBack, SkipForward, Repeat, Volume2, VolumeX,
    CheckCircle, MessageSquare, Send, Loader2, X, Download, ChevronDown,
    ChevronLeft, ChevronRight, PenTool, Eraser, GitCompare, EyeOff,
    Maximize, Minimize
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import './PlaylistClient.css';

const FPS = 24;

function extractFrameNumbers(text = '') {
    return Array.from(text.matchAll(/\[Frame (\d+)\]/g)).map((match) => parseInt(match[1], 10));
}

function stripFrameMarkers(text = '') {
    return text.replace(/\[Frame \d+\]\s*/g, '').trim();
}

function uniqueSortedFrames(frames = []) {
    return [...new Set(frames.filter((frame) => Number.isFinite(frame)))].sort((a, b) => a - b);
}

function buildFrameLabel(frames = []) {
    return uniqueSortedFrames(frames).map((frame) => `[Frame ${frame}]`).join(' ');
}

export default function PlaylistClient({ shots, projectId, projectName, currentUser, initialComments = [], initialShotId = null, isClientView = false }) {
    // Group shots by sequence
    const sequences = useMemo(() => {
        const map = {};
        shots.forEach(shot => {
            const seq = shot.sequence_name || 'Uncategorized';
            if (!map[seq]) map[seq] = [];
            map[seq].push(shot);
        });
        return Object.entries(map).map(([name, items]) => ({ name, shots: items }));
    }, [shots]);

    const [activeSeqIndex, setActiveSeqIndex] = useState(0);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isLooping, setIsLooping] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [showSeqPicker, setShowSeqPicker] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isPhone, setIsPhone] = useState(false);

    // Per-shot status tracking
    const [shotStatuses, setShotStatuses] = useState({});

    // Comments
    const [comments, setComments] = useState(initialComments);
    const [newComment, setNewComment] = useState('');
    const [commentSubmitting, setCommentSubmitting] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [taskStatuses, setTaskStatuses] = useState([]);
    const [openedShots, setOpenedShots] = useState([]);

    // Annotation state
    const [annotationMode, setAnnotationMode] = useState(false);
    const [activeTool, setActiveTool] = useState('pen');
    const [drawColor, setDrawColor] = useState('#ef4444');
    const [hasAnnotation, setHasAnnotation] = useState(false);
    const [queuedAnnotations, setQueuedAnnotations] = useState([]);
    const isDrawing = useRef(false);
    const lastPoint = useRef(null);
    const canvasRef = useRef(null);

    // Comment frame markers
    const [commentFrames, setCommentFrames] = useState([]);

    // Version compare
    const [showVersions, setShowVersions] = useState(false);
    const [versions, setVersions] = useState([]);
    const [activeVersionIdx, setActiveVersionIdx] = useState(0);
    const [versionsLoading, setVersionsLoading] = useState(false);
    const [videoNotice, setVideoNotice] = useState('');
    const [currentVideoUrl, setCurrentVideoUrl] = useState('');

    const videoRef = useRef(null);
    const filmstripRef = useRef(null);
    const videoAreaRef = useRef(null);

    const activeSequence = sequences[activeSeqIndex] || { name: '', shots: [] };
    const seqShots = activeSequence.shots;
    const currentShot = seqShots[currentIndex] || null;
    const isShotProcessing = !showVersions && (currentShot?.preview_status || '').toLowerCase() === 'processing';
    const hasVisibleVideo = Boolean(currentShot?.video_url) && !isShotProcessing;

    const currentFrame = Math.floor(currentTime * FPS);

    const getCanvasContext = useCallback((canvas, options = {}) => {
        if (!canvas) return null;
        return canvas.getContext('2d', options);
    }, []);

    // Status helpers
    const getEffectiveStatus = useCallback((shot) => {
        if (shotStatuses[shot.id]) return shotStatuses[shot.id];
        return { name: shot.task_status_name, short: shot.task_status_short };
    }, [shotStatuses]);

    const isCurrentApproved = currentShot ? (() => {
        const s = getEffectiveStatus(currentShot);
        const short = (s.short || '').toLowerCase();
        return short === 'done' || short === 'approved';
    })() : false;

    // Init
    useEffect(() => {
        fetch('/api/task-statuses').then(r => r.json()).then(data => { if (Array.isArray(data)) setTaskStatuses(data); }).catch(() => { });
        fetch('/api/read-status')
            .then(res => res.json())
            .then(data => { if (data && !data.error) setOpenedShots(Object.keys(data)); })
            .catch(() => {
                const stored = JSON.parse(localStorage.getItem('opened_shots') || '[]');
                setOpenedShots(stored);
            });
    }, []);

    // URL param for initial sequence & shot
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const seqName = params.get('seq');
            const shotId = params.get('shotId') || initialShotId;
            if (seqName) {
                const idx = sequences.findIndex(s => s.name === seqName);
                if (idx >= 0) {
                    setActiveSeqIndex(idx);
                    if (shotId) {
                        const sIdx = sequences[idx].shots.findIndex(s => s.id === shotId);
                        if (sIdx >= 0) setCurrentIndex(sIdx);
                    }
                }
            } else if (shotId) {
                // Find sequence and shot if only shotId is provided
                for (let i = 0; i < sequences.length; i++) {
                    const sIdx = sequences[i].shots.findIndex(s => s.id === shotId);
                    if (sIdx >= 0) {
                        setActiveSeqIndex(i);
                        setCurrentIndex(sIdx);
                        break;
                    }
                }
            }
        }
    }, [sequences, initialShotId]);

    // Mark current shot as opened
    useEffect(() => {
        if (currentShot && !openedShots.includes(currentShot.id)) {
            const newOpened = [...openedShots, currentShot.id];
            setOpenedShots(newOpened);
            fetch('/api/read-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shotId: currentShot.id })
            }).catch(() => {});
            localStorage.setItem('opened_shots', JSON.stringify(newOpened));
        }
    }, [currentShot?.id, openedShots]);

    // Load comments + versions on shot change
    useEffect(() => {
        if (!currentShot) return;

        setCurrentVideoUrl(currentShot.video_url || '');

        // Skip fetch if this is the initial shot and we already have initialComments loaded
        if (currentShot.id === initialShotId && comments.length > 0 && comments === initialComments) {
            // just set frames
            const frames = [];
            comments.forEach(c => {
                frames.push(...extractFrameNumbers(c.text));
            });
            setCommentFrames(frames);
            return;
        }

        setComments([]);
        setCommentFrames([]);
        setVersions([]);
        setActiveVersionIdx(0);
        setShowVersions(false);
        setVideoNotice('');
        setQueuedAnnotations([]);
        clearCanvas();
        setHasAnnotation(false);

        // Load comments
        const loadComments = async () => {
            try {
                const res = await fetch(`/api/comment?taskId=${currentShot.id}`);
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        setComments(data);
                        const frames = [];
                        data.forEach(c => {
                            frames.push(...extractFrameNumbers(c.text));
                        });
                        setCommentFrames(frames);
                    }
                }
            } catch (e) { }
        };
        loadComments();
    }, [currentShot?.id]);

    // Scroll filmstrip to active card (manual scroll to avoid page scroll on mobile)
    useEffect(() => {
        if (filmstripRef.current) {
            const activeCard = filmstripRef.current.querySelector('.filmstrip-card.active');
            if (activeCard) {
                const container = filmstripRef.current;
                const scrollLeft = activeCard.offsetLeft - container.clientWidth / 2 + activeCard.clientWidth / 2;
                container.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
            }
        }
    }, [currentIndex]);

    // ── Arrow key listener for frame-by-frame ──
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Don't handle if typing in textarea
            if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;

            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                stepFrame(-1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                stepFrame(1);
            } else if (e.key === ' ') {
                e.preventDefault();
                togglePlay();
            } else if (e.key === 'f' || e.key === 'F') {
                e.preventDefault();
                toggleFullscreen();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [duration, isPlaying]);

    // ── Canvas / Annotation ──
    const setupCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;

        // Save existing drawing data before resize
        const ctx = getCanvasContext(canvas, { willReadFrequently: true });
        if (!ctx) return;
        let imageData = null;
        if (canvas.width > 0 && canvas.height > 0) {
            imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }

        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;

        // Restore drawing data
        if (imageData) {
            // Need to create a temp canvas to scale the image data if dimensions changed
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = imageData.width;
            tempCanvas.height = imageData.height;
            const tempCtx = getCanvasContext(tempCanvas, { willReadFrequently: true });
            tempCtx?.putImageData(imageData, 0, 0);
            ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
        }
    }, [getCanvasContext]);

    useEffect(() => {
        if (annotationMode) {
            setupCanvas();
            window.addEventListener('resize', setupCanvas);
            // Also pause video when entering annotation mode
            if (videoRef.current && isPlaying) {
                videoRef.current.pause();
                setIsPlaying(false);
            }
            return () => window.removeEventListener('resize', setupCanvas);
        }
    }, [annotationMode, setupCanvas, isPlaying]);

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = getCanvasContext(canvas);
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasAnnotation(false);
    };

    const stageAnnotationFrame = useCallback((frame, imageData) => {
        if (!Number.isFinite(frame) || !imageData) return;
        setQueuedAnnotations((prev) => {
            const next = prev.filter((item) => item.frame !== frame);
            next.push({ frame, imageData });
            return next.sort((a, b) => a.frame - b.frame);
        });
    }, []);

    const getCanvasPoint = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches?.[0]?.clientX ?? e.clientX;
        const clientY = e.touches?.[0]?.clientY ?? e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const startDraw = (e) => {
        if (!annotationMode || activeTool === 'cursor') return;
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
            ctx.lineWidth = 3;
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

    // Native non-passive touch listeners on the canvas so we can preventDefault
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !annotationMode) return;

        const handleTouchStart = (e) => {
            if (activeTool === 'cursor') return;
            e.preventDefault();
            startDraw(e);
        };
        const handleTouchMove = (e) => {
            if (!isDrawing.current) return;
            e.preventDefault();
            draw(e);
        };
        const handleTouchEnd = (e) => {
            e.preventDefault();
            endDraw();
        };

        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

        return () => {
            canvas.removeEventListener('touchstart', handleTouchStart);
            canvas.removeEventListener('touchmove', handleTouchMove);
            canvas.removeEventListener('touchend', handleTouchEnd);
        };
    }, [annotationMode, activeTool]);

    // Lock page scroll while annotating on mobile
    useEffect(() => {
        if (!annotationMode) return;
        const preventScroll = (e) => { e.preventDefault(); };
        document.body.style.touchAction = 'none';
        document.body.style.overscrollBehavior = 'none';
        document.documentElement.style.touchAction = 'none';
        document.addEventListener('touchmove', preventScroll, { passive: false });
        return () => {
            document.body.style.touchAction = '';
            document.body.style.overscrollBehavior = '';
            document.documentElement.style.touchAction = '';
            document.removeEventListener('touchmove', preventScroll);
        };
    }, [annotationMode]);

    // Capture annotation as base64 image (video frame + drawings composited)
    const captureAnnotation = () => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return null;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = video.videoWidth || video.clientWidth;
        tempCanvas.height = video.videoHeight || video.clientHeight;
        const ctx = getCanvasContext(tempCanvas);
        if (!ctx) return null;
        ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
        ctx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
        return tempCanvas.toDataURL('image/png');
    };

    const persistCurrentAnnotation = useCallback(() => {
        if (!hasAnnotation) return false;
        const imageData = captureAnnotation();
        if (!imageData) return false;
        stageAnnotationFrame(currentFrame, imageData);
        clearCanvas();
        return true;
    }, [currentFrame, hasAnnotation, stageAnnotationFrame]);

    const getPendingAnnotations = useCallback(() => {
        const pending = [...queuedAnnotations];
        if (hasAnnotation) {
            const imageData = captureAnnotation();
            if (imageData) {
                const next = pending.filter((item) => item.frame !== currentFrame);
                next.push({ frame: currentFrame, imageData });
                return next.sort((a, b) => a.frame - b.frame);
            }
        }
        return pending.sort((a, b) => a.frame - b.frame);
    }, [currentFrame, hasAnnotation, queuedAnnotations]);

    // ── Version loading ──
    const loadVersions = async () => {
        if (!currentShot) return;
        persistCurrentAnnotation();
        setVersionsLoading(true);
        try {
            const res = await fetch(`/api/versions?taskId=${currentShot.id}`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    const firstPlayableIdx = data.findIndex(version => version.is_playable);
                    setVersions(data);
                    setActiveVersionIdx(firstPlayableIdx >= 0 ? firstPlayableIdx : 0);
                    setShowVersions(true);
                    if (firstPlayableIdx === -1) {
                        setVideoNotice('All available versions for this shot are still processing in Kitsu.');
                    } else if (firstPlayableIdx > 0) {
                        setVideoNotice('Latest version is still processing in Kitsu. Playing the newest ready version instead.');
                    } else {
                        setVideoNotice('');
                    }
                } else {
                    setVersions([]);
                    toast.error('No previous versions found for this shot.');
                }
            }
        } catch (e) { toast.error('Failed to load versions'); }
        setVersionsLoading(false);
    };

    const switchVersion = (idx) => {
        const version = versions[idx];
        if (!version) return;

        if (!version.is_playable) {
            setVideoNotice('That version is still processing in Kitsu and cannot be played yet.');
            toast('Selected version is still processing in Kitsu.');
            return;
        }

        setVideoNotice('');
        setActiveVersionIdx(idx);
        setCurrentVideoUrl(version.video_url || '');
        setCurrentTime(0);
        setDuration(0);
        setIsPlaying(false);
    };

    const exitVersionCompare = () => {
        setShowVersions(false);
        setVideoNotice(isShotProcessing ? 'Latest version is still processing in Kitsu.' : '');
        setCurrentVideoUrl(currentShot?.video_url || '');
        setCurrentTime(0);
        setDuration(0);
    };

    // ── Video handlers ──
    const handleTimeUpdate = () => { if (videoRef.current) setCurrentTime(videoRef.current.currentTime); };
    const handleLoadedMetadata = () => { if (videoRef.current) setDuration(videoRef.current.duration); };

    const handleVideoEnded = () => {
        if (isLooping) {
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch(() => {
                setIsPlaying(false);
            });
        } else if (currentIndex < seqShots.length - 1) {
            jumpToShot(currentIndex + 1);
        } else {
            setIsPlaying(false);
        }
    };

    const togglePlay = () => {
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.pause();
            setIsPlaying(false);
            return;
        }

        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                setIsPlaying(true);
            }).catch(() => {
                setIsPlaying(false);
            });
        } else {
            setIsPlaying(true);
        }
    };

    const stepFrame = (direction) => {
        if (!videoRef.current) return;
        if (annotationMode) persistCurrentAnnotation();
        videoRef.current.pause();
        setIsPlaying(false);
        const frameDelta = direction / FPS;
        const newTime = Math.max(0, Math.min(duration || Infinity, videoRef.current.currentTime + frameDelta));
        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
    };

    // ── Fullscreen ──
    const toggleFullscreen = () => {
        const area = videoAreaRef.current;
        if (!area) return;
        if (!document.fullscreenElement) {
            area.requestFullscreen?.().catch(() => {});
        } else {
            document.exitFullscreen?.().catch(() => {});
        }
    };

    // ── Phone annotation flow (fullscreen-only) ──
    const handlePhoneAnnotate = () => {
        const area = videoAreaRef.current;
        if (!area) return;
        if (!document.fullscreenElement) {
            area.requestFullscreen?.().catch(() => {});
        }
        setAnnotationMode(true);
    };

    const handlePhoneDone = () => {
        if (annotationMode) persistCurrentAnnotation();
        setAnnotationMode(false);
        if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
        }
    };

    useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handler);
        return () => document.removeEventListener('fullscreenchange', handler);
    }, []);

    // Detect phone / small screen
    useEffect(() => {
        const check = () => setIsPhone(window.innerWidth <= 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // Effect to handle video loading when shot changes
    useEffect(() => {
        if (videoRef.current && currentVideoUrl) {
            if (isShotProcessing) {
                videoRef.current.pause();
                setIsPlaying(false);
                return;
            }
            videoRef.current.load();
            if (isPlaying) {
                // Wait for canplay to avoid race condition
                const playPromise = videoRef.current.play();
                if (playPromise !== undefined) {
                    playPromise.catch(() => {
                        // Auto-play was prevented or interrupted
                        setIsPlaying(false);
                    });
                }
            }
        }
    }, [currentVideoUrl, isShotProcessing]); // Removed isPlaying from deps to avoid re-triggering load

    useEffect(() => {
        if (isShotProcessing) {
            setVideoNotice('Latest version is still processing in Kitsu. This shot will be playable as soon as Kitsu finishes generating the movie.');
        } else if (!showVersions) {
            setVideoNotice('');
        }
    }, [isShotProcessing, showVersions, currentShot?.id]);

    const jumpToShot = (index) => {
        if (index < 0 || index >= seqShots.length) return;
        setCurrentIndex(index);
        setCurrentTime(0);
        setDuration(0);
        setIsPlaying(true);
        setAnnotationMode(false);
        setShowVersions(false);
        setQueuedAnnotations([]);
        clearCanvas();
    };

    const switchSequence = (seqIdx) => {
        setActiveSeqIndex(seqIdx);
        setCurrentIndex(0);
        setCurrentTime(0);
        setDuration(0);
        setIsPlaying(false);
        setShowSeqPicker(false);
        setAnnotationMode(false);
        setShowVersions(false);
        setQueuedAnnotations([]);
        clearCanvas();
    };

    const handleTimelineClick = (e) => {
        if (!videoRef.current || !duration) return;
        if (annotationMode) persistCurrentAnnotation();
        const rect = e.currentTarget.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        videoRef.current.currentTime = pct * duration;
        setCurrentTime(pct * duration);
    };

    // ── Approve ──
    const handleApprove = async () => {
        if (isCurrentApproved || !currentShot) return;
        setIsSubmitting(true);
        try {
            const doneStatus = taskStatuses.find(s => s.short_name === 'done' || s.name.toLowerCase() === 'done');
            if (!doneStatus) { toast.error('Could not find "Done" status'); setIsSubmitting(false); return; }
            const res = await fetch('/api/comment', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: currentShot.id, comment: 'Approved by client', taskStatusId: doneStatus.id })
            });
            if (!res.ok) throw new Error('Failed');
            setShotStatuses(prev => ({ ...prev, [currentShot.id]: { name: 'Done', short: 'done' } }));
            setComments(prev => [{ id: Date.now(), user: 'Client (You)', text: 'Approved by client', time: 'Just now' }, ...prev]);
            toast.success('Shot approved');
        } catch (err) { toast.error('Error: ' + err.message); }
        setIsSubmitting(false);
    };

    // ── Submit comment with frame number + annotation upload ──
    const submitComment = async () => {
        if (!newComment.trim() || commentSubmitting || !currentShot) return;
        setCommentSubmitting(true);
        try {
            const retakeStatus = taskStatuses.find(s => s.short_name === 'retake' || s.name.toLowerCase() === 'retake');
            const pendingAnnotations = getPendingAnnotations();
            const commentFramesForSubmission = pendingAnnotations.length > 0
                ? pendingAnnotations.map((annotation) => annotation.frame)
                : [currentFrame];

            // Build comment with frame number
            const frameLabel = buildFrameLabel(commentFramesForSubmission);
            const fullComment = `${frameLabel} ${newComment}`.trim();

            // 1. Post the comment to Kitsu
            const res = await fetch('/api/comment', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: currentShot.id, comment: fullComment, taskStatusId: retakeStatus?.id || undefined })
            });
            if (!res.ok) throw new Error('Failed to post comment');
            const commentData = await res.json();
            let uploadedAttachmentCount = 0;

            if (retakeStatus) setShotStatuses(prev => ({ ...prev, [currentShot.id]: { name: 'Retake', short: 'retake' } }));

            // 2. If annotations exist, upload them to Kitsu attached to this comment
            if (pendingAnnotations.length > 0 && commentData.id) {
                const annotationRes = await fetch('/api/annotation', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        taskId: currentShot.id,
                        commentId: commentData.id,
                        annotations: pendingAnnotations
                    })
                });

                if (!annotationRes.ok) {
                    let detail = 'Failed to upload annotation';
                    try {
                        const errorData = await annotationRes.json();
                        detail = errorData.detail || errorData.error || detail;
                    } catch {}
                    throw new Error(`Comment saved, but annotation sync failed: ${detail}`);
                }

                const annotationData = await annotationRes.json();
                uploadedAttachmentCount = annotationData.attachmentCount || pendingAnnotations.length;
                setQueuedAnnotations([]);
                clearCanvas();
            }

            // Add comment locally
            setComments(prev => [{
                id: commentData.id || Date.now(),
                user: 'Client (You)',
                text: fullComment,
                time: 'Just now',
                attachmentCount: uploadedAttachmentCount
            }, ...prev]);
            setCommentFrames(prev => [...prev, ...commentFramesForSubmission]);
            setNewComment('');
            toast.success('Feedback submitted');

        } catch (err) { toast.error('Failed to post comment: ' + err.message); }
        setCommentSubmitting(false);
    };

    const getStatusColor = (short) => {
        if (!short) return '#64748b';
        const s = short.toLowerCase();
        if (s === 'done' || s === 'approved') return '#10b981';
        if (s === 'retake' || s === 'rejected') return '#ef4444';
        if (s === 'wfa' || s === 'waiting') return '#f59e0b';
        if (s === 'wip') return '#3b82f6';
        return '#64748b';
    };

    const formatTime = (t) => `${Math.floor(t / 60).toString().padStart(2, '0')}:${Math.floor(t % 60).toString().padStart(2, '0')}`;

    if (!shots || shots.length === 0) {
        return (
            <div className="playlist-empty">
                <p>No shots available for playlist review.</p>
                <Link href={`/project/${projectId}`} className="glass-button">Back to Project</Link>
            </div>
        );
    }

    const effectiveStatus = currentShot ? getEffectiveStatus(currentShot) : { name: '', short: '' };

    const downloadSequence = () => {
        if (!seqShots || seqShots.length === 0) return;
        seqShots.forEach((shot, idx) => {
            if (shot.preview_id) {
                setTimeout(() => {
                    const ext = shot.video_url?.match(/ext=([a-zA-Z0-9]+)/)?.[1] || 'mp4';
                    const a = document.createElement('a');
                    a.href = `/api/download-watermarked?id=${shot.preview_id}&name=${encodeURIComponent(shot.entity_name)}&user=${encodeURIComponent(currentUser)}&ext=${ext}`;
                    a.download = '';
                    a.click();
                }, idx * 500); // Stagger downloads
            }
        });
    };

    return (
        <div className={`playlist-container ${isClientView ? 'client-theater-mode' : ''}`}>
            {/* Top bar */}
            {!isClientView && (
            <header className="playlist-header">
                <div className="playlist-header-left">
                    <Link href={`/project/${projectId}`} className="playlist-back-btn">
                        <X size={20} />
                    </Link>
                    <span className="playlist-project-name">{projectName}</span>

                    {/* Sequence picker */}
                    <div className="seq-picker-wrapper">
                        <button className="seq-picker-btn" onClick={() => setShowSeqPicker(!showSeqPicker)}>
                            <span className="seq-picker-label">{activeSequence.name}</span>
                            <ChevronDown size={14} />
                        </button>
                        {showSeqPicker && (
                            <div className="seq-picker-dropdown">
                                {sequences.map((seq, i) => (
                                    <button
                                        key={seq.name}
                                        className={`seq-option ${i === activeSeqIndex ? 'active' : ''}`}
                                        onClick={() => switchSequence(i)}
                                    >
                                        <span className="seq-option-name">{seq.name}</span>
                                        <span className="seq-option-count">{seq.shots.length} shots</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <span className="playlist-separator">•</span>
                    <span className="playlist-shot-name">{currentShot?.entity_name || 'Shot'}</span>
                    <span className="playlist-status-badge" style={{ borderColor: getStatusColor(effectiveStatus.short), color: getStatusColor(effectiveStatus.short) }}>
                        {effectiveStatus.name}
                    </span>
                </div>
                <div className="playlist-header-right">
                    {/* Annotation toggle — hidden on phone (use floating FAB instead) */}
                    {!isPhone && (
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
                    )}
                    {/* Version compare */}
                    <button
                        className={`pl-version-btn ${showVersions ? 'active' : ''}`}
                        onClick={() => showVersions ? exitVersionCompare() : loadVersions()}
                        disabled={versionsLoading}
                        title="Compare older versions"
                    >
                        {versionsLoading ? <Loader2 size={16} className="spin" /> : <GitCompare size={16} />}
                        <span>Versions</span>
                    </button>
                    <a
                        href={`/api/download-watermarked?id=${currentShot?.preview_id || ''}&name=${encodeURIComponent(currentShot?.entity_name || 'shot')}&user=${encodeURIComponent(currentUser)}&ext=${currentShot?.video_url?.match(/ext=([a-zA-Z0-9]+)/)?.[1] || 'mp4'}`}
                        download
                        className="playlist-download-btn"
                        title="Download Current Shot"
                    >
                        <Download size={16} /> Shot
                    </a>
                    <button
                        onClick={downloadSequence}
                        className="playlist-download-btn seq-dl-btn"
                        title="Download All Shots in Sequence"
                    >
                        <Download size={16} /> Seq
                    </button>
                </div>
            </header>
            )}

            {/* Version bar */}
            {showVersions && versions.length > 0 && (
                <div className="version-bar">
                    <span className="version-bar-label">Versions:</span>
                                {versions.map((v, i) => (
                                    <button
                                        key={v.id}
                                        className={`version-chip ${i === activeVersionIdx ? 'active' : ''} ${v.is_playable ? '' : 'disabled'}`}
                                        onClick={() => switchVersion(i)}
                                        title={v.is_playable ? `Play v${v.revision}` : `v${v.revision} is still processing in Kitsu`}
                                    >
                                        v{v.revision}{!v.is_playable ? ' (Processing)' : ''}
                                    </button>
                                ))}
                    <button className="version-close-btn" onClick={exitVersionCompare}>
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Main content */}
            <div className="playlist-main">
                {/* Video area */}
                <div className="playlist-video-area" ref={videoAreaRef}>
                    {/* Fullscreen top bar */}
                    {isFullscreen && (
                        <div className="fs-top-bar">
                            <span className="fs-shot-name">{currentShot?.entity_name || 'Shot'}</span>
                            <button className="fs-close-btn" onClick={toggleFullscreen} title="Exit Fullscreen (Esc)">
                                <Minimize size={18} />
                            </button>
                        </div>
                    )}
                    <div className="playlist-video-wrapper">
                        {hasVisibleVideo ? (
                            <>
                                <video
                                    ref={videoRef}
                                    src={currentVideoUrl || ''}
                                    className="playlist-video"
                                    onTimeUpdate={handleTimeUpdate}
                                    onLoadedMetadata={handleLoadedMetadata}
                                    onEnded={handleVideoEnded}
                                    onClick={annotationMode ? undefined : togglePlay}
                                    onError={() => {
                                        setIsPlaying(false);
                                        setVideoNotice('This preview is not playable yet. Kitsu is still processing the movie file.');
                                    }}
                                    muted={isMuted}
                                />
                                <div className="playlist-watermark">
                                    <span>{currentUser}</span>
                                </div>
                                {/* Annotation canvas */}
                                {annotationMode && (
                                    <canvas
                                        ref={canvasRef}
                                        className={`annotation-canvas cursor-${activeTool === 'eraser' ? 'cell' : 'crosshair'}`}
                                        onMouseDown={startDraw}
                                        onMouseMove={draw}
                                        onMouseUp={endDraw}
                                        onMouseLeave={endDraw}
                                    />
                                )}
                                {!isPlaying && !annotationMode && (
                                    <div className="playlist-play-overlay" onClick={togglePlay}>
                                        <Play size={48} />
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="no-video-placeholder glass-panel" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                                <EyeOff size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                                <p style={{ fontSize: '1.2rem', fontWeight: 500 }}>
                                    {isShotProcessing ? 'Preview Still Processing' : 'No video preview uploaded'}
                                </p>
                                <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                                    {isShotProcessing
                                        ? 'Kitsu has not finished generating the movie file for this latest version yet.'
                                        : 'This shot does not have a video file.'}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Phone floating annotate / done buttons */}
                    {isPhone && hasVisibleVideo && !annotationMode && (
                        <>
                            <button className="pl-fab-annotate" onClick={handlePhoneAnnotate} title="Annotate in fullscreen">
                                <PenTool size={20} />
                                <span>Annotate</span>
                            </button>
                            <div className="pl-annotation-disclaimer">
                                Tap Annotate to draw in fullscreen, or exit to comment
                            </div>
                        </>
                    )}
                    {isPhone && annotationMode && (
                        <button className="pl-fab-done" onClick={handlePhoneDone} title="Finish and comment">
                            <CheckCircle size={20} />
                            <span>Done</span>
                        </button>
                    )}

                    {videoNotice && (
                        <div className="playlist-video-notice">
                            {videoNotice}
                        </div>
                    )}

                    {/* Annotation toolbar */}
                    {annotationMode && (
                        <div className="annotation-toolbar">
                            <span className="anno-label">Draw:</span>
                            <button className={`anno-btn ${activeTool === 'pen' ? 'active' : ''}`} onClick={() => setActiveTool('pen')} title="Pen">
                                <PenTool size={16} />
                            </button>
                            <button className={`anno-btn ${activeTool === 'eraser' ? 'active' : ''}`} onClick={() => setActiveTool('eraser')} title="Eraser">
                                <Eraser size={16} />
                            </button>
                            <div className="anno-divider" />
                            {['#ef4444', '#f59e0b', '#06b6d4', '#10b981', '#ffffff'].map(color => (
                                <div
                                    key={color}
                                    className={`anno-color ${drawColor === color ? 'ring' : ''}`}
                                    style={{ background: color }}
                                    onClick={() => setDrawColor(color)}
                                />
                            ))}
                            <div className="anno-divider" />
                            <button className="anno-btn" onClick={clearCanvas} title="Clear all">
                                <X size={16} />
                            </button>
                            {isPhone && (
                                <button className="anno-btn anno-done-btn" onClick={handlePhoneDone} title="Finish and comment">
                                    <CheckCircle size={16} />
                                </button>
                            )}
                            {hasAnnotation && (
                                <span className="anno-saved-hint">Current frame will be saved when you move frames or send feedback</span>
                            )}
                        </div>
                    )}

                    {/* Transport controls */}
                    <div className="playlist-controls">
                        <div className="playlist-timeline" onClick={handleTimelineClick}>
                            <div className="playlist-timeline-progress" style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }} />
                            {/* Comment frame dots */}
                            {duration > 0 && commentFrames.map((frame, i) => (
                                <div
                                    key={i}
                                    className="timeline-comment-dot"
                                    style={{ left: `${(frame / (duration * FPS)) * 100}%` }}
                                    title={`Comment at Frame ${frame}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (videoRef.current) {
                                            const t = frame / FPS;
                                            videoRef.current.currentTime = t;
                                            setCurrentTime(t);
                                        }
                                    }}
                                />
                            ))}
                        </div>
                        <div className="playlist-control-bar">
                            <div className="playlist-controls-left">
                                <button className="pl-ctrl-btn" onClick={() => jumpToShot(currentIndex - 1)} disabled={currentIndex === 0} title="Previous Shot">
                                    <SkipBack size={18} />
                                </button>
                                <button className="pl-ctrl-btn" onClick={() => stepFrame(-1)} title="Previous Frame (← key)">
                                    <ChevronLeft size={16} />
                                </button>
                                <button className="pl-ctrl-btn pl-play-btn" onClick={togglePlay}>
                                    {isPlaying ? <Pause size={22} /> : <Play size={22} />}
                                </button>
                                <button className="pl-ctrl-btn" onClick={() => stepFrame(1)} title="Next Frame (→ key)">
                                    <ChevronRight size={16} />
                                </button>
                                <button className="pl-ctrl-btn" onClick={() => jumpToShot(currentIndex + 1)} disabled={currentIndex === seqShots.length - 1} title="Next Shot">
                                    <SkipForward size={18} />
                                </button>
                                <span className="pl-shot-counter">{String(currentIndex + 1).padStart(2, '0')} / {String(seqShots.length).padStart(2, '0')}</span>
                            </div>
                            <div className="playlist-controls-right">
                                <span className="pl-frame-counter">F{currentFrame}</span>
                                <span className="pl-timecode">{formatTime(currentTime)} / {formatTime(duration)}</span>
                                <button className={`pl-ctrl-btn ${isLooping ? 'pl-active' : ''}`} onClick={() => setIsLooping(!isLooping)} title="Per-clip Loop">
                                    <Repeat size={16} />
                                </button>
                                <button className="pl-ctrl-btn" onClick={() => setIsMuted(!isMuted)} title={isMuted ? 'Unmute' : 'Mute'}>
                                    {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                                </button>
                                <button className="pl-ctrl-btn" onClick={toggleFullscreen} title={isFullscreen ? 'Exit Fullscreen (f)' : 'Fullscreen (f)'}>
                                    {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right sidebar */}
                <aside className="playlist-sidebar">
                    <div className="playlist-sidebar-header">
                        <MessageSquare size={16} />
                        <span>SHOT COMMENTS & APPROVAL</span>
                    </div>

                    <div className="playlist-decision">
                        <h4>Decision</h4>
                        {isCurrentApproved ? (
                            <button className="pl-action-btn pl-approved-btn" disabled>
                                <CheckCircle size={18} /> Approved ✓
                            </button>
                        ) : (
                            <button className="pl-action-btn pl-approve-btn" onClick={handleApprove} disabled={isSubmitting}>
                                {isSubmitting ? <Loader2 size={18} className="spin" /> : <CheckCircle size={18} />}
                                Approve
                            </button>
                        )}
                        <p className="pl-decision-hint">
                            {isCurrentApproved 
                                ? 'This shot has been approved.' 
                                : isClientView 
                                    ? 'Requesting changes or approving will automatically update the status.'
                                    : 'Posting feedback will automatically request changes (Retake)'}
                        </p>
                    </div>

                    <div className="playlist-feedback">
                        <h4><MessageSquare size={14} /> Feedback Thread</h4>
                        <div className="pl-comment-input">
                            <div className="pl-comment-input-wrap">
                                <div className="pl-input-meta">
                                    <span className="pl-frame-tag">F{currentFrame}</span>
                                    {hasAnnotation && <span className="pl-annotation-tag">Current annotation ready</span>}
                                    {queuedAnnotations.length > 0 && (
                                        <span className="pl-annotation-tag">{queuedAnnotations.length} queued</span>
                                    )}
                                </div>
                                {queuedAnnotations.length > 0 && (
                                    <div className="pl-annotation-queue">
                                        {queuedAnnotations.map((annotation) => (
                                            <button
                                                key={annotation.frame}
                                                type="button"
                                                className="pl-annotation-chip"
                                                onClick={() => {
                                                    setQueuedAnnotations((prev) => prev.filter((item) => item.frame !== annotation.frame));
                                                }}
                                                title={`Remove queued annotation for frame ${annotation.frame}`}
                                            >
                                                <span>F{annotation.frame}</span>
                                                <X size={12} />
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <textarea
                                    placeholder="Write feedback (auto-sends as Retake)..."
                                    value={newComment}
                                    onChange={e => setNewComment(e.target.value)}
                                    rows={2}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); }
                                    }}
                                />
                            </div>
                            <button className="pl-send-btn" onClick={submitComment} disabled={commentSubmitting}>
                                {commentSubmitting ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                            </button>
                        </div>
                        <div className="pl-comments-list">
                            {comments.map(c => {
                                const frameNumbers = extractFrameNumbers(c.text);
                                const primaryFrame = frameNumbers[0] ?? null;
                                const displayText = stripFrameMarkers(c.text);
                                return (
                                    <div
                                        key={c.id}
                                        className={`pl-comment ${frameNumbers.length > 0 ? 'has-frame' : ''}`}
                                        onClick={() => {
                                            if (primaryFrame !== null && videoRef.current) {
                                                const t = primaryFrame / FPS;
                                                videoRef.current.currentTime = t;
                                                setCurrentTime(t);
                                            }
                                        }}
                                        style={{ cursor: primaryFrame !== null ? 'pointer' : 'default' }}
                                    >
                                        <div className="pl-comment-header">
                                            <span className="pl-comment-user">{c.user}</span>
                                            <div className="pl-comment-meta">
                                                {c.attachmentCount > 0 && <span className="pl-annotation-tag">Annotation</span>}
                                                {frameNumbers.map((frame) => (
                                                    <span key={`${c.id}-${frame}`} className="pl-comment-frame">F{frame}</span>
                                                ))}
                                                <span className="pl-comment-time">{c.time}</span>
                                            </div>
                                        </div>
                                        <p className="pl-comment-text">{displayText}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </aside>
            </div>

            {/* Bottom filmstrip */}
            <div className="playlist-filmstrip" ref={filmstripRef}>
                {seqShots.map((shot, i) => {
                    const status = getEffectiveStatus(shot);
                    const statusColor = getStatusColor(status.short);
                    const isActive = i === currentIndex;
                    const isUnopened = !openedShots.includes(shot.id);

                    return (
                        <button
                            key={shot.id}
                            className={`filmstrip-card ${isActive ? 'active' : ''} ${isUnopened ? 'unopened' : ''}`}
                            onClick={() => jumpToShot(i)}
                            style={{ '--status-color': statusColor }}
                        >
                            <div className="filmstrip-thumb">
                                {shot.thumbnail_url ? (
                                    <Image src={shot.thumbnail_url} alt={shot.entity_name} fill sizes="200px" className="filmstrip-thumb-img" />
                                ) : (
                                    <div className="filmstrip-thumb-placeholder" />
                                )}
                            </div>
                            <div className="filmstrip-info">
                                <span className="filmstrip-seq">{shot.sequence_name} / {shot.entity_name}</span>
                                <div className="filmstrip-meta">
                                    <span className="filmstrip-status" style={{ color: statusColor }}>{status.name}</span>
                                    <span className="filmstrip-version">{shot.version_label}</span>
                                </div>
                            </div>
                            <div className="filmstrip-status-bar" style={{ backgroundColor: statusColor }} />
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
