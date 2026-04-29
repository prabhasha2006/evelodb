<h1 align="center">
  <br>
  <a><img src="https://i.ibb.co/t4c363X/20240305-125417.png" width="200"></a>
  <br>
  <b>EveloDB</b>
  <br>
</h1>
<h3 align="center">An awesome local database management system with nodejs. Made by Evelocore. With B-tree Operations.</h3>
<br>
<hr>

## Requirements
- Node.js

## Table of Contents
- [📥 Installation](#installation)
- [🔢 Comparison Operators](#comparison-operators)
- [⚙️ Operations](#operations)
- [🔍 Get Query Result](#query-result)
- [🧠 AI Analyse](#ai-analyse)
- [📝 Use BSON binary encoded](#usebson)
- [🔐 Encryptions](#encryptions)
- [🔄 Change Config](#changeconfig)
- [💡 Features](#features)
- [📈 Changelog](#changelog)
- [🌍 EveloDB Server](#server)

<br>

<a id="installation"></a>
# 📥 Installation

### Npm Install
```bash
npm i evelodb
```

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
| `autoPrimaryKey` | string  | Auto-create unique IDs (_id)             | `true`/`false`/`'id'`       | `true`                      |


- ### autoPrimaryKey
  - `true`: Auto-create unique IDs (`_id`) for each document
  - `false`: No auto-create
  - `string`: Put your own id field name (e.g., `'id'`, `'key'`)

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


<br><br>
<a id="operations"></a>
# ⚙️ Operations

### Create
```js
// Structure
db.create('collection', {
    key: 'value'
})

// Example
db.create('collection', {
    username: 'john',
    name: {
        firstname: 'John',
        lastname: 'Doe'
    },
    email: 'example@gmail.com'
})
```
> Output
```bash
{ success: true }
```
if `autoPrimaryKey: true`
```bash
{ success: true, _id: 'mcbdb90d-ajl393' }
```
if `noRepeat: true` and repeating data is detected
```bash
{ err: 'Duplicate data - record already exists (noRepeat enabled)', code: 'DUPLICATE_DATA' }
```

<hr>

### Update Item
```js
// Structure
db.edit('collection', 
    { key: 'value' },     // find condition
    { key: 'new_value' }  // new data
)

// Example
db.edit('accounts', 
    { username: 'john' },
    {
        name: 'John Smith',
        email: 'updated@gmail.com'
    }
)
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
})

// Example
db.delete('users', {
    name: 'John Doe'
})

// Example with options
console.log(db.delete('users', {
    age: { $lt: 18 }
}))
```
> Output
```bash
{ success: true, deletedCount: 2 }
```
<hr>


### Find
```js
// Structure
const result = db.find('collection', {
    key: 'value'
}).all()

// Example
const user = db.find('users', {
    name: 'john',
    age: { $gt: 18 }
}).all()
console.log(user)
```
> Output
```bash
[
  {
    name: 'john',
    age: 19,
    email: 'example@gmail.com'
  },
  {
    name: 'john',
    age: 24,
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
})

// Example
const user = db.findOne('users', {
    username: 'banana'
})
console.log(user)
```
> Output
```bash
{
    username: 'banana',
    name: 'Test User',
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
}).all()

// Example
const user = db.search('users', {
    name: 'Joh'
}).all()

// Example with options
const user = db.search('users', {
    name: { $regex: '^joh', $options: 'i' }  // Matches names starting with "joh", case-insensitive
}).getList(0, 20)

console.log(user)
```
> Output
```bash
[
  {
    name: 'John Doe',
    age: 25,
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
})

// Example
const exists = db.check('accounts', {
    username: 'evelocore'
})

console.log(exists)
```
> Output
```bash
true
```
<hr>

### Count Items
```js
// Structure
const count = db.count('collection')

// Example
const count = db.count('accounts')
console.log(count)
```
> Output
```bash
{
    success: true,
    count: 25
}
```

<hr>

### Get from all
```js
// Structure
const result = db.get('collection').all()

// Example
const users = db.get('accounts').getList(10, 20)
console.log(users)
```

### Drop Collection
```js
// Structure
db.drop('collection')

// Example
db.drop('accounts')
```

### Write plain data into collection
```js
// Structure
const result = db.writeData('collection', data)

// Example
const users = db.writeData('accounts', [
  { id: 1, name: 'John Doe' },
  { id: 2, name: 'Blue Bird' },
])

const users = db.writeData('appdata', {
    name: 'EveloDB',
    description: 'An awesome local DBMS with nodejs',
    author: 'Evelocore'
})
// Also can maintain object using writeData() and readData()
```

<hr>

### Read plain data from collection
```js
// Structure
const result = db.readData('collection')

// Example
const appData = db.readData('appdata')
console.log(appData)
```

<br><br>

<a id="query-result"></a>
# 🔍 Get Query Result
This is a wrapper that provides chainable methods for working with query results in eveloDB. It enables pagination, sorting, and other data manipulation operations on query results.

## Overview
The Query Result returned by the following eveloDB methods:
- db.find(collection, conditions)
- db.search(collection, conditions)
- db.get(collection) `when data is an array`

## Examples

### getList
- Implements pagination by returning a subset of results.
```js
// Get first 10 users
const firstPage = db.find('users', { status: 'active' }).getList(0, 10);

// Get next 10 users (pagination)
const secondPage = db.find('users', { status: 'active' }).getList(10, 10);

// Get 5 users starting from index 20
const customPage = db.find('users', { status: 'active' }).getList(20, 5);
```

### count
- Returns the total number of items in the result set.
```js
// Get total count of active users
const totalActiveUsers = db.find('users', { status: 'active' }).count();

// Get count of search results
const searchCount = db.search('products', { name: 'phone' }).count();

// Use for pagination info
const results = db.find('orders', { status: 'pending' });
const total = results.count();
const currentPage = results.getList(0, 20);
console.log(`Showing ${currentPage.length} of ${total} results`);
```

### sort
- Sorts the results using a comparison function.
```js
// Sort by name (ascending)
const sortedByName = db.find('users', { status: 'active' })
    .sort((a, b) => a.name.localeCompare(b.name))

// Sort by age (descending)
const sortedByAge = db.find('users', { status: 'active' })
    .sort((a, b) => b.age - a.age)
    .getList(0, 20);

// Sort by date (newest first)
const sortedByDate = db.find('posts', { published: true })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .getList(0, 10);
```

## Method Chaining
One of the key features of QueryResult is method chaining, allowing you to combine operations:
```js
const db = new eveloDB();

// Chain multiple operations
const result = db.find('products', { category: 'electronics' })
    .sort((a, b) => b.price - a.price)  // Sort by price (high to low)
    .getList(10, 5);                    // Get items 11-15

// Complex chaining example
const topExpensiveProducts = db.search('products', { name: 'laptop' })
    .sort((a, b) => b.price - a.price)  // Sort by price descending
    .getList(0, 3);                     // Get top 3 most expensive

// Get count after sorting (count remains the same)
const sortedResults = db.find('users', { role: 'admin' })
    .sort((a, b) => a.name.localeCompare(b.name));
    
const totalCount = sortedResults.count();        // Total admins
const firstPage = sortedResults.getList(0, 10);  // First 10 sorted admins
```

<br><br>

<a id="ai-analyse"></a>
# 🧠 AI Analyse
EveloDB integrates with Google's Generative AI to provide intelligent analysis of your collections.

## AI Analysis Features
- Analyze collection data using natural language queries
- Get AI-powered insights from your datasets
- Filter results before analysis
- Direct data input option

## Parameters

| Parameter    | Type       | Required | Description                                                                 |
|--------------|------------|----------|-----------------------------------------------------------------------------|
| `collection` | string     | No*      | Collection name to analyze (*required if `data` not provided)               |
| `filter`     | object     | No       | Filter with comparison operators to apply before analysis                               |
| `data`       | array      | No*      | Direct data input (*required if `collection` not provided)                  |
| `model`      | string     | Yes      | Gemini model to use (e.g., "gemini-pro", "gemini-2.5-flash")               |
| `apiKey`     | string     | Yes      | Your Google Generative AI API key                                           |
| `query`      | string     | Yes      | Natural language query for analysis (max 1024 chars)                        |

## Example

```js
const res = await db.analyse({
    collection: 'users',
    filter: { age: { $gt: 18 } },
    //data: data,
    model: 'gemini-2.5-flash',
    apiKey: 'GEMINI_API_KEY',
    query: 'Find users with potentially offensive bios'
})

console.log(res)
```
Response:
```bash
{
  success: true,
  response: {
    indexes: [ 1, 2, 4 ],
    reason: "The selected users have bios containing explicit profanity ('F****!'), vulgar expressions ('B****!'), or derogatory/insulting remarks ('This game is trash ****!'), which are all considered potentially offensive.",
    message: 'Offensive content was identified by the presence of strong expletives, common vulgarisms, or direct negative attacks/insults aimed at others or products.',
    data: [ [Object], [Object], [Object] ]
  }
}
```

<br><br>

<a id="usebson"></a>
# 📝 Use BSON encoded

> ###  Binary Serialized Object Notation with EveloDB

- EveloDB can handle both JSON and BSON encoded data. Here's how to use BSON encoded data with eveloDB: 
- JSON use string for keys, while BSON use ObjectId for keys.
- BSON (Binary JSON) is the optimal format for storing and maintaining database records when human readability is not required.

### Configuration with BSON encoding
```js
const eveloDB = require('evelodb')
let db
try {
    db = new eveloDB({
        directory: './evelodatabase',
        extension: 'db', // default 'bson'
        encode: 'bson',
    })
} catch (err) {
    console.error('Init Error:', err.message);
    process.exit(1);
}
```
- `encode: 'bson'` for BSON encoding
- `encode: 'json'` for JSON encoding (default)

### Why JSON is faster than BSON?
- BSON requires binary decode `BSON.deserialize` before JS can use it.
- JSON uses `JSON.parse`, which is highly optimized in V8 (Node.js engine).
- BSON spec has a hard cap: 16,777,216 bytes (~16MB) per document.

### What happend when JSON + Encryption?
- BSON is faster than JSON when use encryptions.
- Because BSON doesn't want aditional encryption.

### Summery
- JSON is faster than BSON when doesn't use encryption.
- If you want unreadable database, use BSON

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

### Generate Hex Key

Using EveloDB inbuild method
```js
const length = 32 // 32, 48, 64
const key = db.generateKey(length)
console.log(key)
```
Using Crypto JS
```js
const crypto = require('crypto');
const key = crypto.randomBytes(16).toString('hex'); // 32 hex chars
console.log(key);
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
// { success: true, converted: 2, failed: 0 }

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

<a id="features"></a>
# 💡 Features
- ✓ JSON-based storage
- ✓ BSON-based storage
- ✓ Powerful filtering support
- ✓ AES Encryption
- ✓ Custom path and extension
- ✓ B-Tree indexing
- ✓ Fast retrieval
- ✓ No Repeat option
- ✓ Auto Primary Key option

<hr>

<br><br>

<a id="changelog"></a>
# 📈 Changelog
- 1.2.9
  - Comparison Operators
  - Improve find, search, update, delete
- 1.2.8
  - No Repeat option
  - Auto Primary Key option
  - Add custom key for primary key
- 1.2.6
  - Fixed some bugs
- 1.2.5
  - BSON-based storage
  - Binary Serialized Object Notation with EveloDB
- 1.2.3
  - Improve AES Encryption for JSON
- 1.2.1
  - AES Encryption for JSON
- 1.1.1
  - Custom path
  - Custom extension
- 1.0.9
  - Improve B-Tree Operations
- 1.0.6
  - B-Tree indexing system

<hr>
<br><br>

<a id="server"></a>
# 🌍 EveloDB Server

> 📝 **Note:** EveloDB Server is currently under development and not officially released.

**EveloDB Server** is a lightweight, powerful, and flexible server built on top of the local BSON-based DBMS **eveloDB**. It provides an all-in-one solution to manage local databases with a user-friendly UI and secure backend system.

---

## 🚀 Features

- 📦 **Standalone Application**
  - Easily install and run as a desktop/server app.

- 🖥️ **Modern UI Interface**
  - Manage databases and collections through a clean web interface.

- 🗂️ **Customizable Database Properties**
  - Each database includes: `name`, `username`, `key`, `colour`, and `icon`.

- 🔐 **Secure Login System**
  - Easy and secure login with key-based access.

- 👥 **User Management**
  - Supports admin/user roles with access control.

- ✏️ **Code & Template Editor**
  - Edit collection templates directly in the browser.

- 🌐 **CORS Origin Control**
  - Manage which frontend origins can access your databases.

- 📤📥 **Import/Export Collections**
  - Backup or import collections as **JSON** or **BSON** files.

- 🧩 **eveloDB Integration**
  - Fully powered by `eveloDB` and accessible via `evelodb-global` npm package.

---

## 📦 Coming Soon
Stay tuned for official release, installation guides, and usage documentation!

<br>

## 📢 Stay Connected

Follow us for updates, announcements, and support:
<p>
    <a href="https://evelocore.com" target="_blank"><img src="https://img.shields.io/badge/Website-f79d2f?style=for-the-badge&logo=google-chrome&logoColor=white"/></a>
    <a href="https://github.com/prabhasha2006" target="_blank"><img src="https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white"/></a>
    <a href="https://whatsapp.com/channel/0029VaxherLJP212qRX1hH0D" target="_blank"><img src="https://img.shields.io/badge/WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white"/></a>
    <a href="https://discord.gg/wy2FwTMC" target="_blank"><img src="https://img.shields.io/badge/Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white"/></a>
    <a href="https://www.facebook.com/profile.php?id=61566785835989" target="_blank"><img src="https://img.shields.io/badge/Facebook-1877F2?style=for-the-badge&logo=facebook&logoColor=white"/></a>
</p>

<br>


<p align="center">
Copyright 2025 © <a href="https://evelocore.com">Evelocore</a> - All rights reserved
</p>
<p align="center">
Developed by <a href="https://kp.evelocore.com">K.Prabhasha</a>
</p>