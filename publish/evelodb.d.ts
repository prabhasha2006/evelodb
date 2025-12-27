// evelodb.d.ts
import { ObjectId } from "bson";

export interface EveloDBConfig {
    directory?: string;
    extension?: string;
    tabspace?: number;
    encode?: "json" | "bson";
    encryption?: string | null;
    encryptionKey?: string | null;
    noRepeat?: boolean;
    autoPrimaryKey?: boolean | string;
    objectId?: boolean;
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

export interface AnalyseResponse<T = any> {
    indexes: number[];
    reason: string;
    message: string;
    data: T[];
}

export class QueryResult<T = any> {
    constructor(data: T[]);
    getList(offset?: number, limit?: number): T[];
    count(): number;
    sort(compareFn: (a: T, b: T) => number): QueryResult<T>;
    all(): T[];
}

export default class eveloDB {
    constructor(config?: EveloDBConfig);

    encrypt(data: any): any;
    decrypt(data: any): any;
    encodeData(data: any): string | Buffer;
    decodeData(data: any): any;

    generateKey(length: number): string;
    generateUniqueId(): string | ObjectId;

    getFilePath(collection: string): string;

    create(collection: string, data: object): { success: boolean; [key: string]: any };
    delete(collection: string, conditions: object): { success: boolean; deletedCount: number } | { err: any };
    inject(collection: string, data: any): { success: boolean };
    writeData(collection: string, data: any): { success: boolean };
    find(collection: string, conditions: object): QueryResult<any>;
    findOne(collection: string, conditions: object): any | null;
    search(collection: string, conditions: object): QueryResult<any>;
    get(collection: string): QueryResult<any>;
    readData(collection: string): any;
    count(collection: string): { success: boolean; count?: number; err?: string };
    check(collection: string, data: object): boolean;
    edit(collection: string, conditions: object, newData: object): { success: boolean; modifiedCount: number } | { err: any };
    drop(collection: string): { success: boolean } | { err: any };
    reset(collection: string): { success: boolean } | { err: any };

    changeConfig(params: {
        from: EveloDBConfig;
        to: EveloDBConfig;
        collections?: string[];
    }): { success: boolean; converted: number; failed: number };

    analyse(params: {
        collection?: string;
        filter?: object;
        data?: any[];
        model: string;
        apiKey: string;
        query: string;
    }): Promise<{ success: boolean; response?: AnalyseResponse; err?: string }>;

    rebuildBTree(collection: string): any;
    getAllFromBTree(): any[];

    writeFile(name: string, data: Buffer): { success: boolean } | { err: string };
    allFiles(): string[];
    readFile(name: string): { success: boolean; data: Buffer } | { err: string; code?: number };
    readImage(name: string, config?: ReadImageConfig): Promise<{
        success: boolean;
        data: any;
        metadata: {
            filename: string;
            extension: string;
            originalSize: number;
            processingApplied: Record<string, boolean>;
        };
    } | { err: string; code?: string }>;
    deleteFile(name: string): { success: boolean } | { err: string; code?: number };
}
