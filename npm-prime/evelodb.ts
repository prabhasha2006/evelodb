import * as fs from 'fs';
import * as path from 'path';
import { BSON, ObjectId } from 'bson';
import imageProcess from './imageProcess.js';
import { BackupManager } from './backup.js';

// ─── Type Definitions ──────────────────────────────────────────────────────────

export interface CollectionSchema {
  fields?: Record<string, any>;
  indexes?: string[];
  uniqueKeys?: string[];
  objectIdKey?: string;
  noRepeat?: boolean;
}

export interface EveloDBConfig {
  directory?: string;
  maxHandles?: number;
  compactThreshold?: number;
  schema?: Record<string, CollectionSchema>;
}

export interface ReadImageConfig {
  returnBase64?: boolean;
  quality?: number;
  pixels?: number;
  blackAndWhite?: boolean;
  mirror?: boolean;
  upToDown?: boolean;
  invert?: boolean;
  brightness?: number;
  contrast?: number;
  maxWidth?: number | null;
  maxHeight?: number | null;
}


export interface WriteResult {
  success?: boolean;
  err?: string;
  code?: string | number;
  _id?: string | ObjectId;
  [key: string]: any;
}


export interface BackupResult {
  success: boolean;
  err?: string;
  backupPath?: string;
}

export interface DeleteResult {
  success?: boolean;
  err?: string;
  code?: number | string;
  deletedCount?: number;
}

export interface EditResult {
  success?: boolean;
  err?: boolean | string;
  code?: string | number;
  modifiedCount?: number;
  skippedDuplicates?: number;
}

export interface CountResult {
  success: boolean;
  count?: number;
  err?: string;
}

export interface DropResult {
  success?: boolean;
  err?: string | number;
  code?: string | number;
  deletedCount?: number;
  message?: string;
}

export interface FileResult {
  success?: boolean;
  err?: string;
  code?: string | number;
  data?: Buffer;
}

export interface ReadImageResult {
  success?: boolean;
  err?: string;
  code?: string | number;
  data?: unknown;
  metadata?: {
    filename: string;
    extension: string;
    originalSize: number;
    processingApplied: {
      resized: boolean;
      qualityReduced: boolean;
      blackAndWhite: boolean;
      mirrored: boolean;
      flippedVertical: boolean;
      inverted: boolean;
      brightnessAdjusted: boolean;
      contrastAdjusted: boolean;
    };
  };
}

export interface ObjectResult<T = any> {
  success: boolean;
  data?: T;
  err?: string;
  code?: string | number;
}

export interface Condition {
  $eq?: unknown;
  $ne?: unknown;
  $gt?: unknown;
  $gte?: unknown;
  $lt?: unknown;
  $lte?: unknown;
  $in?: unknown[];
  $nin?: unknown[];
  $regex?: string;
  $options?: string;
}

export type Conditions = Record<string, unknown | Condition>;

// ─── Object Store Handler ───────────────────────────────────────────────────

class ObjectStore {
  private baseDir: string;

  constructor(private dbDir: string, private name?: string) {
    this.baseDir = `${this.dbDir}/objects`;
    if (!fs.existsSync(this.baseDir)) fs.mkdirSync(this.baseDir, { recursive: true });
  }

  private getPath(name: string): string {
    return `${this.baseDir}/${name}.objdb`;
  }

  read<T = any>(): T | null {
    if (!this.name) return null;
    const p = this.getPath(this.name);
    if (!fs.existsSync(p)) return null;
    try {
      return BSON.deserialize(fs.readFileSync(p)) as T;
    } catch { return null; }
  }

  write(data: Record<string, any>): ObjectResult {
    if (!this.name) return { success: false, err: 'Object name required' };
    try {
      fs.writeFileSync(this.getPath(this.name), BSON.serialize(data));
      return { success: true };
    } catch (e) { return { success: false, err: (e as Error).message }; }
  }

  update(data: Record<string, any>): ObjectResult {
    if (!this.name) return { success: false, err: 'Object name required' };
    const current = this.read() || {};
    return this.write({ ...current, ...data });
  }

  delete(): ObjectResult {
    if (!this.name) return { success: false, err: 'Object name required' };
    const p = this.getPath(this.name);
    if (!fs.existsSync(p)) return { success: false, err: 'Not found' };
    try {
      fs.unlinkSync(p);
      return { success: true };
    } catch (e) { return { success: false, err: (e as Error).message }; }
  }

  rename(newName: string): ObjectResult {
    if (!this.name || !newName) return { success: false, err: 'Names required' };
    const oldP = this.getPath(this.name);
    const newP = this.getPath(newName);
    if (!fs.existsSync(oldP)) return { success: false, err: 'Not found' };
    try {
      fs.renameSync(oldP, newP);
      this.name = newName;
      return { success: true };
    } catch (e) { return { success: false, err: (e as Error).message }; }
  }

  list(): string[] {
    if (!fs.existsSync(this.baseDir)) return [];
    return fs.readdirSync(this.baseDir)
      .filter(f => f.endsWith('.objdb'))
      .map(f => f.replace('.objdb', ''));
  }
}

// ─── Default Config ────────────────────────────────────────────────────────────

const defaultConfig: Required<EveloDBConfig> = {
  directory: './evelodbprime',
  maxHandles: 64,
  compactThreshold: 0.3,
  schema: {},
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function deepCompare(obj1: unknown, obj2: unknown): boolean {
  if (obj1 === obj2) return true;
  if (obj1 === null || obj2 === null || typeof obj1 !== 'object' || typeof obj2 !== 'object')
    return obj1 === obj2;

  const isArr1 = Array.isArray(obj1);
  const isArr2 = Array.isArray(obj2);
  if (isArr1 !== isArr2) return false;

  if (isArr1 && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) return false;
    for (let i = 0; i < obj1.length; i++)
      if (!deepCompare(obj1[i], obj2[i])) return false;
    return true;
  }

  const o1 = obj1 as Record<string, unknown>;
  const o2 = obj2 as Record<string, unknown>;
  const keys1 = Object.keys(o1);
  const keys2 = Object.keys(o2);
  if (keys1.length !== keys2.length) return false;
  for (const key of keys1)
    if (!Object.prototype.hasOwnProperty.call(o2, key) || !deepCompare(o1[key], o2[key]))
      return false;
  return true;
}

function keyCmp(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// ─── Persisted B-Tree ──────────────────────────────────────────────────────────

interface BTreeEntry {
  key: string;
  offset: number;
  len: number;
}

class PBTreeNode {
  entries: BTreeEntry[];
  children: PBTreeNode[];
  isLeaf: boolean;

  constructor(isLeaf: boolean) {
    this.entries = [];
    this.children = [];
    this.isLeaf = isLeaf;
  }
}

class PersistedBTree {
  private order: number;
  private root: PBTreeNode;
  private idxPath: string;
  private dirty: boolean;

  constructor(idxPath: string, order = 128) {
    this.order = order;
    this.idxPath = idxPath;
    this.dirty = false;
    this.root = this.load();
  }

  private serializeNode(node: PBTreeNode, buf: number[]): void {
    buf.push(node.isLeaf ? 1 : 0);
    const kc = node.entries.length;
    buf.push((kc >> 24) & 0xff, (kc >> 16) & 0xff, (kc >> 8) & 0xff, kc & 0xff);
    for (const e of node.entries) {
      const keyBuf = Buffer.from(e.key, 'utf8');
      const kl = keyBuf.length;
      buf.push((kl >> 8) & 0xff, kl & 0xff);
      for (let i = 0; i < kl; i++) buf.push(keyBuf[i]);
      const hi = Math.floor(e.offset / 0x100000000);
      const lo = e.offset >>> 0;
      buf.push(
        (hi >> 24) & 0xff, (hi >> 16) & 0xff, (hi >> 8) & 0xff, hi & 0xff,
        (lo >> 24) & 0xff, (lo >> 16) & 0xff, (lo >> 8) & 0xff, lo & 0xff
      );
      buf.push((e.len >> 24) & 0xff, (e.len >> 16) & 0xff, (e.len >> 8) & 0xff, e.len & 0xff);
    }
    const cc = node.children.length;
    buf.push((cc >> 24) & 0xff, (cc >> 16) & 0xff, (cc >> 8) & 0xff, cc & 0xff);
    for (const child of node.children) this.serializeNode(child, buf);
  }

  private deserializeNode(buf: Buffer, pos: { offset: number }): PBTreeNode {
    const isLeaf = buf[pos.offset++] === 1;
    const node = new PBTreeNode(isLeaf);
    const kc =
      ((buf[pos.offset] << 24) | (buf[pos.offset + 1] << 16) |
        (buf[pos.offset + 2] << 8) | buf[pos.offset + 3]) >>> 0;
    pos.offset += 4;
    for (let i = 0; i < kc; i++) {
      const kl = (buf[pos.offset] << 8) | buf[pos.offset + 1];
      pos.offset += 2;
      const key = buf.slice(pos.offset, pos.offset + kl).toString('utf8');
      pos.offset += kl;
      const hi =
        (buf[pos.offset] * 0x1000000) +
        ((buf[pos.offset + 1] << 16) | (buf[pos.offset + 2] << 8) | buf[pos.offset + 3]);
      const lo =
        (buf[pos.offset + 4] * 0x1000000) +
        ((buf[pos.offset + 5] << 16) | (buf[pos.offset + 6] << 8) | buf[pos.offset + 7]);
      const offset = hi * 0x100000000 + lo;
      pos.offset += 8;
      const len =
        ((buf[pos.offset] << 24) | (buf[pos.offset + 1] << 16) |
          (buf[pos.offset + 2] << 8) | buf[pos.offset + 3]) >>> 0;
      pos.offset += 4;
      node.entries.push({ key, offset, len });
    }
    const cc =
      ((buf[pos.offset] << 24) | (buf[pos.offset + 1] << 16) |
        (buf[pos.offset + 2] << 8) | buf[pos.offset + 3]) >>> 0;
    pos.offset += 4;
    for (let i = 0; i < cc; i++) node.children.push(this.deserializeNode(buf, pos));
    return node;
  }

  private load(): PBTreeNode {
    if (!fs.existsSync(this.idxPath)) return new PBTreeNode(true);
    try {
      const buf = fs.readFileSync(this.idxPath);
      if (buf.length < 5) return new PBTreeNode(true);
      const pos = { offset: 0 };
      this.order = ((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) >>> 0;
      pos.offset = 4;
      return this.deserializeNode(buf, pos);
    } catch (err) {
      const corrupt = this.idxPath + '.corrupt.' + Date.now();
      try { fs.renameSync(this.idxPath, corrupt); } catch { /* ignore */ }
      console.error(
        `[eveloDB] WARNING: corrupt index "${this.idxPath}" renamed to "${corrupt}". ` +
        `Index will be rebuilt from scratch. Error: ${(err as Error).message}`
      );
      return new PBTreeNode(true);
    }
  }

  flush(): void {
    if (!this.dirty) return;
    const arr: number[] = [];
    arr.push(
      (this.order >> 24) & 0xff, (this.order >> 16) & 0xff,
      (this.order >> 8) & 0xff, this.order & 0xff
    );
    this.serializeNode(this.root, arr);
    const tmp = this.idxPath + '.tmp';
    fs.writeFileSync(tmp, Buffer.from(arr));
    fs.renameSync(tmp, this.idxPath);
    this.dirty = false;
  }

  find(key: string): BTreeEntry | null {
    return this.findInNode(this.root, key);
  }

  private findInNode(node: PBTreeNode, key: string): BTreeEntry | null {
    let lo = 0, hi = node.entries.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const cmp = keyCmp(node.entries[mid].key, key);
      if (cmp === 0) return node.entries[mid];
      if (cmp < 0) lo = mid + 1;
      else hi = mid - 1;
    }
    if (node.isLeaf) return null;
    return this.findInNode(node.children[lo], key);
  }

  insert(entry: BTreeEntry): void {
    this.dirty = true;
    if (this.root.entries.length === this.order - 1) {
      const newRoot = new PBTreeNode(false);
      newRoot.children.push(this.root);
      this.splitChild(newRoot, 0);
      this.root = newRoot;
    }
    this.insertNonFull(this.root, entry);
  }

  update(entry: BTreeEntry): boolean {
    this.dirty = true;
    return this.updateInNode(this.root, entry);
  }

  private updateInNode(node: PBTreeNode, entry: BTreeEntry): boolean {
    let lo = 0, hi = node.entries.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const cmp = keyCmp(node.entries[mid].key, entry.key);
      if (cmp === 0) { node.entries[mid] = entry; return true; }
      if (cmp < 0) lo = mid + 1;
      else hi = mid - 1;
    }
    if (node.isLeaf) return false;
    return this.updateInNode(node.children[lo], entry);
  }

  delete(key: string): void {
    this.dirty = true;
    this.deleteFromNode(this.root, key);
    if (!this.root.isLeaf && this.root.entries.length === 0 && this.root.children.length > 0)
      this.root = this.root.children[0];
  }

  private deleteFromNode(node: PBTreeNode, key: string): void {
    let lo = 0, hi = node.entries.length - 1, idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const cmp = keyCmp(node.entries[mid].key, key);
      if (cmp === 0) { idx = mid; break; }
      if (cmp < 0) lo = mid + 1;
      else hi = mid - 1;
    }
    if (idx !== -1) {
      if (node.isLeaf) {
        node.entries.splice(idx, 1);
      } else {
        const pred = this.getRightmost(node.children[idx]);
        node.entries[idx] = pred;
        this.deleteFromNode(node.children[idx], pred.key);
        this.fixChild(node, idx);
      }
    } else {
      if (node.isLeaf) return;
      this.deleteFromNode(node.children[lo], key);
      this.fixChild(node, lo);
    }
  }

  private getRightmost(node: PBTreeNode): BTreeEntry {
    if (node.isLeaf) return node.entries[node.entries.length - 1];
    return this.getRightmost(node.children[node.children.length - 1]);
  }

  private fixChild(parent: PBTreeNode, ci: number): void {
    const minKeys = Math.floor((this.order - 1) / 2);
    const child = parent.children[ci];
    if (child.entries.length >= minKeys) return;
    const leftSib = ci > 0 ? parent.children[ci - 1] : null;
    const rightSib = ci < parent.children.length - 1 ? parent.children[ci + 1] : null;
    if (leftSib && leftSib.entries.length > minKeys) {
      child.entries.unshift(parent.entries[ci - 1]);
      parent.entries[ci - 1] = leftSib.entries.pop()!;
      if (!leftSib.isLeaf) child.children.unshift(leftSib.children.pop()!);
    } else if (rightSib && rightSib.entries.length > minKeys) {
      child.entries.push(parent.entries[ci]);
      parent.entries[ci] = rightSib.entries.shift()!;
      if (!rightSib.isLeaf) child.children.push(rightSib.children.shift()!);
    } else {
      if (leftSib) {
        leftSib.entries.push(parent.entries.splice(ci - 1, 1)[0], ...child.entries);
        if (!child.isLeaf) leftSib.children.push(...child.children);
        parent.children.splice(ci, 1);
      } else if (rightSib) {
        child.entries.push(parent.entries.splice(ci, 1)[0], ...rightSib.entries);
        if (!rightSib.isLeaf) child.children.push(...rightSib.children);
        parent.children.splice(ci + 1, 1);
      }
    }
  }

  private insertNonFull(node: PBTreeNode, entry: BTreeEntry): void {
    let i = node.entries.length - 1;
    if (node.isLeaf) {
      node.entries.push(null as unknown as BTreeEntry);
      while (i >= 0 && keyCmp(entry.key, node.entries[i].key) < 0) {
        node.entries[i + 1] = node.entries[i];
        i--;
      }
      node.entries[i + 1] = entry;
    } else {
      while (i >= 0 && keyCmp(entry.key, node.entries[i].key) < 0) i--;
      i++;
      if (node.children[i].entries.length === this.order - 1) {
        this.splitChild(node, i);
        if (keyCmp(entry.key, node.entries[i].key) > 0) i++;
      }
      this.insertNonFull(node.children[i], entry);
    }
  }

  private splitChild(parent: PBTreeNode, i: number): void {
    const mid = Math.floor((this.order - 1) / 2);
    const child = parent.children[i];
    const sibling = new PBTreeNode(child.isLeaf);
    parent.entries.splice(i, 0, child.entries[mid]);
    parent.children.splice(i + 1, 0, sibling);
    sibling.entries = child.entries.splice(mid + 1);
    child.entries.splice(mid);
    if (!child.isLeaf) sibling.children = child.children.splice(mid + 1);
  }

  allEntries(): BTreeEntry[] {
    const result: BTreeEntry[] = [];
    this.traverseNode(this.root, result);
    return result;
  }

  private traverseNode(node: PBTreeNode, result: BTreeEntry[]): void {
    for (let i = 0; i < node.entries.length; i++) {
      if (!node.isLeaf) this.traverseNode(node.children[i], result);
      result.push(node.entries[i]);
    }
    if (!node.isLeaf && node.children.length > node.entries.length)
      this.traverseNode(node.children[node.entries.length], result);
  }

  size(): number { return this.allEntries().length; }
}

// ─── BSON Page Store ───────────────────────────────────────────────────────────

const FLAG_LIVE = 0x01;
const FLAG_TOMBSTONE = 0x00;
const HEADER_SIZE = 5;

class BSONPageStore {
  private dataPath: string;
  private walPath: string;
  private fd: number | null = null;
  private fileSize: number = 0;
  tombstoneCount: number = 0;
  liveCount: number = 0;

  constructor(dataPath: string) {
    this.dataPath = dataPath;
    this.walPath = dataPath + '.wal';
    this.open();
    this.replayWAL();
  }

  private open(): void {
    const exists = fs.existsSync(this.dataPath);
    this.fd = fs.openSync(this.dataPath, exists ? 'r+' : 'w+');
    this.fileSize = fs.fstatSync(this.fd).size;
  }

  close(): void {
    if (this.fd !== null) { fs.closeSync(this.fd); this.fd = null; }
  }

  private writeWAL(type: number, offset: number, data: Buffer): void {
    const header = Buffer.allocUnsafe(13);
    header[0] = type;
    const hi = Math.floor(offset / 0x100000000);
    const lo = offset >>> 0;
    header.writeUInt32BE(hi, 1);
    header.writeUInt32BE(lo, 5);
    header.writeUInt32BE(data.length, 9);
    fs.appendFileSync(this.walPath, Buffer.concat([header, data]));
  }

  private replayWAL(): void {
    if (!fs.existsSync(this.walPath)) return;
    try {
      const buf = fs.readFileSync(this.walPath);
      let pos = 0;
      while (pos + 13 <= buf.length) {
        const type = buf[pos];
        const hi = buf.readUInt32BE(pos + 1);
        const lo = buf.readUInt32BE(pos + 5);
        const offset = hi * 0x100000000 + lo;
        const len = buf.readUInt32BE(pos + 9);
        pos += 13;
        if (pos + len > buf.length) break;
        const data = buf.slice(pos, pos + len);
        pos += len;
        if (this.fd === null) continue;
        if (type === 0x01) {
          fs.writeSync(this.fd, data, 0, data.length, offset);
          if (offset + data.length > this.fileSize) this.fileSize = offset + data.length;
          this.liveCount++;
        } else if (type === 0x02) {
          const flagBuf = Buffer.from([FLAG_TOMBSTONE]);
          fs.writeSync(this.fd, flagBuf, 0, 1, offset + 4);
          this.tombstoneCount++;
          this.liveCount = Math.max(0, this.liveCount - 1);
        }
      }
    } catch { /* skip */ }
    try { fs.writeFileSync(this.walPath, Buffer.alloc(0)); } catch { /* ignore */ }
  }

  append(doc: Record<string, unknown>): { offset: number; len: number } {
    const bsonDoc = BSON.serialize(doc);
    const header = Buffer.allocUnsafe(HEADER_SIZE);
    header.writeUInt32LE(bsonDoc.length, 0);
    header[4] = FLAG_LIVE;
    const record = Buffer.concat([header, bsonDoc]);
    const offset = this.fileSize;
    this.writeWAL(0x01, offset, record);
    if (this.fd !== null) fs.writeSync(this.fd, record, 0, record.length, offset);
    this.fileSize += record.length;
    this.liveCount++;
    return { offset, len: record.length };
  }

  read(offset: number, len: number): Record<string, unknown> | null {
    if (this.fd === null || offset < 0 || offset + len > this.fileSize) return null;
    const buf = Buffer.allocUnsafe(len);
    fs.readSync(this.fd, buf, 0, len, offset);
    if (buf[4] !== FLAG_LIVE) return null;
    const bodyLen = buf.readUInt32LE(0);
    if (bodyLen + HEADER_SIZE > len) return null;
    try { return BSON.deserialize(buf.slice(HEADER_SIZE, HEADER_SIZE + bodyLen)) as Record<string, unknown>; }
    catch { return null; }
  }

  tombstone(offset: number): void {
    this.writeWAL(0x02, offset, Buffer.alloc(0));
    if (this.fd !== null) {
      const flagBuf = Buffer.from([FLAG_TOMBSTONE]);
      fs.writeSync(this.fd, flagBuf, 0, 1, offset + 4);
    }
    this.tombstoneCount++;
    this.liveCount = Math.max(0, this.liveCount - 1);
  }

  compact(liveEntries: BTreeEntry[]): Map<number, { offset: number; len: number }> {
    const tmpPath = this.dataPath + '.compact.tmp';
    const tmpFd = fs.openSync(tmpPath, 'w');
    const remap = new Map<number, { offset: number; len: number }>();
    let writePos = 0;
    for (const entry of liveEntries) {
      const doc = this.read(entry.offset, entry.len);
      if (!doc) continue;
      const bsonDoc = BSON.serialize(doc);
      const header = Buffer.allocUnsafe(HEADER_SIZE);
      header.writeUInt32LE(bsonDoc.length, 0);
      header[4] = FLAG_LIVE;
      const record = Buffer.concat([header, bsonDoc]);
      fs.writeSync(tmpFd, record, 0, record.length, writePos);
      remap.set(entry.offset, { offset: writePos, len: record.length });
      writePos += record.length;
    }
    fs.closeSync(tmpFd);
    this.close();
    try { fs.writeFileSync(this.walPath, Buffer.alloc(0)); } catch { /* ignore */ }
    fs.renameSync(tmpPath, this.dataPath);
    this.open();
    this.tombstoneCount = 0;
    this.liveCount = liveEntries.length;
    return remap;
  }

  getFileSize(): number { return this.fileSize; }

  *scan(): Generator<{ offset: number; len: number; doc: Record<string, unknown> }> {
    if (this.fd === null) return;
    let pos = 0;
    this.liveCount = 0; this.tombstoneCount = 0;
    while (pos + HEADER_SIZE <= this.fileSize) {
      const header = Buffer.allocUnsafe(HEADER_SIZE);
      fs.readSync(this.fd, header, 0, HEADER_SIZE, pos);
      const bodyLen = header.readUInt32LE(0);
      const flags = header[4];
      const len = HEADER_SIZE + bodyLen;
      if (pos + len > this.fileSize) break;
      if (flags === FLAG_LIVE) {
        const doc = this.read(pos, len);
        if (doc) { this.liveCount++; yield { offset: pos, len, doc }; }
      } else { this.tombstoneCount++; }
      pos += len;
    }
  }
}

// ─── QueryResult ───────────────────────────────────────────────────────────────

export class QueryResult<T = unknown> {
  data: T[];
  err?: string;

  constructor(data: T[] | null | undefined, err?: string) {
    if (err) { this.err = err; this.data = []; }
    else { this.data = Array.isArray(data) ? data : []; }
  }

  getList(offset = 0, limit = 10): T[] | { err: string } {
    if (this.err) return { err: this.err };
    return this.data.slice(offset, offset + limit);
  }

  count(): number | { err: string } {
    if (this.err) return { err: this.err };
    return this.data.length;
  }

  sort(compareFn: (a: T, b: T) => number): QueryResult<T> {
    if (this.err) return this;
    return new QueryResult([...this.data].sort(compareFn));
  }

  all(): T[] | { err: string } {
    if (this.err) return { err: this.err };
    return this.data;
  }
}

// ─── Collection Handle ─────────────────────────────────────────────────────────

interface CollectionHandle {
  store: BSONPageStore;
  primaryIndex: PersistedBTree;
  secondaryIndexes: Map<string, PersistedBTree>;
  lastAccess: number;
}

// ─── eveloDB ───────────────────────────────────────────────────────────────────

export class eveloDB {
  config: Required<EveloDBConfig>;
  private handles: Map<string, CollectionHandle> = new Map();
  private backupManager: BackupManager;

  constructor(config: EveloDBConfig = {}) {
    this.config = { ...defaultConfig, ...config };
    if (!fs.existsSync(this.config.directory))
      fs.mkdirSync(this.config.directory, { recursive: true });
    this.backupManager = new BackupManager(this);
  }

  private getBsonPaths(collection: string): { dataPath: string; primaryIdxPath: string } {
    const dir = this.config.directory;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return {
      dataPath: path.join(dir, `${collection}.db`),
      primaryIdxPath: path.join(dir, `${collection}.bidx`),
    };
  }

  private getHandle(collection: string): CollectionHandle {
    const cached = this.handles.get(collection);
    if (cached) { cached.lastAccess = Date.now(); return cached; }

    if (this.handles.size >= this.config.maxHandles) {
      const oldest = [...this.handles.entries()].sort((a, b) => a[1].lastAccess - b[1].lastAccess)[0];
      if (oldest) { oldest[1].store.close(); oldest[1].primaryIndex.flush(); this.handles.delete(oldest[0]); }
    }

    const { dataPath, primaryIdxPath } = this.getBsonPaths(collection);
    const schema = this.config.schema?.[collection];
    const secondaryIndexes = new Map<string, PersistedBTree>();

    if (schema?.indexes) {
      for (const field of schema.indexes) {
        if (field === '_id') continue;
        const idxPath = path.join(this.config.directory, `${collection}.${field}.bidx`);
        secondaryIndexes.set(field, new PersistedBTree(idxPath, 128));
      }
    }

    const handle: CollectionHandle = {
      store: new BSONPageStore(dataPath),
      primaryIndex: new PersistedBTree(primaryIdxPath, 128),
      secondaryIndexes,
      lastAccess: Date.now(),
    };
    this.handles.set(collection, handle);
    return handle;
  }

  private evictLRU(): void {
    let oldest: string | null = null, oldestTime = Infinity;
    for (const [name, h] of this.handles) {
      if (h.lastAccess < oldestTime) { oldestTime = h.lastAccess; oldest = name; }
    }
    if (oldest) {
      const h = this.handles.get(oldest)!;
      h.primaryIndex.flush();
      for (const idx of h.secondaryIndexes.values()) idx.flush();
      h.store.close();
      this.handles.delete(oldest);
    }
  }

  private flushHandle(collection: string): void {
    const h = this.handles.get(collection);
    if (h) {
      h.primaryIndex.flush();
      for (const idx of h.secondaryIndexes.values()) idx.flush();
    }
  }

  private closeHandle(collection: string): void {
    const h = this.handles.get(collection);
    if (h) {
      h.primaryIndex.flush();
      for (const idx of h.secondaryIndexes.values()) idx.flush();
      h.store.close();
      this.handles.delete(collection);
    }
  }

  closeAll(): void {
    for (const [, h] of this.handles) {
      h.primaryIndex.flush();
      for (const idx of h.secondaryIndexes.values()) idx.flush();
      h.store.close();
    }
    this.handles.clear();
  }

  private generateUniqueId(): string {
    return new ObjectId().toHexString();
  }

  private getObjectIdKey(collection: string): string {
    return this.config.schema?.[collection]?.objectIdKey || '_id';
  }

  private mapInput(collection: string, data: Record<string, any>): Record<string, any> {
    const key = this.getObjectIdKey(collection);
    if (key === '_id' || !data) return data;
    const mapped = { ...data };
    if (key in mapped) {
      mapped._id = mapped[key];
      delete mapped[key];
    }
    return mapped;
  }

  private mapOutput<T>(collection: string, data: T): T {
    const key = this.getObjectIdKey(collection);
    if (key === '_id' || !data || typeof data !== 'object') return data;
    const mapped = { ...(data as any) };
    if ('_id' in mapped) {
      mapped[key] = mapped._id;
      delete mapped._id;
    }
    return mapped;
  }


  private matchesConditions(item: Record<string, unknown>, conditions: Conditions): boolean {
    return Object.entries(conditions).every(([key, value]) => {
      const fieldValue = item[key];
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const keys = Object.keys(value as object);
        if (keys.length > 0 && keys.every(k => k.startsWith('$'))) {
          const cond = value as Condition;
          return Object.entries(cond).every(([op, condVal]) => {
            switch (op) {
              case '$eq': return deepCompare(fieldValue, condVal);
              case '$ne': return !deepCompare(fieldValue, condVal);
              case '$gt': return (fieldValue as number) > (condVal as number);
              case '$gte': return (fieldValue as number) >= (condVal as number);
              case '$lt': return (fieldValue as number) < (condVal as number);
              case '$lte': return (fieldValue as number) <= (condVal as number);
              case '$in': return Array.isArray(condVal) && condVal.some(v => deepCompare(fieldValue, v));
              case '$nin': return Array.isArray(condVal) && !condVal.some(v => deepCompare(fieldValue, v));
              case '$regex': {
                const flags = typeof cond.$options === 'string' ? cond.$options : 'i';
                return new RegExp(condVal as string, flags).test(String(fieldValue));
              }
              default: return false;
            }
          });
        }
      }
      return deepCompare(fieldValue, value);
    });
  }

  private isDuplicateInArray(
    candidates: Record<string, unknown>[],
    newDoc: Record<string, unknown>,
    excludeId?: string
  ): boolean {
    return candidates.some(existing => {
      if (excludeId && String(existing._id) === excludeId) return false;
      const existingKeys = Object.keys(existing).filter(k => k !== '_id' && k !== '_createdAt' && k !== '_modifiedAt');
      const newKeys = Object.keys(newDoc).filter(k => k !== '_id' && k !== '_createdAt' && k !== '_modifiedAt');
      if (existingKeys.length !== newKeys.length) return false;
      return newKeys.every(k => deepCompare(existing[k], newDoc[k])) &&
        existingKeys.every(k => deepCompare(existing[k], newDoc[k]));
    });
  }

  private maybeCompact(collection: string): void {
    const h = this.handles.get(collection);
    if (!h) return;
    const total = h.store.liveCount + h.store.tombstoneCount;
    if (total === 0) return;
    if (h.store.tombstoneCount / total >= this.config.compactThreshold) this.compact(collection);
  }

  private buildFingerprintSet(records: Record<string, unknown>[]): Set<string> {
    const set = new Set<string>();
    for (const r of records) {
      const copy = { ...r }; delete copy._id; delete copy._createdAt; delete copy._modifiedAt;
      set.add(JSON.stringify(copy, Object.keys(copy).sort()));
    }
    return set;
  }

  private fingerprintOf(doc: Record<string, unknown>): string {
    const copy = { ...doc }; delete copy._id; delete copy._createdAt; delete copy._modifiedAt;
    return JSON.stringify(copy, Object.keys(copy).sort());
  }

  private validateSchema(collection: string, doc: Record<string, unknown>, schemaOverride?: any): { valid: boolean; err?: string } {
    const collSchema = this.config.schema?.[collection];
    const fields = schemaOverride || collSchema?.fields;
    if (!fields) return { valid: true };
    for (const [field, config] of Object.entries(fields as Record<string, any>)) {
      const val = doc[field];
      if (config.required && (val === undefined || val === null)) return { valid: false, err: `'${field}' is required` };
      if (val !== undefined && val !== null) {
        if (typeof config.type === 'object' && !Array.isArray(config.type)) {
          // Recursive check for objects
          if (typeof val !== 'object' || Array.isArray(val)) return { valid: false, err: `'${field}' must be an object` };
          const res = this.validateSchema(collection, val as Record<string, unknown>, config.type);
          if (!res.valid) return { valid: false, err: `${field}.${res.err!.replace(/'/g, '')}` };
        } else {
          let typeValid = false;
          if (config.type === String) typeValid = typeof val === 'string';
          else if (config.type === Number) typeValid = typeof val === 'number';
          else if (config.type === Array) typeValid = Array.isArray(val);
          else if (config.type === Object) typeValid = typeof val === 'object' && !Array.isArray(val);
          else if (config.type === Boolean) typeValid = typeof val === 'boolean';
          if (!typeValid) return { valid: false, err: `'${field}' must be of type ${config.type.name}` };
          if (config.min !== undefined || config.max !== undefined) {
            let compareVal: number | undefined;
            if (typeof val === 'string' || Array.isArray(val)) compareVal = val.length;
            else if (typeof val === 'number') compareVal = val;
            if (compareVal !== undefined) {
              if (config.min !== undefined && compareVal < config.min) return { valid: false, err: `'${field}' is below minimum (${config.min})` };
              if (config.max !== undefined && compareVal > config.max) return { valid: false, err: `'${field}' exceeds maximum (${config.max})` };
            }
          }
        }
      }
    }
    // Check for unknown fields (only if not a recursive call for nested object)
    if (!schemaOverride) {
      const schemaKeys = new Set(Object.keys(fields));
      const internalKeys = ['_id', '_createdAt', '_modifiedAt', this.getObjectIdKey(collection)];
      for (const key of Object.keys(doc)) {
        if (!schemaKeys.has(key) && !internalKeys.includes(key)) {
          return { valid: false, err: `Field '${key}' is not defined in schema` };
        }
      }
    } else {
      // For nested objects, we also check for unknown fields
      const schemaKeys = new Set(Object.keys(fields));
      for (const key of Object.keys(doc)) {
        if (!schemaKeys.has(key)) {
          return { valid: false, err: `Field '${key}' is not defined in schema` };
        }
      }
    }

    return { valid: true };
  }

  create(collection: string, data: Record<string, unknown>): WriteResult {
    if (!collection || !data || typeof data !== 'object') return { err: 'Invalid request' };
    
    // Strict Collection Check
    if (this.config.schema && Object.keys(this.config.schema).length > 0 && !this.config.schema[collection]) {
      return { err: `Collection '${collection}' is not defined in schema`, code: 'COLLECTION_NOT_DEFINED' };
    }

    const idKey = this.getObjectIdKey(collection);
    const forbidden = ['_id', '_createdAt', '_modifiedAt', idKey];
    for (const key of forbidden) if (key) delete data[key];

    const mappedData = this.mapInput(collection, data);
    const schemaRes = this.validateSchema(collection, mappedData as Record<string, unknown>);
    if (!schemaRes.valid) return { err: schemaRes.err, code: 'SCHEMA_VALIDATION_FAILED' };
    const h = this.getHandle(collection);
    const doc = { ...mappedData };
    const now = new Date().toISOString();
    if (!doc._id) doc._id = this.generateUniqueId();
    if (!doc._createdAt) doc._createdAt = now;
    doc._modifiedAt = now;
    const pk = String(doc._id);

    if (h.primaryIndex.find(pk)) return { err: 'Duplicate primary key', code: 'DUPLICATE_KEY' };

    // Unique Keys Check
    const collSchema = this.config.schema?.[collection];
    if (collSchema?.uniqueKeys) {
      for (const field of collSchema.uniqueKeys) {
        const val = String(doc[field]);
        if (h.secondaryIndexes.has(field)) {
          if (h.secondaryIndexes.get(field)!.find(val)) return { err: `Duplicate unique key: ${field}`, code: 'DUPLICATE_UNIQUE_KEY' };
        } else {
          // Fallback to scan if not indexed but unique
          const exists = this.findOne(collection, { [field]: doc[field] });
          if (exists) return { err: `Duplicate unique key: ${field}`, code: 'DUPLICATE_UNIQUE_KEY' };
        }
      }
    }

    const noRepeat = collSchema?.noRepeat !== false;
    if (noRepeat) {
      const fingerprints = this.buildFingerprintSet(this.allInternal(collection));
      if (fingerprints.has(this.fingerprintOf(doc))) return { err: 'Duplicate data', code: 'DUPLICATE_DATA' };
    }

    const { offset, len } = h.store.append(doc);
    h.primaryIndex.insert({ key: pk, offset, len });

    // Update Secondary Indexes
    for (const [field, idx] of h.secondaryIndexes) {
      if (doc[field] !== undefined) idx.insert({ key: String(doc[field]), offset, len });
    }

    this.flushHandle(collection);
    const result: WriteResult = { success: true };
    (result as any)[idKey] = doc._id;
    return result;
  }

  delete(collection: string, conditions: Conditions): DeleteResult {
    if (!collection || !conditions) return { err: 'Invalid request' };

    // Strict Collection Check
    if (this.config.schema && Object.keys(this.config.schema).length > 0 && !this.config.schema[collection]) {
      return { err: `Collection '${collection}' is not defined in schema`, code: 'COLLECTION_NOT_DEFINED' };
    }
    const mappedConditions = this.mapInput(collection, conditions as Record<string, any>);
    const h = this.getHandle(collection);
    let deletedCount = 0;
    const toDelete = this.find(collection, mappedConditions, true).all() as Record<string, unknown>[];

    for (const doc of toDelete) {
      const pk = String(doc._id);
      const entry = h.primaryIndex.find(pk);
      if (entry) {
        h.store.tombstone(entry.offset);
        h.primaryIndex.delete(pk);
        // Delete from Secondary Indexes
        for (const [field, idx] of h.secondaryIndexes) {
          if (doc[field] !== undefined) idx.delete(String(doc[field]));
        }
        deletedCount++;
      }
    }

    this.flushHandle(collection); this.maybeCompact(collection);
    return { success: true, deletedCount };
  }

  find<T = Record<string, unknown>>(collection: string, conditions: Conditions, raw: boolean = false): QueryResult<T> {
    if (!collection || !conditions) return new QueryResult<T>(null, 'Invalid request');

    // Strict Collection Check
    if (this.config.schema && Object.keys(this.config.schema).length > 0 && !this.config.schema[collection]) {
      return new QueryResult<T>(null, `Collection '${collection}' is not defined in schema`);
    }
    const mappedConditions = this.mapInput(collection, conditions as Record<string, any>);
    const h = this.getHandle(collection);
    const condEntries = Object.entries(mappedConditions);

    // Try to use indexes
    if (condEntries.length > 0) {
      for (const [field, val] of condEntries) {
        if (typeof val === 'object' && val !== null) continue;

        if (field === '_id') {
          const entry = h.primaryIndex.find(String(val));
          if (entry) {
            const doc = h.store.read(entry.offset, entry.len);
            if (doc && this.matchesConditions(doc as Record<string, unknown>, mappedConditions)) {
              return new QueryResult<T>([(raw ? doc : this.mapOutput(collection, doc)) as unknown as T]);
            }
          }
          return new QueryResult<T>([]);
        }

        const sIdx = h.secondaryIndexes.get(field);
        if (sIdx) {
          const entry = sIdx.find(String(val));
          if (entry) {
            const doc = h.store.read(entry.offset, entry.len);
            if (doc && this.matchesConditions(doc as Record<string, unknown>, mappedConditions)) {
              return new QueryResult<T>([(raw ? doc : this.mapOutput(collection, doc)) as unknown as T]);
            }
          }
          // Note: Secondary indexes might have duplicates. 
          // Currently BTree handles one value per key.
          // This optimized path returns the first match found in index.
        }
      }
    }

    const results: T[] = [];
    for (const e of h.primaryIndex.allEntries()) {
      const doc = h.store.read(e.offset, e.len);
      if (doc && this.matchesConditions(doc as Record<string, unknown>, mappedConditions)) {
        results.push((raw ? doc : this.mapOutput(collection, doc)) as unknown as T);
      }
    }
    return new QueryResult<T>(results);
  }

  findOne<T = Record<string, unknown>>(collection: string, conditions: Conditions): T | null {
    const res = this.find<T>(collection, conditions).all();
    return Array.isArray(res) && res.length > 0 ? res[0] : null;
  }

  get<T = Record<string, unknown>>(collection: string): QueryResult<T> {
    if (!collection) return new QueryResult<T>(null, 'collection required!');

    // Strict Collection Check
    if (this.config.schema && Object.keys(this.config.schema).length > 0 && !this.config.schema[collection]) {
      return new QueryResult<T>(null, `Collection '${collection}' is not defined in schema`);
    }
    const h = this.getHandle(collection), results: T[] = [];
    for (const e of h.primaryIndex.allEntries()) {
      const doc = h.store.read(e.offset, e.len);
      if (doc) results.push(this.mapOutput(collection, doc) as unknown as T);
    }
    return new QueryResult<T>(results);
  }
  update(collection: string, conditions: Conditions, newData: Record<string, unknown>): EditResult {
    return this.edit(collection, conditions, newData);
  }

  inject(collection: string, data: Record<string, unknown>[], options: { method?: 'overwrite' | 'merge' } = {}): any {
    if (!collection || !Array.isArray(data)) return { err: 'Invalid request' };
    const method = options.method || 'overwrite';
    const idKey = this.getObjectIdKey(collection);
    const collSchema = this.config.schema?.[collection];
    const isNoRepeat = collSchema?.noRepeat !== false;

    // 1. Strict Collection Check
    if (this.config.schema && Object.keys(this.config.schema).length > 0 && !this.config.schema[collection]) {
      return { err: `Collection '${collection}' is not defined in schema`, code: 'COLLECTION_NOT_DEFINED' };
    }

    // 2. Validation & Pre-processing
    const processedData: any[] = [];
    for (const item of data) {
      if (!item._id && !item[idKey]) return { err: `Record missing ID field (${idKey})`, code: 'MISSING_ID' };
      if (!item._createdAt) return { err: "Record missing _createdAt", code: 'MISSING_CREATED_AT' };
      if (!item._modifiedAt) return { err: "Record missing _modifiedAt", code: 'MISSING_MODIFIED_AT' };

      const internal = this.mapInput(collection, item);
      const schemaRes = this.validateSchema(collection, internal as Record<string, unknown>);
      if (!schemaRes.valid) return { err: `Validation failed for record: ${schemaRes.err}`, code: 'SCHEMA_VALIDATION_FAILED' };

      processedData.push(internal);
    }

    // 3. Handle Duplicate Checks (noRepeat)
    if (isNoRepeat) {
      const fingerprints = new Set<string>();
      for (const doc of processedData) {
        const fp = this.fingerprintOf(doc);
        if (fingerprints.has(fp)) return { err: 'Duplicate data found in injection payload', code: 'DUPLICATE_DATA' };
        fingerprints.add(fp);
      }

      if (method === 'merge') {
        const existingFingerprints = this.buildFingerprintSet(this.allInternal(collection));
        for (const doc of processedData) {
          if (existingFingerprints.has(this.fingerprintOf(doc))) {
            return { err: 'Injection contains records that already exist in the collection', code: 'DUPLICATE_DATA' };
          }
        }
      }
    }

    // 4. Execute Injection
    if (method === 'overwrite') {
      this.drop(collection);
    }

    const h = this.getHandle(collection);
    let successCount = 0;
    for (const doc of processedData) {
      const pk = String(doc._id);
      if (method === 'merge' && h.primaryIndex.find(pk)) {
        return { err: `Conflict: ID ${pk} already exists`, code: 'ID_CONFLICT' };
      }
      
      const { offset, len } = h.store.append(doc);
      h.primaryIndex.insert({ key: pk, offset, len });
      
      for (const [field, idx] of h.secondaryIndexes) {
        if (doc[field] !== undefined) idx.insert({ key: String(doc[field]), offset, len });
      }
      successCount++;
    }

    this.flushHandle(collection);
    return { success: true, count: successCount };
  }

  edit(collection: string, conditions: Conditions, newData: Record<string, unknown>): EditResult {
    if (!collection || !conditions || !newData) return { err: 'Invalid request' };

    // Strict Collection Check
    if (this.config.schema && Object.keys(this.config.schema).length > 0 && !this.config.schema[collection]) {
      return { err: `Collection '${collection}' is not defined in schema`, code: 'COLLECTION_NOT_DEFINED' };
    }
    
    const idKey = this.getObjectIdKey(collection);
    const forbidden = ['_id', '_createdAt', '_modifiedAt', idKey];
    for (const key of forbidden) if (key) delete newData[key];

    const mappedConditions = this.mapInput(collection, conditions as Record<string, any>);
    const mappedNewData = this.mapInput(collection, newData);
    const h = this.getHandle(collection);
    let modifiedCount = 0, skippedDuplicates = 0;
    const toUpdate = this.find(collection, mappedConditions, true).all() as Record<string, unknown>[];
    if (toUpdate.length === 0) return { err: 'No match', code: 'NO_MATCH' };

    if (this.config.schema?.[collection]) {
      for (const doc of toUpdate) {
        const schemaRes = this.validateSchema(collection, { ...doc, ...mappedNewData });
        if (!schemaRes.valid) return { err: schemaRes.err, code: 'SCHEMA_VALIDATION_FAILED' };
      }
    }

    const updatingKeys = new Set(toUpdate.map(d => String(d._id)));
    const isNoRepeat = this.config.schema?.[collection]?.noRepeat !== false;
    const baseSnapshot = isNoRepeat
      ? this.allInternal(collection).filter(d => !updatingKeys.has(String(d._id))) : [];
    const written: Record<string, unknown>[] = [];

    for (const doc of toUpdate) {
      const pk = String(doc._id), entry = h.primaryIndex.find(pk);
      if (!entry) continue;

      const now = new Date().toISOString();
      const updated = { ...doc, ...mappedNewData, _id: doc._id, _modifiedAt: now };

      if (isNoRepeat && this.isDuplicateInArray([...baseSnapshot, ...written], updated)) {
        skippedDuplicates++; continue;
      }

      h.store.tombstone(entry.offset);
      const { offset, len } = h.store.append(updated);
      h.primaryIndex.update({ key: pk, offset, len });

      // Update Secondary Indexes
      for (const [field, idx] of h.secondaryIndexes) {
        const oldVal = String((doc as any)[field]), newVal = String((updated as any)[field]);
        if (oldVal !== newVal) {
          idx.delete(oldVal);
          idx.insert({ key: newVal, offset, len });
        } else {
          idx.update({ key: oldVal, offset, len });
        }
      }

      written.push(updated); modifiedCount++;
    }
    this.flushHandle(collection); this.maybeCompact(collection);
    return { success: true, modifiedCount, skippedDuplicates };
  }

  /** Returns all records with original _id (unmapped) */
  allInternal(collection: string): Record<string, unknown>[] {
    const h = this.getHandle(collection), results: Record<string, unknown>[] = [];
    for (const e of h.primaryIndex.allEntries()) {
      const doc = h.store.read(e.offset, e.len);
      if (doc) results.push(doc);
    }
    return results;
  }

  count(collection: string): CountResult {
    if (!collection) return { success: false, err: 'collection required!' };
    return { success: true, count: this.getHandle(collection).primaryIndex.size() };
  }

  check(collection: string, data: Conditions): boolean {
    const res = this.find(collection, data).all();
    return Array.isArray(res) && res.length > 0;
  }

  search<T = Record<string, unknown>>(collection: string, conditions: Record<string, unknown>, raw: boolean = false): QueryResult<T> {
    if (!collection || !conditions) return new QueryResult<T>(null, 'Invalid request');

    // Strict Collection Check
    if (this.config.schema && Object.keys(this.config.schema).length > 0 && !this.config.schema[collection]) {
      return new QueryResult<T>(null, `Collection '${collection}' is not defined in schema`);
    }
    const mappedConditions = this.mapInput(collection, conditions);
    const pkVal = mappedConditions._id;
    if (pkVal !== undefined && typeof pkVal === 'string') {
      const h = this.getHandle(collection), entry = h.primaryIndex.find(pkVal);
      if (!entry) return new QueryResult<T>([]);
      const doc = h.store.read(entry.offset, entry.len);
      if (!doc) return new QueryResult<T>([]);
      const others = Object.fromEntries(Object.entries(mappedConditions).filter(([k]) => k !== '_id'));
      const matches = Object.entries(others).every(([k, v]) => {
        const f = doc[k]; if (f == null) return false;
        if (v && typeof v === 'object' && (v as Condition).$regex) {
          return new RegExp((v as Condition).$regex!, (v as Condition).$options || 'i').test(String(f));
        }
        return String(f).toLowerCase().includes(String(v).toLowerCase());
      });
      return new QueryResult<T>(matches ? [(raw ? doc : this.mapOutput(collection, doc)) as unknown as T] : []);
    }
    const all = this.allInternal(collection);
    const results = all.filter(item => Object.entries(mappedConditions).every(([k, v]) => {
      const f = item[k]; if (f == null) return false;
      if (v && typeof v === 'object' && (v as Condition).$regex) {
        return new RegExp((v as Condition).$regex!, (v as Condition).$options || 'i').test(String(f));
      }
      return String(f).toLowerCase().includes(String(v).toLowerCase());
    })).map(doc => (raw ? doc : this.mapOutput(collection, doc)) as unknown as T);
    return new QueryResult<T>(results);
  }

  drop(collection: string): DropResult {
    if (!collection) return { err: 'collection required!' };
    this.flushHandle(collection);
    const h = this.handles.get(collection);
    if (h) { h.store.close(); this.handles.delete(collection); }
    const schema = this.config.schema?.[collection];
    const toDelete = [path.join(this.config.directory, `${collection}.db`), path.join(this.config.directory, `${collection}.bidx`)];
    if (schema?.indexes) {
      for (const field of schema.indexes) {
        if (field === '_id') continue;
        toDelete.push(path.join(this.config.directory, `${collection}.${field}.bidx`));
      }
    }
    let deleted = 0;
    for (const p of toDelete) { if (fs.existsSync(p)) { fs.unlinkSync(p); deleted++; } }
    return deleted > 0 ? { success: true, deletedCount: deleted } : { err: 'Not found', code: 404 };
  }

  reset(collection: string): DropResult { return this.drop(collection); }

  compact(collection: string): { success: boolean; err?: string } {
    const h = this.getHandle(collection), entries = h.primaryIndex.allEntries();
    const live = entries.filter(e => h.store.read(e.offset, e.len) !== null);
    const remap = h.store.compact(live);
    for (const entry of entries) {
      const np = remap.get(entry.offset);
      if (np) {
        h.primaryIndex.update({ key: entry.key, offset: np.offset, len: np.len });
        const doc = h.store.read(np.offset, np.len);
        if (doc) {
          for (const [field, idx] of h.secondaryIndexes) {
            if (doc[field] !== undefined) idx.update({ key: String(doc[field]), offset: np.offset, len: np.len });
          }
        }
      } else {
        h.primaryIndex.delete(entry.key);
      }
    }
    this.flushHandle(collection); return { success: true };
  }


  writeFile(name: string, data: Buffer): FileResult {
    if (!name || !data || !Buffer.isBuffer(data)) return { err: 'Invalid request' };
    const dir = `${this.config.directory}/files`;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    try {
      const tmp = `${dir}/${name}.tmp`; fs.writeFileSync(tmp, data); fs.renameSync(tmp, `${dir}/${name}`);
      return { success: true };
    } catch (e) { return { err: (e as Error).message }; }
  }

  allFiles(): string[] {
    const d = `${this.config.directory}/files`;
    return fs.existsSync(d) ? fs.readdirSync(d) : [];
  }

  readFile(name: string): FileResult {
    const p = `${this.config.directory}/files/${name}`;
    if (!fs.existsSync(p)) return { err: 'Not found', code: 404 };
    try { return { success: true, data: fs.readFileSync(p) }; }
    catch (e) { return { err: (e as Error).message }; }
  }

  async readImage(name: string, config: ReadImageConfig = {}): Promise<ReadImageResult> {
    const p = `${this.config.directory}/files/${name}`;
    if (!fs.existsSync(p)) return { err: 'Not found', code: 404 };
    const ext = path.extname(name).toLowerCase();
    try {
      const data = fs.readFileSync(p);
      const res = await imageProcess(data, ext, {
        returnBase64: config.returnBase64 !== false,
        quality: Math.max(0.1, Math.min(1, config.quality ?? 1)),
        pixels: Math.max(0, config.pixels ?? 0),
        blackAndWhite: !!config.blackAndWhite,
        mirror: !!config.mirror,
        upToDown: !!config.upToDown,
        invert: !!config.invert,
        brightness: Math.max(0.1, Math.min(5, config.brightness ?? 1)),
        contrast: Math.max(0.1, Math.min(5, config.contrast ?? 1)),
        maxWidth: config.maxWidth || null, maxHeight: config.maxHeight || null
      });
      return { success: true, data: res, metadata: { filename: name, extension: ext, originalSize: fs.statSync(p).size, processingApplied: {} as any } };
    } catch (e) { return { err: (e as Error).message }; }
  }

  deleteFile(name: string): FileResult {
    const p = `${this.config.directory}/files/${name}`;
    if (!fs.existsSync(p)) return { err: 'Not found', code: 404 };
    try { fs.unlinkSync(p); return { success: true }; }
    catch (e) { return { err: (e as Error).message }; }
  }

  createBackup(collection: string, config: { type?: 'json' | 'binary'; path: string; password?: string; title?: string }): BackupResult {
    return this.backupManager.createBackup(collection, config);
  }

  restoreBackup(collection: string, config: { type?: 'json' | 'binary'; file: string; password?: string }): { success: boolean; err?: string } {
    return this.backupManager.restoreBackup(collection, config);
  }

  readBackupFile(filePath: string, password?: string): any {
    return this.backupManager.readBackupFile(filePath, password);
  }

  public rebuildIndexes(collection: string) {
    const { primaryIdxPath } = this.getBsonPaths(collection);
    const schema = this.config.schema?.[collection];
    const toDelete = [primaryIdxPath];
    if (schema?.indexes) {
      for (const field of schema.indexes) {
        if (field === '_id') continue;
        toDelete.push(path.join(this.config.directory, `${collection}.${field}.bidx`));
      }
    }
    for (const p of toDelete) { if (fs.existsSync(p)) fs.unlinkSync(p); }
    const h = this.getHandle(collection);
    for (const { offset, len, doc } of h.store.scan()) {
      const key = String(doc._id ?? '');
      if (key) {
        h.primaryIndex.insert({ key, offset, len });
        for (const [field, idx] of h.secondaryIndexes) {
          if (doc[field] !== undefined) idx.insert({ key: String(doc[field]), offset, len });
        }
      }
    }
    this.flushHandle(collection);
  }

  object(name?: string): ObjectStore {
    return new ObjectStore(this.config.directory, name);
  }
}

export default eveloDB;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = eveloDB; module.exports.default = eveloDB; module.exports.eveloDB = eveloDB;
}