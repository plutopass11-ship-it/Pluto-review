'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
    Play, Pause, SkipBack, SkipForward, Repeat, Volume2, VolumeX,
    CheckCircle, MessageSquare, Send, Loader2, X, Download, ChevronDown,
    ChevronLeft, ChevronRight, PenTool, Eraser, GitCompare, EyeOff,
    Maximize, Minimize, Eye
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

/**
 * Natural sort comparator — splits strings into alternating text / number chunks.
 * Handles any shot naming convention: sh_05, Shot_07_A, sht_10, ST_01, etc.
 */
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
        if (!isNaN(na) && !isNaN(nb) && na !== nb) {
            return na - nb;
        }
        const cmp = String(ca).localeCompare(String(cb), undefined, { sensitivity: 'base' });
        if (cmp !== 0) return cmp;
    }
    return 0;
}

export default function PlaylistClient({ shots, projectId, projectName, currentUser, initialComments = [], initialShotId = null, isSharedView = false }) {
    // Group shots by sequence and sort each group naturally by shot name
    const sequences = useMemo(() => {
        const map = {};
        shots.forEach(shot => {
            const seq = shot.sequence_name || 'Uncategorized';
            if (!map[seq]) map[seq] = [];
            map[seq].push(shot);
        });
        return Object.entries(map).map(([name, items]) => ({
            name,
            shots: items.sort((a, b) => naturalSort(a.entity_name || '', b.entity_name || ''))
        }));
    }, [shots]);

    const [activeSeqIndex, setActiveSeqIndex] = useState(0);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isLooping, setIsLooping] = useState(true);
    const [isMuted, setIsMuted] = useState(false);
    const [showSeqPicker, setShowSeqPicker] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isCssFullscreen, setIsCssFullscreen] = useState(false);
    const [isPhone, setIsPhone] = useState(false);
    const [isIos, setIsIos] = useState(false);
    const [hideDone, setHideDone] = useState(true);

    // Per-shot status tracking
    const [shotStatuses, setShotStatuses] = useState({});

    // Comments
    const [comments, setComments] = useState(initialComments);
    const [newComment, setNewComment] = useState('');
    const [commentSubmitting, setCommentSubmitting] = useState(false);
    const [activeReplyCommentId, setActiveReplyCommentId] = useState(null);
    const [replyText, setReplyText] = useState('');
    const [replySubmitting, setReplySubmitting] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [taskStatuses, setTaskStatuses] = useState([]);
    const [clientUser, setClientUser] = useState(null);
    const [readStatus, setReadStatus] = useState({});
    const [readStatusLoaded, setReadStatusLoaded] = useState(false);
    const [approvalInfo, setApprovalInfo] = useState(null);
    const [projectApprovals, setProjectApprovals] = useState(null);
    const [hasPlayedOnce, setHasPlayedOnce] = useState(false);
    const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);
    const [showDownloadMenu, setShowDownloadMenu] = useState(false);
    const [isZipping, setIsZipping] = useState(false);

    // Annotation state
    const [annotationMode, setAnnotationMode] = useState(false);
    const [activeTool, setActiveTool] = useState('pen');
    const [drawColor, setDrawColor] = useState('#ef4444');
    const [hasAnnotation, setHasAnnotation] = useState(false);
    const [queuedAnnotations, setQueuedAnnotations] = useState([]);
    const [selectedShots, setSelectedShots] = useState([]);
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

    // Done-shot visibility helper
    const isShotDone = useCallback((shot) => {
        const s = shotStatuses[shot.id];
        if (s) {
            const short = (s.short || '').toLowerCase();
            return short === 'done' || short === 'approved';
        }
        const short = (shot.task_status_short || '').toLowerCase();
        return short === 'done' || short === 'approved';
    }, [shotStatuses]);

    const handleBatchDownload = async () => {
        const shotsToDownload = visibleSeqShots.filter(s => selectedShots.includes(s.id));
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

    // Filmstrip shows only non-done shots when hideDone is active
    const visibleSeqShots = useMemo(() => {
        if (!hideDone) return seqShots;
        return seqShots.filter((s) => !isShotDone(s));
    }, [seqShots, hideDone, isShotDone]);

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

    // Multi-approve: compute whether to show the "awaiting your approval" banner
    const pendingApprovalBanner = useMemo(() => {
        if (!approvalInfo || approvalInfo.mode !== 'multiple') return null;
        if (isCurrentApproved) return null;
        if (!clientUser?.email) return null;

        const isAssigned = approvalInfo.assignedApprovers?.some(
            a => a.email.toLowerCase() === clientUser.email.toLowerCase()
        );
        if (!isAssigned) return null;

        const alreadyApproved = approvalInfo.approvedBy?.some(
            e => e.toLowerCase() === clientUser.email.toLowerCase()
        );
        if (alreadyApproved) return null;

        // Get names of people who already approved
        const approvedNames = approvalInfo.assignedApprovers
            .filter(a => a.hasApproved)
            .map(a => a.name);

        if (approvedNames.length === 0) return null;

        return { approvedNames };
    }, [approvalInfo, isCurrentApproved, clientUser]);

    // Fetch project-wide approvals
    const refreshProjectApprovals = useCallback(() => {
        fetch(`/api/approvals?projectId=${projectId}`)
            .then(r => r.json())
            .then(data => setProjectApprovals(data))
            .catch(() => {});
    }, [projectId]);

    useEffect(() => {
        refreshProjectApprovals();
    }, [refreshProjectApprovals]);

    // Init
    useEffect(() => {
        fetch('/api/task-statuses').then(r => r.json()).then(data => { if (Array.isArray(data)) setTaskStatuses(data); }).catch(() => { });

        // Load client user from sessionStorage
        try {
            const stored = sessionStorage.getItem('parallax_user');
            if (stored) setClientUser(JSON.parse(stored));
        } catch {}

        // Fetch read status
        fetch('/api/read-status')
            .then(r => {
                if (!r.ok) throw new Error(`read-status returned ${r.status}`);
                return r.json();
            })
            .then(data => {
                // Only set if it's a valid read-status object (not an error response)
                if (data && typeof data === 'object' && !data.error) {
                    setReadStatus(data);
                }
                setReadStatusLoaded(true);
            })
            .catch(() => { setReadStatusLoaded(true); });

        // Global mouseup to stop timeline drag even if cursor leaves the element
        const globalMouseUp = () => setIsDraggingTimeline(false);
        window.addEventListener('mouseup', globalMouseUp);
        return () => window.removeEventListener('mouseup', globalMouseUp);
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

    // Mark shot as read helper
    const markAsRead = (shotId) => {
        if (readStatus[shotId]) return;
        setReadStatus(prev => ({ ...prev, [shotId]: true }));
        fetch('/api/read-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shotId })
        }).then(r => {
            if (!r.ok) {
                // Revert local state if save failed (e.g. no session)
                setReadStatus(prev => {
                    const next = { ...prev };
                    delete next[shotId];
                    return next;
                });
            }
        }).catch(() => {});
    };

    // Mark current shot as opened
    // Load comments + versions on shot change
    useEffect(() => {
        if (!currentShot) return;

        // Mark as read
        markAsRead(currentShot.id);

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

    // Fetch approval info when currentShot changes
    useEffect(() => {
        if (!currentShot) return;
        fetch(`/api/approvals?taskId=${currentShot.id}&projectId=${projectId}`)
            .then(r => r.json())
            .then(data => setApprovalInfo(data))
            .catch(() => {});
    }, [currentShot?.id, projectId]);

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

    // Add mouse wheel horizontal scrolling support to filmstrip
    useEffect(() => {
        const el = filmstripRef.current;
        if (!el) return;

        const handleWheel = (e) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                el.scrollLeft += e.deltaY;
            }
        };

        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => el.removeEventListener('wheel', handleWheel);
    }, []);

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
        } else {
            const nextIdx = getNextVisibleIndex(currentIndex);
            if (nextIdx >= 0) {
                jumpToShot(nextIdx);
            } else {
                setIsPlaying(false);
            }
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
                setHasPlayedOnce(true);
            }).catch(() => {
                setIsPlaying(false);
            });
        } else {
            setIsPlaying(true);
            setHasPlayedOnce(true);
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
    // iPhone doesn't support requestFullscreen on div elements, so we use a CSS fallback
    const supportsNativeFullscreen = typeof document !== 'undefined' &&
        (document.fullscreenEnabled || document.webkitFullscreenEnabled);

    const toggleFullscreen = () => {
        const area = videoAreaRef.current;
        if (!area) return;
        if (isIos || !supportsNativeFullscreen) {
            // CSS pseudo-fullscreen for iPhone
            setIsCssFullscreen(prev => !prev);
        } else {
            if (!document.fullscreenElement) {
                area.requestFullscreen?.().catch(() => {});
            } else {
                document.exitFullscreen?.().catch(() => {});
            }
        }
    };

    // ── Phone annotation flow (fullscreen-only) ──
    const handlePhoneAnnotate = () => {
        const area = videoAreaRef.current;
        if (!area) return;
        if (isIos || !supportsNativeFullscreen) {
            setIsCssFullscreen(true);
        } else if (!document.fullscreenElement) {
            area.requestFullscreen?.().catch(() => {});
        }
        setAnnotationMode(true);
    };

    const handlePhoneDone = () => {
        if (annotationMode) persistCurrentAnnotation();
        setAnnotationMode(false);
        if (isIos || !supportsNativeFullscreen) {
            setIsCssFullscreen(false);
        } else if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
        }
    };

    useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handler);
        document.addEventListener('webkitfullscreenchange', handler);
        return () => {
            document.removeEventListener('fullscreenchange', handler);
            document.removeEventListener('webkitfullscreenchange', handler);
        };
    }, []);

    // Detect phone / small screen + iOS
    useEffect(() => {
        const check = () => setIsPhone(window.innerWidth <= 768);
        check();
        window.addEventListener('resize', check);
        // Detect iOS (iPhone or iPad)
        const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        setIsIos(isIOSDevice);
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
        const nextShot = seqShots[index];
        setCurrentIndex(index);
        setCurrentTime(0);
        setDuration(0);
        setIsPlaying(true);
        setAnnotationMode(false);
        setShowVersions(false);
        setQueuedAnnotations([]);
        setHasPlayedOnce(false);
        clearCanvas();

        // iOS Safari requires play() to be called directly within a user gesture handler.
        // State updates + useEffect lose the gesture context, so we directly manipulate the video here.
        if (isIos && videoRef.current && nextShot?.video_url) {
            videoRef.current.src = nextShot.video_url;
            videoRef.current.load();
            const playPromise = videoRef.current.play();
            if (playPromise !== undefined) {
                playPromise.catch(() => setIsPlaying(false));
            }
            setCurrentVideoUrl(nextShot.video_url);
        }
    };

    // Find next visible shot index (skipping hidden Done shots)
    const getNextVisibleIndex = (fromIndex) => {
        if (!hideDone) return fromIndex + 1;
        for (let i = fromIndex + 1; i < seqShots.length; i++) {
            if (!isShotDone(seqShots[i])) return i;
        }
        return -1;
    };

    // Find previous visible shot index (skipping hidden Done shots)
    const getPrevVisibleIndex = (fromIndex) => {
        if (!hideDone) return fromIndex - 1;
        for (let i = fromIndex - 1; i >= 0; i--) {
            if (!isShotDone(seqShots[i])) return i;
        }
        return -1;
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
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        videoRef.current.currentTime = pct * duration;
        setCurrentTime(pct * duration);
    };

    // ── Timeline drag (mouse + touch) ──
    const seekToClientX = (clientX, target) => {
        if (!videoRef.current || !duration) return;
        const rect = target.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        videoRef.current.currentTime = pct * duration;
        setCurrentTime(pct * duration);
    };

    const handleTimelineMouseDown = (e) => {
        setIsDraggingTimeline(true);
        seekToClientX(e.clientX, e.currentTarget);
    };

    const handleTimelineMouseMove = (e) => {
        if (!isDraggingTimeline) return;
        e.preventDefault();
        seekToClientX(e.clientX, e.currentTarget);
    };

    const handleTimelineMouseUp = () => {
        setIsDraggingTimeline(false);
    };

    const handleTimelineTouchStart = (e) => {
        if (e.touches.length !== 1) return;
        setIsDraggingTimeline(true);
        seekToClientX(e.touches[0].clientX, e.currentTarget);
    };

    const handleTimelineTouchMove = (e) => {
        if (!isDraggingTimeline || e.touches.length !== 1) return;
        e.preventDefault();
        seekToClientX(e.touches[0].clientX, e.currentTarget);
    };

    const handleTimelineTouchEnd = () => {
        setIsDraggingTimeline(false);
    };

    // ── Approve ──
    const handleApprove = async () => {
        if (isCurrentApproved || !currentShot) return;
        setIsSubmitting(true);
        try {
            const doneStatus = taskStatuses.find(s => s.short_name === 'done' || s.name.toLowerCase() === 'done');
            if (!doneStatus) { toast.error('Could not find "Done" status'); setIsSubmitting(false); return; }

            // Check if multi-approver mode
            const isMultiMode = approvalInfo && approvalInfo.mode === 'multiple' && approvalInfo.assignedApprovers?.length > 0;

            if (isMultiMode) {
                // Post approval to multi-approver endpoint
                const approvalRes = await fetch('/api/approvals', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ taskId: currentShot.id, projectId, email: clientUser?.email })
                });
                if (!approvalRes.ok) throw new Error('Failed to submit approval');
                const approvalData = await approvalRes.json();

                const totalRequired = approvalData.totalRequired || 0;
                const approvedCount = approvalData.approvedBy?.length || 0;

                if (approvalData.isFullyApproved) {
                    // All approvers done — update Kitsu status
                    const res = await fetch('/api/comment', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            taskId: currentShot.id, 
                            comment: `Approved this shot - ALL approvals complete! (${approvedCount} of ${totalRequired})`, 
                            taskStatusId: doneStatus.id 
                        })
                    });
                    if (!res.ok) throw new Error('Failed');
                    setShotStatuses(prev => ({ ...prev, [currentShot.id]: { name: 'Done', short: 'done' } }));
                    setComments(prev => [{ 
                        id: Date.now(), 
                        user: clientUser?.name || 'Client (You)', 
                        text: `Approved this shot - ALL approvals complete! (${approvedCount} of ${totalRequired})`, 
                        time: 'Just now', 
                        replies: [] 
                    }, ...prev]);
                    toast.success('All approvers done — shot approved!');
                } else {
                    // Partial approval — post comment to Kitsu without changing status
                    const res = await fetch('/api/comment', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            taskId: currentShot.id, 
                            comment: `Approved this shot (${approvedCount} of ${totalRequired} approvals)`
                        })
                    });
                    if (!res.ok) throw new Error('Failed to post approval comment to Kitsu');
                    
                    // Add it locally to comments list so it renders instantly
                    setComments(prev => [{ 
                        id: Date.now(), 
                        user: clientUser?.name || 'Client (You)', 
                        text: `Approved this shot (${approvedCount} of ${totalRequired} approvals)`, 
                        time: 'Just now', 
                        replies: [] 
                    }, ...prev]);

                    toast.success('Your approval recorded and posted to Kitsu');
                }

                // Refresh approval info
                fetch(`/api/approvals?taskId=${currentShot.id}&projectId=${projectId}`)
                    .then(r => r.json())
                    .then(data => setApprovalInfo(data))
                    .catch(() => {});
                
                // Refresh project-wide approvals
                refreshProjectApprovals();
            } else {
                // Single approver flow
                const res = await fetch('/api/comment', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ taskId: currentShot.id, comment: 'Approved by client', taskStatusId: doneStatus.id })
                });
                if (!res.ok) throw new Error('Failed');
                setShotStatuses(prev => ({ ...prev, [currentShot.id]: { name: 'Done', short: 'done' } }));
                setComments(prev => [{ id: Date.now(), user: clientUser?.name || 'Client (You)', text: 'Approved by client', time: 'Just now', replies: [] }, ...prev]);
                toast.success('Shot approved');
            }
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
                user: clientUser?.name || 'Client (You)',
                text: fullComment,
                time: 'Just now',
                attachmentCount: uploadedAttachmentCount,
                replies: []
            }, ...prev]);
            setCommentFrames(prev => [...prev, ...commentFramesForSubmission]);
            setNewComment('');
            toast.success('Feedback submitted');

        } catch (err) { toast.error('Failed to post comment: ' + err.message); }
        setCommentSubmitting(false);
    };

    // ── Submit comment reply to Kitsu ──
    const submitReply = async (commentId) => {
        if (!replyText.trim() || replySubmitting || !currentShot) return;
        setReplySubmitting(true);
        try {
            const res = await fetch('/api/comment/reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskId: currentShot.id,
                    commentId,
                    text: replyText
                })
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Failed to post reply');
            }
            const replyData = await res.json();

            setComments(prev => prev.map(c => {
                if (c.id === commentId) {
                    const existingReplies = c.replies || [];
                    return {
                        ...c,
                        replies: [...existingReplies, {
                            id: replyData.id || Date.now(),
                            user: 'Client (You)',
                            text: replyText,
                            time: 'Just now'
                        }]
                    };
                }
                return c;
            }));

            setReplyText('');
            setActiveReplyCommentId(null);
            toast.success('Reply submitted');
        } catch (err) {
            toast.error('Failed to post reply: ' + err.message);
        } finally {
            setReplySubmitting(false);
        }
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

    const downloadSingleShot = (shot) => {
        if (!shot.preview_id) return;
        const ext = shot.video_url?.match(/ext=([a-zA-Z0-9]+)/)?.[1] || 'mp4';
        const a = document.createElement('a');
        const downloadName = `${activeSequence.name || 'seq'}-${shot.entity_name}`;
        a.href = `/api/download-watermarked?id=${shot.preview_id}&name=${encodeURIComponent(downloadName)}&user=${encodeURIComponent(currentUser)}&ext=${ext}&projectId=${encodeURIComponent(projectId)}&projectName=${encodeURIComponent(projectName)}&sequenceName=${encodeURIComponent(activeSequence.name || '')}&type=shot`;
        a.download = '';
        a.click();
    };

    const downloadSequenceZip = async (shotsToZip) => {
        if (!shotsToZip || shotsToZip.length === 0) return;
        setIsZipping(true);
        setShowDownloadMenu(false);
        
        try {
            const res = await fetch('/api/download-sequence-zip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    projectName,
                    sequenceName: activeSequence.name || 'seq',
                    shots: shotsToZip,
                    type: shotsToZip.length === seqShots.length ? 'sequence' : shotsToZip.every(s => isShotDone(s)) ? 'approved' : 'unapproved',
                }),
            });
            
            if (!res.ok) {
                const err = await res.json();
                toast.error(err.error || 'Failed to create ZIP');
                setIsZipping(false);
                return;
            }
            
            const data = await res.json();
            
            // Trigger the download
            window.location.href = data.downloadUrl;
            toast.success(`Downloading ${data.shotCount} shots as ZIP`);
        } catch (err) {
            toast.error('Failed to create ZIP');
        } finally {
            setIsZipping(false);
        }
    };

    const downloadSequence = () => downloadSequenceZip(seqShots);

    const downloadApprovedShots = () => {
        const approved = seqShots.filter(s => isShotDone(s));
        if (approved.length === 0) {
            toast('No approved shots in this sequence');
            return;
        }
        downloadSequenceZip(approved);
    };

    const downloadUnapprovedShots = () => {
        const unapproved = seqShots.filter(s => !isShotDone(s));
        if (unapproved.length === 0) {
            toast('No unapproved shots in this sequence');
            return;
        }
        downloadSequenceZip(unapproved);
    };

    return (
        <div className="playlist-container">
            {/* Top bar */}
            <header className="playlist-header">
                <div className="playlist-header-left">
                    {!isSharedView && (
                        <Link href={`/project/${projectId}`} className="playlist-back-btn">
                            <X size={20} />
                        </Link>
                    )}
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
                {clientUser && (
                    <span className="pl-greeting animate-fade-in">Hello, {clientUser.name}! 👋</span>
                )}
                <div className="playlist-header-right">
                    {/* Hide / Show Done toggle */}
                    <button
                        className={`pl-hide-done-btn ${hideDone ? 'active' : ''}`}
                        onClick={() => setHideDone((v) => !v)}
                        title={hideDone ? 'Show done shots' : 'Hide done shots'}
                    >
                        {hideDone ? <EyeOff size={14} /> : <Eye size={14} />}
                        <span className="pl-hide-done-label">{hideDone ? 'Hide Done' : 'Show Done'}</span>
                    </button>
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
                        href={`/api/download-watermarked?id=${currentShot?.preview_id || ''}&name=${encodeURIComponent(`${activeSequence.name || 'seq'}-${currentShot?.entity_name || 'shot'}`)}&user=${encodeURIComponent(currentUser)}&ext=${currentShot?.video_url?.match(/ext=([a-zA-Z0-9]+)/)?.[1] || 'mp4'}&projectId=${encodeURIComponent(projectId)}&projectName=${encodeURIComponent(projectName)}&sequenceName=${encodeURIComponent(activeSequence.name || '')}&type=shot`}
                        download
                        className={`playlist-download-btn ${isZipping ? 'disabled' : ''}`}
                        title="Download Current Shot"
                        onClick={(e) => isZipping && e.preventDefault()}
                    >
                        <Download size={16} /> Shot
                    </a>
                    <div className="playlist-download-dropdown-wrapper">
                        <button
                            onClick={() => !isZipping && setShowDownloadMenu(!showDownloadMenu)}
                            className={`playlist-download-btn seq-dl-btn ${isZipping ? 'disabled' : ''}`}
                            title={isZipping ? 'Zipping in progress...' : 'Download options'}
                            disabled={isZipping}
                        >
                            {isZipping ? <Loader2 size={14} className="spin" /> : <Download size={16} />}
                            <ChevronDown size={12} />
                        </button>
                        {showDownloadMenu && (
                            <div className="playlist-download-dropdown">
                                <button onClick={downloadSequence} className="dl-dropdown-item">
                                    <Download size={14} /> Download whole Sequence
                                </button>
                                <button onClick={downloadApprovedShots} className="dl-dropdown-item">
                                    <CheckCircle size={14} /> Download Approved
                                </button>
                                <button onClick={downloadUnapprovedShots} className="dl-dropdown-item">
                                    <X size={14} /> Download Unapproved
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Zipping disclaimer */}
            {isZipping && (
                <div className="zipping-banner">
                    <Loader2 size={14} className="spin" />
                    <span>Zipping sequence, please wait...</span>
                </div>
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
                <div className={`playlist-video-area ${isCssFullscreen ? 'css-fullscreen' : ''}`} ref={videoAreaRef}>
                    {/* Fullscreen top bar */}
                    {(isFullscreen || isCssFullscreen) && (
                        <div className="fs-top-bar">
                            <span className="fs-shot-name">{currentShot?.entity_name || 'Shot'}</span>
                            <button className="fs-close-btn" onClick={toggleFullscreen} title="Exit Fullscreen (Esc)">
                                <Minimize size={18} />
                            </button>
                        </div>
                    )}

                    {/* Multi-approve floating notification popup */}
                    {pendingApprovalBanner && (
                        <div className="multi-approve-floating-banner">
                            <CheckCircle size={16} className="status-icon" />
                            <span className="banner-text">
                                <strong>{pendingApprovalBanner.approvedNames.join(', ')}</strong>
                                {' '}approved this shot. Please confirm your approval.
                            </span>
                            <button
                                className="banner-approve-btn"
                                onClick={handleApprove}
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? <Loader2 size={14} className="spin" /> : <CheckCircle size={14} />}
                                Confirm Approval
                            </button>
                        </div>
                    )}
                    <div className="playlist-video-wrapper">
                        {/* Mobile floating status badge */}
                        <span
                            className="pl-video-status-badge"
                            style={{ borderColor: getStatusColor(effectiveStatus.short), color: getStatusColor(effectiveStatus.short) }}
                        >
                            {effectiveStatus.name}
                        </span>
                        {hasVisibleVideo ? (
                            <>
                                <video
                                    ref={videoRef}
                                    src={currentVideoUrl || ''}
                                    className="playlist-video"
                                    preload="auto"
                                    playsInline
                                    webkit-playsinline="true"
                                    x5-playsinline="true"
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
                                    <span>Preview for {currentUser}</span>
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
                                {!hasPlayedOnce && !isPlaying && !annotationMode && (
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
                        <button className="pl-fab-annotate" onClick={handlePhoneAnnotate} title="Annotate in fullscreen">
                            <PenTool size={20} />
                            <span>Annotate</span>
                        </button>
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
                        <div
                            className="playlist-timeline"
                            onClick={handleTimelineClick}
                            onMouseDown={handleTimelineMouseDown}
                            onMouseMove={handleTimelineMouseMove}
                            onMouseUp={handleTimelineMouseUp}
                            onMouseLeave={handleTimelineMouseUp}
                            onTouchStart={handleTimelineTouchStart}
                            onTouchMove={handleTimelineTouchMove}
                            onTouchEnd={handleTimelineTouchEnd}
                        >
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
                                <button className="pl-ctrl-btn" onClick={() => { const idx = getPrevVisibleIndex(currentIndex); if (idx >= 0) jumpToShot(idx); }} disabled={getPrevVisibleIndex(currentIndex) < 0} title="Previous Shot">
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
                                <button className="pl-ctrl-btn" onClick={() => { const idx = getNextVisibleIndex(currentIndex); if (idx >= 0) jumpToShot(idx); }} disabled={getNextVisibleIndex(currentIndex) < 0} title="Next Shot">
                                    <SkipForward size={18} />
                                </button>
                                <span className="pl-shot-counter">
                                    {hideDone
                                        ? `${String(visibleSeqShots.findIndex(s => s.id === currentShot?.id) + 1).padStart(2, '0')} / ${String(visibleSeqShots.length).padStart(2, '0')}`
                                        : `${String(currentIndex + 1).padStart(2, '0')} / ${String(seqShots.length).padStart(2, '0')}`
                                    }
                                </span>
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
                        {/* Multi-approver status */}
                        {approvalInfo && approvalInfo.mode === 'multiple' && approvalInfo.assignedApprovers?.length > 0 ? (
                            <div className="pl-multi-approve">
                                {isCurrentApproved ? (
                                    <button className="pl-action-btn pl-approved-btn" disabled>
                                        <CheckCircle size={18} /> Approved ✓
                                    </button>
                                ) : approvalInfo.approvedBy?.some(e => e.toLowerCase() === clientUser?.email?.toLowerCase()) ? (
                                    <button className="pl-action-btn pl-approved-btn" disabled>
                                        <CheckCircle size={18} /> Approved by You
                                    </button>
                                ) : (
                                    <button className="pl-action-btn pl-approve-btn" onClick={handleApprove} disabled={isSubmitting}>
                                        {isSubmitting ? <Loader2 size={18} className="spin" /> : <CheckCircle size={18} />}
                                        Approve
                                    </button>
                                )}
                                <div className="pl-approval-checklist">
                                    <span className="pl-approval-count">
                                        {approvalInfo.approvedBy?.length || 0} of {approvalInfo.assignedApprovers?.length || 0} approved
                                    </span>
                                    {approvalInfo.assignedApprovers.map(a => (
                                        <div key={a.email} className={`pl-approver-row ${a.hasApproved ? 'approved' : ''}`}>
                                            <span className="pl-approver-check">{a.hasApproved ? '✓' : '○'}</span>
                                            <span className="pl-approver-name">{a.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            // Existing single-approver logic
                            isCurrentApproved ? (
                                <button className="pl-action-btn pl-approved-btn" disabled>
                                    <CheckCircle size={18} /> Approved ✓
                                </button>
                            ) : (
                                <button className="pl-action-btn pl-approve-btn" onClick={handleApprove} disabled={isSubmitting}>
                                    {isSubmitting ? <Loader2 size={18} className="spin" /> : <CheckCircle size={18} />}
                                    Approve
                                </button>
                            )
                        )}
                        <p className="pl-decision-hint">
                            {isCurrentApproved 
                                ? 'This shot has been approved.' 
                                : approvalInfo?.mode === 'multiple'
                                    ? `Requires approval from all ${approvalInfo.assignedApprovers?.length || 0} assigned reviewers.`
                                    : isSharedView 
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
                                        
                                        {/* Action buttons (Reply) */}
                                        <div className="pl-comment-actions">
                                            <button 
                                                className={`pl-reply-trigger-btn ${activeReplyCommentId === c.id ? 'active' : ''}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveReplyCommentId(activeReplyCommentId === c.id ? null : c.id);
                                                    setReplyText('');
                                                }}
                                            >
                                                <MessageSquare size={12} />
                                                <span>Reply</span>
                                            </button>
                                        </div>

                                        {/* Replies list */}
                                        {c.replies && c.replies.length > 0 && (
                                            <div className="pl-replies-list" onClick={(e) => e.stopPropagation()}>
                                                <div className="pl-thread-connector" />
                                                {c.replies.map(r => (
                                                    <div key={r.id} className="pl-reply-item">
                                                        <div className="pl-reply-header">
                                                            <span className="pl-reply-user">{r.user}</span>
                                                            <span className="pl-reply-time">{r.time}</span>
                                                        </div>
                                                        <p className="pl-reply-text">{r.text}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Inline reply form */}
                                        {activeReplyCommentId === c.id && (
                                            <div className="pl-nested-reply-form" onClick={(e) => e.stopPropagation()}>
                                                <textarea
                                                    placeholder="Write a reply or remark..."
                                                    value={replyText}
                                                    onChange={(e) => setReplyText(e.target.value)}
                                                    rows={2}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' && !e.shiftKey) {
                                                            e.preventDefault();
                                                            submitReply(c.id);
                                                        }
                                                    }}
                                                />
                                                <div className="pl-nested-reply-buttons">
                                                    <button 
                                                        className="pl-nested-cancel-btn" 
                                                        onClick={() => {
                                                            setActiveReplyCommentId(null);
                                                            setReplyText('');
                                                        }}
                                                        disabled={replySubmitting}
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button 
                                                        className="pl-nested-submit-btn" 
                                                        onClick={() => submitReply(c.id)}
                                                        disabled={replySubmitting || !replyText.trim()}
                                                    >
                                                        {replySubmitting ? <Loader2 size={12} className="spin" /> : 'Send'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </aside>
            </div>

            {/* Bottom filmstrip */}
            <div className="playlist-filmstrip" ref={filmstripRef}>
                {visibleSeqShots.map((shot) => {
                    const status = getEffectiveStatus(shot);
                    const statusColor = getStatusColor(status.short);
                    const isActive = shot.id === currentShot?.id;
                    const realIndex = seqShots.findIndex((s) => s.id === shot.id);

                    // Check if shot is awaiting the current user's approval in multi-approve mode
                    const isAwaitingCurrentUserConfirm = (() => {
                        if (!projectApprovals || projectApprovals.mode !== 'multiple') return false;
                        
                        // If it's already marked approved or done on Kitsu, no confirm needed
                        const shortStatus = (status.short || '').toLowerCase();
                        if (shortStatus === 'done' || shortStatus === 'approved') return false;
                        
                        if (!clientUser?.email) return false;
                        
                        // Check if current user is an assigned approver
                        const isAssigned = projectApprovals.assignedApprovers?.some(
                            email => email.toLowerCase() === clientUser.email.toLowerCase()
                        );
                        if (!isAssigned) return false;
                        
                        // Check what approvals are recorded for this specific shot
                        const shotApprovals = projectApprovals.approvals?.[shot.id] || [];
                        
                        // Has current user already approved this shot?
                        const alreadyApproved = shotApprovals.some(
                            email => email.toLowerCase() === clientUser.email.toLowerCase()
                        );
                        if (alreadyApproved) return false;
                        
                        // Have other people approved this shot?
                        const otherPeopleApproved = shotApprovals.length > 0;
                        return otherPeopleApproved;
                    })();

                    return (
                        <button
                            key={shot.id}
                            className={`filmstrip-card ${isActive ? 'active' : ''} ${isAwaitingCurrentUserConfirm ? 'awaiting-confirm' : ''} ${selectedShots.includes(shot.id) ? 'selected-for-download' : ''}`}
                            onClick={(e) => {
                                if (e.ctrlKey || e.metaKey) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setSelectedShots(prev => prev.includes(shot.id) ? prev.filter(id => id !== shot.id) : [...prev, shot.id]);
                                } else {
                                    jumpToShot(realIndex);
                                }
                            }}
                            style={{ '--status-color': statusColor }}
                        >
                            <div className="filmstrip-thumb">
                                {selectedShots.includes(shot.id) && (
                                    <div className="selected-checkmark-overlay">
                                        <CheckCircle size={12} />
                                    </div>
                                )}
                                {isAwaitingCurrentUserConfirm ? (
                                    <span className="pl-confirm-badge">AWAITING CONFIRM</span>
                                ) : (
                                    readStatusLoaded && !readStatus[shot.id] && <span className="pl-new-badge">NEW</span>
                                )}
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
            {selectedShots.length > 0 && (
                <div className="batch-download-bar glass-panel animate-slide-up" style={{ bottom: '120px' }}>
                    <span className="selected-count">{selectedShots.length} shot{selectedShots.length !== 1 ? 's' : ''} selected</span>
                    <div className="batch-actions">
                        <button className="glass-button" onClick={() => setSelectedShots([])}>Cancel</button>
                        <button className="glass-button" style={{ color: '#10b981', borderColor: '#10b98155' }} onClick={handleBatchDownload}>
                            <Download size={16} /> Download
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
