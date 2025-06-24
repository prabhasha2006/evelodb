<h1 align="center">
  <br>
  <a><img src="https://i.ibb.co/t4c363X/20240305-125417.png" width="200"></a>
  <br>
  <b>EveloDB</b>
  <br>
</h1>
<h3 align="center">A Local Database Management System with Node.js featuring B-Tree Implementation</h3>
<br>
<hr>

## Requirements
- Node.js

## Installation

### Via npm
```bash
npm i evelodb
```

### Manual Installation
- Download `evelodb.js`
- Place it in your project directory
- First run creates `./evelodatabase/` automatically

## Import
```js
const eveloDB = require('evelodb')
const db = new eveloDB();
```

### Optional Configuration
```js
let db
try {
    db = new eveloDB({
        directory: './evelodatabase', // ./evelodatabase/users.db
        extension: 'db'v // users.db
        encryption: '<encryption_method>',
        encryptionKey: '<encryption_key>',
    })
} catch (err) {
    console.error('Error:', err.message);
}
```

<br><br>
# ⚙️ Operations

### Create
```js
// Structure
db.create('collection', {
    key: 'value'
});

// Example
db.create('collection', {
    username: 'evelocore',
    name: {
        firstname: 'Kumuthu',
        lastname: 'Prabhasha'
    },
    email: 'example@gmail.com'
});
```
> Output
```bash
{ success: true }
```

### Find
```js
// Structure
const result = db.find('collection', {
    key: 'value'
});

// Example
const user = db.find('collection', {
    username: 'evelocore'
});
console.log(user)
```
> Output
```bash
[
  {
    username: 'evelocore',
    name: 'Evelocore',
    developer: 'K.Prabhasha',
    email: 'example@gmail.com'
  }
]
```


### Find One
```js
// Structure
const result = db.findOne('collection', {
    key: 'value'
});

// Example
const user = db.findOne('collection', {
    username: 'evelocore'
});
console.log(user)
```
> Output
```bash
{
    username: 'evelocore',
    name: 'Evelocore',
    developer: 'K.Prabhasha',
    email: 'example@gmail.com'
}
```
```bash
null
```

### Search
```js
// Structure
const result = db.search('collection', {
    key: 'partial_value'
});

// Example
const user = db.search('collection', {
    username: 'evelo'
});
console.log(user)
```
> Output
```bash
[
  {
    username: 'evelocore',
    name: 'Evelocore',
    developer: 'K.Prabhasha',
    email: 'example@gmail.com'
  }
]
```

### Check Existence
```js
// Structure
const exists = db.check('collection', {
    key: 'value'
});

// Example
const exists = db.check('accounts', {
    username: 'evelocore'
});
console.log(exists)
```
> Output
```bash
true
```

### Update
```js
// Structure
db.edit('collection', 
    { key: 'value' },     // find condition
    { key: 'new_value' }  // new data
);

// Example
db.edit('accounts', 
    { username: 'evelocore' },
    {
        name: 'EveloCore Official',
        email: 'updated@gmail.com'
    }
);
```

### Delete
```js
// Structure
db.delete('collection', {
    key: 'value'
});

// Example
db.delete('accounts', {
    username: 'evelocore'
});
```

### Get full collection
```js
// Structure
const result = db.get('collection');

// Example
const users = db.get('accounts');
console.log(users);
```

### Inject full collection
```js
// Structure
const result = db.inject('collection', data);

// Example
const users = db.inject('accounts', [
  { id: 1, name: 'Evelocore' },
  { id: 2, name: 'K.Prabhasha' },
]);

const users = db.inject('appdata', {
    name: 'Evelodb',
    description: 'An awesome local DBMS with nodejs',
    author: 'Evelocore'
})
// Also can maintain object using inject() and get()
```

### Reset Collection
```js
// Structure
db.reset('collection');

// Example
db.reset('accounts');
```

<br><br>
# 🔐 Encryptions

### Configuration
```js
const eveloDB = require('evelodb')
let db
try {
    db = new eveloDB({
        directory: './evelodatabase',
        extension: 'db',
        encryption: '<encryption_method>',
        encryptionKey: '<encryption_key>',
    })
} catch (err) {
    console.error('Error:', err.message);
}
```

### Encryption Methods
- `aes-128-cbc` (16 bytes) - 32 hex characters
- `aes-192-cbc` (24 bytes) - 48 hex characters
- `aes-256-cbc` (32 bytes) - 64 hex characters
- `aes-128-gcm` (16 bytes) - 32 hex characters
- `aes-256-gcm` (32 bytes) - 64 hex characters

### Example Configuration
```js
const eveloDB = require('evelodb')
let db
try {
    db = new eveloDB({
        directory: './evelodatabase',
        extension: 'db',
        encryption: 'aes-256-cbc',
        encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' // 64 characters
    })
} catch (err) {
    console.error('Error:', err.message);
}
```


### Change Encryption

- Note: If you are using the same encryption key, you can use the same instance of the database.
- If you change the encryption key or method, your current db files and data was encrypted with the old key will be corrupted and cannot be read.
- Solution for change encryption, use `changeEncrypt()` method. It can change your current db configuration to new configuration and continue normally with new config.

- Converting my current `aes-256-cbc` encrypted database to `aes-128-cbc` with new key.
```js
const res = db.changeEncrypt({
    from: {
        directory: './evelodatabase',
        extension: 'db',
        encryption: 'aes-256-cbc',
        encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    },
    to: {
        directory: './evelodatabase',
        extension: 'db',
        encryption: 'aes-128-cbc',
        encryptionKey: '0123456789abcdef0123456789abcdef'
    },
    collections: ['users'] // if not set collections, convert all collections
})
console.log(res);
// { success: true, converted: 1, failed: 0 }
```
- If you remove `encryption` and `encryptionKey` parameters in `to` object, it will remove the encryptions in your database and continue with json string.
```js
const res = db.changeEncrypt({
    from: {
        directory: './evelodatabase',
        extension: 'db',
        encryption: 'aes-256-cbc',
        encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    },
    to: {
        directory: './evelodatabase',
        extension: 'db'
    }
})
```

<br><br>
## ✅ Testing with Examples

- Copy `test.js` file to your project directory and run:

<details>
<summary><code>const eveloDB = require('evelodb')</code></summary>

```js
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
```
</details>

<br><br>

## 💡 Features
- ✓ JSON-based storage
- ✓ AES Encryption
- ✓ Custom path and extension
- ✓ B-Tree indexing
- ✓ Fast retrieval
- ✓ Node.js

<p align="center">
Copyright 2024 © Evelocore - All rights reserved
</p>