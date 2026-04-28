/// <reference types="node" />
import { BSON } from "bson";

export interface EveloDBConfig {
  directory?: string;
  noRepeat?: boolean;
  maxHandles?: number;
  compactThreshold?: number;
  schema?: Record<string, Record<string, any>>;
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
  _id?: string;
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

export class QueryResult<T = unknown> {
  data: T[];
  err?: string;
  constructor(data: T[] | null | undefined, err?: string);
  getList(offset?: number, limit?: number): T[] | { err: string };
  count(): number | { err: string };
  sort(compareFn: (a: T, b: T) => number): QueryResult<T>;
  all(): T[] | { err: string };
}

export class eveloDB {
  config: Required<EveloDBConfig>;
  constructor(config?: EveloDBConfig);
  create(collection: string, data: Record<string, unknown>): WriteResult;
  delete(collection: string, conditions: Conditions): DeleteResult;
  find<T = Record<string, unknown>>(collection: string, conditions: Conditions): QueryResult<T>;
  findOne<T = Record<string, unknown>>(collection: string, conditions: Conditions): T | null;
  get<T = Record<string, unknown>>(collection: string): QueryResult<T>;
  edit(collection: string, conditions: Conditions, newData: Record<string, unknown>): EditResult;
  count(collection: string): CountResult;
  check(collection: string, data: Conditions): boolean;
  search<T = Record<string, unknown>>(collection: string, conditions: Record<string, unknown>): QueryResult<T>;
  drop(collection: string): DropResult;
  reset(collection: string): DropResult;
  compact(collection: string): { success: boolean; err?: string };
  writeFile(name: string, data: Buffer): FileResult;
  allFiles(): string[];
  readFile(name: string): FileResult;
  readImage(name: string, config?: ReadImageConfig): Promise<ReadImageResult>;
  deleteFile(name: string): FileResult;
  createBackup(collection: string, config: { type: 'json' | 'db'; path: string }): BackupResult;
  closeAll(): void;
}

export default eveloDB;