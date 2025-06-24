const { encrypt, decrypt } = require('./encryption');

const k = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // 64-char hex string
const n = 'aes-256-gcm'
console.log(k.length);
const a = encrypt(
    'hello world',
    n,
    k
)

console.log(a);
const b = decrypt(
    a,
    n,
    k
)
console.log(b);