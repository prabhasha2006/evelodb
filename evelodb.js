const fs = require('fs');
const { encrypt, decrypt, generateKey } = require('./encryption');
const { BSON, ObjectId } = require('bson');
const { GoogleGenAI } = require("@google/genai");
const imageProcess = require('./imageProcess');
const path = require('path');

/**
 * @typedef {Object} EveloDBConfig
 * @property {string} [directory='./evelodatabase'] - Directory to store collections.
 * @property {string} [extension='json'] - File extension to use.
 * @property {number} [tabspace=3] - Number of spaces for JSON formatting.
 * @property {'json'|'bson'} [encode='json'] - Encoding type.
 * @property {string|null} [encryption=null] - Encryption algorithm if any.
 * @property {string|null} [encryptionKey=null] - Encryption key in hex.
 * @property {boolean} [noRepeat=false] - Prevent duplicate records.
 * @property {boolean|string} [autoPrimaryKey=true] - Enable or name auto-generated primary key.
 * @property {boolean} [objectId=false] - Use BSON ObjectId for IDs if encoding is BSON.
 */

/**
 * @class BTreeNode
 * @classdesc Node used internally by BTree.
 * @property {Array<[any, any]>} keys - Stored keys and their values.
 * @property {Array<BTreeNode>} children - Child nodes.
 * @property {boolean} isLeaf - Whether node is leaf.
 */

/**
 * @class BTree
 * @classdesc Simple B-Tree for indexing token-based values.
 * @param {number} order - Maximum number of keys per node.
 */

/**
 * @class QueryResult
 * @classdesc Encapsulates results returned from find/search operations.
 * @param {Array} data - Array of items.
 * @method getList(offset, limit) - Returns a slice of data.
 * @method count() - Returns number of items.
 * @method sort(compareFn) - Returns sorted QueryResult.
 * @method all() - Returns all items.
 */

/**
 * @class eveloDB
 * @classdesc Main database class for EveloDB.
 * @param {EveloDBConfig} [config={}] - Configuration options.
 */

/**
 * @function deepCompare
 * @description Recursively compares two objects or arrays for equality.
 * @param {any} obj1
 * @param {any} obj2
 * @returns {boolean}
 */

/**
 * @function encrypt
 * @param {any} data
 * @param {string} algorithm
 * @param {string} key
 * @returns {string|Buffer}
 */

/**
 * @function decrypt
 * @param {any} data
 * @param {string} algorithm
 * @param {string} key
 * @returns {any}
 */

/**
 * @typedef {Object} ReadImageConfig
 * @property {boolean} [returnBase64=true] - Return base64 string.
 * @property {number} [quality=1] - Image quality from 0.1 to 1.
 * @property {number} [pixels=0] - Resize pixels (0 to keep original size).
 * @property {boolean} [blackAndWhite=false] - Convert to grayscale.
 * @property {boolean} [mirror=false] - Mirror image horizontally.
 * @property {boolean} [upToDown=false] - Flip image vertically.
 * @property {boolean} [invert=false] - Invert colors.
 * @property {number} [brightness=1] - Brightness multiplier.
 * @property {number} [contrast=1] - Contrast multiplier.
 * @property {number|null} [maxWidth=null] - Max width in pixels.
 * @property {number|null} [maxHeight=null] - Max height in pixels.
 */

/**
 * @typedef {Object} AnalyseResponse
 * @property {Array<number>} indexes - Matching indexes in data array.
 * @property {string} reason - Reasoning for selection.
 * @property {string} message - Additional insight message.
 * @property {Array<any>} data - Actual items from data array.
 */

// Default configuration
const defaultConfig = {
    directory: './evelodatabase',
    extension: 'json',
    tabspace: 3,
    encode: 'json', // json, bson
    encryption: null,
    encryptionKey: null,
    noRepeat: false,
    autoPrimaryKey: true,
    objectId: false
}

// Deep comparison function
function deepCompare(obj1, obj2) {
    if (typeof obj1 === 'object' && typeof obj2 === 'object') {
        if (Array.isArray(obj1)) {
            if (!Array.isArray(obj2)) return false;
            if (obj1.length !== obj2.length) return false;
            for (let i = 0; i < obj1.length; i++) {
                if (!deepCompare(obj1[i], obj2[i])) return false;
            }
            return true;
        } else {
            const keys1 = Object.keys(obj1);
            const keys2 = Object.keys(obj2);
            if (keys1.length !== keys2.length) return false;
            for (let key of keys1) {
                if (!deepCompare(obj1[key], obj2[key])) return false;
            }
            return true;
        }
    } else {
        return obj1 === obj2;
    }
}

// B-Tree Node class
class BTreeNode {
    constructor(isLeaf) {
        this.keys = [];
        this.children = [];
        this.isLeaf = isLeaf;
    }
}

// B-Tree class
class BTree {
    constructor(order) {
        this.order = order;
        this.root = new BTreeNode(true);
    }

    insert(key, value) {
        let root = this.root;
        if (root.keys.length === this.order - 1) {
            let newRoot = new BTreeNode(false);
            newRoot.children.push(root);
            this.splitChild(newRoot, 0);
            this.root = newRoot;
        }
        this.insertNonFull(this.root, [key, value]);
    }

    insertNonFull(node, keyValue) {
        let i = node.keys.length - 1;
        if (node.isLeaf) {
            node.keys.push(null);
            while (i >= 0 && keyValue[0] < node.keys[i][0]) {
                node.keys[i + 1] = node.keys[i];
                i--;
            }
            node.keys[i + 1] = keyValue;
        } else {
            while (i >= 0 && keyValue[0] < node.keys[i][0]) {
                i--;
            }
            i++;
            if (node.children[i].keys.length === this.order - 1) {
                this.splitChild(node, i);
                if (keyValue[0] > node.keys[i][0]) {
                    i++;
                }
            }
            this.insertNonFull(node.children[i], keyValue);
        }
    }

    splitChild(node, i) {
        let order = this.order;
        let child = node.children[i];
        let newNode = new BTreeNode(child.isLeaf);
        node.keys.splice(i, 0, child.keys[Math.floor(order / 2)]);
        node.children.splice(i + 1, 0, newNode);
        newNode.keys = child.keys.splice(Math.floor(order / 2) + 1);
        if (!child.isLeaf) {
            newNode.children = child.children.splice(Math.floor(order / 2) + 1);
        }
    }

    traverse(node) {
        let result = [];
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

class QueryResult {
    constructor(data) {
        this.data = Array.isArray(data) ? data : []
    }

    /**
     * @param {number} offset - Starting index.
     * @param {number} limit - Number of items to return.
     */
    getList(offset = 0, limit = 10) {
        return this.data.slice(offset, offset + limit);
    }

    count() {
        return this.data.length;
    }

    /**
     * @param {function} compareFn - Comparison function.
     * @returns {QueryResult}
     */
    sort(compareFn) {
        return new QueryResult([...this.data].sort(compareFn));
    }

    all() {
        return this.data;
    }
}

// eveloDB class

/**
 * @class eveloDB
 */
class eveloDB {
    constructor(config = {}) {
        this.config = { ...defaultConfig, ...config };

        if (this.config.encode === 'bson' && this.config.encryption && this.config.encryptionKey) {
            throw new Error('BSON encoding does not support encryption. Please set "encryption" and "encryptionKey" to null or use "json" encoding.');
        }

        if (this.config.encode === 'bson') {
            if (!config.extension) {
                this.config.extension = 'bson'; // Default extension for BSON
            }
            this.config.tabspace = 0; // BSON does not use tabspace
            this.config.encryption = null; // BSON does not support encryption
            this.config.encryptionKey = null; // BSON does not support encryption
        }

        // Validate encryption config
        if (this.config.encryption) {
            const key = this.config.encryptionKey;
            const algorithm = this.config.encryption;

            if (!key) {
                throw new Error('Encryption key required when encryption is enabled');
            }

            const keyLengths = {
                'aes-128-cbc': 32, // 16 bytes = 32 hex characters
                'aes-192-cbc': 48, // 24 bytes = 48 hex characters
                'aes-256-cbc': 64, // 32 bytes = 64 hex characters
                'aes-128-gcm': 32, // 16 bytes = 32 hex characters
                'aes-256-gcm': 64, // 32 bytes = 64 hex characters
            }

            const expectedLength = keyLengths[algorithm];

            if (!expectedLength) {
                throw new Error(`Unsupported encryption algorithm: ${algorithm}`);
            }

            if (key.length !== expectedLength) {
                throw new Error(`${algorithm.toUpperCase()} requires a ${expectedLength}-character hex key (${expectedLength / 2} bytes)`);
            }
        }

        this.btree = new BTree(3);
        if (!fs.existsSync(this.config.directory)) {
            fs.mkdirSync(this.config.directory, { recursive: true });
        }
    }

    // Encryption/decryption methods
    encrypt(data) {
        if (this.config.encode === 'bson') {
            return data
        }
        return encrypt(
            data,
            this.config.encryption,
            this.config.encryptionKey
        );
    }

    decrypt(data) {
        if (this.config.encode === 'bson') {
            return data
        }
        return decrypt(
            data,
            this.config.encryption,
            this.config.encryptionKey
        );
    }

    encodeData(data) {
        if (this.config.encode === 'bson') {
            try {
                const obj = { db: data };
                return BSON.serialize(obj);
            } catch (error) {
                if (error.code === 'ERR_OUT_OF_RANGE' || error.message.includes('out of range')) {
                    // Fallback to JSON for very large objects that exceed BSON buffer limits
                    console.warn('BSON serialization failed, falling back to JSON for large object');
                    return JSON.stringify(data, null, this.config.tabspace);
                }
                throw error;
            }
        }
        if (this.config.encode === 'json') {
            return JSON.stringify(data, null, this.config.tabspace);
        }
        return JSON.stringify(data, null, this.config.tabspace);
    }

    decodeData(data) {
        if (this.config.encode === 'bson') {
            try {
                const { db } = BSON.deserialize(data);
                return db;
            } catch (error) {
                // If BSON deserialization fails, try JSON (for fallback cases)
                try {
                    return JSON.parse(data.toString('utf8'));
                } catch (jsonError) {
                    throw new Error(`Failed to decode data: ${error.message}, ${jsonError.message}`);
                }
            }
        }
        if (this.config.encode === 'json') {
            return JSON.parse(data.toString('utf8'));
        }
        return JSON.parse(data.toString('utf8'));
    }

    // More accurate size estimation that handles BSON limitations
    getSafeBsonSize(data) {
        if (this.config.encode !== 'bson') {
            return Buffer.from(JSON.stringify(data)).length;
        }

        try {
            const obj = { db: data };
            return BSON.serialize(obj).length;
        } catch (error) {
            if (error.code === 'ERR_OUT_OF_RANGE' || error.message.includes('out of range')) {
                // If BSON serialization fails, use JSON size as fallback
                return Buffer.from(JSON.stringify(data)).length;
            }
            throw error;
        }
    }

    // Helper to split file path into name and extension
    splitFilePath(filePath) {
        const lastDotIndex = filePath.lastIndexOf('.');
        if (lastDotIndex === -1) {
            return { name: filePath, extension: '' };
        }
        return {
            name: filePath.substring(0, lastDotIndex),
            extension: filePath.substring(lastDotIndex)
        };
    }

    // Helper to generate chunk file names
    getChunkFileName(baseFilePath, chunkIndex) {
        const { name, extension } = this.splitFilePath(baseFilePath);
        if (chunkIndex === 0) {
            return baseFilePath; // Main file
        }
        return `${name} ${chunkIndex}${extension}`;
    }

    writeFileData(filePath, data) {
        // If not BSON or data is not an array, use normal storage
        if (this.config.encode !== 'bson' || !Array.isArray(data)) {
            const encodedData = this.config.encryption ? this.encrypt(data) : this.encodeData(data);
            fs.writeFileSync(filePath, encodedData);

            // Clean up any existing chunk files
            this.cleanupChunkFiles(filePath);
            return true;
        }

        // If data is not an array, use normal storage
        if (!Array.isArray(data)) {
            const encodedData = this.config.encryption ? this.encrypt(data) : this.encodeData(data);
            fs.writeFileSync(filePath, encodedData);
            this.cleanupChunkFiles(filePath);
            return true;
        }

        const MAX_SIZE = 10000000; // Reduced to 10MB for safety margin

        // Check if array needs splitting
        const totalSize = this.getSafeBsonSize(data);

        if (totalSize <= MAX_SIZE) {
            try {
                // Try to store as single file
                const encodedData = this.config.encryption ? this.encrypt(data) : this.encodeData(data);
                fs.writeFileSync(filePath, encodedData);
                this.cleanupChunkFiles(filePath);
                return true;
            } catch (error) {
                if (error.code === 'ERR_OUT_OF_RANGE' || error.message.includes('out of range')) {
                    // If single file fails due to size, proceed with chunking
                    console.warn('Single file storage failed, proceeding with chunking');
                } else {
                    throw error;
                }
            }
        }

        // Split array into smaller, safer chunks
        const chunks = [];
        let currentChunk = [];
        let currentSize = 0;

        for (const item of data) {
            const itemSize = this.getSafeBsonSize([item]);

            // Safety check: if a single item is too large, handle it separately
            if (itemSize > MAX_SIZE) {
                console.warn(`Single item exceeds maximum size (${itemSize} > ${MAX_SIZE}), storing separately`);
                if (currentChunk.length > 0) {
                    chunks.push([...currentChunk]);
                    currentChunk = [];
                    currentSize = 0;
                }
                chunks.push([item]); // Store oversized item in its own chunk
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

        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }

        console.log(`Splitting data into ${chunks.length} chunks`);

        // Store each chunk in separate files
        for (let i = 0; i < chunks.length; i++) {
            const chunkFilePath = this.getChunkFileName(filePath, i);
            try {
                const encodedData = this.config.encryption ?
                    this.encrypt(chunks[i]) :
                    this.encodeData(chunks[i]);
                fs.writeFileSync(chunkFilePath, encodedData);
            } catch (error) {
                console.error(`Failed to write chunk ${i}:`, error);
                // Try with even smaller chunk or fallback to JSON
                if (chunks[i].length > 1) {
                    console.warn('Retrying with smaller chunk size');
                    this.writeFileData(chunkFilePath, chunks[i]); // Recursively handle
                } else {
                    throw new Error(`Failed to store oversized item: ${error.message}`);
                }
            }
        }

        this.cleanupChunkFiles(filePath, chunks.length);
        return true;
    }

    // Helper to clean up leftover chunk files
    cleanupChunkFiles(baseFilePath, currentChunkCount = 1) {
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

    readFileData(filePath) {
        // Check if main file exists
        if (!fs.existsSync(filePath)) {
            return null;
        }

        // Read main file (chunk 0)
        let mainData;
        try {
            mainData = this.config.encode === 'bson' ?
                fs.readFileSync(filePath) :
                fs.readFileSync(filePath, 'utf8');
        } catch (error) {
            console.error(`Failed to read main file ${filePath}:`, error);
            return null;
        }

        let result;
        try {
            result = this.config.encryption ?
                this.decrypt(mainData) :
                this.decodeData(mainData);
        } catch (error) {
            console.error(`Failed to decode main file ${filePath}:`, error);
            return null;
        }

        // If result is not an array, return as is (no chunking needed)
        if (!Array.isArray(result)) {
            return result;
        }

        // Check for chunk files and combine them
        const combinedData = [...result];
        let chunkIndex = 1;

        while (true) {
            const chunkFilePath = this.getChunkFileName(filePath, chunkIndex);
            if (!fs.existsSync(chunkFilePath)) {
                break;
            }

            try {
                const chunkData = this.config.encode === 'bson' ?
                    fs.readFileSync(chunkFilePath) :
                    fs.readFileSync(chunkFilePath, 'utf8');

                const decodedChunk = this.config.encryption ?
                    this.decrypt(chunkData) :
                    this.decodeData(chunkData);

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

    // Additional helper to handle very large individual items
    getFileChunkInfo(filePath) {
        if (!fs.existsSync(filePath)) {
            return null;
        }

        const info = {
            isChunked: false,
            chunkCount: 1,
            totalSize: 0,
            chunkFiles: [filePath],
            hasOversizedItems: false
        };

        // Check main file
        try {
            const mainStats = fs.statSync(filePath);
            info.totalSize = mainStats.size;

            // Check if main file contains JSON fallback data
            if (this.config.encode === 'bson') {
                const data = fs.readFileSync(filePath);
                try {
                    BSON.deserialize(data);
                } catch (error) {
                    info.usesJsonFallback = true;
                }
            }
        } catch (error) {
            console.warn(`Error getting stats for ${filePath}:`, error);
        }

        // Check for chunk files
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

                    // Check for oversized single items
                    if (chunkStats.size > 10000000) { // 10MB
                        info.hasOversizedItems = true;
                    }
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

    /**
     * @param {number} length
     * @returns 
     */
    generateKey(length) {
        return generateKey(length);
    }

    // Helper method to get file path
    getFilePath(collection) {
        return `${this.config.directory}/${collection}.${this.config.extension}`;
    }

    // Database operations
    /**
     * 
     * @param {string} collection 
     * @param {object} data 
     * @returns 
     */
    create(collection, data) {
        // Validate required parameters
        if (!collection) return { err: 'Collection name required' };
        if (collection.includes('/') || collection.includes('\\') || collection.includes('.') || collection.includes(' ')) {
            return { err: 'Invalid collection name. Avoid special characters and spaces.' };
        }
        if (!data || typeof data !== 'object') return { err: 'Valid data object required' };

        const fullPath = this.getFilePath(collection);
        let db = [];

        // Load existing data if file exists
        if (fs.existsSync(fullPath)) {
            db = this.readFileData(fullPath)

            // Early noRepeat check before modifying data
            if (this.config.noRepeat) {
                const isDuplicate = db.some(existingItem => {
                    // Compare only user-provided fields
                    return Object.keys(data).every(key => {
                        // Skip comparison if this is an auto-generated field
                        if (key === '__id') return true;
                        return deepCompare(existingItem[key], data[key]);
                    }) &&
                        // Also ensure we're not matching against records missing compared fields
                        Object.keys(data).every(key => key in existingItem);
                });

                if (isDuplicate) {
                    return {
                        err: 'Duplicate data - record already exists (noRepeat enabled)',
                        code: 'DUPLICATE_DATA'
                    };
                }
            }
        }

        // Prepare the new object (after passing noRepeat check)
        const object = { ...data };

        // Generate a unique ID for the new object
        let autoPrimaryKeyName;
        if (this.config.autoPrimaryKey) {
            autoPrimaryKeyName = (typeof this.config.autoPrimaryKey === 'string' && this.config.autoPrimaryKey.length > 0)
                ? this.config.autoPrimaryKey
                : '_id'; // Default key name

            // Only add if the key doesn't already exist in the document
            if (!object.hasOwnProperty(autoPrimaryKeyName)) {
                object[autoPrimaryKeyName] = this.generateUniqueId();
            }
        }

        // Add to database
        db.push(object);

        // Write to file
        this.writeFileData(fullPath, db)

        // Index in B-Tree if token exists
        if (object.token) {
            this.btree.insert(object.token, object);
        }

        return {
            success: true,
            ...(autoPrimaryKeyName && object[autoPrimaryKeyName] ? {
                [autoPrimaryKeyName]: object[autoPrimaryKeyName]
            } : {})
        }
    }

    /**
     * 
     * @param {string} collection 
     * @param {object} conditions 
     * @returns 
     */
    delete(collection, conditions) {
        if (!collection) return { err: 'collection required!' };
        if (!conditions) return { err: 'conditions required!' };

        const fullPath = this.getFilePath(collection);
        if (!fs.existsSync(fullPath)) return { err: 404 };

        let db = this.readFileData(fullPath);

        const originalLength = db.length;

        // Filter out matching items
        const filteredData = db.filter(item => !this.matchesConditions(item, conditions));

        const deletedCount = originalLength - filteredData.length;

        this.writeFileData(fullPath, filteredData);

        return {
            success: true,
            deletedCount
        };
    }

    /**
     * 
     * @param {string} collection 
     * @param {any} data 
     * @returns 
     */
    inject(collection, data) {
        if (!collection) return { err: 'collection required!' };
        if (!data) return { err: 'data required!' };

        const fullPath = this.getFilePath(collection);
        this.writeFileData(fullPath, data)
        return { success: true };
    }

    /**
     * 
     * @param {string} collection 
     * @param {any} data 
     * @returns 
     */
    writeData(collection, data) {
        if (!collection) return { err: 'collection required!' };
        if (collection.includes('/') || collection.includes('\\') || collection.includes('.') || collection.includes(' ')) {
            return { err: 'Invalid collection name. Avoid special characters and spaces.' };
        }
        if (!data) return { err: 'data required!' };

        const fullPath = this.getFilePath(collection);
        this.writeFileData(fullPath, data)
        return { success: true };
    }

    /**
     * 
     * @param {string} collection 
     * @param {object} conditions 
     * @returns 
     */
    find(collection, conditions) {
        if (!collection) return { err: 'collection required!' };
        if (!conditions) return { err: 'conditions required!' };

        const fullPath = this.getFilePath(collection);
        if (!fs.existsSync(fullPath)) return new QueryResult([]);

        const db = this.readFileData(fullPath);
        const results = db.filter(item => this.matchesConditions(item, conditions));

        return new QueryResult(results);
    }

    /**
     * 
     * @param {string} collection 
     * @param {object} conditions 
     * @returns 
     */
    findOne(collection, conditions) {
        if (!collection) return { err: 'collection required!' };
        if (!conditions) return { err: 'conditions required!' };

        const fullPath = this.getFilePath(collection);
        if (!fs.existsSync(fullPath)) return null;

        const db = this.readFileData(fullPath);

        return db.find(item => this.matchesConditions(item, conditions)) || null;
    }

    /**
     * 
     * @param {string} collection 
     * @param {object} conditions 
     * @returns 
     */
    search(collection, conditions) {
        if (!collection) return { err: 'collection required!' };
        if (!conditions) return { err: 'conditions required!' };

        const fullPath = this.getFilePath(collection);
        if (!fs.existsSync(fullPath)) return new QueryResult([]);

        const db = this.readFileData(fullPath);
        const results = db.filter(item => {
            return Object.entries(conditions).every(([key, value]) => {
                const field = item[key];

                if (field === undefined || field === null) return false;

                // If value is a regex object
                if (value && typeof value === 'object' && value.$regex) {
                    const pattern = value.$regex;
                    const flags = value.$options || 'i';
                    const regex = new RegExp(pattern, flags);
                    return regex.test(field.toString());
                }

                // Simple substring match (like search)
                return field.toString().toLowerCase().includes(value.toString().toLowerCase());
            });
        });

        return new QueryResult(results);
    }

    /**
     * 
     * @param {string} collection 
     * @returns 
     */
    get(collection) {
        if (!collection) return { err: 'collection required!' };

        const fullPath = this.getFilePath(collection);
        if (!fs.existsSync(fullPath)) return new QueryResult(undefined);

        const data = this.readFileData(fullPath);

        return new QueryResult(data);
    }

    /**
     * 
     * @param {string} collection 
     * @returns 
     */
    readData(collection) {
        if (!collection) return { err: 'collection required!' };

        const fullPath = this.getFilePath(collection);
        if (!fs.existsSync(fullPath)) return undefined;

        const data = this.readFileData(fullPath);

        return data;
    }

    /**
     * 
     * @param {string} collection 
     * @returns 
     */
    count(collection) {
        // 1. First check if collection exists (same as get())
        if (!collection) return { success: false, err: 'collection required!' };

        // 2. Get the data
        const result = this.get(collection).all()

        // 3. Handle potential errors from get()
        if (!result) {
            return {
                success: false,
                err: 'Collection not found'
            }
        }

        // 4. Validate we got an array
        if (!Array.isArray(result)) {
            return {
                success: false,
                err: 'Invalid collection data format'
            }
        }

        // 5. Return success with count
        return {
            success: true,
            count: result.length
        }
    }

    /**
     * 
     * @param {string} collection 
     * @param {object} data 
     * @returns 
     */
    check(collection, data) {
        if (!collection) return { err: 'collection required!' };
        if (!data) return { err: 'conditions required!' };

        return this.find(collection, data).all().length > 0;
    }


    /**
     * 
     * @param {string} collection 
     * @param {object} conditions
     * @param {object} newData
     * @returns 
     */
    edit(collection, conditions, newData) {
        if (!collection) return { err: 'Collection name required' };
        if (!conditions) return { err: 'Conditions required' };
        if (!newData) return { err: 'New data required' };

        const fullPath = this.getFilePath(collection);
        if (!fs.existsSync(fullPath)) return { err: 'Collection not found', code: 404 };

        let db = this.readFileData(fullPath);
        let editedCount = 0;
        let duplicateFound = false;

        const updatedDb = db.map(item => {
            if (this.matchesConditions(item, conditions)) {
                const updatedItem = { ...item, ...newData };

                if (this.config.noRepeat) {
                    const isDuplicate = db.some(existingItem => {
                        if (existingItem[this.config.autoPrimaryKey] && item[this.config.autoPrimaryKey] && existingItem[this.config.autoPrimaryKey] === item[this.config.autoPrimaryKey]) {
                            return false;
                        }

                        return Object.keys(newData).every(key => {
                            if (key === this.config.autoPrimaryKey) return false;
                            return deepCompare(existingItem[key], updatedItem[key]);
                        });
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
            return {
                err: 'Edit would create duplicate data (noRepeat enabled)',
                code: 'DUPLICATE_DATA'
            };
        }

        if (editedCount === 0) {
            return { err: 'No matching records found', code: 'NO_MATCH' };
        }

        this.writeFileData(fullPath, updatedDb);
        return {
            success: true,
            modifiedCount: editedCount
        };
    }

    /**
     * 
     * @param {string} collection 
     * @returns 
     */
    drop(collection) {
        if (!collection) return { err: 'collection required!' };

        const fullPath = this.getFilePath(collection);

        // For BSON encoding, delete all chunk files as well
        if (this.config.encode === 'bson') {
            let deletedCount = 0;
            let chunkIndex = 0;

            // Delete all chunk files (main file + chunks)
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

            if (deletedCount > 0) {
                return {
                    success: true,
                    deletedCount: deletedCount,
                    message: `Deleted ${deletedCount} files including chunks`
                };
            } else {
                return { err: 'No files found to delete', code: 404 };
            }
        }
        else {
            // For non-BSON, just delete the main file
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
                return { success: true };
            } else {
                return { err: 404 };
            }
        }
    }

    /**
     * 
     * @param {string} collection 
     * @returns 
     */
    reset(collection) {
        return this.drop(collection)
    }

    /**
     * 
     * @param {object} param0 
     * @returns 
     */
    changeConfig({ from, to, collections }) {

        if (this.config.encode !== 'json' && (from.encryption || from.encryptionKey || to.encryption || to.encryptionKey)) {
            throw new Error('Cannot change encryption settings while encoding is not JSON');
        }

        const path = require('path');
        const files = fs.readdirSync(from.directory || this.config.directory);
        const { encrypt: doEncrypt, decrypt: doDecrypt } = require('./encryption');

        const keyLengths = {
            'aes-128-cbc': 32,
            'aes-192-cbc': 48,
            'aes-256-cbc': 64,
            'aes-128-gcm': 32,
            'aes-256-gcm': 64,
        };

        const validate = (key, algo) => {
            if (!algo) return;
            if (!key || key.length !== keyLengths[algo]) {
                throw new Error(`${algo} requires ${keyLengths[algo]} hex characters`);
            }
        };

        validate(from.encryptionKey, from.encryption);
        validate(to.encryptionKey, to.encryption);

        let successCount = 0, errorCount = 0;
        const fromExt = from.extension || this.config.extension;
        const toExt = to.extension || this.config.extension;
        const fromDir = from.directory || this.config.directory;
        const toDir = to.directory || this.config.directory;

        // ✅ Create destination directory if it doesn't exist
        if (!fs.existsSync(toDir)) {
            fs.mkdirSync(toDir, { recursive: true });
        }

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
                    ? doDecrypt(raw, from.encryption, from.encryptionKey)
                    : JSON.parse(raw);

                const newContent = to.encryption
                    ? doEncrypt(json, to.encryption, to.encryptionKey)
                    : JSON.stringify(json, null, 3);

                fs.writeFileSync(toPath, newContent);
                successCount++;

                // Delete old file if directory or extension changed
                if (fromPath !== toPath && fs.existsSync(fromPath)) {
                    fs.unlinkSync(fromPath);
                }
            } catch (err) {
                console.error(`Failed to convert ${file}: ${err.message}`);
                errorCount++;
            }
        });

        // ✅ Delete fromDir if it's now empty and not same as toDir
        if (fromDir !== toDir && fs.existsSync(fromDir)) {
            const remaining = fs.readdirSync(fromDir);
            if (remaining.length === 0) {
                fs.rmdirSync(fromDir, { recursive: true });
            }
        }

        return {
            success: true,
            converted: successCount,
            failed: errorCount
        };
    }

    /**
     * Analyzes data based on provided parameters
     * @param {object} param0 - Configuration object
     * @param {string} param0.collection - Name of the collection to analyze
     * @param {object} param0.filter - Filter criteria for the analysis
     * @param {Array|object} param0.data - Data to be analyzed
     * @param {object} param0.model - Data model definition
     * @param {string} param0.apiKey - API key for authentication
     * @param {string} param0.query - Query string for analysis
     * @returns {Promise<any>} Result of the analysis
     */
    async analyse({ collection, filter, data, model, apiKey, query }) {
        if (data && !Array.isArray(data)) return { success: false, err: 'Data must be an array' };
        if (data && collection) return { success: false, err: 'Cannot specify collection when data is provided' };
        if (filter && typeof filter !== 'object') return { success: false, err: 'Filter must be an object' };
        if (!model) return { success: false, err: 'Model is required' };
        if (!apiKey) return { success: false, err: 'API Key is required' };
        if (!query) return { success: false, err: 'Query is required' };
        if (query.length > 1024) return { success: false, err: 'Query exceeds maximum length of 1024 characters' };

        var collData = data || this.get(collection).all()
        if (filter) {
            collData = collData.filter(item => this.matchesConditions(item, filter))
        }
        if (collData.length == 0) return { success: false, err: 'No matching data found' }

        const genAI = new GoogleGenAI({ apiKey: apiKey })
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
    `

        try {
            const response = await genAI.models.generateContent({
                model: model,
                contents: prompt,
            });
            const responseText = response.text

            // Clean the response (remove markdown code blocks if present)
            const cleanResponse = responseText.replace(/```json|```/g, '').trim()

            // Parse and validate the response
            const parsedResponse = JSON.parse(cleanResponse);

            if (!parsedResponse.indexes || !Array.isArray(parsedResponse.indexes)) {
                throw new Error('Invalid response format: missing indexes array')
            }

            return {
                success: true,
                response: {
                    ...parsedResponse,
                    data: parsedResponse.indexes.map(index => collData[index])
                }
            };

        } catch (error) {
            console.error('AI Analysis Error:', error);
            return {
                success: false,
                err: error.message || "Failed to process AI response"
            };
        }
    }

    rebuildBTree(collection) {
        if (!collection) return { err: 'collection required!' };

        const fullPath = this.getFilePath(collection);
        if (!fs.existsSync(fullPath)) return { err: 404 };

        let db = this.readFileData(fullPath)

        this.btree = new BTree(3);
        db.forEach(item => {
            if (item.token) {
                this.btree.insert(item.token, item);
            } else {
                console.error(`Item is missing a token:`, item);
            }
        });
    }

    matchesConditions(item, conditions) {
        return Object.entries(conditions).every(([key, value]) => {
            const fieldValue = item[key];

            // Handle MongoDB-like operators
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                return Object.entries(value).every(([op, condVal]) => {
                    switch (op) {
                        case '$eq': return fieldValue === condVal;
                        case '$ne': return fieldValue !== condVal;
                        case '$gt': return fieldValue > condVal;
                        case '$gte': return fieldValue >= condVal;
                        case '$lt': return fieldValue < condVal;
                        case '$lte': return fieldValue <= condVal;
                        case '$in': return Array.isArray(condVal) && condVal.includes(fieldValue);
                        case '$nin': return Array.isArray(condVal) && !condVal.includes(fieldValue);
                        default: return false; // unknown operator
                    }
                });
            }

            // Default exact match
            return fieldValue === value;
        });
    }

    getAllFromBTree() {
        return this.btree.traverse(this.btree.root);
    }

    generateUniqueId() {
        if (this.config.encode === 'bson' && this.config.objectId) {
            return new ObjectId()//.toString();
        }
        const timestamp = Date.now().toString(36);
        const randomStr = Math.random().toString(36).substring(2, 10);
        return `${timestamp}${randomStr}`;
    }

    /**
     * 
     * @param {string} name 
     * @param {any} data 
     * @returns 
     */
    writeFile(name, data) {
        if (!name) return { err: 'File name required' }
        if (!data) return { err: 'Data required' }
        if (name.includes('/') || name.includes('\\')) return { err: 'Invalid file name. Avoid special characters.' }
        if (!Buffer.isBuffer(data)) return { err: 'Data must be a Buffer' }

        if (!fs.existsSync(`${this.config.directory}/files`)) {
            fs.mkdirSync(`${this.config.directory}/files`, { recursive: true });
        }

        const filePath = `${this.config.directory}/files/${name}`;
        try {
            fs.writeFileSync(filePath, data);
            return { success: true };
        } catch (error) {
            return { err: `Failed to write file: ${error.message}` };
        }
    }

    allFiles() {
        if (!fs.existsSync(`${this.config.directory}/files`)) return []
        const files = fs.readdirSync(`${this.config.directory}/files`);
        return files
    }

    /**
     * 
     * @param {string} name 
     * @returns 
     */
    readFile(name) {
        if (!name) return { err: 'File name required' };

        if (!fs.existsSync(`${this.config.directory}/files`)) return { err: 'Files not found', code: 404 }

        const filePath = `${this.config.directory}/files/${name}`;
        if (!fs.existsSync(filePath)) {
            return { err: 'File not found', code: 404 };
        }
        try {
            const data = fs.readFileSync(filePath);
            return { success: true, data };
        } catch (error) {
            return { err: `Failed to read file: ${error.message}` };
        }
    }

    /**
     * Reads and processes an image with various configuration options
     * @param {string} name - The name or path of the image to read
     * @param {object} [config] - Configuration options for image processing
     * @param {boolean} [config.returnBase64=true] - Whether to return image as base64 string
     * @param {number} [config.quality=1] - Image quality (0 to 1)
     * @param {number} [config.pixels=0] - Resize to specific number of pixels (0 keeps original size)
     * @param {boolean} [config.blackAndWhite=false] - Convert image to black and white
     * @param {boolean} [config.mirror=false] - Mirror the image horizontally
     * @param {boolean} [config.upToDown=false] - Flip the image vertically
     * @param {boolean} [config.invert=false] - Invert image colors
     * @param {number} [config.brightness=1] - Brightness adjustment (1 = normal)
     * @param {number} [config.contrast=1] - Contrast adjustment (1 = normal)
     * @param {number|null} [config.maxWidth=null] - Maximum width for resizing
     * @param {number|null} [config.maxHeight=null] - Maximum height for resizing
     * @returns {Promise<string|ImageData>} Processed image data (base64 string or ImageData object)
     */
    async readImage(name, config = {
        returnBase64: true,
        quality: 1,
        pixels: 0, // 0 = keep original size
        blackAndWhite: false,
        mirror: false,
        upToDown: false,
        invert: false,
        brightness: 1,
        contrast: 1,
        maxWidth: null,
        maxHeight: null
    }) {
        if (!name) return { err: 'File name required' };
        if (name.includes('/') || name.includes('\\')) return { err: 'Invalid file name. Avoid special characters.' }
        if (!fs.existsSync(`${this.config.directory}/files`)) {
            return { err: 'Files directory not found', code: 404 };
        }

        const filePath = `${this.config.directory}/files/${name}`;
        if (!fs.existsSync(filePath)) {
            return { err: 'File not found', code: 404 };
        }

        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.tiff', '.svg', '.ico', '.heic', '.avif', '.jfif'];
        const ext = path.extname(name).toLowerCase();

        if (!imageExtensions.includes(ext)) {
            return { err: 'Not a valid image file' };
        }

        try {
            const data = fs.readFileSync(filePath);

            // Enhanced config with validation
            const processingConfig = {
                returnBase64: config.returnBase64 !== false,
                quality: Math.max(0.1, Math.min(1, config.quality || 1)),
                pixels: Math.max(0, config.pixels || 0),
                blackAndWhite: Boolean(config.blackAndWhite),
                mirror: Boolean(config.mirror),
                upToDown: Boolean(config.upToDown),
                invert: Boolean(config.invert),
                brightness: Math.max(0.1, Math.min(5, config.brightness || 1)),
                contrast: Math.max(0.1, Math.min(5, config.contrast || 1)),
                maxWidth: config.maxWidth > 0 ? Math.round(config.maxWidth) : null,
                maxHeight: config.maxHeight > 0 ? Math.round(config.maxHeight) : null
            };

            const res = await imageProcess(data, ext, processingConfig);

            // Get file stats for additional info
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
                        contrastAdjusted: processingConfig.contrast !== 1
                    }
                }
            };

        } catch (error) {
            console.error('Image processing error:', error);
            return {
                err: `Failed to process image: ${error.message}`,
                code: 'PROCESSING_ERROR'
            };
        }
    }

    /**
     * 
     * @param {string} name 
     * @returns 
     */
    deleteFile(name) {
        if (!name) return { err: 'File name required' };

        if (!fs.existsSync(`${this.config.directory}/files`)) return { err: 'Files not found', code: 404 }

        const filePath = `${this.config.directory}/files/${name}`;
        if (!fs.existsSync(filePath)) {
            return { err: 'File not found', code: 404 };
        }
        try {
            fs.unlinkSync(filePath);
            return { success: true };
        } catch (error) {
            return { err: `Failed to delete file: ${error.message}` };
        }
    }
}

module.exports = eveloDB;