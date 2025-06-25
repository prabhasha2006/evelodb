// This is a test file for the EveloDB module.

const eveloDB = require('evelodb');
let db

// Initialize DB
try {
    db = new eveloDB({
        directory: './evelodatabase',
        extension: 'db',
        noRepeat: true,
        // Start unencrypted to test conversion
    });
} catch (err) {
    console.error('Init Error:', err.message);
    process.exit(1);
}

// ===== TEST FLOW =====

const testUser = { name: 'John Doe', age: 30 };
const query = { age: 30 };
const new_query = { age: 40 };
const search_query = { name: 'Joh' };
let createdId;

// Create Data
console.log('\n✅ Create Data');
try {
    const res = db.create('users', testUser);
    createdId = create.__id;
    console.log(`Create Result:`, res);
} catch (err) {
    console.error('Create Error:', err.message);
}

// Find Data
console.log('\n🔍 Find Before Conversion');
try {
    const res = db.find('users', { __id: createdId });
    console.log(`Find Result:`, res);
} catch (err) {
    console.error('Find Error:', err.message);
}

// Search Data
console.log('\n🔍 Search by a piece of value');
try {
    const res = db.search('users', search_query);
    console.log(`Find Result:`, res);
} catch (err) {
    console.error('Find Error:', err.message);
}

// Convert to encrypted format
console.log('\n🔐 Convert to Encrypted Format');
try {
    const res = db.changeConfig({
        from: {
            directory: './evelodatabase',
            extension: 'db',
            noRepeat: true
        },
        to: {
            directory: './evelodatabase',
            extension: 'db',
            noRepeat: true,
            encryption: 'aes-256-cbc',
            encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
        }
    });
    console.log('Conversion Result:', res);
} catch (err) {
    console.error('Conversion Error:', err.message);
}

// Initialize with new config
try {
    db = new eveloDB({
        directory: './evelodatabase',
        extension: 'db',
        noRepeat: true,
        encryption: 'aes-256-cbc',
        encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    });
} catch (err) {
    console.error('Re-init Error:', err.message);
}

// Find Data Again
console.log('\n🔍 Try Reading Encrypted With New DB Config');
try {
    const res = db.find('users', query);
    console.log(`Find Result:`, res);
} catch (err) {
    console.error('Find Error:', err.message);
}

// Edit Data
console.log('\n🔍 Editing data');
try {
    const res = db.edit('users', query, new_query);
    console.log(`Editing Result:`, res);
} catch (err) {
    console.error('Edit Error:', err.message);
}

// Find Data Again
console.log('\n🔍 Find old object again after edit');
try {
    const res = db.find('users', query);
    console.log(`Find Result:`, res);
} catch (err) {
    console.error('Find Error:', err.message);
}

// Find Data Again
console.log('\n🔍 Find new object again after edit');
try {
    const res = db.find('users', new_query);
    console.log(`Find Result:`, res);
} catch (err) {
    console.error('Find Error:', err.message);
}

// Convert config back to plain JSON
console.log('\n🔓 Convert Back to Plain JSON');
try {
    const res = db.changeConfig({
        from: {
            directory: './evelodatabase',
            extension: 'db',
            noRepeat: true,
            encryption: 'aes-256-cbc',
            encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
        },
        to: {
            directory: './evelodatabase',
            extension: 'db',
            noRepeat: true
        }
    });
    console.log('Conversion Result:', res);
} catch (err) {
    console.error('Conversion Error:', err.message);
}

// Initialize with new config
try {
    db = new eveloDB({
        directory: './evelodatabase',
        extension: 'db',
        noRepeat: true
    });
} catch (err) {
    console.error('Re-init Error:', err.message);
}

// Delete Data
console.log('\n🧹 Clean Up');
try {
    const res = db.delete('users', new_query);
    console.log(`Delete Result:`, res);
} catch (err) {
    console.error('Delete Error:', err.message);
}

// Reset collection
console.log('\n🧹 Drop Collection')
try {
    const res = db.reset('users');
    console.log(`Drop Result:`, res);
} catch (err) {
    console.error('Drop Error:', err.message);
}
