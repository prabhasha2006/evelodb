import * as fs from 'fs';
import { encrypt, decrypt, generateKey } from './encryption.js';
import { BSON, ObjectId } from 'bson';
import { GoogleGenAI } from '@google/genai';
import imageProcess from './imageProcess.js';
import * as path from 'path';
// ─── Default Config ────────────────────────────────────────────────────────────
const defaultConfig = {
    directory: './evelodatabase',
    extension: 'json',
    tabspace: 3,
    encode: 'json',
    encryption: null,
    encryptionKey: null,
    noRepeat: false,
    autoPrimaryKey: true,
    objectId: false,
};
// ─── Helpers ───────────────────────────────────────────────────────────────────
function deepCompare(obj1, obj2) {
    if (obj1 === obj2)
        return true;
    if (obj1 === null || obj2 === null || typeof obj1 !== 'object' || typeof obj2 !== 'object')
        return obj1 === obj2;
    const isArr1 = Array.isArray(obj1);
    const isArr2 = Array.isArray(obj2);
    if (isArr1 !== isArr2)
        return false;
    if (isArr1 && Array.isArray(obj2)) {
        if (obj1.length !== obj2.length)
            return false;
        for (let i = 0; i < obj1.length; i++)
            if (!deepCompare(obj1[i], obj2[i]))
                return false;
        return true;
    }
    const o1 = obj1;
    const o2 = obj2;
    const keys1 = Object.keys(o1);
    const keys2 = Object.keys(o2);
    if (keys1.length !== keys2.length)
        return false;
    for (const key of keys1)
        if (!Object.prototype.hasOwnProperty.call(o2, key) || !deepCompare(o1[key], o2[key]))
            return false;
    return true;
}
class PBTreeNode {
    entries;
    children;
    isLeaf;
    constructor(isLeaf) {
        this.entries = [];
        this.children = [];
        this.isLeaf = isLeaf;
    }
}
class PersistedBTree {
    order; // max keys per node = order - 1
    root;
    idxPath;
    dirty;
    constructor(idxPath, order = 128) {
        this.order = order;
        this.idxPath = idxPath;
        this.dirty = false;
        this.root = this.load();
    }
    // ── Serialization ────────────────────────────────────────────────────────
    serializeNode(node, buf) {
        buf.push(node.isLeaf ? 1 : 0);
        // keyCount (4 bytes)
        const kc = node.entries.length;
        buf.push((kc >> 24) & 0xff, (kc >> 16) & 0xff, (kc >> 8) & 0xff, kc & 0xff);
        for (const e of node.entries) {
            const keyBuf = Buffer.from(e.key, 'utf8');
            const kl = keyBuf.length;
            // keyLen (2 bytes)
            buf.push((kl >> 8) & 0xff, kl & 0xff);
            // key bytes
            for (let i = 0; i < kl; i++)
                buf.push(keyBuf[i]);
            // offset (8 bytes, BigInt-safe via two 32-bit halves)
            const hi = Math.floor(e.offset / 0x100000000);
            const lo = e.offset >>> 0;
            buf.push((hi >> 24) & 0xff, (hi >> 16) & 0xff, (hi >> 8) & 0xff, hi & 0xff, (lo >> 24) & 0xff, (lo >> 16) & 0xff, (lo >> 8) & 0xff, lo & 0xff);
            // len (4 bytes)
            buf.push((e.len >> 24) & 0xff, (e.len >> 16) & 0xff, (e.len >> 8) & 0xff, e.len & 0xff);
        }
        // childCount (4 bytes)
        const cc = node.children.length;
        buf.push((cc >> 24) & 0xff, (cc >> 16) & 0xff, (cc >> 8) & 0xff, cc & 0xff);
        for (const child of node.children)
            this.serializeNode(child, buf);
    }
    deserializeNode(buf, pos) {
        const isLeaf = buf[pos.offset++] === 1;
        const node = new PBTreeNode(isLeaf);
        const kc = (buf[pos.offset] << 24) | (buf[pos.offset + 1] << 16) |
            (buf[pos.offset + 2] << 8) | buf[pos.offset + 3];
        pos.offset += 4;
        for (let i = 0; i < kc; i++) {
            const kl = (buf[pos.offset] << 8) | buf[pos.offset + 1];
            pos.offset += 2;
            const key = buf.slice(pos.offset, pos.offset + kl).toString('utf8');
            pos.offset += kl;
            const hi = (buf[pos.offset] * 0x1000000) +
                ((buf[pos.offset + 1] << 16) | (buf[pos.offset + 2] << 8) | buf[pos.offset + 3]);
            const lo = (buf[pos.offset + 4] * 0x1000000) +
                ((buf[pos.offset + 5] << 16) | (buf[pos.offset + 6] << 8) | buf[pos.offset + 7]);
            const offset = hi * 0x100000000 + lo;
            pos.offset += 8;
            const len = (buf[pos.offset] << 24) | (buf[pos.offset + 1] << 16) |
                (buf[pos.offset + 2] << 8) | buf[pos.offset + 3];
            pos.offset += 4;
            node.entries.push({ key, offset, len });
        }
        const cc = (buf[pos.offset] << 24) | (buf[pos.offset + 1] << 16) |
            (buf[pos.offset + 2] << 8) | buf[pos.offset + 3];
        pos.offset += 4;
        for (let i = 0; i < cc; i++)
            node.children.push(this.deserializeNode(buf, pos));
        return node;
    }
    // ── Disk I/O ─────────────────────────────────────────────────────────────
    load() {
        if (!fs.existsSync(this.idxPath))
            return new PBTreeNode(true);
        try {
            const buf = fs.readFileSync(this.idxPath);
            if (buf.length < 8)
                return new PBTreeNode(true);
            const pos = { offset: 0 };
            // read order (4 bytes)
            this.order = (buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3];
            pos.offset = 4;
            return this.deserializeNode(buf, pos);
        }
        catch {
            return new PBTreeNode(true);
        }
    }
    flush() {
        if (!this.dirty)
            return;
        const arr = [];
        // write order (4 bytes)
        arr.push((this.order >> 24) & 0xff, (this.order >> 16) & 0xff, (this.order >> 8) & 0xff, this.order & 0xff);
        this.serializeNode(this.root, arr);
        fs.writeFileSync(this.idxPath, Buffer.from(arr));
        this.dirty = false;
    }
    // ── Core B-Tree ops ───────────────────────────────────────────────────────
    find(key) {
        return this.findInNode(this.root, key);
    }
    findInNode(node, key) {
        let lo = 0, hi = node.entries.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            const cmp = node.entries[mid].key.localeCompare(key);
            if (cmp === 0)
                return node.entries[mid];
            if (cmp < 0)
                lo = mid + 1;
            else
                hi = mid - 1;
        }
        if (node.isLeaf)
            return null;
        return this.findInNode(node.children[lo], key);
    }
    insert(entry) {
        this.dirty = true;
        const root = this.root;
        if (root.entries.length === this.order - 1) {
            const newRoot = new PBTreeNode(false);
            newRoot.children.push(root);
            this.splitChild(newRoot, 0);
            this.root = newRoot;
        }
        this.insertNonFull(this.root, entry);
    }
    update(entry) {
        this.dirty = true;
        this.updateInNode(this.root, entry);
    }
    updateInNode(node, entry) {
        let lo = 0, hi = node.entries.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            const cmp = node.entries[mid].key.localeCompare(entry.key);
            if (cmp === 0) {
                node.entries[mid] = entry;
                return true;
            }
            if (cmp < 0)
                lo = mid + 1;
            else
                hi = mid - 1;
        }
        if (node.isLeaf)
            return false;
        return this.updateInNode(node.children[lo], entry);
    }
    delete(key) {
        this.dirty = true;
        this.deleteFromNode(this.root, key);
        // collapse empty root
        if (!this.root.isLeaf && this.root.entries.length === 0 && this.root.children.length > 0)
            this.root = this.root.children[0];
    }
    deleteFromNode(node, key) {
        let lo = 0, hi = node.entries.length - 1, idx = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            const cmp = node.entries[mid].key.localeCompare(key);
            if (cmp === 0) {
                idx = mid;
                break;
            }
            if (cmp < 0)
                lo = mid + 1;
            else
                hi = mid - 1;
        }
        if (idx !== -1) {
            if (node.isLeaf) {
                node.entries.splice(idx, 1);
            }
            else {
                // replace with in-order predecessor
                const pred = this.getRightmost(node.children[idx]);
                node.entries[idx] = pred;
                this.deleteFromNode(node.children[idx], pred.key);
                this.fixChild(node, idx);
            }
        }
        else {
            if (node.isLeaf)
                return;
            const ci = lo; // child index
            this.deleteFromNode(node.children[ci], key);
            this.fixChild(node, ci);
        }
    }
    getRightmost(node) {
        if (node.isLeaf)
            return node.entries[node.entries.length - 1];
        return this.getRightmost(node.children[node.children.length - 1]);
    }
    fixChild(parent, ci) {
        const minKeys = Math.floor((this.order - 1) / 2);
        const child = parent.children[ci];
        if (child.entries.length >= minKeys)
            return;
        const leftSib = ci > 0 ? parent.children[ci - 1] : null;
        const rightSib = ci < parent.children.length - 1 ? parent.children[ci + 1] : null;
        if (leftSib && leftSib.entries.length > minKeys) {
            // rotate right
            child.entries.unshift(parent.entries[ci - 1]);
            parent.entries[ci - 1] = leftSib.entries.pop();
            if (!leftSib.isLeaf)
                child.children.unshift(leftSib.children.pop());
        }
        else if (rightSib && rightSib.entries.length > minKeys) {
            // rotate left
            child.entries.push(parent.entries[ci]);
            parent.entries[ci] = rightSib.entries.shift();
            if (!rightSib.isLeaf)
                child.children.push(rightSib.children.shift());
        }
        else {
            // merge
            if (leftSib) {
                leftSib.entries.push(parent.entries.splice(ci - 1, 1)[0], ...child.entries);
                if (!child.isLeaf)
                    leftSib.children.push(...child.children);
                parent.children.splice(ci, 1);
            }
            else if (rightSib) {
                child.entries.push(parent.entries.splice(ci, 1)[0], ...rightSib.entries);
                if (!rightSib.isLeaf)
                    child.children.push(...rightSib.children);
                parent.children.splice(ci + 1, 1);
            }
        }
    }
    insertNonFull(node, entry) {
        let i = node.entries.length - 1;
        if (node.isLeaf) {
            node.entries.push(null);
            while (i >= 0 && entry.key < node.entries[i].key) {
                node.entries[i + 1] = node.entries[i];
                i--;
            }
            node.entries[i + 1] = entry;
        }
        else {
            while (i >= 0 && entry.key < node.entries[i].key)
                i--;
            i++;
            if (node.children[i].entries.length === this.order - 1) {
                this.splitChild(node, i);
                if (entry.key > node.entries[i].key)
                    i++;
            }
            this.insertNonFull(node.children[i], entry);
        }
    }
    splitChild(parent, i) {
        const mid = Math.floor((this.order - 1) / 2);
        const child = parent.children[i];
        const sibling = new PBTreeNode(child.isLeaf);
        parent.entries.splice(i, 0, child.entries[mid]);
        parent.children.splice(i + 1, 0, sibling);
        sibling.entries = child.entries.splice(mid + 1);
        child.entries.splice(mid);
        if (!child.isLeaf) {
            sibling.children = child.children.splice(mid + 1);
        }
    }
    // ── Full scan (used by find/filter when no index key given) ───────────────
    allEntries() {
        const result = [];
        this.traverseNode(this.root, result);
        return result;
    }
    traverseNode(node, result) {
        for (let i = 0; i < node.entries.length; i++) {
            if (!node.isLeaf)
                this.traverseNode(node.children[i], result);
            result.push(node.entries[i]);
        }
        if (!node.isLeaf && node.children.length > node.entries.length)
            this.traverseNode(node.children[node.entries.length], result);
    }
}
// ─── BSON Page Store ───────────────────────────────────────────────────────────
//
//  Records are appended to a .bson data file.
//  Each record:
//    [4 bytes: BSON doc length]  ← standard BSON prefix, tells us how many bytes to read
//    [N bytes: BSON document  ]
//
//  Deleted / updated records are marked with a tombstone (first byte = 0x00).
//  The B-Tree index always points to the latest live offset.
//  A compaction step rewrites the file removing tombstones (triggered manually or at threshold).
const TOMBSTONE = 0x00;
class BSONPageStore {
    dataPath;
    walPath;
    fd = null;
    fileSize = 0;
    constructor(dataPath) {
        this.dataPath = dataPath;
        this.walPath = dataPath + '.wal';
        this.open();
        this.replayWAL();
    }
    open() {
        const exists = fs.existsSync(this.dataPath);
        this.fd = fs.openSync(this.dataPath, exists ? 'r+' : 'w+');
        this.fileSize = fs.fstatSync(this.fd).size;
    }
    close() {
        if (this.fd !== null) {
            fs.closeSync(this.fd);
            this.fd = null;
        }
    }
    // ── WAL ──────────────────────────────────────────────────────────────────
    // WAL entry: [1 byte: type] [8 bytes: offset] [4 bytes: len] [len bytes: data]
    // type 0x01 = append, type 0x02 = tombstone
    writeWAL(type, offset, data) {
        const entry = Buffer.allocUnsafe(1 + 8 + 4 + data.length);
        entry[0] = type;
        // offset as two 32-bit halves
        const hi = Math.floor(offset / 0x100000000);
        const lo = offset >>> 0;
        entry.writeUInt32BE(hi, 1);
        entry.writeUInt32BE(lo, 5);
        entry.writeUInt32BE(data.length, 9);
        data.copy(entry, 13);
        fs.appendFileSync(this.walPath, entry);
    }
    replayWAL() {
        if (!fs.existsSync(this.walPath))
            return;
        try {
            const buf = fs.readFileSync(this.walPath);
            let pos = 0;
            while (pos < buf.length) {
                if (pos + 13 > buf.length)
                    break;
                const type = buf[pos++];
                const hi = buf.readUInt32BE(pos);
                pos += 4;
                const lo = buf.readUInt32BE(pos);
                pos += 4;
                const offset = hi * 0x100000000 + lo;
                const len = buf.readUInt32BE(pos);
                pos += 4;
                if (pos + len > buf.length)
                    break;
                const data = buf.slice(pos, pos + len);
                pos += len;
                if (type === 0x01) {
                    // append: write to data file at offset
                    if (this.fd !== null) {
                        fs.writeSync(this.fd, data, 0, data.length, offset);
                        if (offset + data.length > this.fileSize)
                            this.fileSize = offset + data.length;
                    }
                }
                else if (type === 0x02) {
                    // tombstone
                    if (this.fd !== null) {
                        const t = Buffer.from([TOMBSTONE]);
                        fs.writeSync(this.fd, t, 0, 1, offset + 4); // +4 to skip BSON length prefix
                    }
                }
            }
        }
        catch { /* corrupt WAL, ignore */ }
        // clear WAL after replay
        try {
            fs.writeFileSync(this.walPath, '');
        }
        catch { /* ignore */ }
    }
    // ── Append ───────────────────────────────────────────────────────────────
    append(doc) {
        const bsonDoc = BSON.serialize(doc);
        // 4-byte length prefix (little-endian, same as BSON spec)
        const lenBuf = Buffer.allocUnsafe(4);
        lenBuf.writeUInt32LE(bsonDoc.length, 0);
        const record = Buffer.concat([lenBuf, bsonDoc]);
        const offset = this.fileSize;
        this.writeWAL(0x01, offset, record);
        if (this.fd !== null) {
            fs.writeSync(this.fd, record, 0, record.length, offset);
        }
        this.fileSize += record.length;
        return { offset, len: record.length };
    }
    // ── Read single record ────────────────────────────────────────────────────
    read(offset, len) {
        if (this.fd === null || offset + len > this.fileSize)
            return null;
        const buf = Buffer.allocUnsafe(len);
        fs.readSync(this.fd, buf, 0, len, offset);
        // check tombstone (first byte of BSON doc, which is at buf[4])
        if (buf[4] === TOMBSTONE)
            return null;
        const bsonLen = buf.readUInt32LE(0);
        const bsonBuf = buf.slice(4, 4 + bsonLen);
        try {
            return BSON.deserialize(bsonBuf);
        }
        catch {
            return null;
        }
    }
    // ── Tombstone (soft delete) ───────────────────────────────────────────────
    tombstone(offset) {
        const marker = Buffer.from([TOMBSTONE]);
        this.writeWAL(0x02, offset, marker);
        if (this.fd !== null) {
            fs.writeSync(this.fd, marker, 0, 1, offset + 4);
        }
    }
    // ── Compact ──────────────────────────────────────────────────────────────
    // Rewrites the data file removing all tombstoned records.
    // Returns a map of old offset → new offset for index rebuilding.
    compact(liveEntries) {
        const tmpPath = this.dataPath + '.tmp';
        const tmpFd = fs.openSync(tmpPath, 'w');
        const remap = new Map();
        let writePos = 0;
        for (const entry of liveEntries) {
            const doc = this.read(entry.offset, entry.len);
            if (!doc)
                continue;
            const bsonDoc = BSON.serialize(doc);
            const lenBuf = Buffer.allocUnsafe(4);
            lenBuf.writeUInt32LE(bsonDoc.length, 0);
            const record = Buffer.concat([lenBuf, bsonDoc]);
            fs.writeSync(tmpFd, record, 0, record.length, writePos);
            remap.set(entry.offset, { offset: writePos, len: record.length });
            writePos += record.length;
        }
        fs.closeSync(tmpFd);
        this.close();
        fs.renameSync(tmpPath, this.dataPath);
        this.open();
        return remap;
    }
    getFileSize() { return this.fileSize; }
}
// ─── QueryResult ───────────────────────────────────────────────────────────────
export class QueryResult {
    data;
    err;
    constructor(data, err) {
        if (err) {
            this.err = err;
            this.data = [];
        }
        else {
            this.data = Array.isArray(data) ? data : [];
        }
    }
    getList(offset = 0, limit = 10) {
        if (this.err)
            return { err: this.err };
        return this.data.slice(offset, offset + limit);
    }
    count() {
        if (this.err)
            return { err: this.err };
        return this.data.length;
    }
    sort(compareFn) {
        if (this.err)
            return this;
        return new QueryResult([...this.data].sort(compareFn));
    }
    all() {
        if (this.err)
            return { err: this.err };
        return this.data;
    }
}
// ─── eveloDB ───────────────────────────────────────────────────────────────────
export class eveloDB {
    config;
    handles = new Map();
    constructor(config = {}) {
        this.config = { ...defaultConfig, ...config };
        if (this.config.encode === 'bson' && this.config.encryption && this.config.encryptionKey)
            throw new Error('BSON encoding does not support encryption.');
        if (this.config.encode === 'bson') {
            if (!config.extension)
                this.config.extension = 'bson';
            this.config.tabspace = 0;
            this.config.encryption = null;
            this.config.encryptionKey = null;
        }
        if (this.config.encryption) {
            const key = this.config.encryptionKey;
            const algorithm = this.config.encryption;
            if (!key)
                throw new Error('Encryption key required when encryption is enabled');
            const keyLengths = {
                'aes-128-cbc': 32, 'aes-192-cbc': 48, 'aes-256-cbc': 64,
                'aes-128-gcm': 32, 'aes-256-gcm': 64,
            };
            const expectedLength = keyLengths[algorithm];
            if (!expectedLength)
                throw new Error(`Unsupported encryption algorithm: ${algorithm}`);
            if (key.length !== expectedLength)
                throw new Error(`${algorithm.toUpperCase()} requires a ${expectedLength}-character hex key`);
        }
        if (!fs.existsSync(this.config.directory))
            fs.mkdirSync(this.config.directory, { recursive: true });
    }
    // ── Collection handle management ──────────────────────────────────────────
    getHandle(collection) {
        if (this.handles.has(collection))
            return this.handles.get(collection);
        const dataPath = `${this.config.directory}/${collection}.bson`;
        const idxPath = `${this.config.directory}/${collection}.bidx`;
        const handle = {
            store: new BSONPageStore(dataPath),
            index: new PersistedBTree(idxPath, 128),
        };
        this.handles.set(collection, handle);
        return handle;
    }
    flushHandle(collection) {
        const h = this.handles.get(collection);
        if (h)
            h.index.flush();
    }
    // Close and flush all open handles (call on process exit)
    closeAll() {
        for (const [name, h] of this.handles) {
            h.index.flush();
            h.store.close();
            this.handles.delete(name);
        }
    }
    // ── Primary key helpers ───────────────────────────────────────────────────
    pkName() {
        return typeof this.config.autoPrimaryKey === 'string' &&
            this.config.autoPrimaryKey.length > 0
            ? this.config.autoPrimaryKey
            : '_id';
    }
    generateUniqueId() {
        if (this.config.encode === 'bson' && this.config.objectId)
            return new ObjectId();
        const timestamp = Date.now().toString(36);
        const randomStr = Math.random().toString(36).substring(2, 10);
        return `${timestamp}${randomStr}`;
    }
    generateKey(length) { return generateKey(length); }
    // ── JSON path (unchanged — small, human-readable) ─────────────────────────
    getJsonPath(collection) {
        return `${this.config.directory}/${collection}.${this.config.extension}`;
    }
    encryptData(data) {
        return encrypt(data, this.config.encryptionKey, this.config.encryption);
    }
    decryptData(data) {
        return decrypt(data, this.config.encryptionKey, this.config.encryption);
    }
    readJson(collection) {
        const p = this.getJsonPath(collection);
        if (!fs.existsSync(p))
            return [];
        const raw = fs.readFileSync(p, 'utf8');
        const parsed = this.config.encryption ? this.decryptData(raw) : JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    writeJson(collection, data) {
        const p = this.getJsonPath(collection);
        const content = this.config.encryption
            ? this.encryptData(data)
            : JSON.stringify(data, null, this.config.tabspace);
        fs.writeFileSync(p, content);
    }
    // ── Condition matching ────────────────────────────────────────────────────
    matchesConditions(item, conditions) {
        return Object.entries(conditions).every(([key, value]) => {
            const fieldValue = item[key];
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                const keys = Object.keys(value);
                if (keys.length > 0 && keys.every(k => k.startsWith('$'))) {
                    const cond = value;
                    return Object.entries(cond).every(([op, condVal]) => {
                        switch (op) {
                            case '$eq': return deepCompare(fieldValue, condVal);
                            case '$ne': return !deepCompare(fieldValue, condVal);
                            case '$gt': return fieldValue > condVal;
                            case '$gte': return fieldValue >= condVal;
                            case '$lt': return fieldValue < condVal;
                            case '$lte': return fieldValue <= condVal;
                            case '$in': return Array.isArray(condVal) && condVal.includes(fieldValue);
                            case '$nin': return Array.isArray(condVal) && !condVal.includes(fieldValue);
                            case '$regex': {
                                const r = new RegExp(condVal, (cond.$options ?? 'i'));
                                return r.test(String(fieldValue));
                            }
                            default: return false;
                        }
                    });
                }
            }
            return deepCompare(fieldValue, value);
        });
    }
    // ── CRUD — BSON path ──────────────────────────────────────────────────────
    bsonCreate(collection, data) {
        const h = this.getHandle(collection);
        const pk = this.pkName();
        if (!data[pk])
            data[pk] = this.generateUniqueId();
        const key = String(data[pk]);
        if (this.config.noRepeat) {
            // noRepeat needs a full scan — acceptable for BSON mode too
            const all = this.bsonAll(collection);
            const dup = all.some(item => Object.keys(data).every(k => k === pk || deepCompare(item[k], data[k])));
            if (dup)
                return { err: 'Duplicate data (noRepeat enabled)', code: 'DUPLICATE_DATA' };
        }
        const { offset, len } = h.store.append(data);
        h.index.insert({ key, offset, len });
        this.flushHandle(collection);
        return { success: true, [pk]: data[pk] };
    }
    bsonFindOne(collection, conditions) {
        const pk = this.pkName();
        const pkVal = conditions[pk];
        if (pkVal !== undefined && typeof pkVal !== 'object') {
            // fast path: direct index lookup
            const h = this.getHandle(collection);
            const entry = h.index.find(String(pkVal));
            if (!entry)
                return null;
            const doc = h.store.read(entry.offset, entry.len);
            if (!doc)
                return null;
            return this.matchesConditions(doc, conditions) ? doc : null;
        }
        // slow path: full scan
        const all = this.bsonAll(collection);
        return (all.find(item => this.matchesConditions(item, conditions)) ?? null);
    }
    bsonFind(collection, conditions) {
        const pk = this.pkName();
        const pkVal = conditions[pk];
        if (pkVal !== undefined && typeof pkVal !== 'object') {
            const doc = this.bsonFindOne(collection, conditions);
            return doc ? [doc] : [];
        }
        const all = this.bsonAll(collection);
        return all.filter(item => this.matchesConditions(item, conditions));
    }
    bsonAll(collection) {
        const h = this.getHandle(collection);
        const entries = h.index.allEntries();
        const results = [];
        for (const e of entries) {
            const doc = h.store.read(e.offset, e.len);
            if (doc)
                results.push(doc);
        }
        return results;
    }
    bsonDelete(collection, conditions) {
        const pk = this.pkName();
        const pkVal = conditions[pk];
        const h = this.getHandle(collection);
        let deletedCount = 0;
        if (pkVal !== undefined && typeof pkVal !== 'object') {
            // fast path
            const key = String(pkVal);
            const entry = h.index.find(key);
            if (entry) {
                const doc = h.store.read(entry.offset, entry.len);
                if (doc && this.matchesConditions(doc, conditions)) {
                    h.store.tombstone(entry.offset);
                    h.index.delete(key);
                    deletedCount = 1;
                }
            }
        }
        else {
            // full scan
            const entries = h.index.allEntries();
            for (const e of entries) {
                const doc = h.store.read(e.offset, e.len);
                if (doc && this.matchesConditions(doc, conditions)) {
                    h.store.tombstone(e.offset);
                    h.index.delete(e.key);
                    deletedCount++;
                }
            }
        }
        this.flushHandle(collection);
        return { success: true, deletedCount };
    }
    bsonEdit(collection, conditions, newData) {
        const pk = this.pkName();
        const h = this.getHandle(collection);
        let modifiedCount = 0;
        const toUpdate = this.bsonFind(collection, conditions);
        if (toUpdate.length === 0)
            return { err: 'No matching records found', code: 'NO_MATCH' };
        for (const doc of toUpdate) {
            const key = String(doc[pk]);
            const entry = h.index.find(key);
            if (!entry)
                continue;
            const updated = { ...doc, ...newData, [pk]: doc[pk] };
            if (this.config.noRepeat) {
                const all = this.bsonAll(collection);
                const dup = all.some(item => String(item[pk]) !== key && deepCompare(item, updated));
                if (dup)
                    continue;
            }
            // tombstone old, append new
            h.store.tombstone(entry.offset);
            const { offset, len } = h.store.append(updated);
            h.index.update({ key, offset, len });
            modifiedCount++;
        }
        this.flushHandle(collection);
        return { success: true, modifiedCount };
    }
    bsonDrop(collection) {
        this.flushHandle(collection);
        const h = this.handles.get(collection);
        if (h) {
            h.store.close();
            this.handles.delete(collection);
        }
        const dataPath = `${this.config.directory}/${collection}.bson`;
        const idxPath = `${this.config.directory}/${collection}.bidx`;
        const walPath = `${this.config.directory}/${collection}.bson.wal`;
        let deleted = 0;
        for (const p of [dataPath, idxPath, walPath]) {
            if (fs.existsSync(p)) {
                fs.unlinkSync(p);
                deleted++;
            }
        }
        return deleted > 0 ? { success: true, deletedCount: deleted } : { err: 404 };
    }
    // ── Compaction (BSON only) ────────────────────────────────────────────────
    // Call this manually when you want to reclaim disk space from tombstoned records.
    compact(collection) {
        if (this.config.encode !== 'bson')
            return { success: false, err: 'Only available in BSON mode' };
        const h = this.getHandle(collection);
        const entries = h.index.allEntries();
        const remap = h.store.compact(entries);
        // update index with new offsets
        for (const entry of entries) {
            const newPos = remap.get(entry.offset);
            if (newPos)
                h.index.update({ key: entry.key, offset: newPos.offset, len: newPos.len });
            else
                h.index.delete(entry.key);
        }
        this.flushHandle(collection);
        return { success: true };
    }
    // ── Public CRUD ───────────────────────────────────────────────────────────
    create(collection, data) {
        if (!collection)
            return { err: 'Collection name required' };
        if (/[/\\.\ ]/.test(collection))
            return { err: 'Invalid collection name' };
        if (!data || typeof data !== 'object')
            return { err: 'Valid data object required' };
        if (this.config.encode === 'bson')
            return this.bsonCreate(collection, { ...data });
        // JSON path (unchanged behaviour)
        const db = this.readJson(collection);
        const pk = this.pkName();
        const object = { ...data };
        if (this.config.noRepeat) {
            const dup = db.some(existing => Object.keys(data).every(k => k === pk || deepCompare(existing[k], data[k])));
            if (dup)
                return { err: 'Duplicate data (noRepeat enabled)', code: 'DUPLICATE_DATA' };
        }
        if (!object[pk])
            object[pk] = this.generateUniqueId();
        db.push(object);
        this.writeJson(collection, db);
        return { success: true, [pk]: object[pk] };
    }
    delete(collection, conditions) {
        if (!collection)
            return { err: 'collection required!' };
        if (!conditions)
            return { err: 'conditions required!' };
        if (this.config.encode === 'bson')
            return this.bsonDelete(collection, conditions);
        const p = this.getJsonPath(collection);
        if (!fs.existsSync(p))
            return { err: 'Not found', code: 404 };
        const db = this.readJson(collection);
        const filtered = db.filter(item => !this.matchesConditions(item, conditions));
        this.writeJson(collection, filtered);
        return { success: true, deletedCount: db.length - filtered.length };
    }
    find(collection, conditions) {
        if (!collection)
            return new QueryResult(null, 'collection required!');
        if (!conditions)
            return new QueryResult(null, 'conditions required!');
        if (this.config.encode === 'bson')
            return new QueryResult(this.bsonFind(collection, conditions));
        const db = this.readJson(collection);
        return new QueryResult(db.filter(item => this.matchesConditions(item, conditions)));
    }
    findOne(collection, conditions) {
        if (!collection)
            return { err: 'collection required!' };
        if (!conditions)
            return { err: 'conditions required!' };
        if (this.config.encode === 'bson')
            return this.bsonFindOne(collection, conditions) ?? null;
        const db = this.readJson(collection);
        return (db.find(item => this.matchesConditions(item, conditions)) ?? null);
    }
    get(collection) {
        if (!collection)
            return new QueryResult(null, 'collection required!');
        if (this.config.encode === 'bson')
            return new QueryResult(this.bsonAll(collection));
        const data = this.readJson(collection);
        return new QueryResult(data);
    }
    edit(collection, conditions, newData) {
        if (!collection)
            return { err: 'Collection name required' };
        if (!conditions)
            return { err: 'Conditions required' };
        if (!newData)
            return { err: 'New data required' };
        if (this.config.encode === 'bson')
            return this.bsonEdit(collection, conditions, newData);
        const p = this.getJsonPath(collection);
        if (!fs.existsSync(p))
            return { err: 'Collection not found', code: 404 };
        const db = this.readJson(collection);
        const pk = this.pkName();
        let editedCount = 0, duplicateFound = false;
        const updatedDb = db.map(item => {
            if (!this.matchesConditions(item, conditions))
                return item;
            const updated = { ...item, ...newData };
            if (this.config.noRepeat) {
                const dup = db.some(e => e[pk] !== item[pk] && deepCompare(e, updated));
                if (dup) {
                    duplicateFound = true;
                    return item;
                }
            }
            editedCount++;
            return updated;
        });
        if (duplicateFound)
            return { err: 'Edit would create duplicate (noRepeat enabled)', code: 'DUPLICATE_DATA' };
        if (editedCount === 0)
            return { err: 'No matching records found', code: 'NO_MATCH' };
        this.writeJson(collection, updatedDb);
        return { success: true, modifiedCount: editedCount };
    }
    count(collection) {
        if (!collection)
            return { success: false, err: 'collection required!' };
        if (this.config.encode === 'bson') {
            const h = this.getHandle(collection);
            return { success: true, count: h.index.allEntries().length };
        }
        const db = this.readJson(collection);
        return { success: true, count: db.length };
    }
    check(collection, data) {
        if (!collection)
            return { err: 'collection required!' };
        if (!data)
            return { err: 'conditions required!' };
        const result = this.find(collection, data);
        if (result?.err)
            return { err: result.err };
        return result.all().length > 0;
    }
    search(collection, conditions) {
        if (!collection)
            return new QueryResult(null, 'collection required!');
        if (!conditions)
            return new QueryResult(null, 'conditions required!');
        const all = this.config.encode === 'bson'
            ? this.bsonAll(collection)
            : this.readJson(collection);
        const results = all.filter(item => Object.entries(conditions).every(([key, value]) => {
            const field = item[key];
            if (field == null)
                return false;
            if (value && typeof value === 'object' && value.$regex) {
                const cond = value;
                return new RegExp(cond.$regex, cond.$options ?? 'i').test(String(field));
            }
            return String(field).toLowerCase().includes(String(value).toLowerCase());
        }));
        return new QueryResult(results);
    }
    drop(collection) {
        if (!collection)
            return { err: 'collection required!' };
        if (this.config.encode === 'bson')
            return this.bsonDrop(collection);
        const p = this.getJsonPath(collection);
        if (fs.existsSync(p)) {
            fs.unlinkSync(p);
            return { success: true };
        }
        return { err: 404 };
    }
    reset(collection) { return this.drop(collection); }
    inject(collection, data) {
        if (!collection)
            return { err: 'collection required!' };
        if (this.config.encode === 'bson')
            return { err: 'inject() not supported in BSON mode' };
        fs.writeFileSync(this.getJsonPath(collection), JSON.stringify(data, null, this.config.tabspace));
        return { success: true };
    }
    writeData(collection, data) {
        return this.inject(collection, data);
    }
    readData(collection) {
        if (!collection)
            return { err: 'collection required!' };
        if (this.config.encode === 'bson')
            return this.bsonAll(collection);
        return this.readJson(collection);
    }
    // ── Config Migration ──────────────────────────────────────────────────────
    changeConfig({ from, to, collections }) {
        const keyLengths = {
            'aes-128-cbc': 32, 'aes-192-cbc': 48, 'aes-256-cbc': 64,
            'aes-128-gcm': 32, 'aes-256-gcm': 64,
        };
        const validate = (key, algo) => {
            if (!algo)
                return;
            if (!key || key.length !== keyLengths[algo])
                throw new Error(`${algo} requires ${keyLengths[algo]} hex characters`);
        };
        validate(from.encryptionKey, from.encryption);
        validate(to.encryptionKey, to.encryption);
        const fromDir = from.directory ?? this.config.directory;
        const toDir = to.directory ?? this.config.directory;
        const fromExt = from.extension ?? this.config.extension;
        const toExt = to.extension ?? this.config.extension;
        if (!fs.existsSync(toDir))
            fs.mkdirSync(toDir, { recursive: true });
        const files = fs.readdirSync(fromDir);
        let successCount = 0, errorCount = 0;
        files.forEach(file => {
            const ext = path.extname(file).slice(1);
            const name = path.basename(file, '.' + ext);
            if (ext !== fromExt)
                return;
            if (collections && !collections.includes(name))
                return;
            const fromPath = path.join(fromDir, file);
            const toPath = path.join(toDir, `${name}.${toExt}`);
            try {
                const raw = fs.readFileSync(fromPath, 'utf8');
                const json = from.encryption
                    ? decrypt(raw, from.encryptionKey, from.encryption)
                    : JSON.parse(raw);
                const newContent = to.encryption
                    ? encrypt(json, to.encryptionKey, to.encryption)
                    : JSON.stringify(json, null, 3);
                fs.writeFileSync(toPath, newContent);
                successCount++;
                if (fromPath !== toPath && fs.existsSync(fromPath))
                    fs.unlinkSync(fromPath);
            }
            catch (err) {
                console.error(`Failed to convert ${file}: ${err.message}`);
                errorCount++;
            }
        });
        if (fromDir !== toDir && fs.existsSync(fromDir)) {
            if (fs.readdirSync(fromDir).length === 0)
                fs.rmdirSync(fromDir, { recursive: true });
        }
        return { success: true, converted: successCount, failed: errorCount };
    }
    // ── AI Analysis ───────────────────────────────────────────────────────────
    async analyse({ collection, filter, data, model, apiKey, query, }) {
        if (data && !Array.isArray(data))
            return { success: false, err: 'Data must be an array' };
        if (data && collection)
            return { success: false, err: 'Cannot specify collection when data is provided' };
        if (!model)
            return { success: false, err: 'Model is required' };
        if (!apiKey)
            return { success: false, err: 'API Key is required' };
        if (!query)
            return { success: false, err: 'Query is required' };
        if (query.length > 1024)
            return { success: false, err: 'Query exceeds 1024 characters' };
        let collData = data ?? [];
        if (!data) {
            const getResult = this.get(collection);
            if (getResult?.err)
                return { success: false, err: getResult.err };
            collData = getResult.all();
        }
        if (filter)
            collData = collData.filter(item => this.matchesConditions(item, filter));
        if (collData.length === 0)
            return { success: false, err: 'No matching data found' };
        const genAI = new GoogleGenAI({ apiKey });
        const prompt = `
Analyze the following data array according to the specified conditions.
Return a JSON response with the exact structure shown in the example.

Example Response Format:
{
    "indexes": [0, 2, 3],
    "reason": "These items match the criteria because...",
    "message": "Additional insights about the selection"
}

Data to Analyze:
${JSON.stringify(collData, null, 2)}

Conditions:
${query}

Important Rules:
1. Only return valid JSON in the specified format
2. "indexes" must be array of numbers matching data array indices
3. "reason" should explain your selection logic
4. Keep the response concise but meaningful
`;
        try {
            const response = await genAI.models.generateContent({ model, contents: prompt });
            const cleanResponse = (response.text || '').replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(cleanResponse);
            if (!parsed.indexes || !Array.isArray(parsed.indexes))
                throw new Error('Invalid response format: missing indexes array');
            return {
                success: true,
                response: { ...parsed, data: parsed.indexes.map(i => collData[i]) },
            };
        }
        catch (error) {
            return { success: false, err: error.message ?? 'Failed to process AI response' };
        }
    }
    // ── File Storage (unchanged) ──────────────────────────────────────────────
    writeFile(name, data) {
        if (!name)
            return { err: 'File name required' };
        if (!data)
            return { err: 'Data required' };
        if (name.includes('/') || name.includes('\\'))
            return { err: 'Invalid file name' };
        if (!Buffer.isBuffer(data))
            return { err: 'Data must be a Buffer' };
        const filesDir = `${this.config.directory}/files`;
        if (!fs.existsSync(filesDir))
            fs.mkdirSync(filesDir, { recursive: true });
        try {
            fs.writeFileSync(`${filesDir}/${name}`, data);
            return { success: true };
        }
        catch (error) {
            return { err: `Failed to write file: ${error.message}` };
        }
    }
    allFiles() {
        const filesDir = `${this.config.directory}/files`;
        if (!fs.existsSync(filesDir))
            return [];
        return fs.readdirSync(filesDir);
    }
    readFile(name) {
        if (!name)
            return { err: 'File name required' };
        const filesDir = `${this.config.directory}/files`;
        const filePath = `${filesDir}/${name}`;
        if (!fs.existsSync(filePath))
            return { err: 'File not found', code: 404 };
        try {
            return { success: true, data: fs.readFileSync(filePath) };
        }
        catch (error) {
            return { err: `Failed to read file: ${error.message}` };
        }
    }
    async readImage(name, config = {}) {
        if (!name)
            return { err: 'File name required' };
        if (name.includes('/') || name.includes('\\'))
            return { err: 'Invalid file name' };
        const filesDir = `${this.config.directory}/files`;
        const filePath = `${filesDir}/${name}`;
        if (!fs.existsSync(filePath))
            return { err: 'File not found', code: 404 };
        const imageExtensions = [
            '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp',
            '.tiff', '.svg', '.ico', '.heic', '.avif', '.jfif',
        ];
        const ext = path.extname(name).toLowerCase();
        if (!imageExtensions.includes(ext))
            return { err: 'Not a valid image file' };
        try {
            const data = fs.readFileSync(filePath);
            const processingConfig = {
                returnBase64: config.returnBase64 !== false,
                quality: Math.max(0.1, Math.min(1, config.quality ?? 1)),
                pixels: Math.max(0, config.pixels ?? 0),
                blackAndWhite: Boolean(config.blackAndWhite),
                mirror: Boolean(config.mirror),
                upToDown: Boolean(config.upToDown),
                invert: Boolean(config.invert),
                brightness: Math.max(0.1, Math.min(5, config.brightness ?? 1)),
                contrast: Math.max(0.1, Math.min(5, config.contrast ?? 1)),
                maxWidth: (config.maxWidth ?? 0) > 0 ? Math.round(config.maxWidth) : null,
                maxHeight: (config.maxHeight ?? 0) > 0 ? Math.round(config.maxHeight) : null,
            };
            const res = await imageProcess(data, ext, processingConfig);
            const stats = fs.statSync(filePath);
            return {
                success: true,
                data: res,
                metadata: {
                    filename: name, extension: ext, originalSize: stats.size,
                    processingApplied: {
                        resized: processingConfig.pixels > 0,
                        qualityReduced: processingConfig.quality < 1,
                        blackAndWhite: processingConfig.blackAndWhite,
                        mirrored: processingConfig.mirror,
                        flippedVertical: processingConfig.upToDown,
                        inverted: processingConfig.invert,
                        brightnessAdjusted: processingConfig.brightness !== 1,
                        contrastAdjusted: processingConfig.contrast !== 1,
                    },
                },
            };
        }
        catch (error) {
            return { err: `Failed to process image: ${error.message}`, code: 'PROCESSING_ERROR' };
        }
    }
    deleteFile(name) {
        if (!name)
            return { err: 'File name required' };
        const filePath = `${this.config.directory}/files/${name}`;
        if (!fs.existsSync(filePath))
            return { err: 'File not found', code: 404 };
        try {
            fs.unlinkSync(filePath);
            return { success: true };
        }
        catch (error) {
            return { err: `Failed to delete file: ${error.message}` };
        }
    }
}
export default eveloDB;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = eveloDB;
    module.exports.default = eveloDB;
    module.exports.eveloDB = eveloDB;
}
