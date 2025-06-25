// 1.1.7

const fs = require('fs');
const { encrypt, decrypt } = require('./encryption');

// Default configuration
const defaultConfig = {
    directory: './evelodatabase',
    extension: 'json',
    tabspace: 3,
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
        return encrypt(
            data,
            this.config.encryption,
            this.config.encryptionKey
        );
    }

    decrypt(data) {
        return decrypt(
            data,
            this.config.encryption,
            this.config.encryptionKey
        );
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
            const fileData = fs.readFileSync(fullPath, 'utf8');
            db = this.config.encryption ? this.decrypt(fileData) : JSON.parse(fileData);

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

        // Add autoPrimaryKey if enabled
        if (this.config.autoPrimaryKey) {
            object.__id = this.generateUniqueId();
        }

        // Add to database
        db.push(object);

        // Write to file
        fs.writeFileSync(
            fullPath,
            this.config.encryption
                ? this.encrypt(db)
                : JSON.stringify(db, null, this.config.tabspace)
        );

        // Index in B-Tree if token exists
        if (object.token) {
            this.btree.insert(object.token, object);
        }

        return {
            success: true,
            ...(this.config.autoPrimaryKey && { __id: object.__id })
        };
    }

    delete(collection, conditions) {
        if (!collection) return { err: 'collection required!' };
        if (!conditions) return { err: 'conditions required!' };

        const fullPath = this.getFilePath(collection);
        if (!fs.existsSync(fullPath)) return { err: 404 };

        let db = this.config.encryption
            ? this.decrypt(fs.readFileSync(fullPath, 'utf8'))
            : JSON.parse(fs.readFileSync(fullPath, 'utf8'));

        const filteredData = db.filter(item => {
            return !Object.entries(conditions).every(([key, value]) => {
                if (typeof value === 'object') {
                    return deepCompare(item[key], value);
                } else {
                    return item[key] === value;
                }
            });
        });

        fs.writeFileSync(
            fullPath,
            this.config.encryption
                ? this.encrypt(filteredData)
                : JSON.stringify(filteredData, null, this.config.tabspace)
        );
        return { success: true };
    }

    inject(collection, data) {
        if (!collection) return { err: 'collection required!' };
        if (!data) return { err: 'data required!' };

        const fullPath = this.getFilePath(collection);
        fs.writeFileSync(
            fullPath,
            this.config.encryption
                ? this.encrypt(data)
                : JSON.stringify(data, null, this.config.tabspace)
        );
        return { success: true };
    }

    find(collection, conditions) {
        if (!collection) return { err: 'collection required!' };
        if (!conditions) return { err: 'conditions required!' };

        const fullPath = this.getFilePath(collection);
        if (!fs.existsSync(fullPath)) return { err: 404 };

        let db = this.config.encryption
            ? this.decrypt(fs.readFileSync(fullPath, 'utf8'))
            : JSON.parse(fs.readFileSync(fullPath, 'utf8'));

        return db.filter(item => {
            return Object.entries(conditions).every(([key, value]) => item[key] === value);
        });
    }

    findOne(collection, conditions) {
        if (!collection) return { err: 'collection required!' };
        if (!conditions) return { err: 'conditions required!' };

        const fullPath = this.getFilePath(collection);
        if (!fs.existsSync(fullPath)) return { err: 404 };

        let db = this.config.encryption
            ? this.decrypt(fs.readFileSync(fullPath, 'utf8'))
            : JSON.parse(fs.readFileSync(fullPath, 'utf8'));

        return db.find(item => {
            return Object.entries(conditions).every(([key, value]) => item[key] === value);
        }) || null;
    }

    search(collection, conditions) {
        if (!collection) return { err: 'collection required!' };
        if (!conditions) return { err: 'conditions required!' };

        const fullPath = this.getFilePath(collection);
        if (!fs.existsSync(fullPath)) return { err: 404 };

        let db = this.config.encryption
            ? this.decrypt(fs.readFileSync(fullPath, 'utf8'))
            : JSON.parse(fs.readFileSync(fullPath, 'utf8'));

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
        if (!fs.existsSync(fullPath)) return { err: 404 };

        return this.config.encryption
            ? this.decrypt(fs.readFileSync(fullPath, 'utf8'))
            : JSON.parse(fs.readFileSync(fullPath, 'utf8'));
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
        let db = this.config.encryption
            ? this.decrypt(fs.readFileSync(fullPath, 'utf8'))
            : JSON.parse(fs.readFileSync(fullPath, 'utf8'));

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
        fs.writeFileSync(
            fullPath,
            this.config.encryption
                ? this.encrypt(updatedDb)
                : JSON.stringify(updatedDb, null, this.config.tabspace)
        );

        return {
            success: true,
            modifiedCount: editedCount
        };
    }

    reset(collection) {
        if (!collection) return { err: 'collection required!' };

        const fullPath = this.getFilePath(collection);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            return { success: true };
        } else {
            return { err: 404 };
        }
    }

    changeConfig({ from, to, collections }) {
        const path = require('path');
        const files = fs.readdirSync(from.directory);
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
        const fromExt = from.extension || 'json';
        const toExt = to.extension || 'json';

        files.forEach(file => {
            const ext = path.extname(file).slice(1);
            const name = path.basename(file, '.' + ext);
            if (ext !== fromExt) return;
            if (collections && !collections.includes(name)) return;

            const fromPath = path.join(from.directory, file);
            const toPath = path.join(to.directory, `${name}.${toExt}`);

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
            } catch (err) {
                console.error(`Failed to convert ${file}: ${err.message}`);
                errorCount++;
            }
        });

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

        let db = this.config.encryption
            ? this.decrypt(fs.readFileSync(fullPath, 'utf8'))
            : JSON.parse(fs.readFileSync(fullPath, 'utf8'));

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
        const timestamp = Date.now().toString(36);
        const randomStr = Math.random().toString(36).substring(2, 8);
        return `${timestamp}-${randomStr}`;
    }
}

module.exports = eveloDB;