import { getPin, getPinVersion, validatePin, changePin } from '@/lib/pin-store';

/**
 * GET /api/admin/pin
 * Returns the current PIN version (not the PIN itself).
 * Used by the client to detect PIN changes and force re-auth.
 */
export async function GET() {
    try {
        const version = await getPinVersion();
        return Response.json({ version });
    } catch (error) {
        console.error('PIN version GET error:', error);
        return Response.json({ error: 'Failed to get PIN version' }, { status: 500 });
    }
}

/**
 * POST /api/admin/pin
 * Verifies or changes the PIN.
 * 
 * Body: { action: 'verify', pin: '...' }
 *   — Returns { valid: true/false }
 * 
 * Body: { action: 'change', currentPin: '...', newPin: '...' }
 *   — Changes the PIN and bumps the version. Returns { success: true, version: N }
 */
export async function POST(request) {
    try {
        const body = await request.json();
        const { action } = body;

        if (action === 'verify') {
            const { pin } = body;
            if (!pin) {
                return Response.json({ error: 'Missing pin' }, { status: 400 });
            }
            const valid = await validatePin(pin);
            return Response.json({ valid });
        }

        if (action === 'change') {
            const { currentPin, newPin } = body;

            if (!currentPin || !newPin) {
                return Response.json({ error: 'Missing currentPin or newPin' }, { status: 400 });
            }

            if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
                return Response.json({ error: 'New PIN must be exactly 4 digits' }, { status: 400 });
            }

            const isValid = await validatePin(currentPin);
            if (!isValid) {
                return Response.json({ error: 'Current PIN is incorrect' }, { status: 403 });
            }

            const newVersion = await changePin(newPin);
            return Response.json({ success: true, version: newVersion });
        }

        return Response.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('PIN POST error:', error);
        return Response.json({ error: 'Failed to process PIN request' }, { status: 500 });
    }
}
