import { promises as fs } from 'fs';
import { join } from 'path';

const PIN_FILE = join(process.cwd(), 'data', 'admin-pin.json');

const DEFAULT_PIN_DATA = {
    pin: '9801',
    version: 1,
};

async function readPinData() {
    try {
        const data = await fs.readFile(PIN_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // Create default file
            await savePinData(DEFAULT_PIN_DATA);
            return { ...DEFAULT_PIN_DATA };
        }
        throw error;
    }
}

async function savePinData(data) {
    await fs.mkdir(join(process.cwd(), 'data'), { recursive: true });
    await fs.writeFile(PIN_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Get the current admin PIN.
 */
export async function getPin() {
    const data = await readPinData();
    return data.pin;
}

/**
 * Get the current PIN version (used for auto-logout detection).
 */
export async function getPinVersion() {
    const data = await readPinData();
    return data.version;
}

/**
 * Validate a PIN against the stored one.
 */
export async function validatePin(pin) {
    const currentPin = await getPin();
    return pin === currentPin;
}

/**
 * Validate the PIN from a request's x-admin-pin header.
 */
export async function validatePinHeader(request) {
    const pin = request.headers.get('x-admin-pin');
    if (!pin) return false;
    return await validatePin(pin);
}

/**
 * Change the PIN and bump the version (triggers auto-logout for all admins).
 */
export async function changePin(newPin) {
    const data = await readPinData();
    data.pin = newPin;
    data.version = (data.version || 1) + 1;
    await savePinData(data);
    return data.version;
}
