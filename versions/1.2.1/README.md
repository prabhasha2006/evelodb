<h1 align="center">
  <br>
  <a><img src="https://i.ibb.co/t4c363X/20240305-125417.png" width="200"></a>
  <br>
  <b>EveloDB</b>
  <br>
</h1>
<h3 align="center">An awesome local database management system with nodejs. Made by Evelocore. With B-tree Operations & AES Encryption.</h3>
<br>
<hr>

## Requirements
- Node.js

## Table of Contents
- [Installation](#installation)
- [Operations](#operations)
- [Encryptions](#encryptions)
- [Change Config](#changeconfig)
- [Testing Script](#testing)
- [Features](#features)

<br>

<a id="installation"></a>
# 📥 Installation

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
        extension: 'db', // users.db
        encryption: '<encryption_method>',
        encryptionKey: '<encryption_key>',
        noRepeat: false,
        autoPrimaryKey: true
    })
} catch (err) {
    console.error('Init Error:', err.message);
    process.exit(1);
}
```

### Configuration Parameters

| Parameter        | Type     | Description                              | Example                     | Default                     |
|------------------|----------|------------------------------------------|-----------------------------|-----------------------------|
| `directory`      | string   | Where database files are stored          | `'./database'`              | `'./evelodatabase'`         |
| `extension`      | string   | File extension for DB files              | `'db'`, `'edb'`             | `'json'`                    |
| `encryption`     | string   | Encryption algorithm                     | `'aes-256-cbc'`             | `null`                      |
| `encryptionKey`  | string   | Key (length varies by algorithm)         | 64-char hex for AES-256     | `null`                      |
| `noRepeat`       | boolean  | Reject duplicate data                    | `true`/`false`              | `false`                     |
| `autoPrimaryKey` | boolean  | Auto-create unique IDs (__id)            | `true`/`false`              | `true`                      |

<br><br>
<a id="operations"></a>
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
if `autoPrimaryKey: true`
```bash
{ success: true, __id: 'mcbdb90d-ajl393' }
```
if `noRepeat: true` and repeating data is detected
```bash
{ err: 'Duplicate data - record already exists (noRepeat enabled)', code: 'DUPLICATE_DATA' }
```

<hr>

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
No result found
```bash
[]
```

<hr>

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
No result found
```bash
null
```

<hr>

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

<hr>

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

<hr>

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
> Output
```bash
{ success: true, modifiedCount: 1 }
```
if find condition not matched
```bash
{ err: 'No matching records found', code: 'NO_MATCH' }
```
if `noRepeat: true` and repeating data is detected
```bash
{ err: 'Edit would create duplicate data (noRepeat enabled)', code: 'DUPLICATE_DATA' }
```

<hr>

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

<hr>

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

<hr>

### Reset Collection
```js
// Structure
db.reset('collection');

// Example
db.reset('accounts');
```

<br><br>
<a id="encryptions"></a>
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
    console.error('Init Error:', err.message);
    process.exit(1);
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
        extension: 'db',
        encryption: 'aes-256-cbc',
        encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' // 64 hex characters
    })
} catch (err) {
    console.error('Init Error:', err.message);
    process.exit(1);
}
```

<br><br>
<a id="changeconfig"></a>
# 🔄 Change Configuration

- Note: If you are using the config, you can use the same instance of the database.
- If you change the encryption / encryptionKey / extension  or directory, your current db files and data was initialized with the old config will be corrupted and cannot be read.
- Solution for change configuration, use `changeConfig()` method. It can change your current db config to new config and continue normally after initialize again with new config .
-
- Eg: Converting my current
 `aes-256-cbc` encrypted .json database from './evelodatabase' to `aes-128-cbc` and .db with new key and './database' directory.

```js
const res = db.changeConfig({
    from: {
        directory: './evelodatabase',
        extension: 'json',
        encryption: 'aes-256-cbc',
        encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    },
    to: {
        directory: './database',
        extension: 'db',
        encryption: 'aes-128-cbc',
        encryptionKey: '0123456789abcdef0123456789abcdef' // 32 hex characters
    },
    collections: ['users', 'accounts'] // if not set collections, convert all collections
})
console.log(res)
// { success: true, converted: 1, failed: 0 }

// Initialize again
try {
    db = new eveloDB({
        directory: './database',
        extension: 'db',
        encryption: 'aes-128-cbc',
        encryptionKey: '0123456789abcdef0123456789abcdef'
    });
} catch (err) {
    console.error('Re-init Error:', err.message);
}
```
If you remove `encryption` and `encryptionKey` parameters in `to` object, it will remove the encryptions in your database and continue with json string.
```js
const res = db.changeConfig({
    from: {
        encryption: 'aes-256-cbc',
        encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    },
    to: {}
})
```

<br><br>

<a id="testing"></a>
# ✅ Testing with Examples

- Copy `test.js` file to your project directory and run:

<details>
<summary><code>Show Script</code></summary>

```js
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
```
</details>

<br><br>

<a id="features"></a>
# 💡 Features
- ✓ JSON-based storage
- ✓ AES Encryption
- ✓ Custom path and extension
- ✓ B-Tree indexing
- ✓ Fast retrieval
- ✓ No Repeat option
- ✓ Auto Primary Key option

<p align="center">
Copyright 2024 © <a href="https://evelocore.com">Evelocore</a> - All rights reserved
</p>
<p align="center">
Developed by <a href="https://kp.evelocore.com">K.Prabhasha</a>
</p>