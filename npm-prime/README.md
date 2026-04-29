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
- [⚙️ Configuration](#configuration)
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

<a id="configuration"></a>
### Configuration
```js
const db = new eveloDB({
    directory: './evelodbprime', // Storage directory
    noRepeat: false,             // Reject duplicate data
    schema: {
        users: {
            fields: {
                username: { type: String, required: true, min: 5, max: 30 },
                email: { type: String, required: true },
                age: { type: Number, required: true, max: 90 },
                vehicle: {
                    type: {
                        color: { type: String, required: true },
                        model: { type: String, required: true }
                    },
                    required: false
                }
            },
            indexes: ["email", "username"],
            uniqueKeys: ["email", "username"],
            objectIdKey: "userId"
        },
        products: {
            fields: {
                name: { type: String, required: true },
                price: { type: Number, required: true, min: 0 },
                inStock: { type: Boolean, required: true }
            },
            indexes: ["name"],
            uniqueKeys: ["name"],
            objectIdKey: "productId"
        }
    }
});
```

### Configuration Parameters

| Parameter          | Type     | Required | Description                                  | Default                     |
|--------------------|----------|----------|----------------------------------------------|-----------------------------|
| `directory`        | string   | No       | Where database files are stored              | `'./evelodbprime'`          |
| `noRepeat`         | boolean  | No       | Reject duplicate data (all fields)           | `false`                     |
| `maxHandles`       | number   | No       | Max open collection handles (LRU)             | `64`                        |
| `compactThreshold` | number   | No       | Auto-compact ratio (0.1 - 0.9)               | `0.3`                       |
| `schema`           | Object   | No       | Schema, Indexes, and Unique Keys for collections | `{}`                    |

### Schema Definition

When defining a `schema`, each collection can have `fields`, `indexes`, and `uniqueKeys`.

#### Field Validation
| Property   | Type               | Description                                                                 | Required |
|------------|--------------------|-----------------------------------------------------------------------------|----------|
| `type`     | Constructor / Obj  | Data type (e.g., `String`, `Number`, `Boolean`, or a nested object schema). | **Yes**  |
| `required` | boolean            | If `true`, the field must be present during creation/update.                | No       |
| `min`      | number             | Minimum value for `Number` or minimum length for `String`.                  | No       |
| `max`      | number             | Maximum value for `Number` or maximum length for `String`.                  | No       |

#### Collection Options
| Option       | Type     | Description                                                                 | Required |
|--------------|----------|-----------------------------------------------------------------------------|----------|
| `fields`     | Object   | Field validation rules (as defined in the table above).                     | No       |
| `indexes`    | string[] | Fields to create B-Tree indexes for (enables O(log n) searches).            | No       |
| `uniqueKeys` | string[] | Fields that must contain unique values across the entire collection.        | No       |
| `objectIdKey`| string   | Virtual name for the internal `_id` field (e.g., `"userId"`).               | No       |

> [!IMPORTANT]
> **System Managed Fields:** Fields like `_id` (or your custom `objectIdKey`), `_createdAt`, and `_modifiedAt` are automatically managed by EveloDB. Any attempt to manually set or update these fields in `create()` or `edit()` will result in an error.

> **Note:** All parameters are optional. If no directory is specified, EveloDB will default to `./evelodbprime`.


> **Note:** EveloDB Prime uses `.db` extension and `_id` as the primary key. Secondary indexes use `.field.bidx` files.



> ### Easy Schema Explanation
> #### indexes: ["email", "username"]
> - These indexes will be created as B-Trees on the disk for faster searching
> - If not specified, it will default to [objectIdKey] or ["_id"]
>
> #### uniqueKeys: ["email", "username"]
> - These fields will be checked for uniqueness before insertion
> - If not specified, it will default to []
>
> #### objectIdKey: "userId"
> - This field will be the auto generated id
> - If not specified, it will default to '_id'
>
> #### name: { type: String, required: true }
> - 'name' is String value and required
>
> #### username: { type: String, required: true, min: 5, max: 30 }
> - 'username' is String value and required
> - minimum length is 5
> - maximum length is 30
>
> #### age: { type: Number, required: true, max: 90 }
> - 'age' is Number value and required
> - maximum value is 90
>
> #### vehicle: { type: { color: { type: String, required: true }, model: { type: String, required: true } } }
> - 'vehicle' is Object value and not required
> - inside 'vehicle' there is 'color' and 'model' which are String value and required


<br><br>

<a id="typescript"></a>
# 📘 TypeScript / ES Modules

EveloDB Prime is fully written in TypeScript and supports both CommonJS and ES Module environments natively.

### Importing Types
```typescript
import eveloDB, { type EveloDBConfig } from 'evelodb-prime';

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
Adds a new record to the collection.
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
  userId: '662e5a4e3d5a4e3d5a4e3d5a', // Renamed via objectIdKey
  _createdAt: '2026-04-28T10:00:00Z',
  _modifiedAt: '2026-04-28T10:00:00Z'
}
```
> **Note:** If `objectIdKey` is not defined in the schema, this field defaults to `_id`.

### Update
Modifies existing records that match the conditions.
```js
db.edit('users', 
    { username: 'john' },
    { email: 'newemail@example.com' }
)
```
> Output
```bash
{
  success: true,
  modifiedCount: 1,
  skippedDuplicates: 0 // If noRepeat is enabled
}
```

### Delete
Removes records that match the conditions.
```js
db.delete('users', { username: 'john' })
```
> Output
```bash
{
  success: true,
  deletedCount: 1
}
```

### Find
Search for records. Returns a `QueryResult` object.
```js
// Find one using virtual ID key
const user = db.findOne('users', { userId: '662e5a4e3d5a4e3d5a4e3d5a' });

// Find many (returns QueryResult)
const result = db.find('users', { age: { $gt: 18 } });
```

<br><br>

<a id="query-result"></a>
# 🔍 Get Query Result
Methods to handle and format the results from `find`, `get`, or `search`.

```js
const result = db.find('users', { status: 'active' });

result.all();                  // [ {..}, {..} ] - Array of all matches
result.count();                // 25 - Total count of matches
result.getList(0, 10);         // [ {..} x10 ] - Paginated results
result.sort((a, b) => a.age - b.age); // Returns sorted QueryResult
```

<br><br>

<a id="backup"></a>
# 💾 Backup Data
Export your collection data for safekeeping or migration.

> [!NOTE]
> Backups always preserve the original `_id` field, even if you have configured an `objectIdKey`. This ensures your backups remain compatible even if you change your schema configuration later.

```js
// 1. Backup as Secure Binary (Full-file XOR Encoding)
db.createBackup('users', {
    type: 'binary',
    path: './backups',
    password: 'my_secret_password',
    title: 'User Records April 2026'
});

// 2. Backup as JSON
db.createBackup('users', { type: 'json', path: './backups' });

// 3. Backup as raw .db file
db.createBackup('users', { type: 'db', path: './backups' });
```
> Output (`createBackup`)
```bash
{
  success: true,
  backupPath: './backups/users_backup_2026-04-28.backup'
}
```

# 🔍 Read Backup Info
Inspect a backup file (Metadata & Data) without performing a restore.

```js
const info = db.readBackupFile('./backups/users_backup.backup', 'my_secret_password');
```
> Output (`readBackupFile`)
```bash
{
  success: true,
  title: 'User Records April 2026',
  protected: true,
  schema: { ... },
  length: 150,
  data: [ { username: 'john', ... }, ... ],
  created: 2026-04-28T10:00:00Z
}
```

# 🔄 Restore Backup
Restore a collection from a previous backup. 

> [!WARNING]
> Restoring a backup will overwrite current data in the collection.

```js
db.restoreBackup('users', {
    type: 'binary',
    file: './backups/users_backup_2026-04-28.backup',
    password: 'my_secret_password'
});
```
> Output (`restoreBackup`)
```bash
{ success: true }
```


<br><br>

<a id="filehandle"></a>
# 📁 Store Files
EveloDB Prime also supports storing raw binary files in the `/files` subdirectory.

```js
const buffer = fs.readFileSync('image.jpg');

db.writeFile('avatar.jpg', buffer); // { success: true }
db.readFile('avatar.jpg');          // { success: true, data: <Buffer ...> }
db.deleteFile('avatar.jpg');        // { success: true }
db.allFiles();                      // ['avatar.jpg', 'doc.pdf']
```

<br><br>

<a id="filehandleimg"></a>
# 🖼️ Image Utilities
Advanced image processing including resizing, filters, and optimization.

```js
const img = await db.readImage('avatar.jpg', {
    pixels: 800,       // Resize width
    quality: 0.8,      // 0.1 to 1.0
    blackAndWhite: true
});
```
> Output (`readImage`)
```bash
{
  success: true,
  data: 'data:image/jpeg;base64,...',
  metadata: { filename: 'avatar.jpg', originalSize: 204800, ... }
}
```

<br><br>

<a id="features"></a>
# 💡 Features
- **BSON Native**: Optimized for binary serialization. No JSON overhead.
- **Secure Backups**: Full-file XOR encoding for binary backups.
- **B-Tree Indexing**: O(log n) lookups for primary and secondary keys.
- **Unique Constraints**: Prevent data duplication at the database level.
- **Atomic Renames**: Crash-safe file writes using temporary staging.
- **Auto-Compaction**: Automatic reclamation of deleted record space.
- **System Timestamps**: Automatic `_createdAt` and `_modifiedAt` management.

<br><br>

<a id="changelog"></a>
# 📈 Changelog

### v1.0.0-beta.0 (EveloDB Prime)
- **Breaking**: Fully modularized backup system into `BackupManager`.
- **Breaking**: Updated `restoreBackup` to use single `file` path instead of directory/filename.
- **Feature**: Added **Secure Binary Backups** with full-file XOR encoding.
- **Feature**: Added `readBackupFile` for safe inspection of encrypted backups.
- **Feature**: Switched to **24-character Hex ObjectIDs** for better indexing compatibility.
- **Feature**: Added **Secondary B-Tree Indexes** and **Unique Key** support.
- **Feature**: Added **objectIdKey** to schema for virtual renaming of the `_id` field in API calls.
- **Performance**: Optimized B-Tree insertion and search speeds.

<br><br>

<p align="center">
  Made with ❤️ by <b>Evelocore</b>
</p>