import { NextResponse } from 'next/server';
import { createReadStream, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TMP_DIR = join(tmpdir(), 'parallax-zips');

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const token = searchParams.get('token');
        const name = searchParams.get('name') || 'download.zip';
        
        if (!token) {
            return NextResponse.json({ error: 'Missing token' }, { status: 400 });
        }

        // Validate token format (UUID only to prevent path traversal)
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
        }

        const filePath = join(TMP_DIR, `${token}.zip`);
        
        try {
            const stats = statSync(filePath);
            
            if (!stats.isFile()) {
                return NextResponse.json({ error: 'File not found' }, { status: 404 });
            }

            // Stream the file
            const stream = createReadStream(filePath);
            
            return new Response(stream, {
                headers: {
                    'Content-Type': 'application/zip',
                    'Content-Disposition': `attachment; filename="${name}"`,
                    'Content-Length': String(stats.size),
                    'Cache-Control': 'no-cache',
                },
            });
        } catch {
            return NextResponse.json({ error: 'File not found or expired' }, { status: 404 });
        }
        
    } catch (error) {
        console.error('Download error:', error);
        return NextResponse.json({ error: 'Download failed' }, { status: 500 });
    }
}
