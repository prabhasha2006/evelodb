import EveDB from "./publish/evelodb";
import * as fs from 'fs';
import * as path from 'path';

const config = {
    directory: "./test_rebuild_db",
    extension: "bson",
    encode: "bson" as const
};

// 1. Create records
console.log("Creating records...");
let db = new EveDB(config);
/* db.create("test", { _id: "1", name: "Alice" });
db.create("test", { _id: "2", name: "Bob" });
db.closeAll();

const dataPath = "./test_rebuild_db/test.bson";
const idxPath = "./test_rebuild_db/test.bson.bidx";

if (fs.existsSync(idxPath)) {
    console.log("Index file exists. Deleting it...");
    fs.unlinkSync(idxPath);
}

// 2. Reopen and check
console.log("Reopening database...");
db = new EveDB(config);
const alice = db.findOne("test", { _id: "1" });
console.log("Found Alice:", alice);
 */
const all = db.get("test").all();
console.log("All records:", all);

if (Array.isArray(all) && all.length === 2) {
    console.log("SUCCESS: Index was rebuilt and both records found.");
} else {
    console.log("FAILURE: Records missing after index deletion.");
}

// Clean up
// fs.rmSync("./test_rebuild_db", { recursive: true, force: true });
