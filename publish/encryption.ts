import crypto from 'crypto';

type SupportedAlgorithm = 'aes-256-cbc' | 'aes-256-gcm' | 'aes-128-cbc' | 'aes-128-gcm';

function encrypt(data: unknown, key: string, algorithm: SupportedAlgorithm = 'aes-256-cbc'): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, Buffer.from(key, 'hex'), iv);

    const updated = cipher.update(Buffer.from(JSON.stringify(data)));
    const final = cipher.final();
    const encrypted = Buffer.concat([updated, final]);

    const authTag = algorithm.includes('gcm')
        ? ':' + (cipher as any).getAuthTag().toString('hex')
        : '';

    // Format: iv:encrypted[:authTag]
    return `${iv.toString('hex')}:${encrypted.toString('hex')}${authTag}`;
}

function decrypt(data: string, key: string, algorithm: SupportedAlgorithm = 'aes-256-cbc'): unknown {
    const parts = data.split(':');

    if (parts.length < 2) {
        throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key, 'hex'), iv);

    if (algorithm.includes('gcm')) {
        if (!parts[2]) {
            throw new Error('Missing auth tag for GCM algorithm');
        }
        (decipher as any).setAuthTag(Buffer.from(parts[2], 'hex'));
    }

    const updated = decipher.update(encrypted);
    const final = decipher.final();
    const decrypted = Buffer.concat([updated, final]);

    return JSON.parse(decrypted.toString('utf8')) as unknown;
}

function generateKey(length: number = 32): string {
    return crypto.randomBytes(length / 2).toString('hex');
}

export { encrypt, decrypt, generateKey };
export type { SupportedAlgorithm };