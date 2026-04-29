# evelodb-global

A lightweight Node.js client library for EveloDB database using TCP socket communication.

## Installation

```bash
npm install evelodb-global
```

## Usage

### TypeScript

```typescript
import eveloDB from 'evelodb-global';

const client = new eveloDB({
  host: '127.0.0.1',
  port: 7962,
  user: 'your-user',
  key: 'your-key'
});

// Create
await client.create('users', { name: 'John', email: 'john@example.com' });

// Find
const results = await client.find('users', { name: 'John' });

// Update
await client.edit('users', { name: 'John' }, { email: 'newemail@example.com' });

// Delete
await client.remove('users', { name: 'John' });
```

### JavaScript

```javascript
const eveloDB = require('evelodb-global').default;

const client = new eveloDB({
  host: '127.0.0.1',
  port: 7962,
  user: 'your-user',
  key: 'your-key'
});

const results = await client.find('users', { name: 'John' });
```

## Configuration

- `host` (string): Database server host (default: '127.0.0.1')
- `port` (number): Database server port (default: 7962)
- `user` (string): Database user
- `key` (string): Database key
- `noRepeat` (boolean): Prevent duplicate entries (default: false)
- `autoPrimaryKey` (boolean|string): Auto-generate primary key (default: true)
- `returnRequestInfo` (boolean): Return request metadata (default: false)

## API Methods

- `create(collection, data)`
- `find(collection, conditions)`
- `findOne(collection, conditions)`
- `search(collection, conditions)`
- `get(collection)`
- `edit(collection, conditions, newData)`
- `remove(collection, conditions)`
- `delete(collection, conditions)`
- `count(collection)`
- `check(collection, data)`
- `analyse(params)`
- `drop(collection)`
- `reset(collection)`
- `inject(collection, data)`
- `writeData(collection, data)`
- `readData(collection)`
- `writeFile(name, data)`
- `readFile(name)`
- `deleteFile(name)`
- `allFiles()`

## License

MIT
