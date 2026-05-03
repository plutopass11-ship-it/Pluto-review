import { promises as fs } from 'fs';
import { join } from 'path';

const LOG_DIR = join(process.cwd(), 'data');
const LOG_FILE = join(LOG_DIR, 'download-logs.json');
const MAX_ENTRIES = 500;

async function ensureDir() {
    try {
        await fs.mkdir(LOG_DIR, { recursive: true });
    } catch { /* ignore */ }
}

function parseDevice(userAgent) {
    if (!userAgent) return 'Unknown';
    
    const ua = userAgent.toLowerCase();
    
    // Mobile detection
    if (ua.includes('iphone')) return 'iPhone';
    if (ua.includes('ipad')) return 'iPad';
    if (ua.includes('android')) {
        if (ua.includes('mobile')) return 'Android Phone';
        return 'Android Tablet';
    }
    
    // Desktop OS
    if (ua.includes('windows')) return 'Windows PC';
    if (ua.includes('macintosh') || ua.includes('mac os')) return 'Mac';
    if (ua.includes('linux')) return 'Linux';
    
    return 'Unknown Device';
}

function parseBrowser(userAgent) {
    if (!userAgent) return 'Unknown';
    
    const ua = userAgent.toLowerCase();
    if (ua.includes('chrome') && !ua.includes('edg')) return 'Chrome';
    if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
    if (ua.includes('firefox')) return 'Firefox';
    if (ua.includes('edg')) return 'Edge';
    
    return 'Unknown Browser';
}

async function fetchLocation(ip) {
    // Skip private/local IPs
    if (!ip || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
        return null;
    }
    
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        
        const res = await fetch(`http://ip-api.com/json/${ip}?fields=city,country,regionName`, {
            signal: controller.signal,
        });
        
        clearTimeout(timeout);
        
        if (!res.ok) return null;
        const data = await res.json();
        
        if (data.status === 'success') {
            return {
                city: data.city || null,
                country: data.country || null,
                region: data.regionName || null,
            };
        }
        return null;
    } catch {
        return null;
    }
}

export async function logDownload({
    ip,
    userAgent,
    projectId,
    projectName,
    sequenceName,
    shotName,
    type,
    fileName,
}) {
    try {
        await ensureDir();
        
        const entry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: new Date().toISOString(),
            ip: ip || 'unknown',
            userAgent: userAgent || 'unknown',
            device: parseDevice(userAgent),
            browser: parseBrowser(userAgent),
            projectId: projectId || 'unknown',
            projectName: projectName || 'Unknown Project',
            sequenceName: sequenceName || null,
            shotName: shotName || null,
            type: type || 'unknown',
            fileName: fileName || null,
            location: null, // Will be updated asynchronously
        };
        
        // Try to get location (fire and forget, don't block)
        fetchLocation(ip).then((loc) => {
            if (loc) {
                entry.location = loc;
                // Re-save with location
                appendLogEntry(entry);
            }
        }).catch(() => { /* ignore */ });
        
        // Save immediately without location
        await appendLogEntry(entry);
        
        return entry;
    } catch (err) {
        console.error('Failed to log download:', err);
        return null;
    }
}

async function appendLogEntry(entry) {
    try {
        let logs = [];
        try {
            const data = await fs.readFile(LOG_FILE, 'utf-8');
            logs = JSON.parse(data);
            if (!Array.isArray(logs)) logs = [];
        } catch {
            // File doesn't exist yet
        }
        
        // Check if entry already exists (by id) - for location update
        const existingIdx = logs.findIndex(l => l.id === entry.id);
        if (existingIdx >= 0) {
            logs[existingIdx] = entry;
        } else {
            logs.unshift(entry); // Newest first
        }
        
        // Trim to max entries
        if (logs.length > MAX_ENTRIES) {
            logs = logs.slice(0, MAX_ENTRIES);
        }
        
        await fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2));
    } catch (err) {
        console.error('Failed to write log file:', err);
    }
}

export async function getDownloadLogs(projectId = null, limit = 100) {
    try {
        const data = await fs.readFile(LOG_FILE, 'utf-8');
        let logs = JSON.parse(data);
        if (!Array.isArray(logs)) logs = [];
        
        if (projectId && projectId !== 'all') {
            logs = logs.filter(l => l.projectId === projectId);
        }
        
        return logs.slice(0, limit);
    } catch {
        return [];
    }
}

export async function getLogProjects() {
    try {
        const data = await fs.readFile(LOG_FILE, 'utf-8');
        const logs = JSON.parse(data);
        if (!Array.isArray(logs)) return [];
        
        const projects = new Map();
        logs.forEach(l => {
            if (l.projectId && l.projectName) {
                projects.set(l.projectId, l.projectName);
            }
        });
        
        return Array.from(projects.entries()).map(([id, name]) => ({ id, name }));
    } catch {
        return [];
    }
}
