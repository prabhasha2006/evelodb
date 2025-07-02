
const eveloDB = require('./evelodb.js');
let db
try {
    db = new eveloDB({
        noRepeat: true,
        autoPrimaryKey: 'key'
    })
} catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
}

//console.log(db.create('users', { name:'Kumuthu', age: 30}))
//console.log(db.edit('users', { age: 30}, { age: 40}))
console.log(db.create('users', { age: 40}))

/* try {
    const res = db.changeConfig({
        from: {
            extension: 'db',
        },
        to: {
            extension: 'db',
            encryption: 'aes-128-cbc',
            encryptionKey: '4c51172e64a2ee9bbbad4975d47566fe' // 32 bytes key for AES-128-cbc
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