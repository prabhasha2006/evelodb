const fs = require('fs');
const filePath = './evelodatabase';
const fileExt = 'json';
const tabspace = 3;

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
    constructor() {
        this.btree = new BTree(3); // B-Tree order 3
    }

    create(collection, data) {
        if (!fs.existsSync(filePath)) {
            fs.mkdirSync(filePath);
        }
        if (!collection) return { err: 'collection required!' };
        if (!data) return { err: 'data required!' };

        let object = { ...data };
        let db = [];

        const fullPath = `${filePath}/${collection}.${fileExt}`;
        if (fs.existsSync(fullPath)) {
            db = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        }
        db.push(object);
        fs.writeFileSync(fullPath, JSON.stringify(db, null, tabspace));

        this.btree.insert(object.token, object); // Insert into B-Tree
        return { success: true };
    }

    delete(collection, conditions) {
        if (!collection) return { err: 'collection required!' };
        if (!conditions) return { err: 'conditions required!' };
        if (!fs.existsSync(`${filePath}/${collection}.${fileExt}`)) return { err: 404 };

        let db = JSON.parse(fs.readFileSync(`${filePath}/${collection}.${fileExt}`, 'utf8'));
        const filteredData = db.filter(item => {
            return !Object.entries(conditions).every(([key, value]) => {
                if (typeof value === 'object') {
                    return deepCompare(item[key], value);
                } else {
                    return item[key] === value;
                }
            });
        });
        fs.writeFileSync(`${filePath}/${collection}.${fileExt}`, JSON.stringify(filteredData, null, tabspace));
        return { success: true };
    }

    inject(collection, data) {
        if (!fs.existsSync(filePath)) {
            fs.mkdirSync(filePath);
        }
        if (!collection) return { err: 'collection required!' };
        if (!data) return { err: 'conditions required!' };

        fs.writeFileSync(`${filePath}/${collection}.${fileExt}`, JSON.stringify(data, null, tabspace));
        return { success: true };
    }

    find(collection, conditions) {
        if (!collection) return { err: 'collection required!' };
        if (!conditions) return { err: 'conditions required!' };

        let db = JSON.parse(fs.readFileSync(`${filePath}/${collection}.${fileExt}`, 'utf8'));
        return db.filter(item => {
            return Object.entries(conditions).every(([key, value]) => item[key] === value);
        });
    }

    findOne(collection, conditions) {
        if (!collection) return { err: 'collection required!' };
        if (!conditions) return { err: 'conditions required!' };

        let db = JSON.parse(fs.readFileSync(`${filePath}/${collection}.${fileExt}`, 'utf8'));
        return db.find(item => {
            return Object.entries(conditions).every(([key, value]) => item[key] === value);
        }) || null;
    }

    search(collection, conditions) {
        if (!collection) return { err: 'collection required!' };
        if (!conditions) return { err: 'conditions required!' };

        let db = JSON.parse(fs.readFileSync(`${filePath}/${collection}.${fileExt}`, 'utf8'));
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

        if (fs.existsSync(`${filePath}/${collection}.${fileExt}`)) {
            let db = JSON.parse(fs.readFileSync(`${filePath}/${collection}.${fileExt}`, 'utf8'));
            return db;
        } else {
            return { err: 404 };
        }
    }

    check(collection, data) {
        if (!collection) return { err: 'collection required!' };
        if (!data) return { err: 'conditions required!' };

        return this.find(collection, data).length > 0;
    }

    edit(collection, conditions, newData) {
        if (!collection) return { err: 'collection required!' };
        if (!conditions) return { err: 'conditions required!' };
        if (!newData) return { err: 'new data required!' };

        let db = JSON.parse(fs.readFileSync(`${filePath}/${collection}.${fileExt}`, 'utf8'));
        db.forEach(item => {
            if (Object.entries(conditions).every(([key, value]) => item[key] === value)) {
                Object.entries(newData).forEach(([key, value]) => {
                    item[key] = value;
                });
            }
        });

        fs.writeFileSync(`${filePath}/${collection}.${fileExt}`, JSON.stringify(db, null, tabspace));
        return { success: true };
    }

    reset(collection) {
        if (!collection) return { err: 'collection required!' };
        if (fs.existsSync(`${filePath}/${collection}.${fileExt}`)) {
            fs.unlinkSync(`${filePath}/${collection}.${fileExt}`);
            return { success: true };
        } else {
            return { err: 404 };
        }
    }

    rebuildBTree(collection) {
        if (!collection) return { err: 'collection required!' };
        if (!fs.existsSync(`${filePath}/${collection}.${fileExt}`)) return { err: 404 };

        let db = JSON.parse(fs.readFileSync(`${filePath}/${collection}.${fileExt}`, 'utf8'));
        this.btree = new BTree(3); // Reinitialize B-Tree
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
}

module.exports = eveloDB;

// 1.1.0
