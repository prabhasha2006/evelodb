const crypto = require('crypto');

function encrypt(data, algorithm = 'aes-256-cbc', key) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, Buffer.from(key, 'hex'), iv);
    
    let encrypted = cipher.update(JSON.stringify(data));
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const authTag = algorithm.includes('gcm') ? cipher.getAuthTag().toString('hex') : '';

    // Format: iv:encrypted[:authTag]
    return iv.toString('hex') + ':' + encrypted.toString('hex') + (authTag ? ':' + authTag : '');
}

function decrypt(data, algorithm = 'aes-256-cbc', key) {
    const parts = data.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key, 'hex'), iv);

    if (algorithm.includes('gcm')) {
        const authTag = Buffer.from(parts[2], 'hex');
        decipher.setAuthTag(authTag);
    }

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return JSON.parse(decrypted.toString());
}

module.exports = { encrypt, decrypt };
