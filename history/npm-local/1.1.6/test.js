// This is a test file for the EveloDB module.

const eveloDB = require('evelodb');

let db;
try {
    db = new eveloDB({
        directory: './evelodatabase',
        extension: 'db',
        // Start unencrypted to test conversion
    });
} catch (err) {
    console.error('Init Error:', err.message);
    process.exit(1);
}

function createData(collection, data) {
    try {
        const res = db.create(collection, data);
        console.log(`Create Result:`, res);
    } catch (err) {
        console.error('Create Error:', err.message);
    }
}

function findData(collection, query) {
    try {
        const res = db.find(collection, query);
        console.log(`Find Result:`, res);
    } catch (err) {
        console.error('Find Error:', err.message);
    }
}

function searchData(collection, query) {
    try {
        const res = db.search(collection, query);
        console.log(`Find Result:`, res);
    } catch (err) {
        console.error('Find Error:', err.message);
    }
}

function deleteData(collection, query) {
    try {
        const res = db.delete(collection, query);
        console.log(`Delete Result:`, res);
    } catch (err) {
        console.error('Delete Error:', err.message);
    }
}

function convertEncryption(fromEnc, fromKey, toEnc, toKey) {
    try {
        const res = db.changeEncrypt({
            from: {
                directory: './evelodatabase',
                extension: 'db',
                encryption: fromEnc,
                encryptionKey: fromKey
            },
            to: {
                directory: './evelodatabase',
                extension: 'db',
                encryption: toEnc || null,
                encryptionKey: toKey || null
            },
            collections: ['users'] // optional
        });
        console.log('Conversion Result:', res);
    } catch (err) {
        console.error('Conversion Error:', err.message);
    }
}

// ===== TEST FLOW =====

const testUser = { name: 'John Doe', age: 30 };
const query = { name: 'John Doe' };
const search_query = { name: 'Joh' };

console.log('\n✅ STEP 1: Create Data');
createData('users', testUser);

console.log('\n🔍 STEP 2: Find Before Conversion');
findData('users', query);

console.log('\n🔍 STEP 3: Search by a piece of value');
searchData('users', search_query);

console.log('\n🔐 STEP 4: Convert to Encrypted Format');
convertEncryption(
    '', '', // from: unencrypted
    'aes-256-cbc',
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
);

console.log('\n🔍 STEP 5: Try Reading Encrypted With New DB Config');
try {
    db = new eveloDB({
        directory: './evelodatabase',
        extension: 'db',
        encryption: 'aes-256-cbc',
        encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    });
} catch (err) {
    console.error('Re-init Error:', err.message);
}
findData('users', query);

console.log('\n🔓 STEP 6: Convert Back to Plain JSON');
convertEncryption(
    'aes-256-cbc',
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    '', ''
);

console.log('\n🔍 STEP 7: Try Reading Encrypted With New DB Config');
try {
    db = new eveloDB({
        directory: './evelodatabase',
        extension: 'db'
    });
} catch (err) {
    console.error('Re-init Error:', err.message);
}

console.log('\n🧹 STEP 8: Clean Up');
deleteData('users', query);
