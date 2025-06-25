const eveloDB = require('./evelodb.js');
let db

const test = 'json' // 'json' or 'bson'

try {
    db = new eveloDB({
        extension: test,
        encode: test
    });
} catch (err) {
    console.error('Init Error:', err.message);
    process.exit(1);
}

const testUser = {
    name: 'John Doe',
    age: 40,
    photo: require('./b.js')
}

// Create Data
function createData() {
    console.log('\n✅ Create Data');
    try {
        db.create('users', testUser);
    } catch (err) {
        console.error('Create Error:', err.message);
    }
}

// Find Data
function findData() {
    let startTime = Date.now();
    try {
        const res = db.find('users', { name: 'John Doe' });
        if (res.length > 0) {
            const t = Date.now() - startTime;
            console.log(`Find Result Time taken: ${t}ms - ${test.toLocaleUpperCase()}`);
            console.log(res.length)
        }
    } catch (err) {
        console.error('Find Error:', err.message);
    }
}

for (let i = 0; i < 210; i++) {
    //createData()
}

findData()

// 680KB -> Find Result Time taken: 1ms - JSON 
// 680KB ->Find Result Time taken: 4ms - BSON

// 19157KB -> Find Result Time taken: 42ms - JSON
// 17331KB -> Find Result Time taken: 45ms - BSON