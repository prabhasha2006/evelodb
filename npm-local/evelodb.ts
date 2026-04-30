import * as fs from 'fs';
import { encrypt, decrypt, generateKey } from './encryption.js';
import { BSON, ObjectId } from 'bson';
import { GoogleGenAI } from '@google/genai';
import imageProcess from './imageProcess.js';
import * as path from 'path';

// ─── Type Definitions ──────────────────────────────────────────────────────────

export interface EveloDBConfig {
  /** Directory to store collections. @default './evelodatabase' */
  directory?: string;
  /** File extension to use. @default 'json' */
  extension?: string;
  /** Number of spaces for JSON formatting. @default 3 */
  tabspace?: number;
  /** Encoding type. @default 'json' */
  encode?: 'json' | 'bson';
  /** Encryption algorithm if any. @default null */
  encryption?: string | null;
  /** Encryption key in hex. @default null */
  encryptionKey?: string | null;
  /** Prevent duplicate records. @default false */
  noRepeat?: boolean;
  /** Enable or name auto-generated primary key. @default true */
  autoPrimaryKey?: boolean | string;
  /** Use BSON ObjectId for IDs if encoding is BSON. @default false */
  objectId?: boolean;
}

export interface ReadImageConfig {
  /** Return base64 string. @default true */
  returnBase64?: boolean;
  /** Image quality from 0.1 to 1. @default 1 */
  quality?: number;
  /** Resize pixels (0 to keep original size). @default 0 */
  pixels?: number;
  /** Convert to grayscale. @default false */
  blackAndWhite?: boolean;
  /** Mirror image horizontally. @default false */
  mirror?: boolean;
  /** Flip image vertically. @default false */
  upToDown?: boolean;
  /** Invert colors. @default false */
  invert?: boolean;
  /** Brightness multiplier. @default 1 */
  brightness?: number;
  /** Contrast multiplier. @default 1 */
  contrast?: number;
  /** Max width in pixels. @default null */
  maxWidth?: number | null;
  /** Max height in pixels. @default null */
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
  err?: string;
  code?: string | number;
  modifiedCount?: number;
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

export interface FileChunkInfo {
  isChunked: boolean;
  chunkCount: number;
  totalSize: number;
  chunkFiles: string[];
  hasOversizedItems: boolean;
  usesJsonFallback?: boolean;
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
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function deepCompare(obj1: unknown, obj2: unknown): boolean {
  if (obj1 === obj2) return true;
  if (
    obj1 === null ||
    obj2 === null ||
    typeof obj1 !== 'object' ||
    typeof obj2 !== 'object'
  ) {
    return obj1 === obj2;
  }

  const isArr1 = Array.isArray(obj1);
  const isArr2 = Array.isArray(obj2);
  if (isArr1 !== isArr2) return false;

  if (isArr1 && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) return false;
    for (let i = 0; i < obj1.length; i++) {
      if (!deepCompare(obj1[i], obj2[i])) return false;
    }
    return true;
  } else {
    const o1 = obj1 as Record<string, unknown>;
    const o2 = obj2 as Record<string, unknown>;
    const keys1 = Object.keys(o1);
    const keys2 = Object.keys(o2);
    if (keys1.length !== keys2.length) return false;
    for (const key of keys1) {
      if (
        !Object.prototype.hasOwnProperty.call(o2, key) ||
        !deepCompare(o1[key], o2[key])
      )
        return false;
    }
    return true;
  }
}

// ─── B-Tree ────────────────────────────────────────────────────────────────────

class BTreeNode {
  keys: Array<[unknown, unknown]>;
  children: BTreeNode[];
  isLeaf: boolean;

  constructor(isLeaf: boolean) {
    this.keys = [];
    this.children = [];
    this.isLeaf = isLeaf;
  }
}

class BTree {
  order: number;
  root: BTreeNode;

  constructor(order: number) {
    this.order = order;
    this.root = new BTreeNode(true);
  }

  insert(key: unknown, value: unknown): void {
    const root = this.root;
    if (root.keys.length === this.order - 1) {
      const newRoot = new BTreeNode(false);
      newRoot.children.push(root);
      this.splitChild(newRoot, 0);
      this.root = newRoot;
    }
    this.insertNonFull(this.root, [key, value]);
  }

  private insertNonFull(node: BTreeNode, keyValue: [unknown, unknown]): void {
    let i = node.keys.length - 1;
    if (node.isLeaf) {
      node.keys.push(null as unknown as [unknown, unknown]);
      while (i >= 0 && (keyValue[0] as number) < (node.keys[i][0] as number)) {
        node.keys[i + 1] = node.keys[i];
        i--;
      }
      node.keys[i + 1] = keyValue;
    } else {
      while (i >= 0 && (keyValue[0] as number) < (node.keys[i][0] as number)) {
        i--;
      }
      i++;
      if (node.children[i].keys.length === this.order - 1) {
        this.splitChild(node, i);
        if ((keyValue[0] as number) > (node.keys[i][0] as number)) {
          i++;
        }
      }
      this.insertNonFull(node.children[i], keyValue);
    }
  }

  private splitChild(node: BTreeNode, i: number): void {
    const order = this.order;
    const child = node.children[i];
    const newNode = new BTreeNode(child.isLeaf);
    node.keys.splice(i, 0, child.keys[Math.floor(order / 2)]);
    node.children.splice(i + 1, 0, newNode);
    newNode.keys = child.keys.splice(Math.floor(order / 2) + 1);
    if (!child.isLeaf) {
      newNode.children = child.children.splice(Math.floor(order / 2) + 1);
    }
  }

  traverse(node: BTreeNode): unknown[] {
    let result: unknown[] = [];
    for (let i = 0; i < node.keys.length; i++) {
      if (!node.isLeaf) {
        result = result.concat(this.traverse(node.children[i]));
      }
      result.push(node.keys[i][1]);
    }
    if (!node.isLeaf && node.children.length > node.keys.length) {
      result = result.concat(this.traverse(node.children[node.keys.length]));
    }
    return result;
  }
}

// ─── QueryResult ───────────────────────────────────────────────────────────────

export class QueryResult<T = unknown> {
  data: T[];
  err?: string;

  constructor(data: T[] | null | undefined, err?: string) {
    if (err) {
      this.err = err;
      this.data = [];
    } else {
      this.data = Array.isArray(data) ? data : [];
    }
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

// ─── eveloDB ───────────────────────────────────────────────────────────────────

export class eveloDB {
  config: Required<EveloDBConfig>;
  private btree: BTree;

  constructor(config: EveloDBConfig = {}) {
    this.config = { ...defaultConfig, ...config };

    if (
      this.config.encode === 'bson' &&
      this.config.encryption &&
      this.config.encryptionKey
    ) {
      throw new Error(
        'BSON encoding does not support encryption. Please set "encryption" and "encryptionKey" to null or use "json" encoding.'
      );
    }

    if (this.config.encode === 'bson') {
      if (!config.extension) {
        this.config.extension = 'bson';
      }
      this.config.tabspace = 0;
      this.config.encryption = null;
      this.config.encryptionKey = null;
    }

    if (this.config.encryption) {
      const key = this.config.encryptionKey;
      const algorithm = this.config.encryption;

      if (!key) {
        throw new Error('Encryption key required when encryption is enabled');
      }

      const keyLengths: Record<string, number> = {
        'aes-128-cbc': 32,
        'aes-192-cbc': 48,
        'aes-256-cbc': 64,
        'aes-128-gcm': 32,
        'aes-256-gcm': 64,
      };

      const expectedLength = keyLengths[algorithm];

      if (!expectedLength) {
        throw new Error(`Unsupported encryption algorithm: ${algorithm}`);
      }

      if (key.length !== expectedLength) {
        throw new Error(
          `${algorithm.toUpperCase()} requires a ${expectedLength}-character hex key (${expectedLength / 2
          } bytes)`
        );
      }
    }

    this.btree = new BTree(3);
    if (!fs.existsSync(this.config.directory)) {
      fs.mkdirSync(this.config.directory, { recursive: true });
    }
  }

  // ── Encryption helpers ────────────────────────────────────────────────────

  private encryptData(data: unknown): unknown {
    if (this.config.encode === 'bson') return data;
    return encrypt(
      data,
      this.config.encryptionKey!,
      this.config.encryption as any
    );
  }

  private decryptData(data: unknown): unknown {
    if (this.config.encode === 'bson') return data;
    return decrypt(
      data as string,
      this.config.encryptionKey!,
      this.config.encryption as any
    );
  }

  private encodeData(data: unknown): Buffer | string {
    if (this.config.encode === 'bson') {
      try {
        const obj = { db: data };
        return Buffer.from(BSON.serialize(obj));
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'ERR_OUT_OF_RANGE' || err.message?.includes('out of range')) {
          console.warn('BSON serialization failed, falling back to JSON for large object');
          return JSON.stringify(data, null, this.config.tabspace);
        }
        throw error;
      }
    }
    return JSON.stringify(data, null, this.config.tabspace);
  }

  private decodeData(data: Buffer | string): unknown {
    if (this.config.encode === 'bson') {
      try {
        const { db } = BSON.deserialize(data as Buffer);
        return db;
      } catch (error) {
        try {
          return JSON.parse(data.toString('utf8'));
        } catch (jsonError) {
          throw new Error(
            `Failed to decode data: ${(error as Error).message}, ${(jsonError as Error).message}`
          );
        }
      }
    }
    return JSON.parse(data.toString());
  }

  // ── Size estimation ───────────────────────────────────────────────────────

  private getSafeBsonSize(data: unknown): number {
    if (this.config.encode !== 'bson') {
      return Buffer.from(JSON.stringify(data)).length;
    }
    try {
      const obj = { db: data };
      return BSON.serialize(obj).length;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ERR_OUT_OF_RANGE' || err.message?.includes('out of range')) {
        return Buffer.from(JSON.stringify(data)).length;
      }
      throw error;
    }
  }

  // ── File path helpers ─────────────────────────────────────────────────────

  private splitFilePath(filePath: string): { name: string; extension: string } {
    const lastDotIndex = filePath.lastIndexOf('.');
    if (lastDotIndex === -1) return { name: filePath, extension: '' };
    return {
      name: filePath.substring(0, lastDotIndex),
      extension: filePath.substring(lastDotIndex),
    };
  }

  private getChunkFileName(baseFilePath: string, chunkIndex: number): string {
    const { name, extension } = this.splitFilePath(baseFilePath);
    if (chunkIndex === 0) return baseFilePath;
    return `${name} ${chunkIndex}${extension}`;
  }

  // ── File I/O ──────────────────────────────────────────────────────────────

  private writeFileData(filePath: string, data: unknown): boolean {
    const MAX_SIZE = 10_000_000; // 10 MB

    if (this.config.encode !== 'bson' || !Array.isArray(data)) {
      const encodedData = this.config.encryption
        ? this.encryptData(data)
        : this.encodeData(data);
      fs.writeFileSync(filePath, encodedData as string | Buffer);
      this.cleanupChunkFiles(filePath);
      return true;
    }

    const totalSize = this.getSafeBsonSize(data);

    if (totalSize <= MAX_SIZE) {
      try {
        const encodedData = this.config.encryption
          ? this.encryptData(data)
          : this.encodeData(data);
        fs.writeFileSync(filePath, encodedData as string | Buffer);
        this.cleanupChunkFiles(filePath);
        return true;
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'ERR_OUT_OF_RANGE' || err.message?.includes('out of range')) {
          console.warn('Single file storage failed, proceeding with chunking');
        } else {
          throw error;
        }
      }
    }

    // Chunk the array
    const chunks: unknown[][] = [];
    let currentChunk: unknown[] = [];
    let currentSize = 0;

    for (const item of data as unknown[]) {
      const itemSize = this.getSafeBsonSize([item]);

      if (itemSize > MAX_SIZE) {
        console.warn(
          `Single item exceeds maximum size (${itemSize} > ${MAX_SIZE}), storing separately`
        );
        if (currentChunk.length > 0) {
          chunks.push([...currentChunk]);
          currentChunk = [];
          currentSize = 0;
        }
        chunks.push([item]);
        continue;
      }

      if (currentSize + itemSize > MAX_SIZE && currentChunk.length > 0) {
        chunks.push([...currentChunk]);
        currentChunk = [item];
        currentSize = itemSize;
      } else {
        currentChunk.push(item);
        currentSize += itemSize;
      }
    }

    if (currentChunk.length > 0) chunks.push(currentChunk);

    console.log(`Splitting data into ${chunks.length} chunks`);

    for (let i = 0; i < chunks.length; i++) {
      const chunkFilePath = this.getChunkFileName(filePath, i);
      try {
        const encodedData = this.config.encryption
          ? this.encryptData(chunks[i])
          : this.encodeData(chunks[i]);
        fs.writeFileSync(chunkFilePath, encodedData as string | Buffer);
      } catch (error) {
        console.error(`Failed to write chunk ${i}:`, error);
        if (chunks[i].length > 1) {
          console.warn('Retrying with smaller chunk size');
          this.writeFileData(chunkFilePath, chunks[i]);
        } else {
          throw new Error(`Failed to store oversized item: ${(error as Error).message}`);
        }
      }
    }

    this.cleanupChunkFiles(filePath, chunks.length);
    return true;
  }

  private cleanupChunkFiles(baseFilePath: string, currentChunkCount = 1): void {
    let chunkIndex = currentChunkCount;
    while (true) {
      const chunkFilePath = this.getChunkFileName(baseFilePath, chunkIndex);
      if (fs.existsSync(chunkFilePath)) {
        try {
          fs.unlinkSync(chunkFilePath);
          console.log(`Cleaned up leftover chunk: ${chunkFilePath}`);
        } catch (error) {
          console.warn(`Failed to remove chunk file ${chunkFilePath}:`, error);
        }
        chunkIndex++;
      } else {
        break;
      }
    }
  }

  private readFileData(filePath: string): unknown {
    if (!fs.existsSync(filePath)) return null;

    let mainData: Buffer | string;
    try {
      mainData =
        this.config.encode === 'bson'
          ? fs.readFileSync(filePath)
          : fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      console.error(`Failed to read main file ${filePath}:`, error);
      return null;
    }

    let result: unknown;
    try {
      result = this.config.encryption
        ? this.decryptData(mainData)
        : this.decodeData(mainData);
    } catch (error) {
      console.error(`Failed to decode main file ${filePath}:`, error);
      return null;
    }

    if (!Array.isArray(result)) return result;

    const combinedData = [...result];
    let chunkIndex = 1;

    while (true) {
      const chunkFilePath = this.getChunkFileName(filePath, chunkIndex);
      if (!fs.existsSync(chunkFilePath)) break;

      try {
        const chunkData =
          this.config.encode === 'bson'
            ? fs.readFileSync(chunkFilePath)
            : fs.readFileSync(chunkFilePath, 'utf8');

        const decodedChunk = this.config.encryption
          ? this.decryptData(chunkData)
          : this.decodeData(chunkData);

        if (Array.isArray(decodedChunk)) {
          combinedData.push(...decodedChunk);
        }
        chunkIndex++;
      } catch (error) {
        console.warn(`Error reading chunk file ${chunkFilePath}:`, error);
        break;
      }
    }

    return combinedData;
  }

  getFileChunkInfo(filePath: string): FileChunkInfo | null {
    if (!fs.existsSync(filePath)) return null;

    const info: FileChunkInfo = {
      isChunked: false,
      chunkCount: 1,
      totalSize: 0,
      chunkFiles: [filePath],
      hasOversizedItems: false,
    };

    try {
      const mainStats = fs.statSync(filePath);
      info.totalSize = mainStats.size;

      if (this.config.encode === 'bson') {
        const data = fs.readFileSync(filePath);
        try {
          BSON.deserialize(data);
        } catch {
          info.usesJsonFallback = true;
        }
      }
    } catch (error) {
      console.warn(`Error getting stats for ${filePath}:`, error);
    }

    let chunkIndex = 1;
    while (true) {
      const chunkFilePath = this.getChunkFileName(filePath, chunkIndex);
      if (fs.existsSync(chunkFilePath)) {
        info.isChunked = true;
        info.chunkCount++;
        info.chunkFiles.push(chunkFilePath);

        try {
          const chunkStats = fs.statSync(chunkFilePath);
          info.totalSize += chunkStats.size;
          if (chunkStats.size > 10_000_000) info.hasOversizedItems = true;
        } catch (error) {
          console.warn(`Error getting stats for ${chunkFilePath}:`, error);
        }

        chunkIndex++;
      } else {
        break;
      }
    }

    return info;
  }

  // ── Public helpers ────────────────────────────────────────────────────────

  generateKey(length: number): string {
    return generateKey(length);
  }

  private getFilePath(collection: string): string {
    return `${this.config.directory}/${collection}.${this.config.extension}`;
  }

  private generateUniqueId(): string | ObjectId {
    if (this.config.encode === 'bson' && this.config.objectId) {
      return new ObjectId();
    }
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 10);
    return `${timestamp}${randomStr}`;
  }

  // ── CRUD Operations ───────────────────────────────────────────────────────

  create(collection: string, data: Record<string, unknown>): WriteResult {
    if (!collection) return { err: 'Collection name required' };
    if (
      collection.includes('/') ||
      collection.includes('\\') ||
      collection.includes('.') ||
      collection.includes(' ')
    ) {
      return { err: 'Invalid collection name. Avoid special characters and spaces.' };
    }
    if (!data || typeof data !== 'object') return { err: 'Valid data object required' };

    const fullPath = this.getFilePath(collection);
    let db: Record<string, unknown>[] = [];

    if (fs.existsSync(fullPath)) {
      db = this.readFileData(fullPath) as Record<string, unknown>[];
      if (!Array.isArray(db)) return { err: 'Collection data is not an array' };

      if (this.config.noRepeat) {
        const isDuplicate = db.some(existingItem =>
          Object.keys(data).every(key => {
            if (key === this.config.autoPrimaryKey) return true;
            return deepCompare(existingItem[key], data[key]);
          }) && Object.keys(data).every(key => key in existingItem)
        );

        if (isDuplicate) {
          return {
            err: 'Duplicate data - record already exists (noRepeat enabled)',
            code: 'DUPLICATE_DATA',
          };
        }
      }
    }

    const object: Record<string, unknown> = { ...data };

    let autoPrimaryKeyName: string | undefined;
    if (this.config.autoPrimaryKey) {
      autoPrimaryKeyName =
        typeof this.config.autoPrimaryKey === 'string' &&
          this.config.autoPrimaryKey.length > 0
          ? this.config.autoPrimaryKey
          : '_id';

      if (!Object.prototype.hasOwnProperty.call(object, autoPrimaryKeyName)) {
        object[autoPrimaryKeyName] = this.generateUniqueId();
      }
    }

    db.push(object);
    this.writeFileData(fullPath, db);

    if (object.token) {
      this.btree.insert(object.token, object);
    }

    return {
      success: true,
      ...(autoPrimaryKeyName && object[autoPrimaryKeyName]
        ? { [autoPrimaryKeyName]: object[autoPrimaryKeyName] }
        : {}),
    };
  }

  delete(collection: string, conditions: Conditions): DeleteResult {
    if (!collection) return { err: 'collection required!' };
    if (!conditions) return { err: 'conditions required!' };

    const fullPath = this.getFilePath(collection);
    if (!fs.existsSync(fullPath)) return { err: 'Not found', code: 404 };

    const db = this.readFileData(fullPath) as unknown[];
    if (!Array.isArray(db)) return { err: 'Collection data is not an array' };

    const originalLength = db.length;
    const filteredData = db.filter(
      item => !this.matchesConditions(item as Record<string, unknown>, conditions)
    );
    const deletedCount = originalLength - filteredData.length;

    this.writeFileData(fullPath, filteredData);
    return { success: true, deletedCount };
  }

  inject(collection: string, data: unknown): WriteResult {
    if (!collection) return { err: 'collection required!' };
    if (data === undefined || data === null) return { err: 'data required!' };

    const fullPath = this.getFilePath(collection);
    this.writeFileData(fullPath, data);
    return { success: true };
  }

  writeData(collection: string, data: unknown): WriteResult {
    if (!collection) return { err: 'collection required!' };
    if (
      collection.includes('/') ||
      collection.includes('\\') ||
      collection.includes('.') ||
      collection.includes(' ')
    ) {
      return { err: 'Invalid collection name. Avoid special characters and spaces.' };
    }
    if (data === undefined || data === null) return { err: 'data required!' };

    const fullPath = this.getFilePath(collection);
    this.writeFileData(fullPath, data);
    return { success: true };
  }

  find<T = Record<string, unknown>>(
    collection: string,
    conditions: Conditions
  ): QueryResult<T> {
    if (!collection) return new QueryResult<T>(null, 'collection required!');
    if (!conditions) return new QueryResult<T>(null, 'conditions required!');

    const fullPath = this.getFilePath(collection);
    if (!fs.existsSync(fullPath)) return new QueryResult<T>([]);

    const db = this.readFileData(fullPath) as T[];
    if (!Array.isArray(db))
      return new QueryResult<T>(null, 'Collection data is not an array');

    const results = db.filter(item =>
      this.matchesConditions(item as Record<string, unknown>, conditions)
    );
    return new QueryResult<T>(results);
  }

  findOne<T = Record<string, unknown>>(
    collection: string,
    conditions: Conditions
  ): T | null | { err: string } {
    if (!collection) return { err: 'collection required!' };
    if (!conditions) return { err: 'conditions required!' };

    const fullPath = this.getFilePath(collection);
    if (!fs.existsSync(fullPath)) return null;

    const db = this.readFileData(fullPath) as T[];
    if (!Array.isArray(db)) return { err: 'Collection data is not an array' };

    return (
      db.find(item =>
        this.matchesConditions(item as Record<string, unknown>, conditions)
      ) ?? null
    );
  }

  search<T = Record<string, unknown>>(
    collection: string,
    conditions: Record<string, unknown>
  ): QueryResult<T> {
    if (!collection) return new QueryResult<T>(null, 'collection required!');
    if (!conditions) return new QueryResult<T>(null, 'conditions required!');

    const fullPath = this.getFilePath(collection);
    if (!fs.existsSync(fullPath)) return new QueryResult<T>([]);

    const db = this.readFileData(fullPath) as Record<string, unknown>[];
    if (!Array.isArray(db))
      return new QueryResult<T>(null, 'Collection data is not an array');

    const results = db.filter(item =>
      Object.entries(conditions).every(([key, value]) => {
        const field = item[key];
        if (field === undefined || field === null) return false;

        if (value && typeof value === 'object' && (value as Condition).$regex) {
          const cond = value as Condition;
          const regex = new RegExp(cond.$regex!, cond.$options ?? 'i');
          return regex.test(String(field));
        }

        return String(field).toLowerCase().includes(String(value).toLowerCase());
      })
    );

    return new QueryResult<T>(results as unknown as T[]);
  }

  get<T = Record<string, unknown>>(collection: string): QueryResult<T> {
    if (!collection) return new QueryResult<T>(null, 'collection required!');

    const fullPath = this.getFilePath(collection);
    if (!fs.existsSync(fullPath)) return new QueryResult<T>(undefined);

    const data = this.readFileData(fullPath) as T[];
    if (!Array.isArray(data))
      return new QueryResult<T>(null, 'Collection data is not an array');

    return new QueryResult<T>(data);
  }

  readData(collection: string): unknown {
    if (!collection) return { err: 'collection required!' };

    const fullPath = this.getFilePath(collection);
    if (!fs.existsSync(fullPath)) return undefined;

    return this.readFileData(fullPath);
  }

  count(collection: string): CountResult {
    if (!collection) return { success: false, err: 'collection required!' };

    const getResult = this.get(collection);
    if (getResult?.err) return { success: false, err: getResult.err };

    const result = getResult.all();
    if (!result) return { success: false, err: 'Collection not found' };
    if (!Array.isArray(result)) return { success: false, err: 'Invalid collection data format' };

    return { success: true, count: result.length };
  }

  check(collection: string, data: Conditions): boolean | { err: string } {
    if (!collection) return { err: 'collection required!' };
    if (!data) return { err: 'conditions required!' };

    const result = this.find(collection, data);
    if (result?.err) return { err: result.err };

    return (result.all() as unknown[]).length > 0;
  }

  edit(
    collection: string,
    conditions: Conditions,
    newData: Record<string, unknown>
  ): EditResult {
    if (!collection) return { err: 'Collection name required' };
    if (!conditions) return { err: 'Conditions required' };
    if (!newData) return { err: 'New data required' };

    const fullPath = this.getFilePath(collection);
    if (!fs.existsSync(fullPath)) return { err: 'Collection not found', code: 404 };

    const db = this.readFileData(fullPath) as Record<string, unknown>[];
    if (!Array.isArray(db)) return { err: 'Collection data is not an array' };

    let editedCount = 0;
    let duplicateFound = false;
    const pkKey =
      typeof this.config.autoPrimaryKey === 'string' ? this.config.autoPrimaryKey : '_id';

    const updatedDb = db.map(item => {
      if (this.matchesConditions(item, conditions)) {
        const updatedItem = { ...item, ...newData };

        if (this.config.noRepeat) {
          const isDuplicate = db.some(existingItem => {
            if (
              existingItem[pkKey] &&
              item[pkKey] &&
              existingItem[pkKey] === item[pkKey]
            ) {
              return false;
            }
            return deepCompare(existingItem, updatedItem);
          });

          if (isDuplicate) {
            duplicateFound = true;
            return item;
          }
        }

        editedCount++;
        return updatedItem;
      }
      return item;
    });

    if (duplicateFound) {
      return { err: 'Edit would create duplicate data (noRepeat enabled)', code: 'DUPLICATE_DATA' };
    }

    if (editedCount === 0) {
      return { err: 'No matching records found', code: 'NO_MATCH' };
    }

    this.writeFileData(fullPath, updatedDb);
    return { success: true, modifiedCount: editedCount };
  }

  drop(collection: string): DropResult {
    if (!collection) return { err: 'collection required!' };

    const fullPath = this.getFilePath(collection);

    if (this.config.encode === 'bson') {
      let deletedCount = 0;
      let chunkIndex = 0;

      while (true) {
        const chunkFilePath = this.getChunkFileName(fullPath, chunkIndex);
        if (fs.existsSync(chunkFilePath)) {
          try {
            fs.unlinkSync(chunkFilePath);
            deletedCount++;
            console.log(`Deleted chunk file: ${chunkFilePath}`);
          } catch (error) {
            console.warn(`Failed to delete chunk file ${chunkFilePath}:`, error);
          }
          chunkIndex++;
        } else {
          break;
        }
      }

      return deletedCount > 0
        ? {
          success: true,
          deletedCount,
          message: `Deleted ${deletedCount} files including chunks`,
        }
        : { err: 'No files found to delete', code: 404 };
    }

    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      return { success: true };
    }
    return { err: 404 };
  }

  reset(collection: string): DropResult {
    return this.drop(collection);
  }

  // ── Config Migration ──────────────────────────────────────────────────────

  changeConfig({ from, to, collections }: ChangeConfigOptions): ChangeConfigResult {
    if (
      this.config.encode !== 'json' &&
      (from.encryption || from.encryptionKey || to.encryption || to.encryptionKey)
    ) {
      throw new Error('Cannot change encryption settings while encoding is not JSON');
    }

    const keyLengths: Record<string, number> = {
      'aes-128-cbc': 32,
      'aes-192-cbc': 48,
      'aes-256-cbc': 64,
      'aes-128-gcm': 32,
      'aes-256-gcm': 64,
    };

    const validate = (key: string | null | undefined, algo: string | null | undefined): void => {
      if (!algo) return;
      if (!key || key.length !== keyLengths[algo]) {
        throw new Error(`${algo} requires ${keyLengths[algo]} hex characters`);
      }
    };

    validate(from.encryptionKey, from.encryption);
    validate(to.encryptionKey, to.encryption);

    const fromDir = from.directory ?? this.config.directory;
    const toDir = to.directory ?? this.config.directory;
    const fromExt = from.extension ?? this.config.extension;
    const toExt = to.extension ?? this.config.extension;

    if (!fs.existsSync(toDir)) fs.mkdirSync(toDir, { recursive: true });

    const files = fs.readdirSync(fromDir);
    let successCount = 0;
    let errorCount = 0;

    files.forEach(file => {
      const ext = path.extname(file).slice(1);
      const name = path.basename(file, '.' + ext);
      if (ext !== fromExt) return;
      if (collections && !collections.includes(name)) return;

      const fromPath = path.join(fromDir, file);
      const toPath = path.join(toDir, `${name}.${toExt}`);

      try {
        const raw = fs.readFileSync(fromPath, 'utf8');
        const json = from.encryption
          ? decrypt(raw, from.encryptionKey!, from.encryption as any)
          : JSON.parse(raw);

        const newContent = to.encryption
          ? encrypt(json, to.encryptionKey!, to.encryption as any)
          : JSON.stringify(json, null, 3);

        fs.writeFileSync(toPath, newContent as string);
        successCount++;

        if (fromPath !== toPath && fs.existsSync(fromPath)) {
          fs.unlinkSync(fromPath);
        }
      } catch (err) {
        console.error(`Failed to convert ${file}: ${(err as Error).message}`);
        errorCount++;
      }
    });

    if (fromDir !== toDir && fs.existsSync(fromDir)) {
      const remaining = fs.readdirSync(fromDir);
      if (remaining.length === 0) fs.rmdirSync(fromDir);
    }

    return { success: true, converted: successCount, failed: errorCount };
  }

  // ── AI Analysis ───────────────────────────────────────────────────────────

  async analyse({
    collection,
    filter,
    data,
    model,
    apiKey,
    query,
  }: {
    collection?: string;
    filter?: Conditions;
    data?: unknown[];
    model: string;
    apiKey: string;
    query: string;
  }): Promise<AnalyseResult> {
    if (data && !Array.isArray(data)) return { success: false, err: 'Data must be an array' };
    if (data && collection) return { success: false, err: 'Cannot specify collection when data is provided' };
    if (filter && typeof filter !== 'object') return { success: false, err: 'Filter must be an object' };
    if (!model) return { success: false, err: 'Model is required' };
    if (!apiKey) return { success: false, err: 'API Key is required' };
    if (!query) return { success: false, err: 'Query is required' };
    if (query.length > 1024) return { success: false, err: 'Query exceeds maximum length of 1024 characters' };

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
      const parsedResponse = JSON.parse(cleanResponse) as Omit<AnalyseResponse, 'data'>;

      if (!parsedResponse.indexes || !Array.isArray(parsedResponse.indexes)) {
        throw new Error('Invalid response format: missing indexes array');
      }

      return {
        success: true,
        response: {
          ...parsedResponse,
          data: parsedResponse.indexes.map(index => collData[index]),
        },
      };
    } catch (error) {
      console.error('AI Analysis Error:', error);
      return { success: false, err: (error as Error).message ?? 'Failed to process AI response' };
    }
  }

  // ── BTree ─────────────────────────────────────────────────────────────────

  rebuildBTree(collection: string): { err: string | number } | void {
    if (!collection) return { err: 'collection required!' };

    const fullPath = this.getFilePath(collection);
    if (!fs.existsSync(fullPath)) return { err: 404 };

    const db = this.readFileData(fullPath) as Record<string, unknown>[];
    if (!Array.isArray(db)) return { err: 'Collection data is not an array' };

    this.btree = new BTree(3);
    db.forEach(item => {
      if (item.token) {
        this.btree.insert(item.token, item);
      } else {
        console.error('Item is missing a token:', item);
      }
    });
  }

  getAllFromBTree(): unknown[] {
    return this.btree.traverse(this.btree.root);
  }

  // ── Condition Matching ────────────────────────────────────────────────────

  private matchesConditions(
    item: Record<string, unknown>,
    conditions: Conditions
  ): boolean {
    return Object.entries(conditions).every(([key, value]) => {
      const fieldValue = item[key];

      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        const keys = Object.keys(value as object);
        const isOperatorObject =
          keys.length > 0 && keys.every(k => k.startsWith('$'));

        if (isOperatorObject) {
          const cond = value as Condition;
          return Object.entries(cond).every(([op, condVal]) => {
            switch (op) {
              case '$eq': return deepCompare(fieldValue, condVal);
              case '$ne': return !deepCompare(fieldValue, condVal);
              case '$gt': return (fieldValue as number) > (condVal as number);
              case '$gte': return (fieldValue as number) >= (condVal as number);
              case '$lt': return (fieldValue as number) < (condVal as number);
              case '$lte': return (fieldValue as number) <= (condVal as number);
              case '$in': return Array.isArray(condVal) && condVal.includes(fieldValue);
              case '$nin': return Array.isArray(condVal) && !condVal.includes(fieldValue);
              default: return false;
            }
          });
        }
      }

      return deepCompare(fieldValue, value);
    });
  }

  // ── File Storage ──────────────────────────────────────────────────────────

  writeFile(name: string, data: Buffer): FileResult {
    if (!name) return { err: 'File name required' };
    if (!data) return { err: 'Data required' };
    if (name.includes('/') || name.includes('\\'))
      return { err: 'Invalid file name. Avoid special characters.' };
    if (!Buffer.isBuffer(data)) return { err: 'Data must be a Buffer' };

    const filesDir = `${this.config.directory}/files`;
    if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true });

    const filePath = `${filesDir}/${name}`;
    try {
      fs.writeFileSync(filePath, data);
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
    if (!fs.existsSync(filesDir)) return { err: 'Files not found', code: 404 };

    const filePath = `${filesDir}/${name}`;
    if (!fs.existsSync(filePath)) return { err: 'File not found', code: 404 };

    try {
      const data = fs.readFileSync(filePath);
      return { success: true, data };
    } catch (error) {
      return { err: `Failed to read file: ${(error as Error).message}` };
    }
  }

  async readImage(
    name: string,
    config: ReadImageConfig = {}
  ): Promise<ReadImageResult> {
    if (!name) return { err: 'File name required' };
    if (name.includes('/') || name.includes('\\'))
      return { err: 'Invalid file name. Avoid special characters.' };

    const filesDir = `${this.config.directory}/files`;
    if (!fs.existsSync(filesDir))
      return { err: 'Files directory not found', code: 404 };

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
          filename: name,
          extension: ext,
          originalSize: stats.size,
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
      console.error('Image processing error:', error);
      return {
        err: `Failed to process image: ${(error as Error).message}`,
        code: 'PROCESSING_ERROR',
      };
    }
  }

  deleteFile(name: string): FileResult {
    if (!name) return { err: 'File name required' };

    const filesDir = `${this.config.directory}/files`;
    if (!fs.existsSync(filesDir)) return { err: 'Files not found', code: 404 };

    const filePath = `${filesDir}/${name}`;
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

// CommonJS backwards compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = eveloDB;
  module.exports.default = eveloDB;
  module.exports.eveloDB = eveloDB;
}