<h1 align="center">
  <br>
  <a><img src="https://cdn.evelocore.com/files/Evelocore/projects/evelodb/icon.png" width="200"></a>
  <br>
  <b>EveloDB Prime</b>
  <br>
</h1>
<h3 align="center">A high-performance BSON-only database for Node.js. Made by Evelocore. With B-tree Operations.</h3>
<br>
<hr>

## 📚 Introduction

**EveloDB Prime** is the streamlined, high-performance evolution of EveloDB. It removes the overhead of multi-format support and encryption to focus strictly on **BSON-backed B-Tree storage**. It's designed for large-scale applications that need fast indexing and reliable local storage without the complexity of configuration.

## Requirements
- Node.js

## Table of Contents
- [📥 Installation](#installation)
- [📘 TypeScript / ES Modules](#typescript)
- [🔢 Comparison Operators](#comparison-operators)
- [⚙️ Operations](#operations)
- [🔍 Get Query Result](#query-result)
- [💾 Backup Data](#backup)
- [📁 Store Files](#filehandle)
- [🖼️ Image Utilities](#filehandleimg)
- [💡 Features](#features)
- [📈 Changelog](#changelog)

<br>

<a id="installation"></a>
# 📥 Installation

### Npm Install
```bash
npm i evelodb-prime
```

## Import

### CommonJS
```js
const eveloDB = require('evelodb-prime');
const db = new eveloDB();
```

### TypeScript / ES Modules
```typescript
import eveloDB from 'evelodb-prime';
const db = new eveloDB();
```

### Configuration
```js
const db = new eveloDB({
    directory: './evelodatabase', // Storage directory
    noRepeat: false,              // Reject duplicate data
    schema: {
        users: {
            fields: {
                username: { type: String, required: true, min: 5, max: 30 },
                email: { type: String, required: true },
                age: { type: Number, required: true, min: 18, max: 90 }
            },
            indexes: ["email", "username"],
            uniqueKeys: ["email", "username"]
        }
    }
});
```

### Configuration Parameters

| Parameter          | Type     | Description                                  | Default                     |
|--------------------|----------|----------------------------------------------|-----------------------------|
| `directory`        | string   | Where database files are stored              | `'./evelodatabase'`         |
| `noRepeat`         | boolean  | Reject duplicate data (all fields)           | `false`                     |
| `maxHandles`       | number   | Max open collection handles (LRU)             | `64`                        |
| `compactThreshold` | number   | Auto-compact ratio (0.1 - 0.9)               | `0.3`                       |
| `schema`           | Object   | Schema, Indexes, and Unique Keys for collections | `{}`                        |

> **Note:** EveloDB Prime uses `.db` extension and `_id` as the primary key. Secondary indexes use `.field.bidx` files.

<br><br>

<a id="typescript"></a>
# 📘 TypeScript / ES Modules

EveloDB Prime is fully written in TypeScript and supports both CommonJS and ES Module environments natively.

### Importing Types
```typescript
import eveloDB, { type EveloDBConfig } from 'evelodb-ultra';

const config: EveloDBConfig = {
    directory: './database',
    noRepeat: true
};

const db = new eveloDB(config);
```

<br><br>

<a id="comparison-operators"></a>
# 🔢 Comparison Operators
Used to filter with conditions like greater than, less than, equal, etc.

| Operator | Description             | Example                                 |
|----------|-------------------------|-----------------------------------------|
| `$eq`    | Equal                   | `{ age: { $eq: 25 } }`                  |
| `$ne`    | Not equal               | `{ age: { $ne: 25 } }`                  |
| `$gt`    | Greater than            | `{ age: { $gt: 25 } }`                  |
| `$gte`   | Greater than or equal   | `{ age: { $gte: 25 } }`                 |
| `$lt`    | Less than               | `{ age: { $lt: 25 } }`                  |
| `$lte`   | Less than or equal      | `{ age: { $lte: 25 } }`                 |
| `$in`    | Matches any in an array | `{ status: { $in: ["active", "pending"] } }` |
| `$nin`   | Not in array            | `{ status: { $nin: ["inactive"] } }`    |
| `$regex` | Regular expression      | `{ name: { $regex: "^Jo", $options: "i" } }` |

<br><br>

<a id="operations"></a>
# ⚙️ Operations

### Create
```js
db.create('users', {
    username: 'john',
    email: 'john@example.com'
})
```
> Output
```bash
{ 
  success: true, 
  _id: '662e5a4e3d5a4e3d5a4e3d5a',
  _createdAt: '2026-04-28T10:00:00Z',
  _modifiedAt: '2026-04-28T10:00:00Z'
}
```

### Update
```js
db.edit('users', 
    { username: 'john' },
    { email: 'newemail@example.com' }
)
```

### Delete
```js
db.delete('users', { username: 'john' })
```

### Find
```js
const user = db.findOne('users', { _id: 'mcbdb90d-ajl393' });
const allUsers = db.find('users', { age: { $gt: 18 } }).all();
```

<br><br>

<a id="query-result"></a>
# 🔍 Get Query Result
Methods to handle the results from `find`, `get`, or `search`.

```js
const result = db.find('users', { status: 'active' });

result.all();                  // Returns all matching documents
result.count();                // Returns total number of matches
result.getList(offset, limit); // Returns a paginated list
result.sort((a, b) => ...);    // Sorts the result set
```

<br><br>

<a id="backup"></a>
# 💾 Backup Data
Export your collection data for safekeeping or migration.

```js
// 1. Backup as Secure Binary (Encrypted with XOR)
db.createBackup('users', {
    type: 'binary',
    path: './backups',
    password: 'my_secret_password',
    title: 'User Records April 2026'
});

// 2. Backup as JSON (Includes Schema & Collection info)
db.createBackup('users', {
    type: 'json',
    path: './backups'
});

// 3. Backup as raw .db file
db.createBackup('users', {
    type: 'db',
    path: './backups'
});
```

# 🔍 Read Backup Info
Inspect a backup file without restoring it.

```js
const info = db.readBackupFile('./backups/users_backup.backup', 'my_secret_password');
console.log(info.title);   // 'User Records April 2026'
console.log(info.data);    // [ {...}, {...} ]
```

# 🔄 Restore Backup
Restore a collection from a previous backup. 

> [!WARNING]
> Restoring a backup will overwrite current data in the collection.

```js
// Restore from Binary (Requires password if protected)
db.restoreBackup('users', {
    type: 'binary',
    file: './backups/users_backup.backup',
    password: 'my_secret_password'
});

// Restore from JSON
db.restoreBackup('users', {
    type: 'json',
    file: './backups/users_backup.json'
});

// Restore from raw .db file
db.restoreBackup('users', {
    type: 'db',
    file: './backups/users_backup.db'
});
```


<br><br>

<a id="filehandle"></a>
# 📁 Store Files
EveloDB Prime also supports storing raw binary files.

```js
const fs = require('fs');
const buffer = fs.readFileSync('image.jpg');

db.writeFile('avatar.jpg', buffer);
const file = db.readFile('avatar.jpg');
db.deleteFile('avatar.jpg');
```

<br><br>

<a id="filehandleimg"></a>
# 🖼️ Image Utilities
Advanced image processing and retrieval.

```js
const img = await db.readImage('avatar.jpg', {
    pixels: 800,       // Resize to 800px width (aspect ratio preserved)
    quality: 0.8,      // 80% quality compression
    blackAndWhite: true // Apply grayscale filter
});
```

<br><br>

<a id="features"></a>
# 💡 Features
- **BSON Only**: Optimized for high-speed binary serialization.
- **B-Tree Indexing**: Instant lookups by `_id` (Primary) and custom fields (Secondary).
- **Secondary Indexes**: High-speed queries on any field specified in the schema.
- **Unique Constraints**: Automatically enforce unique values for specific fields.
- **Atomic Writes**: Uses Write-Ahead Logging (WAL) and temporary file renaming to prevent corruption.
- **LRU Handle Caching**: Efficient memory usage even with thousands of collections.
- **Auto-Compaction**: Keeps your database small by cleaning up deleted records.
- **System Timestamps**: Automatic `_createdAt` and `_modifiedAt` management for all records.
- **Schema Validation**: Optional strict type and constraint checking for your data.

<br><br>

<a id="changelog"></a>
# 📈 Changelog

### v1.0.0-beta.0 (EveloDB Prime)
- **Breaking Change**: Removed JSON support. BSON is now the only encoding.
- **Breaking Change**: Removed manual extension and encryption settings.
- **Breaking Change**: Fixed primary key to `_id`.
- Streamlined codebase for maximum performance.
- Fixed `.db` extension for data files.
- Added automatic `_createdAt` and `_modifiedAt` timestamps.
- Removed `readData` and `writeData` functions.
- Added **Schema Validation** support.
- Removed **AI Analyse** (Google GenAI) integration.
- Added **Secondary Indexes** support for high-speed custom field lookups.
- Added **Unique Key** constraints.
- Added **Backup** system (JSON/DB formats).

<br><br>

<p align="center">
  Made with ❤️ by <b>Evelocore</b>
</p>