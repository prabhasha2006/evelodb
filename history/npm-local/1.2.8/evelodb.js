// 1.1.7

const fs = require('fs');
const { encrypt, decrypt, generateKey } = require('./encryption');
const { BSON, ObjectId } = require('bson');

// Default configuration
const defaultConfig = {
    directory: './evelodatabase',
    extension: 'json',
    tabspace: 3,
    encode: 'json', // json, bson
    encryption: null,
    encryptionKey: null,
    noRepeat: false,
    autoPrimaryKey: true
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

// eveloDB class
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
            const obj = { db: data };
            return BSON.serialize(obj);
        }
        if (this.config.encode === 'json') {
            return JSON.stringify(data, null, this.config.tabspace);
        }
        return JSON.stringify(data, null, this.config.tabspace);
    }

    decodeData(data) {
        if (this.config.encode === 'bson') {
            const { db } = BSON.deserialize(data);
            return db;
        }
        if (this.config.encode === 'json') {
            return JSON.parse(data);
        }
        return JSON.parse(data);
    }

    readFileData(filePath) {
        /* if (!fs.existsSync(filePath)) {
            return null;
        } */
        const data = this.config.encode === 'bson' ? fs.readFileSync(filePath) : fs.readFileSync(filePath, 'utf8');
        const res = this.config.encryption ? this.decrypt(data) : this.decodeData(data)
        return res
    }

    writeFileData(filePath, data) {
        const encodedData = this.config.encryption ? this.encrypt(data) : this.encodeData(data);
        fs.writeFileSync(filePath, encodedData);
        return true;
    }

    generateKey(length) {
        return generateKey(length);
    }

    // Helper method to get file path
    getFilePath(collection) {
        return `${this.config.directory}/${collection}.${this.config.extension}`;
    }

    // Database operations
    create(collection, data) {
        // Validate required parameters
        if (!collection) return { err: 'Collection name required' };
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

    delete(collection, conditions) {
        if (!collection) return { err: 'collection required!' };
        if (!conditions) return { err: 'conditions required!' };

        const fullPath = this.getFilePath(collection);
        if (!fs.existsSync(fullPath)) return { err: 404 };

        let db = this.readFileData(fullPath)

        const filteredData = db.filter(item => {
            return !Object.entries(conditions).every(([key, value]) => {
                if (typeof value === 'object') {
                    return deepCompare(item[key], value);
                } else {
                    return item[key] === value;
                }
            });
        });

        this.writeFileData(fullPath, filteredData)
        return { success: true };
    }

    inject(collection, data) {
        if (!collection) return { err: 'collection required!' };
        if (!data) return { err: 'data required!' };

        const fullPath = this.getFilePath(collection);
        this.writeFileData(fullPath, data)
        return { success: true };
    }

    find(collection, conditions) {
        if (!collection) return { err: 'collection required!' };
        if (!conditions) return { err: 'conditions required!' };

        const fullPath = this.getFilePath(collection);
        //if (!fs.existsSync(fullPath)) return { err: 404 };
        if (!fs.existsSync(fullPath)) return [];

        let db = this.readFileData(fullPath)

        return db.filter(item => {
            return Object.entries(conditions).every(([key, value]) => item[key] === value);
        });
    }

    findOne(collection, conditions) {
        if (!collection) return { err: 'collection required!' };
        if (!conditions) return { err: 'conditions required!' };

        const fullPath = this.getFilePath(collection);
        //if (!fs.existsSync(fullPath)) return { err: 404 };
        if (!fs.existsSync(fullPath)) return null;

        let db = this.readFileData(fullPath)

        return db.find(item => {
            return Object.entries(conditions).every(([key, value]) => item[key] === value);
        }) || null;
    }

    search(collection, conditions) {
        if (!collection) return { err: 'collection required!' };
        if (!conditions) return { err: 'conditions required!' };

        const fullPath = this.getFilePath(collection);
        //if (!fs.existsSync(fullPath)) return { err: 404 };
        if (!fs.existsSync(fullPath)) return [];

        let db = this.readFileData(fullPath)

        return db.filter(item => {
            return Object.entries(conditions).every(([key, value]) => {
                if (item[key] !== undefined && item[key] !== null) {
                    return item[key].toString().match(new RegExp(value, 'i'));
                }
                return false;
            });
        });
    }

    get(collection) {
        if (!collection) return { err: 'collection required!' };

        const fullPath = this.getFilePath(collection);
        //if (!fs.existsSync(fullPath)) return { err: 404 };
        if (!fs.existsSync(fullPath)) return undefined;

        return this.readFileData(fullPath)
    }

    count(collection) {
        // 1. First check if collection exists (same as get())
        if (!collection) return { success: false, err: 'collection required!' };

        // 2. Get the data
        const result = this.get(collection);

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

    check(collection, data) {
        if (!collection) return { err: 'collection required!' };
        if (!data) return { err: 'conditions required!' };

        return this.find(collection, data).length > 0;
    }

    edit(collection, conditions, newData) {
        // Validate required parameters
        if (!collection) return { err: 'Collection name required' };
        if (!conditions) return { err: 'Conditions required' };
        if (!newData) return { err: 'New data required' };

        const fullPath = this.getFilePath(collection);
        if (!fs.existsSync(fullPath)) return { err: 'Collection not found', code: 404 };

        // Load and decrypt data if encrypted
        let db = this.readFileData(fullPath)

        let editedCount = 0;
        let duplicateFound = false;

        // Find and update matching items
        const updatedDb = db.map(item => {
            // Check if item matches conditions
            if (Object.entries(conditions).every(([key, value]) => {
                return item[key] === value || deepCompare(item[key], value);
            })) {
                // Create the would-be updated object
                const updatedItem = { ...item, ...newData };

                // Check for duplicates if noRepeat is enabled
                if (this.config.noRepeat) {
                    const isDuplicate = db.some(existingItem => {
                        // Skip comparing with itself
                        if (existingItem.__id && item.__id && existingItem.__id === item.__id) {
                            return false;
                        }
                        // Compare all fields except auto-generated ones
                        return Object.keys(newData).every(key => {
                            if (key === '__id') return false;
                            return deepCompare(existingItem[key], updatedItem[key]);
                        });
                    });

                    if (isDuplicate) {
                        duplicateFound = true;
                        return item; // Return original item without changes
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

        // Save updated data
        this.writeFileData(fullPath, updatedDb)

        return {
            success: true,
            modifiedCount: editedCount
        };
    }

    drop(collection) {
        if (!collection) return { err: 'collection required!' };

        const fullPath = this.getFilePath(collection);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            return { success: true };
        } else {
            return { err: 404 };
        }
    }

    reset(collection) {
        return this.drop(collection)
    }

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

    getAllFromBTree() {
        return this.btree.traverse(this.btree.root);
    }

    generateUniqueId() {
        if (this.config.encode === 'bson') {
            return new ObjectId()//.toString();
        }
        const timestamp = Date.now().toString(36);
        const randomStr = Math.random().toString(36).substring(2, 8);
        return `${timestamp}-${randomStr}`;
    }
}

module.exports = eveloDB;