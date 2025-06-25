
const eveloDB = require('./evelodb.js');
let db
try {
    db = new eveloDB({
        noRepeat: true,
        auroPrimaryKey: true,
        extension: 'json',
    })
} catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
}

console.log(db.generateKey(64));

/* try {
    const res = db.changeConfig({
        from: {
            noRepeat: true,
            auroPrimaryKey: true,
            extension: 'json',
        },
        to: {
            extension: 'db',
            encryption: 'aes-128-cbc',
            encryptionKey: 'a9X7mLp3QzB1eV2tYcWrU6nGfJ0KsHdE' // 32 bytes key for AES-128-cbc
        }
    })
    console.log(res)
} catch (error) {
    console.error('Failed to change database configuration:', error);
    process.exit(1);
} */


/* try {
    const res = db.changeConfig({
        from: {
            //directory: './evelodatabase',
        },
        to: {
            directory: './database',
            //encryption: 'aes-128-cbc',
            //encryptionKey: 'a9X7mLp3QzB1eV2tYcWrU6nGfJ0KsHdE'
        }
    });
    console.log('Conversion Result:', res);
} catch (err) {
    console.error('Conversion Error:', err.message);
} */