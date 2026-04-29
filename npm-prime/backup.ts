import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { BSON } from 'bson';

export interface BackupResult {
  success: boolean;
  err?: string;
  backupPath?: string;
}

export interface BackupFileInfo {
  success: boolean;
  err?: string;
  title?: string;
  protected?: boolean;
  schema?: any;
  length?: number;
  data: any[];
  created?: Date;
}

/**
 * Handles all backup and restoration logic for EveloDB
 */
export class BackupManager {
  constructor(private db: any) {}

  createBackup(collection: string, config: { type: 'json' | 'db' | 'binary'; path: string; password?: string; title?: string }): BackupResult {
    if (!collection || !config.path) return { success: false, err: 'Invalid request' };
    try {
      if (!fs.existsSync(config.path)) fs.mkdirSync(config.path, { recursive: true });
      const now = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${collection}_backup_${now}`;
      
      const schema = this.db.config.schema?.[collection] || {};
      const serializedSchema = this.serializeSchema(schema);

      if (config.type === 'json') {
        const recordsRes = this.db.allInternal(collection);
        if (!Array.isArray(recordsRes)) return { success: false, err: 'Failed to retrieve records' };
        
        const backupData = {
          collection,
          schema: { [collection]: serializedSchema },
          data: recordsRes
        };
        const fullPath = path.join(config.path, `${filename}.json`);
        fs.writeFileSync(fullPath, JSON.stringify(backupData, null, 2));
        return { success: true, backupPath: fullPath };
      } else if (config.type === 'binary') {
        const recordsRes = this.db.allInternal(collection);
        if (!Array.isArray(recordsRes)) return { success: false, err: 'Failed to retrieve records' };
        const records = recordsRes;

        const backupData = {
          title: config.title || '',
          collection,
          protected: !!config.password,
          schema: { [collection]: serializedSchema },
          length: records.length,
          created: new Date(),
          data: records
        };

        let fileBuffer: any = Buffer.from(BSON.serialize(backupData));
        if (config.password) {
          fileBuffer = this.encrypt(fileBuffer, config.password);
        }

        const fullPath = path.join(config.path, `${filename}.backup`);
        fs.writeFileSync(fullPath, fileBuffer);
        return { success: true, backupPath: fullPath };
      } else {
        const { dataPath } = this.db.getBsonPaths(collection);
        if (!fs.existsSync(dataPath)) return { success: false, err: 'Collection file not found' };
        const fullPath = path.join(config.path, `${filename}.db`);
        fs.copyFileSync(dataPath, fullPath);
        return { success: true, backupPath: fullPath };
      }
    } catch (e) {
      return { success: false, err: (e as Error).message };
    }
  }

  restoreBackup(collection: string, config: { type: 'json' | 'db' | 'binary'; file: string; password?: string }): { success: boolean; err?: string } {
    const filePath = config.file;
    if (!collection || !filePath || !fs.existsSync(filePath)) return { success: false, err: 'Invalid request or file not found' };
    
    try {
      this.db.closeHandle(collection);
      const { dataPath } = this.db.getBsonPaths(collection);

      if (config.type === 'json') {
        const backup = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        this.applyRestoredSchema(collection, backup.schema);
        this.db.drop(collection);
        for (const record of backup.data || []) this.db.create(collection, record);
        return { success: true };
      } else if (config.type === 'binary') {
        const backupInfo = this.readBackupFile(filePath, config.password);
        if (!backupInfo.success) return { success: false, err: backupInfo.err };
        
        // If it was protected, we MUST have records (unless length was 0)
        if (backupInfo.protected && (backupInfo.length || 0) > 0 && (!backupInfo.data || backupInfo.data.length === 0)) {
           return { success: false, err: 'Invalid password or decryption failed' };
        }
        
        this.applyRestoredSchema(collection, backupInfo.schema);
        this.db.drop(collection);
        for (const record of backupInfo.data) this.db.create(collection, record);
        return { success: true };
      } else {
        fs.copyFileSync(filePath, dataPath);
        this.db.rebuildIndexes(collection);
        return { success: true };
      }
    } catch (e) {
      return { success: false, err: (e as Error).message };
    }
  }

  readBackupFile(filePath: string, password?: string): BackupFileInfo {
    if (!fs.existsSync(filePath)) return { success: false, err: 'File not found', data: [] };
    try {
      const isBinary = filePath.endsWith('.backup');
      if (isBinary) {
        let fileBuffer: any = fs.readFileSync(filePath);
        let backup: any;

        // 1. Try reading as plain BSON first
        try {
          backup = BSON.deserialize(fileBuffer);
          // If we got here, the file was NOT whole-file encrypted
        } catch (e) {
          // 2. If BSON fails, it MUST be whole-file encrypted
          if (!password) return { success: false, err: 'Backup is encrypted. Password required.', data: [] };
          try {
            fileBuffer = this.decrypt(fileBuffer, password);
            backup = BSON.deserialize(fileBuffer);
          } catch (decryptErr) {
            return { success: false, err: 'Invalid password or corrupted backup file.', data: [] };
          }
        }

        // 3. Check protection status vs password
        if (backup.protected && !password) {
          // Allow reading metadata but return no records if password missing
          return {
            success: true,
            title: backup.title,
            protected: true,
            schema: backup.schema,
            length: backup.length,
            data: [],
            created: backup.created
          };
        }

        return {
          success: true,
          title: backup.title,
          protected: !!backup.protected,
          schema: backup.schema,
          length: backup.length,
          data: backup.data || [],
          created: backup.created
        };
      } else {
        const backup = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return {
          success: true,
          title: backup.collection,
          protected: false,
          schema: backup.schema,
          length: backup.data?.length || 0,
          data: backup.data || [],
          created: new Date()
        };
      }
    } catch (e) { return { success: false, err: (e as Error).message, data: [] }; }
  }

  private serializeSchema(schema: any) {
    if (!schema) return {};
    const serializeFields = (fields: any) => {
      if (!fields) return undefined;
      const result: any = {};
      for (const [k, v] of Object.entries(fields)) {
        const cfg = { ...(v as any) };
        if (cfg.type === String) cfg.type = 'String';
        else if (cfg.type === Number) cfg.type = 'Number';
        else if (cfg.type === Boolean) cfg.type = 'Boolean';
        else if (cfg.type === Array) cfg.type = 'Array';
        else if (cfg.type === Object) cfg.type = 'Object';
        else if (typeof cfg.type === 'object' && cfg.type !== null) cfg.type = serializeFields(cfg.type);
        result[k] = cfg;
      }
      return result;
    };
    return {
      fields: serializeFields(schema.fields),
      indexes: schema.indexes,
      uniqueKeys: schema.uniqueKeys,
      objectIdKey: schema.objectIdKey,
      noRepeat: schema.noRepeat
    };
  }

  private applyRestoredSchema(collection: string, schema: any) {
    if (schema) {
      // Handle both old (direct) and new (wrapped) schema formats
      const targetSchema = schema[collection] || schema;
      
      const deserializeFields = (fields: any) => {
        if (!fields) return undefined;
        const result: any = {};
        for (const [k, v] of Object.entries(fields)) {
          const cfg = { ...(v as any) };
          if (cfg.type === 'String') cfg.type = String;
          else if (cfg.type === 'Number') cfg.type = Number;
          else if (cfg.type === 'Boolean') cfg.type = Boolean;
          else if (cfg.type === 'Array') cfg.type = Array;
          else if (cfg.type === 'Object') cfg.type = Object;
          else if (typeof cfg.type === 'object' && cfg.type !== null) cfg.type = deserializeFields(cfg.type);
          result[k] = cfg;
        }
        return result;
      };
      if (!this.db.config.schema) this.db.config.schema = {};
      this.db.config.schema[collection] = {
        fields: deserializeFields(targetSchema.fields),
        indexes: targetSchema.indexes,
        uniqueKeys: targetSchema.uniqueKeys,
        objectIdKey: targetSchema.objectIdKey,
        noRepeat: targetSchema.noRepeat
      };
    }
  }

  private encrypt(buffer: any, password: string): Buffer {
    const key = crypto.createHash('sha256').update(password).digest();
    const result = Buffer.alloc(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      result[i] = buffer[i] ^ key[i % key.length];
    }
    return result;
  }

  private decrypt(buffer: any, password: string): Buffer {
    // XOR is its own inverse
    return this.encrypt(buffer, password);
  }
}
