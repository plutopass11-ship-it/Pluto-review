import { NextResponse } from 'next/server';
import { getKitsuToken, getKitsuApiUrl } from '@/lib/kitsu';
import { logDownload } from '@/lib/download-logger';
import archiver from 'archiver';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

const TMP_DIR = join(tmpdir(), 'parallax-zips');

// Ensure temp directory exists
async function ensureTmpDir() {
    try {
        await fs.mkdir(TMP_DIR, { recursive: true });
    } catch { /* ignore */ }
}

// Cleanup old files on startup
async function cleanupOldFiles() {
    try {
        const files = await fs.readdir(TMP_DIR);
        const now = Date.now();
        const ONE_HOUR = 60 * 60 * 1000;
        
        for (const file of files) {
            const filePath = join(TMP_DIR, file);
            try {
                const stats = await fs.stat(filePath);
                if (now - stats.mtime.getTime() > ONE_HOUR) {
                    await fs.unlink(filePath);
                }
            } catch { /* ignore individual file errors */ }
        }
    } catch { /* ignore if directory doesn't exist */ }
}

// Run cleanup on module load
ensureTmpDir().then(() => cleanupOldFiles());

export async function POST(request) {
    try {
        const body = await request.json();
        const { projectId, projectName, sequenceName, shots, type, username } = body;
        
        if (!projectId || !shots || !Array.isArray(shots)) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Filter shots that have preview_id
        const downloadableShots = shots.filter(s => s.preview_id && s.video_url);
        
        if (downloadableShots.length === 0) {
            const errorMsg = type === 'batch' 
                ? 'None of the selected shots have downloadable previews'
                : 'No downloadable shots in this sequence';
            return NextResponse.json({ error: errorMsg }, { status: 400 });
        }

        await ensureTmpDir();
        
        const token = randomUUID();
        const dateStr = new Date().toISOString().slice(0, 10);
        
        let zipName;
        if (type === 'batch') {
            const cleanProjectName = (projectName || 'project').replace(/[^a-zA-Z0-9-_]/g, '_') || 'project';
            zipName = `${cleanProjectName}-${dateStr}.zip`;
        } else {
            const cleanSeqName = (sequenceName || 'seq').replace(/[^a-zA-Z0-9-_]/g, '_') || 'seq';
            zipName = `${cleanSeqName}-${dateStr}.zip`;
        }
        
        const filePath = join(TMP_DIR, `${token}.zip`);
        
        // Create ZIP file
        const output = require('fs').createWriteStream(filePath);
        const archive = archiver('zip', { zlib: { level: 6 } });
        
        await new Promise((resolve, reject) => {
            output.on('close', resolve);
            archive.on('error', reject);
            archive.on('warning', (err) => {
                if (err.code !== 'ENOENT') reject(err);
            });
            
            archive.pipe(output);
            
            // We'll fetch and append each video
            const fetchPromises = downloadableShots.map(async (shot) => {
                try {
                    const kitsuToken = await getKitsuToken();
                    const ext = shot.video_url?.match(/ext=([a-zA-Z0-9]+)/)?.[1] || 'mp4';
                    const videoUrl = `${getKitsuApiUrl()}/movies/originals/preview-files/${shot.preview_id}.${ext}`;
                    
                    const res = await fetch(videoUrl, {
                        headers: { Authorization: `Bearer ${kitsuToken}` },
                    });
                    
                    if (!res.ok) {
                        console.error(`Failed to fetch video for shot ${shot.entity_name}: ${res.status}`);
                        return;
                    }
                    
                    // Get the video buffer
                    const buffer = Buffer.from(await res.arrayBuffer());
                    const seq = shot.sequence_name || sequenceName || 'seq';
                    const cleanSeq = seq.replace(/[^a-zA-Z0-9-_]/g, '_') || 'seq';
                    const cleanShotName = (shot.entity_name || 'shot').replace(/[^a-zA-Z0-9-_]/g, '_') || 'shot';
                    const fileName = `${cleanSeq}-${cleanShotName}.${ext}`;
                    
                    archive.append(buffer, { name: fileName });
                } catch (err) {
                    console.error(`Error fetching shot ${shot.entity_name}:`, err);
                }
            });
            
            Promise.all(fetchPromises).then(() => {
                archive.finalize();
            }).catch(reject);
        });

        // Schedule deletion after 1 hour
        setTimeout(async () => {
            try {
                await fs.unlink(filePath);
            } catch { /* ignore if already deleted */ }
        }, 60 * 60 * 1000);

        // Log the download request
        const headers = Object.fromEntries(request.headers.entries());
        logDownload({
            ip: headers['x-forwarded-for']?.split(',')[0] || headers['x-real-ip'] || 'unknown',
            userAgent: headers['user-agent'],
            projectId,
            projectName: projectName || 'Unknown Project',
            sequenceName,
            shotName: null,
            type: type || 'sequence',
            fileName: zipName,
            username: username,
        }).catch(() => {});

        return NextResponse.json({ 
            downloadUrl: `/api/download-file?token=${token}&name=${encodeURIComponent(zipName)}`,
            shotCount: downloadableShots.length 
        });
        
    } catch (error) {
        console.error('ZIP creation error:', error);
        return NextResponse.json({ error: error.message || 'Failed to create ZIP' }, { status: 500 });
    }
}
