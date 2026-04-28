import * as fs from 'fs';
import { encrypt, decrypt, generateKey } from './encryption.js';
import { BSON, ObjectId } from 'bson';
import { GoogleGenAI } from '@google/genai';
import imageProcess from './imageProcess.js';
import * as path from 'path';

// ─── Type Definitions ──────────────────────────────────────────────────────────

export interface EveloDBConfig {
  directory?: string;
  extension?: string;
  tabspace?: number;
  encode?: 'json' | 'bson';
  encryption?: string | null;
  encryptionKey?: string | null;
  noRepeat?: boolean;
  autoPrimaryKey?: boolean | string;
  objectId?: boolean;
  /** Max open collection handles before LRU eviction. Default 64 */
  maxHandles?: number;
  /** Compact BSON collection when tombstone ratio exceeds this (0–1). Default 0.3 */
  compactThreshold?: number;
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

export interface AnalyseResponse {
  indexes: number[];
  reason: string;
  message: string;
  data: unknown[];
}

export interface AnalyseResult {
  success: boolean;
  response?: AnalyseResponse;
  err?: string;
}

export interface WriteResult {
  success?: boolean;
  err?: string;
  code?: string | number;
  [key: string]: unknown;
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
  code?: number;
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

export interface ChangeConfigOptions {
  from: Partial<EveloDBConfig>;
  to: Partial<EveloDBConfig>;
  collections?: string[];
}

export interface ChangeConfigResult {
  success: boolean;
  converted: number;
  failed: number;
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

// ─── Default Config ────────────────────────────────────────────────────────────

const defaultConfig: Required<EveloDBConfig> = {
  directory: './evelodatabase',
  extension: 'json',
  tabspace: 3,
  encode: 'json',
  encryption: null,
  encryptionKey: null,
  noRepeat: false,
  autoPrimaryKey: true,
  objectId: false,
  maxHandles: 64,
  compactThreshold: 0.3,
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

/**
 * Unified key comparison used everywhere — plain lexicographic (<, >, ===).
 * Must be used consistently in both B-Tree insert and search paths.
 * localeCompare is intentionally NOT used; it produces locale-dependent
 * ordering that differs between environments and breaks the B-Tree invariant
 * when mixed with raw string comparison operators.
 */
function keyCmp(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// ─── Persisted B-Tree ──────────────────────────────────────────────────────────
//
//  Binary layout of .bidx file (prepended to extension, e.g. .db.bidx):
//
//  [4 bytes: order] [nodes...]
//
//  Each node:
//  [1 byte: isLeaf] [4 bytes: keyCount] [keys...] [4 bytes: childCount] [children...]
//
//  Each key entry:
//  [2 bytes: keyLen] [keyLen bytes: UTF-8 key] [8 bytes: dataOffset] [4 bytes: dataLen]
//
//  dataOffset — byte position inside the data file where the record starts.
//  dataLen    — how many bytes to read for that record.

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

  // ── Serialization ────────────────────────────────────────────────────────

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

  // ── Disk I/O ─────────────────────────────────────────────────────────────

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
      // FIX: rename corrupt index so it can be inspected, log the error clearly
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
    // Atomic write: write to tmp then rename
    const tmp = this.idxPath + '.tmp';
    fs.writeFileSync(tmp, Buffer.from(arr));
    // Windows-safe: unlink target before rename
    try { if (fs.existsSync(this.idxPath)) fs.unlinkSync(this.idxPath); } catch { /* ignore */ }
    fs.renameSync(tmp, this.idxPath);
    this.dirty = false;
  }

  // ── Core B-Tree ops — all use keyCmp for consistent ordering ─────────────

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
      // FIX: use keyCmp consistently (was using raw < before)
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

  /** Total number of indexed keys */
  size(): number {
    return this.allEntries().length;
  }
}

// ─── BSON Page Store ───────────────────────────────────────────────────────────
//
//  Record format in data file:
//
//    [4 bytes LE: bodyLen] [1 byte: flags] [bodyLen bytes: BSON doc]
//
//  flags: 0x01 = live, 0x00 = tombstoned
//
//  Using an explicit flags byte (separate from the BSON body) fixes the
//  original bug where 0x00 (BSON end-of-doc marker) was misread as a tombstone.
//
//  WAL entry:
//    [1 byte: type] [8 bytes BE: offset] [4 bytes BE: len] [len bytes: payload]
//  type 0x01 = append record, type 0x02 = tombstone (payload = empty, len = 0)

const FLAG_LIVE = 0x01;
const FLAG_TOMBSTONE = 0x00;
const HEADER_SIZE = 5; // 4-byte bodyLen + 1-byte flags

class BSONPageStore {
  private dataPath: string;
  private walPath: string;
  private fd: number | null = null;
  private fileSize: number = 0;
  /** Approximate count of tombstoned records (for compaction heuristic) */
  tombstoneCount: number = 0;
  /** Approximate count of live records */
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
    if (this.fd !== null) {
      fs.closeSync(this.fd);
      this.fd = null;
    }
  }

  // ── WAL ──────────────────────────────────────────────────────────────────

  private writeWAL(type: number, offset: number, data: Buffer): void {
    const header = Buffer.allocUnsafe(13);
    header[0] = type;
    const hi = Math.floor(offset / 0x100000000);
    const lo = offset >>> 0;
    header.writeUInt32BE(hi, 1);
    header.writeUInt32BE(lo, 5);
    header.writeUInt32BE(data.length, 9);
    // Atomic append: write header + data together
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
          this.liveCount++; // FIX: track live records during replay
        } else if (type === 0x02) {
          const flagBuf = Buffer.from([FLAG_TOMBSTONE]);
          fs.writeSync(this.fd, flagBuf, 0, 1, offset + 4);
          this.tombstoneCount++; // FIX: track tombstones during replay
          this.liveCount = Math.max(0, this.liveCount - 1);
        }
      }
    } catch { /* corrupt WAL — ignore, best-effort replay */ }

    try { fs.writeFileSync(this.walPath, Buffer.alloc(0)); } catch { /* ignore */ }
  }

  // ── Append ───────────────────────────────────────────────────────────────

  append(doc: Record<string, unknown>): { offset: number; len: number } {
    const bsonDoc = BSON.serialize(doc);
    // Record: [4-byte LE bodyLen] [1-byte flags=LIVE] [bsonDoc]
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

  // ── Read single record ────────────────────────────────────────────────────

  read(offset: number, len: number): Record<string, unknown> | null {
    if (this.fd === null || offset < 0 || offset + len > this.fileSize) return null;

    const buf = Buffer.allocUnsafe(len);
    fs.readSync(this.fd, buf, 0, len, offset);

    // FIX: flags byte is at buf[4] (dedicated flags, not part of BSON body)
    if (buf[4] !== FLAG_LIVE) return null;

    const bodyLen = buf.readUInt32LE(0);
    if (bodyLen + HEADER_SIZE > len) return null; // sanity

    try {
      return BSON.deserialize(buf.slice(HEADER_SIZE, HEADER_SIZE + bodyLen)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  // ── Tombstone (soft delete) ───────────────────────────────────────────────

  tombstone(offset: number): void {
    // FIX: WAL tombstone entry carries 0 payload bytes; offset points to record start
    this.writeWAL(0x02, offset, Buffer.alloc(0));
    if (this.fd !== null) {
      const flagBuf = Buffer.from([FLAG_TOMBSTONE]);
      fs.writeSync(this.fd, flagBuf, 0, 1, offset + 4); // +4 to reach flags byte
    }
    this.tombstoneCount++;
    this.liveCount = Math.max(0, this.liveCount - 1);
  }

  // ── Compact ──────────────────────────────────────────────────────────────
  // Rewrites the data file removing all tombstoned records.
  // Returns a remap of old offset → {new offset, new len}.

  compact(liveEntries: BTreeEntry[]): Map<number, { offset: number; len: number }> {
    const tmpPath = this.dataPath + '.compact.tmp';
    const tmpFd = fs.openSync(tmpPath, 'w');
    const remap = new Map<number, { offset: number; len: number }>();
    let writePos = 0;

    for (const entry of liveEntries) {
      const doc = this.read(entry.offset, entry.len);
      if (!doc) continue; // skip tombstoned / corrupt

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

    // Clear WAL before rename so stale WAL entries don't replay against new file
    try { fs.writeFileSync(this.walPath, Buffer.alloc(0)); } catch { /* ignore */ }

    // Windows-safe: unlink target before rename
    try { if (fs.existsSync(this.dataPath)) fs.unlinkSync(this.dataPath); } catch { /* ignore */ }
    fs.renameSync(tmpPath, this.dataPath);
    this.open();
    this.tombstoneCount = 0;
    this.liveCount = liveEntries.length;
    return remap;
  }

  getFileSize(): number { return this.fileSize; }

  /**
   * Scans the data file and yields all live records found.
   * Useful for index rebuilding from a raw .bson file.
   */
  *scan(): Generator<{ offset: number; len: number; doc: Record<string, unknown> }> {
    if (this.fd === null) return;
    let pos = 0;
    this.liveCount = 0;
    this.tombstoneCount = 0;
    while (pos + HEADER_SIZE <= this.fileSize) {
      const header = Buffer.allocUnsafe(HEADER_SIZE);
      fs.readSync(this.fd, header, 0, HEADER_SIZE, pos);
      const bodyLen = header.readUInt32LE(0);
      const flags = header[4];
      const len = HEADER_SIZE + bodyLen;
      if (pos + len > this.fileSize) break;

      if (flags === FLAG_LIVE) {
        const doc = this.read(pos, len);
        if (doc) {
          this.liveCount++;
          yield { offset: pos, len, doc };
        }
      } else {
        this.tombstoneCount++;
      }
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
  index: PersistedBTree;
  lastAccess: number;
}

// ─── eveloDB ───────────────────────────────────────────────────────────────────

export class eveloDB {
  config: Required<EveloDBConfig>;
  private handles: Map<string, CollectionHandle> = new Map();

  constructor(config: EveloDBConfig = {}) {
    this.config = { ...defaultConfig, ...config };

    if (this.config.encode === 'bson' && this.config.encryption && this.config.encryptionKey)
      throw new Error('BSON encoding does not support encryption.');

    if (this.config.encode === 'bson') {
      // Only fall back to 'bson' extension if user did not explicitly set one.
      // Respects any user-supplied extension (e.g. 'db', 'data', etc.)
      if (!config.extension) this.config.extension = 'bson';
      this.config.tabspace = 0;
      this.config.encryption = null;
      this.config.encryptionKey = null;
    }

    if (this.config.encryption) {
      const key = this.config.encryptionKey;
      const algorithm = this.config.encryption;
      if (!key) throw new Error('Encryption key required when encryption is enabled');
      const keyLengths: Record<string, number> = {
        'aes-128-cbc': 32, 'aes-192-cbc': 48, 'aes-256-cbc': 64,
        'aes-128-gcm': 32, 'aes-256-gcm': 64,
      };
      const expectedLength = keyLengths[algorithm];
      if (!expectedLength) throw new Error(`Unsupported encryption algorithm: ${algorithm}`);
      if (key.length !== expectedLength)
        throw new Error(`${algorithm.toUpperCase()} requires a ${expectedLength}-character hex key`);
    }

    if (!fs.existsSync(this.config.directory))
      fs.mkdirSync(this.config.directory, { recursive: true });

    // Proactively check for and migrate old formats if needed
    this.proactiveMigration();
  }

  // ── Path helpers ──────────────────────────────────────────────────────────
  //
  // FIX: All three BSON-mode file paths are derived from the user-configured
  // extension so that e.g. extension:'db' produces .db / .db.bidx / .db.wal
  // instead of the hard-coded .bson / .bidx / .bson.wal.

  private getBsonPaths(collection: string): { dataPath: string; idxPath: string; walPath: string } {
    const ext = this.config.extension;
    const base = `${this.config.directory}/${collection}`;
    return {
      dataPath: `${base}.${ext}`,
      idxPath: `${base}.${ext}.bidx`,
      walPath: `${base}.${ext}.wal`,
    };
  }

  // ── LRU Handle management ─────────────────────────────────────────────────

  private getHandle(collection: string): CollectionHandle {
    const h = this.handles.get(collection);
    if (h) { h.lastAccess = Date.now(); return h; }

    // LRU eviction when over the limit
    if (this.handles.size >= this.config.maxHandles) this.evictLRU();

    const { dataPath, idxPath } = this.getBsonPaths(collection);

    // AUTO-MIGRATION FROM OLD BSON FORMAT
    // If index file is missing but data file exists, check if it's the old single-doc format.
    if (!fs.existsSync(idxPath) && fs.existsSync(dataPath)) {
      const oldRecords = this.readOldBson(dataPath);
      if (oldRecords.length > 0) {
        // Backup the old format files
        const bakSuffix = '.old_format_bak';
        fs.renameSync(dataPath, dataPath + bakSuffix);
        const { name, extension } = this.splitFilePath(dataPath);
        let i = 1;
        while (fs.existsSync(`${name} ${i}${extension}`)) {
          fs.renameSync(`${name} ${i}${extension}`, `${name} ${i}${extension}.bak`);
          i++;
        }

        const handle: CollectionHandle = {
          store: new BSONPageStore(dataPath),
          index: new PersistedBTree(idxPath, 128),
          lastAccess: Date.now(),
        };
        const pk = this.pkName();
        for (const doc of oldRecords) {
          const { offset, len } = handle.store.append(doc);
          const key = String(doc[pk] ?? '');
          if (key) handle.index.insert({ key, offset, len });
        }
        handle.index.flush();
        this.handles.set(collection, handle);
        return handle;
      }
    }

    const handle: CollectionHandle = {
      store: new BSONPageStore(dataPath),
      index: new PersistedBTree(idxPath, 128),
      lastAccess: Date.now(),
    };
    this.handles.set(collection, handle);

    // FIX: If index file is missing but data file exists and has data (new format), rebuild the index.
    if (!fs.existsSync(idxPath) && fs.existsSync(dataPath) && handle.store.getFileSize() > 0) {
      const pk = this.pkName();
      for (const { offset, len, doc } of handle.store.scan()) {
        const key = String(doc[pk] ?? '');
        if (key) handle.index.insert({ key, offset, len });
      }
      handle.index.flush();
    }

    return handle;
  }

  private evictLRU(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [name, h] of this.handles) {
      if (h.lastAccess < oldestTime) { oldestTime = h.lastAccess; oldest = name; }
    }
    if (oldest) {
      const h = this.handles.get(oldest)!;
      h.index.flush();
      h.store.close();
      this.handles.delete(oldest);
    }
  }

  private flushHandle(collection: string): void {
    const h = this.handles.get(collection);
    if (h) h.index.flush();
  }

  closeAll(): void {
    for (const [, h] of this.handles) {
      h.index.flush();
      h.store.close();
    }
    this.handles.clear();
  }

  // ── Primary key helpers ───────────────────────────────────────────────────

  private pkName(): string {
    return typeof this.config.autoPrimaryKey === 'string' && this.config.autoPrimaryKey.length > 0
      ? this.config.autoPrimaryKey
      : '_id';
  }

  private generateUniqueId(): string | ObjectId {
    if (this.config.encode === 'bson' && this.config.objectId) return new ObjectId();
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 10);
    return `${timestamp}${randomStr}`;
  }

  generateKey(length: number): string { return generateKey(length); }

  // ── JSON path helpers ─────────────────────────────────────────────────────

  private getJsonPath(collection: string): string {
    return `${this.config.directory}/${collection}.${this.config.extension}`;
  }

  private encryptData(data: unknown): unknown {
    return encrypt(data, this.config.encryptionKey!, this.config.encryption as any);
  }

  private decryptData(data: unknown): unknown {
    return decrypt(data as string, this.config.encryptionKey!, this.config.encryption as any);
  }

  private readJson(collection: string): Record<string, unknown>[] {
    const p = this.getJsonPath(collection);
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = this.config.encryption ? this.decryptData(raw) : JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as Record<string, unknown>[] : [];
  }

  private writeJson(collection: string, data: Record<string, unknown>[]): void {
    const p = this.getJsonPath(collection);
    const tmp = p + '.tmp';
    const content = this.config.encryption
      ? this.encryptData(data) as string
      : JSON.stringify(data, null, this.config.tabspace);
    // Atomic write via tmp + rename
    fs.writeFileSync(tmp, content);
    // Windows-safe: unlink target before rename
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
    fs.renameSync(tmp, p);
  }

  // ── Old BSON migration helpers ────────────────────────────────────────────

  private splitFilePath(filePath: string): { name: string; extension: string } {
    const lastDotIndex = filePath.lastIndexOf('.');
    if (lastDotIndex === -1) return { name: filePath, extension: '' };
    return {
      name: filePath.substring(0, lastDotIndex),
      extension: filePath.substring(lastDotIndex),
    };
  }

  private readOldBson(filePath: string): Record<string, unknown>[] {
    if (!fs.existsSync(filePath)) return [];
    try {
      const data = fs.readFileSync(filePath);
      // Old eveloDB BSON format was a single BSON document: { db: [...] }
      const decoded = BSON.deserialize(data);
      if (decoded && Array.isArray(decoded.db)) {
        const records = decoded.db as Record<string, unknown>[];
        // Handle old chunked format
        const { name, extension } = this.splitFilePath(filePath);
        let i = 1;
        while (true) {
          const chunkPath = `${name} ${i}${extension}`;
          if (fs.existsSync(chunkPath)) {
            try {
              const chunkDecoded = BSON.deserialize(fs.readFileSync(chunkPath));
              if (chunkDecoded && Array.isArray(chunkDecoded.db)) {
                records.push(...(chunkDecoded.db as Record<string, unknown>[]));
              }
            } catch { break; }
            i++;
          } else break;
        }
        return records;
      }
    } catch { /* Not an old format BSON file */ }
    return [];
  }

  // ── Proactive Migration ───────────────────────────────────────────────────

  private proactiveMigration(): void {
    // Proactive migration is primarily for BSON format transitions.
    if (this.config.encode !== 'bson') return;
    if (!fs.existsSync(this.config.directory)) return;

    try {
      const files = fs.readdirSync(this.config.directory);
      const ext = `.${this.config.extension}`;
      for (const file of files) {
        if (file.endsWith(ext)) {
          const collection = path.basename(file, ext);
          const { idxPath } = this.getBsonPaths(collection);
          // If the .bidx file is missing, getHandle() will detect if it's 
          // an old-format BSON file and migrate it automatically.
          if (!fs.existsSync(idxPath)) {
            try {
              this.getHandle(collection);
            } catch (err) {
              console.warn(`[eveloDB] Proactive migration failed for "${collection}":`, err);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[eveloDB] Failed to scan for proactive migration:', err);
    }
  }

  // ── Condition matching ────────────────────────────────────────────────────

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
              case '$options': return true; // handled inside $regex
              default: return false;
            }
          });
        }
      }
      return deepCompare(fieldValue, value);
    });
  }

  // ── noRepeat helpers ──────────────────────────────────────────────────────
  //
  // FIX: noRepeat now compares ALL fields (not just the fields present in
  // the new doc), so a subset of an existing record is NOT flagged as duplicate.
  // Two records are duplicates only if every non-PK field in BOTH records matches.

  private isDuplicateInArray(
    candidates: Record<string, unknown>[],
    newDoc: Record<string, unknown>,
    pk: string,
    excludeKey?: string
  ): boolean {
    return candidates.some(existing => {
      if (excludeKey && String(existing[pk]) === excludeKey) return false;
      const existingKeys = Object.keys(existing).filter(k => k !== pk);
      const newKeys = Object.keys(newDoc).filter(k => k !== pk);
      if (existingKeys.length !== newKeys.length) return false;
      return newKeys.every(k => deepCompare(existing[k], newDoc[k])) &&
        existingKeys.every(k => deepCompare(existing[k], newDoc[k]));
    });
  }

  // ── Auto compaction check ─────────────────────────────────────────────────

  private maybeCompact(collection: string): void {
    const h = this.handles.get(collection);
    if (!h) return;
    const total = h.store.liveCount + h.store.tombstoneCount;
    if (total === 0) return;
    const ratio = h.store.tombstoneCount / total;
    if (ratio >= this.config.compactThreshold) this.compact(collection);
  }

  // ── CRUD — BSON path ──────────────────────────────────────────────────────

  // Add this private helper to eveloDB
  private buildFingerprintSet(
    records: Record<string, unknown>[],
    pk: string
  ): Set<string> {
    const set = new Set<string>();
    for (const r of records) {
      const copy = { ...r };
      delete copy[pk];
      set.add(JSON.stringify(copy, Object.keys(copy).sort()));
    }
    return set;
  }

  private fingerprintOf(doc: Record<string, unknown>, pk: string): string {
    const copy = { ...doc };
    delete copy[pk];
    return JSON.stringify(copy, Object.keys(copy).sort());
  }

  // Then replace isDuplicateInArray usages in bsonCreate and bsonEdit with:
  private bsonCreate(collection: string, data: Record<string, unknown>): WriteResult {
    const h = this.getHandle(collection);
    const pk = this.pkName();

    if (!data[pk]) data[pk] = this.generateUniqueId();
    const key = String(data[pk]);

    if (h.index.find(key)) return { err: 'Duplicate primary key', code: 'DUPLICATE_KEY' };

    if (this.config.noRepeat) {
      // FIX: O(n) fingerprint check instead of O(n²) deepCompare loop
      const all = this.bsonAll(collection);
      const fingerprints = this.buildFingerprintSet(all, pk);
      if (fingerprints.has(this.fingerprintOf(data, pk)))
        return { err: 'Duplicate data (noRepeat enabled)', code: 'DUPLICATE_DATA' };
    }

    const { offset, len } = h.store.append(data);
    h.index.insert({ key, offset, len });
    this.flushHandle(collection);
    return { success: true, [pk]: data[pk] };
  }

  private bsonFindOne(collection: string, conditions: Conditions): Record<string, unknown> | null {
    const pk = this.pkName();
    const pkVal = conditions[pk];

    if (pkVal !== undefined && typeof pkVal !== 'object') {
      const h = this.getHandle(collection);
      const entry = h.index.find(String(pkVal));
      if (!entry) return null;
      const doc = h.store.read(entry.offset, entry.len);
      if (!doc) return null;
      return this.matchesConditions(doc, conditions) ? doc : null;
    }

    const all = this.bsonAll(collection);
    return (all.find(item => this.matchesConditions(item, conditions)) ?? null);
  }

  private bsonFind(collection: string, conditions: Conditions): Record<string, unknown>[] {
    const pk = this.pkName();
    const pkVal = conditions[pk];

    if (pkVal !== undefined && typeof pkVal !== 'object') {
      const doc = this.bsonFindOne(collection, conditions);
      return doc ? [doc] : [];
    }

    return this.bsonAll(collection).filter(item => this.matchesConditions(item, conditions));
  }

  private bsonAll(collection: string): Record<string, unknown>[] {
    const h = this.getHandle(collection);
    const entries = h.index.allEntries();
    const results: Record<string, unknown>[] = [];
    for (const e of entries) {
      const doc = h.store.read(e.offset, e.len);
      if (doc) results.push(doc);
    }
    return results;
  }

  private bsonDelete(collection: string, conditions: Conditions): DeleteResult {
    const pk = this.pkName();
    const pkVal = conditions[pk];
    const h = this.getHandle(collection);
    let deletedCount = 0;

    if (pkVal !== undefined && typeof pkVal !== 'object') {
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
    } else {
      for (const e of h.index.allEntries()) {
        const doc = h.store.read(e.offset, e.len);
        if (doc && this.matchesConditions(doc, conditions)) {
          h.store.tombstone(e.offset);
          h.index.delete(e.key);
          deletedCount++;
        }
      }
    }

    this.flushHandle(collection);
    this.maybeCompact(collection);
    return { success: true, deletedCount };
  }

  private bsonEdit(
    collection: string,
    conditions: Conditions,
    newData: Record<string, unknown>
  ): EditResult {
    const pk = this.pkName();
    const h = this.getHandle(collection);
    let modifiedCount = 0;
    let skippedDuplicates = 0;

    const toUpdate = this.bsonFind(collection, conditions);
    if (toUpdate.length === 0) return { err: 'No matching records found', code: 'NO_MATCH' };

    // FIX: snapshot excludes the records being updated so we compare against
    // records that won't be touched, then track newly written docs ourselves.
    const updatingKeys = new Set(toUpdate.map(d => String(d[pk])));
    const baseSnapshot: Record<string, unknown>[] = this.config.noRepeat
      ? this.bsonAll(collection).filter(d => !updatingKeys.has(String(d[pk])))
      : [];

    // Accumulates docs that were already written this loop iteration
    const writtenThisEdit: Record<string, unknown>[] = [];

    for (const doc of toUpdate) {
      const key = String(doc[pk]);
      const entry = h.index.find(key);
      if (!entry) continue;

      const updated: Record<string, unknown> = { ...doc, ...newData, [pk]: doc[pk] };

      if (this.config.noRepeat) {
        // FIX: check against both untouched records AND already-written records
        const checkPool = [...baseSnapshot, ...writtenThisEdit];
        if (this.isDuplicateInArray(checkPool, updated, pk)) {
          skippedDuplicates++;
          continue;
        }
      }

      h.store.tombstone(entry.offset);
      const { offset, len } = h.store.append(updated);
      h.index.update({ key, offset, len });
      writtenThisEdit.push(updated); // FIX: track for subsequent iteration checks
      modifiedCount++;
    }

    this.flushHandle(collection);
    this.maybeCompact(collection);

    if (modifiedCount === 0 && skippedDuplicates > 0)
      return { err: true, code: 'DUPLICATE_DATA', modifiedCount: 0, skippedDuplicates };

    return { success: true, modifiedCount, skippedDuplicates };
  }

  private bsonDrop(collection: string): DropResult {
    this.flushHandle(collection);
    const h = this.handles.get(collection);
    if (h) { h.store.close(); this.handles.delete(collection); }

    // FIX: use getBsonPaths so extension is respected
    const { dataPath, idxPath, walPath } = this.getBsonPaths(collection);
    let deleted = 0;
    for (const p of [dataPath, idxPath, walPath]) {
      if (fs.existsSync(p)) { fs.unlinkSync(p); deleted++; }
    }
    return deleted > 0 ? { success: true, deletedCount: deleted } : { err: 'Collection not found', code: 404 };
  }

  // ── Compaction (BSON only) ────────────────────────────────────────────────

  compact(collection: string): { success: boolean; err?: string } {
    if (this.config.encode !== 'bson') return { success: false, err: 'Only available in BSON mode' };
    const h = this.getHandle(collection);
    const entries = h.index.allEntries();

    // FIX: read live entries only — filter here so compact() never receives stale index entries
    const liveEntries = entries.filter(e => {
      const doc = h.store.read(e.offset, e.len);
      return doc !== null;
    });

    const remap = h.store.compact(liveEntries);

    // Rebuild index with new offsets; remove any entries that didn't survive
    for (const entry of entries) {
      const newPos = remap.get(entry.offset);
      if (newPos) h.index.update({ key: entry.key, offset: newPos.offset, len: newPos.len });
      else h.index.delete(entry.key); // was tombstoned, clean up index
    }

    this.flushHandle(collection);
    return { success: true };
  }

  // ── Public CRUD ───────────────────────────────────────────────────────────

  create(collection: string, data: Record<string, unknown>): WriteResult {
    if (!collection) return { err: 'Collection name required' };
    if (/[/\\.\ ]/.test(collection)) return { err: 'Invalid collection name' };
    if (!data || typeof data !== 'object') return { err: 'Valid data object required' };

    if (this.config.encode === 'bson') return this.bsonCreate(collection, { ...data });

    // JSON path
    const db = this.readJson(collection);
    const pk = this.pkName();
    const object: Record<string, unknown> = { ...data };

    if (this.config.noRepeat) {
      if (this.isDuplicateInArray(db, object, pk))
        return { err: 'Duplicate data (noRepeat enabled)', code: 'DUPLICATE_DATA' };
    }

    if (!object[pk]) object[pk] = this.generateUniqueId();
    db.push(object);
    this.writeJson(collection, db);
    return { success: true, [pk]: object[pk] };
  }

  delete(collection: string, conditions: Conditions): DeleteResult {
    if (!collection) return { err: 'collection required!' };
    if (!conditions) return { err: 'conditions required!' };

    if (this.config.encode === 'bson') return this.bsonDelete(collection, conditions);

    const p = this.getJsonPath(collection);
    if (!fs.existsSync(p)) return { err: 'Not found', code: 404 };
    const db = this.readJson(collection);
    const filtered = db.filter(item => !this.matchesConditions(item, conditions));
    this.writeJson(collection, filtered);
    return { success: true, deletedCount: db.length - filtered.length };
  }

  find<T = Record<string, unknown>>(collection: string, conditions: Conditions): QueryResult<T> {
    if (!collection) return new QueryResult<T>(null, 'collection required!');
    if (!conditions) return new QueryResult<T>(null, 'conditions required!');

    if (this.config.encode === 'bson')
      return new QueryResult<T>(this.bsonFind(collection, conditions) as unknown as T[]);

    const db = this.readJson(collection);
    return new QueryResult<T>(
      db.filter(item => this.matchesConditions(item, conditions)) as unknown as T[]
    );
  }

  findOne<T = Record<string, unknown>>(
    collection: string,
    conditions: Conditions
  ): T | null | { err: string } {
    if (!collection) return { err: 'collection required!' };
    if (!conditions) return { err: 'conditions required!' };

    if (this.config.encode === 'bson')
      return (this.bsonFindOne(collection, conditions) as unknown as T) ?? null;

    const db = this.readJson(collection);
    return (db.find(item => this.matchesConditions(item, conditions)) ?? null) as T | null;
  }

  get<T = Record<string, unknown>>(collection: string): QueryResult<T> {
    if (!collection) return new QueryResult<T>(null, 'collection required!');

    if (this.config.encode === 'bson')
      return new QueryResult<T>(this.bsonAll(collection) as unknown as T[]);

    return new QueryResult<T>(this.readJson(collection) as unknown as T[]);
  }

  edit(collection: string, conditions: Conditions, newData: Record<string, unknown>): EditResult {
    if (!collection) return { err: 'Collection name required' };
    if (!conditions) return { err: 'Conditions required' };
    if (!newData) return { err: 'New data required' };

    if (this.config.encode === 'bson') return this.bsonEdit(collection, conditions, newData);

    const p = this.getJsonPath(collection);
    if (!fs.existsSync(p)) return { err: 'Collection not found', code: 404 };

    const db = this.readJson(collection);
    const pk = this.pkName();
    let modifiedCount = 0, skippedDuplicates = 0;

    const updatedDb = db.map(item => {
      if (!this.matchesConditions(item, conditions)) return item;
      const updated = { ...item, ...newData, [pk]: item[pk] };
      if (this.config.noRepeat) {
        if (this.isDuplicateInArray(db, updated, pk, String(item[pk]))) {
          skippedDuplicates++;
          return item;
        }
      }
      modifiedCount++;
      return updated;
    });

    if (modifiedCount === 0 && skippedDuplicates > 0)
      return { err: true, code: 'DUPLICATE_DATA', modifiedCount: 0, skippedDuplicates };
    if (modifiedCount === 0)
      return { err: 'No matching records found', code: 'NO_MATCH' };

    this.writeJson(collection, updatedDb);
    return { success: true, modifiedCount, skippedDuplicates };
  }

  count(collection: string): CountResult {
    if (!collection) return { success: false, err: 'collection required!' };
    if (this.config.encode === 'bson') {
      const h = this.getHandle(collection);
      return { success: true, count: h.index.size() };
    }
    return { success: true, count: this.readJson(collection).length };
  }

  check(collection: string, data: Conditions): boolean | { err: string } {
    if (!collection) return { err: 'collection required!' };
    if (!data) return { err: 'conditions required!' };
    const result = this.find(collection, data);
    if (result?.err) return { err: result.err };
    return (result.all() as unknown[]).length > 0;
  }

  search<T = Record<string, unknown>>(
    collection: string,
    conditions: Record<string, unknown>
  ): QueryResult<T> {
    if (!collection) return new QueryResult<T>(null, 'collection required!');
    if (!conditions) return new QueryResult<T>(null, 'conditions required!');

    const pk = this.pkName();

    // FIX: if searching by primary key with a plain value, use the index fast path
    if (
      this.config.encode === 'bson' &&
      conditions[pk] !== undefined &&
      typeof conditions[pk] === 'string'
    ) {
      const h = this.getHandle(collection);
      const entry = h.index.find(String(conditions[pk]));
      if (!entry) return new QueryResult<T>([]);
      const doc = h.store.read(entry.offset, entry.len);
      if (!doc) return new QueryResult<T>([]);

      // Still apply any remaining search conditions
      const otherConditions = Object.fromEntries(
        Object.entries(conditions).filter(([k]) => k !== pk)
      );
      if (Object.keys(otherConditions).length === 0)
        return new QueryResult<T>([doc] as unknown as T[]);

      const matches = Object.entries(otherConditions).every(([key, value]) => {
        const field = doc[key];
        if (field == null) return false;
        if (value && typeof value === 'object' && (value as Condition).$regex) {
          const cond = value as Condition;
          const flags = typeof cond.$options === 'string' ? cond.$options : 'i';
          return new RegExp(cond.$regex!, flags).test(String(field));
        }
        return String(field).toLowerCase().includes(String(value).toLowerCase());
      });

      return new QueryResult<T>(matches ? [doc] as unknown as T[] : []);
    }

    // Full scan for non-PK searches
    const all = this.config.encode === 'bson'
      ? this.bsonAll(collection)
      : this.readJson(collection);

    const results = all.filter(item =>
      Object.entries(conditions).every(([key, value]) => {
        const field = item[key];
        if (field == null) return false;
        if (value && typeof value === 'object' && (value as Condition).$regex) {
          const cond = value as Condition;
          const flags = typeof cond.$options === 'string' ? cond.$options : 'i';
          return new RegExp(cond.$regex!, flags).test(String(field));
        }
        return String(field).toLowerCase().includes(String(value).toLowerCase());
      })
    );

    return new QueryResult<T>(results as unknown as T[]);
  }

  drop(collection: string): DropResult {
    if (!collection) return { err: 'collection required!' };
    if (this.config.encode === 'bson') return this.bsonDrop(collection);

    const p = this.getJsonPath(collection);
    if (fs.existsSync(p)) { fs.unlinkSync(p); return { success: true }; }
    return { err: 'Collection not found', code: 404 };
  }

  reset(collection: string): DropResult { return this.drop(collection); }

  // ── Raw data access (JSON only) ───────────────────────────────────────────
  //
  // FIX: inject() and writeData() now run through noRepeat validation.
  // BSON mode is blocked as before — inject is inherently a JSON concept.

  inject(collection: string, data: unknown): WriteResult {
    if (!collection) return { err: 'collection required!' };
    if (this.config.encode === 'bson') return { err: 'inject() not supported in BSON mode' };
    if (!Array.isArray(data)) return { err: 'inject() expects an array' };

    const pk = this.pkName();

    // FIX: assign a primary key to any record that lacks one
    const normalized = (data as Record<string, unknown>[]).map(item => {
      if (!item[pk]) return { ...item, [pk]: this.generateUniqueId() };
      return item;
    });

    if (this.config.noRepeat) {
      const seen: Record<string, unknown>[] = [];
      for (const item of normalized) {
        if (this.isDuplicateInArray(seen, item, pk))
          return { err: 'inject() data contains duplicates (noRepeat enabled)', code: 'DUPLICATE_DATA' };
        seen.push(item);
      }
    }

    const p = this.getJsonPath(collection);
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(normalized, null, this.config.tabspace));
    // Windows-safe: unlink target before rename
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
    fs.renameSync(tmp, p);
    return { success: true };
  }

  // ── detectPkField ─────────────────────────────────────────────────────────
  private detectPkField(collection: string): string | null {
    const ext = this.config.extension;
    const dataPath = `${this.config.directory}/${collection}.${ext}`;
    const idxPath = `${this.config.directory}/${collection}.${ext}.bidx`;

    if (!fs.existsSync(dataPath) || !fs.existsSync(idxPath)) return null;

    let handle = this.handles.get(collection);
    let tmpStore: BSONPageStore | null = null;

    if (!handle) {
      tmpStore = new BSONPageStore(dataPath);
      handle = {
        store: tmpStore,
        index: new PersistedBTree(idxPath, 128),
      } as CollectionHandle;
    }

    try {
      const entries = handle.index.allEntries();
      if (entries.length === 0) return null;

      const firstEntry = entries[0];
      const doc = handle.store.read(firstEntry.offset, firstEntry.len);
      if (!doc) return null;

      // skip wrapper fields from non-array writeData()
      const keyValue = firstEntry.key;
      const configPk = this.pkName();
      const reserved = new Set(['saved_plain_data', 'data']);
      const matches = Object.keys(doc)
        .filter(field => !reserved.has(field) && String(doc[field]) === keyValue);

      if (matches.length === 0) return null;
      if (matches.includes(configPk)) return configPk;
      return matches[0];
    } finally {
      if (tmpStore) tmpStore.close();
    }
  }

  // ── writeData ─────────────────────────────────────────────────────────────
  writeData(collection: string, data: unknown): WriteResult {
    if (!collection) return { err: 'collection required!' };

    const ext = this.config.extension;
    const dataPath = `${this.config.directory}/${collection}.${ext}`;
    const idxPath = `${this.config.directory}/${collection}.${ext}.bidx`;
    const walPath = `${this.config.directory}/${collection}.${ext}.wal`;
    const tmpData = dataPath + '.tmp';
    const tmpIdx = idxPath + '.tmp';

    // ── close handle before ANY file operation ────────────────────────────
    // Windows holds file locks until the fd is explicitly closed.
    // Must happen before unlink or rename — not just before the rename.
    const h = this.handles.get(collection);
    if (h) { h.index.flush(); h.store.close(); this.handles.delete(collection); }

    // ── NON-ARRAY: plain object / config store ────────────────────────────
    if (!Array.isArray(data)) {
      if (this.config.encode === 'bson') {
        try {
          const pk = this.pkName();
          const id = String(this.generateUniqueId());
          const doc = { [pk]: id, saved_plain_data: 'bson', data };

          const store = new BSONPageStore(tmpData);
          const index = new PersistedBTree(tmpIdx, 128);
          const { offset, len } = store.append(doc);
          index.insert({ key: id, offset, len });
          index.flush();
          store.close();

          try { fs.writeFileSync(walPath, Buffer.alloc(0)); } catch { /* ignore */ }

          // Windows-safe: unlink target before rename
          try { if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath); } catch { /* ignore */ }
          try { if (fs.existsSync(idxPath)) fs.unlinkSync(idxPath); } catch { /* ignore */ }
          fs.renameSync(tmpData, dataPath);
          fs.renameSync(tmpIdx, idxPath);
          return { success: true };
        } catch (err) {
          try { if (fs.existsSync(tmpData)) fs.unlinkSync(tmpData); } catch { /* ignore */ }
          try { if (fs.existsSync(tmpIdx)) fs.unlinkSync(tmpIdx); } catch { /* ignore */ }
          return { err: `writeData() failed: ${(err as Error).message}` };
        }
      }

      // JSON non-array
      try {
        const p = this.getJsonPath(collection);
        const tmp = p + '.tmp';
        const content = this.config.encryption
          ? (this.encryptData(data) as string)
          : JSON.stringify(data, null, this.config.tabspace);
        fs.writeFileSync(tmp, content);
        try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
        fs.renameSync(tmp, p);
        return { success: true };
      } catch (err) {
        return { err: `writeData() failed: ${(err as Error).message}` };
      }
    }

    // ── ARRAY: records collection ─────────────────────────────────────────
    const records = data as Record<string, unknown>[];

    const pk = this.config.encode === 'bson'
      ? (this.detectPkField(collection) ?? this.pkName())
      : this.pkName();

    const missingIdx = records.findIndex(
      r => r[pk] === undefined || r[pk] === null || r[pk] === ''
    );
    if (missingIdx !== -1) {
      return {
        err: `record at index ${missingIdx} is missing primary key field "${pk}"`,
        code: 'MISSING_PK',
      };
    }

    const seen = new Set<string>();
    for (let i = 0; i < records.length; i++) {
      const key = String(records[i][pk]);
      if (seen.has(key))
        return { err: `duplicate primary key "${key}" at index ${i}`, code: 'DUPLICATE_KEY' };
      seen.add(key);
    }

    if (this.config.encode === 'bson') {
      try {
        const store = new BSONPageStore(tmpData);
        const index = new PersistedBTree(tmpIdx, 128);

        for (const doc of records) {
          const key = String(doc[pk]);
          const { offset, len } = store.append(doc);
          index.insert({ key, offset, len });
        }

        index.flush();
        store.close();

        try { fs.writeFileSync(walPath, Buffer.alloc(0)); } catch { /* ignore */ }

        // Windows-safe: unlink target before rename
        try { if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath); } catch { /* ignore */ }
        try { if (fs.existsSync(idxPath)) fs.unlinkSync(idxPath); } catch { /* ignore */ }
        fs.renameSync(tmpData, dataPath);
        fs.renameSync(tmpIdx, idxPath);
        return { success: true };
      } catch (err) {
        try { if (fs.existsSync(tmpData)) fs.unlinkSync(tmpData); } catch { /* ignore */ }
        try { if (fs.existsSync(tmpIdx)) fs.unlinkSync(tmpIdx); } catch { /* ignore */ }
        return { err: `writeData() failed: ${(err as Error).message}` };
      }
    }

    // JSON array
    try {
      const p = this.getJsonPath(collection);
      const tmp = p + '.tmp';
      const content = this.config.encryption
        ? (this.encryptData(records) as string)
        : JSON.stringify(records, null, this.config.tabspace);
      fs.writeFileSync(tmp, content);
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
      fs.renameSync(tmp, p);
      return { success: true };
    } catch (err) {
      return { err: `writeData() failed: ${(err as Error).message}` };
    }
  }

  // ── readData ──────────────────────────────────────────────────────────────

  readData(collection: string): unknown {
    if (!collection) return { err: 'collection required!' };

    if (this.config.encode === 'bson') {
      const records = this.bsonAll(collection);

      // unwrap plain object saved by non-array writeData()
      if (records.length === 1 && records[0].saved_plain_data === 'bson') {
        return records[0].data;
      }

      return records;
    }

    // JSON
    const p = this.getJsonPath(collection);
    if (!fs.existsSync(p)) return null;
    try {
      const raw = fs.readFileSync(p, 'utf8');
      const content = this.config.encryption ? this.decryptData(raw) : raw;
      if (typeof content !== 'string') return content;
      try { return JSON.parse(content); } catch { return content; }
    } catch { return null; }
  }

  // ── Config Migration ──────────────────────────────────────────────────────
  //
  // FIX: now handles BSON source collections in addition to JSON.

  changeConfig({ from, to, collections }: ChangeConfigOptions): ChangeConfigResult {
    const keyLengths: Record<string, number> = {
      'aes-128-cbc': 32, 'aes-192-cbc': 48, 'aes-256-cbc': 64,
      'aes-128-gcm': 32, 'aes-256-gcm': 64,
    };
    const validate = (key?: string | null, algo?: string | null): void => {
      if (!algo) return;
      if (!key || key.length !== keyLengths[algo])
        throw new Error(`${algo} requires ${keyLengths[algo]} hex characters`);
    };
    validate(from.encryptionKey, from.encryption);
    validate(to.encryptionKey, to.encryption);

    const fromDir = from.directory ?? this.config.directory;
    const toDir = to.directory ?? this.config.directory;
    const fromExt = from.extension ?? this.config.extension;
    const toExt = to.extension ?? this.config.extension;
    const fromEncode = from.encode ?? this.config.encode;
    const toEncode = to.encode ?? this.config.encode;

    // FIX: resolve the primary key name from config, not hardcoded '_id'/'id'
    const pkField = typeof this.config.autoPrimaryKey === 'string' && this.config.autoPrimaryKey.length > 0
      ? this.config.autoPrimaryKey
      : '_id';

    if (!fs.existsSync(toDir)) fs.mkdirSync(toDir, { recursive: true });

    const files = fs.readdirSync(fromDir);
    let successCount = 0, errorCount = 0;

    files.forEach(file => {
      const ext = path.extname(file).slice(1);
      const name = path.basename(file, '.' + ext);

      if (file.endsWith('.bidx') || file.endsWith('.wal') || file.endsWith('.tmp')) return;
      if (ext !== fromExt) return;
      if (collections && !collections.includes(name)) return;

      const fromPath = path.join(fromDir, file);
      const toPath = path.join(toDir, `${name}.${toExt}`);

      try {
        let records: Record<string, unknown>[] = [];

        if (fromEncode === 'bson') {
          // Check for old BSON format first
          records = this.readOldBson(fromPath);
          if (records.length === 0 && fs.existsSync(fromPath)) {
            // New BSON format migration
            const tmpStore = new BSONPageStore(fromPath);
            const tmpIdx = new PersistedBTree(fromPath + '.bidx', 128);
            const entries = tmpIdx.allEntries();
            records = entries.map(e => tmpStore.read(e.offset, e.len)).filter(Boolean) as Record<string, unknown>[];
            tmpStore.close();
          }
        } else {
          const raw = fs.readFileSync(fromPath, 'utf8');
          records = (from.encryption
            ? decrypt(raw, from.encryptionKey!, from.encryption as any)
            : JSON.parse(raw)) as Record<string, unknown>[];
        }

        // FIX: apply noRepeat validation before writing to destination
        if (this.config.noRepeat) {
          const seen: Record<string, unknown>[] = [];
          const deduped: Record<string, unknown>[] = [];
          for (const doc of records) {
            if (!this.isDuplicateInArray(seen, doc, pkField)) {
              seen.push(doc);
              deduped.push(doc);
            }
          }
          records = deduped;
        }

        if (toEncode === 'bson') {
          const tmpStore = new BSONPageStore(toPath);
          const tmpIdx = new PersistedBTree(toPath + '.bidx', 128);
          for (const doc of records) {
            const { offset, len } = tmpStore.append(doc);
            // FIX: use configured pkField instead of hardcoded '_id'/'id'
            const pkVal = String(doc[pkField] ?? '');
            if (pkVal) tmpIdx.insert({ key: pkVal, offset, len });
          }
          tmpIdx.flush();
          tmpStore.close();
        } else {
          const newContent = to.encryption
            ? encrypt(records, to.encryptionKey!, to.encryption as any)
            : JSON.stringify(records, null, 3);
          const tmp = toPath + '.tmp';
          fs.writeFileSync(tmp, newContent as string);
          // Windows-safe: unlink target before rename
          try { if (fs.existsSync(toPath)) fs.unlinkSync(toPath); } catch { /* ignore */ }
          fs.renameSync(tmp, toPath);
        }

        successCount++;
        if (fromPath !== toPath && fs.existsSync(fromPath)) fs.unlinkSync(fromPath);
      } catch (err) {
        console.error(`Failed to convert ${file}: ${(err as Error).message}`);
        errorCount++;
      }
    });

    if (fromDir !== toDir && fs.existsSync(fromDir)) {
      try {
        if (fs.readdirSync(fromDir).length === 0) fs.rmdirSync(fromDir);
      } catch { /* ignore */ }
    }

    return { success: true, converted: successCount, failed: errorCount };
  }

  // ── AI Analysis ───────────────────────────────────────────────────────────

  async analyse({
    collection, filter, data, model, apiKey, query,
  }: {
    collection?: string;
    filter?: Conditions;
    data?: unknown[];
    model: string;
    apiKey: string;
    query: string;
  }): Promise<AnalyseResult> {
    if (data && !Array.isArray(data)) return { success: false, err: 'Data must be an array' };
    if (data && collection) return { success: false, err: 'Cannot specify both collection and data' };
    if (!model) return { success: false, err: 'Model is required' };
    if (!apiKey) return { success: false, err: 'API Key is required' };
    if (!query) return { success: false, err: 'Query is required' };
    if (query.length > 1024) return { success: false, err: 'Query exceeds 1024 characters' };

    let collData: unknown[] = data ?? [];
    if (!data) {
      const getResult = this.get(collection!);
      if (getResult?.err) return { success: false, err: getResult.err };
      collData = getResult.all() as unknown[];
    }

    if (filter) {
      collData = collData.filter(item =>
        this.matchesConditions(item as Record<string, unknown>, filter)
      );
    }

    if (collData.length === 0) return { success: false, err: 'No matching data found' };

    const genAI = new GoogleGenAI({ apiKey });
    const prompt = `
Analyze the following data array according to the specified conditions.
Return a JSON response with the exact structure shown below.

Response format (JSON only, no markdown):
{
    "indexes": [0, 2, 3],
    "reason": "These items match the criteria because...",
    "message": "Additional insights about the selection"
}

Data:
${JSON.stringify(collData, null, 2)}

Conditions:
${query}

Rules:
1. Return only valid JSON in the format above.
2. "indexes" must be an array of numbers (indices into the data array above).
3. "reason" should explain your selection logic.
4. Keep the response concise.
`;

    try {
      const response = await genAI.models.generateContent({ model, contents: prompt });
      const cleanResponse = (response.text || '').replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleanResponse) as Omit<AnalyseResponse, 'data'>;
      if (!parsed.indexes || !Array.isArray(parsed.indexes))
        throw new Error('Invalid response format: missing indexes array');
      return {
        success: true,
        response: { ...parsed, data: parsed.indexes.map(i => collData[i]) },
      };
    } catch (error) {
      return { success: false, err: (error as Error).message ?? 'Failed to process AI response' };
    }
  }

  // ── File Storage ──────────────────────────────────────────────────────────

  writeFile(name: string, data: Buffer): FileResult {
    if (!name) return { err: 'File name required' };
    if (!data) return { err: 'Data required' };
    if (name.includes('/') || name.includes('\\')) return { err: 'Invalid file name' };
    if (!Buffer.isBuffer(data)) return { err: 'Data must be a Buffer' };
    const filesDir = `${this.config.directory}/files`;
    if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true });
    try {
      const target = `${filesDir}/${name}`;
      const tmp = target + '.tmp';
      fs.writeFileSync(tmp, data);
      // Windows-safe: unlink target before rename
      try { if (fs.existsSync(target)) fs.unlinkSync(target); } catch { /* ignore */ }
      fs.renameSync(tmp, target);
      return { success: true };
    } catch (error) {
      return { err: `Failed to write file: ${(error as Error).message}` };
    }
  }

  allFiles(): string[] {
    const filesDir = `${this.config.directory}/files`;
    if (!fs.existsSync(filesDir)) return [];
    return fs.readdirSync(filesDir);
  }

  readFile(name: string): FileResult {
    if (!name) return { err: 'File name required' };
    const filesDir = `${this.config.directory}/files`;
    const filePath = `${filesDir}/${name}`;
    if (!fs.existsSync(filePath)) return { err: 'File not found', code: 404 };
    try {
      return { success: true, data: fs.readFileSync(filePath) };
    } catch (error) {
      return { err: `Failed to read file: ${(error as Error).message}` };
    }
  }

  async readImage(name: string, config: ReadImageConfig = {}): Promise<ReadImageResult> {
    if (!name) return { err: 'File name required' };
    if (name.includes('/') || name.includes('\\')) return { err: 'Invalid file name' };
    const filesDir = `${this.config.directory}/files`;
    const filePath = `${filesDir}/${name}`;
    if (!fs.existsSync(filePath)) return { err: 'File not found', code: 404 };

    const imageExtensions = [
      '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp',
      '.tiff', '.svg', '.ico', '.heic', '.avif', '.jfif',
    ];
    const ext = path.extname(name).toLowerCase();
    if (!imageExtensions.includes(ext)) return { err: 'Not a valid image file' };

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
        maxWidth: (config.maxWidth ?? 0) > 0 ? Math.round(config.maxWidth!) : null,
        maxHeight: (config.maxHeight ?? 0) > 0 ? Math.round(config.maxHeight!) : null,
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
    } catch (error) {
      return { err: `Failed to process image: ${(error as Error).message}`, code: 'PROCESSING_ERROR' };
    }
  }

  deleteFile(name: string): FileResult {
    if (!name) return { err: 'File name required' };
    const filePath = `${this.config.directory}/files/${name}`;
    if (!fs.existsSync(filePath)) return { err: 'File not found', code: 404 };
    try {
      fs.unlinkSync(filePath);
      return { success: true };
    } catch (error) {
      return { err: `Failed to delete file: ${(error as Error).message}` };
    }
  }
}

export default eveloDB;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = eveloDB;
  module.exports.default = eveloDB;
  module.exports.eveloDB = eveloDB;
}