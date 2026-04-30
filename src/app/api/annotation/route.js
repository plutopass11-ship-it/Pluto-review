import { getKitsuToken, getKitsuApiUrl } from '@/lib/kitsu';

/**
 * POST /api/annotation
 * Body: { taskId, commentId, imageData } or { taskId, commentId, annotations: [{ frame, imageData }] }
 *
 * Uploads one or more annotation images (base64 PNG) as comment attachments.
 */
export async function POST(request) {
    try {
        const body = await request.json();
        const { taskId, commentId, imageData, annotations } = body;

        const uploads = Array.isArray(annotations) && annotations.length > 0
            ? annotations.filter((annotation) => annotation?.imageData)
            : imageData
                ? [{ frame: body.frame ?? null, imageData }]
                : [];

        if (!taskId || !commentId || uploads.length === 0) {
            return new Response(JSON.stringify({ error: 'Missing taskId, commentId, or annotation payload' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const token = await getKitsuToken();
        const uploadedAttachments = [];

        for (let index = 0; index < uploads.length; index += 1) {
            const annotation = uploads[index];
            const base64Data = annotation.imageData.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            const formData = new FormData();
            const blob = new Blob([buffer], { type: 'image/png' });
            const frameSuffix = Number.isFinite(annotation.frame) ? `-f${annotation.frame}` : '';
            formData.append('file', blob, `annotation-${commentId}${frameSuffix}-${index + 1}.png`);

            const uploadRes = await fetch(
                `${getKitsuApiUrl()}/actions/tasks/${taskId}/comments/${commentId}/add-attachment`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json'
                    },
                    body: formData
                }
            );

            if (!uploadRes.ok) {
                const err = await uploadRes.text();
                return new Response(JSON.stringify({
                    error: 'Failed to upload annotation',
                    detail: err,
                    uploadedCount: uploadedAttachments.length
                }), {
                    status: uploadRes.status,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            uploadedAttachments.push(await uploadRes.json());
        }

        return new Response(JSON.stringify({
            success: true,
            attachmentCount: uploadedAttachments.length,
            attachments: uploadedAttachments
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Annotation upload error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
