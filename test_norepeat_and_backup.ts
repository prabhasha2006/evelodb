import EveDB, { type EveloDBConfig } from "./npm-prime/evelodb";
import * as fs from 'fs';

async function runTest() {
    console.log("--- TEST 1: Default noRepeat (should be TRUE) ---");
    const db1 = new EveDB({ directory: "./test_nr_1" });
    db1.drop("logs");
    db1.create("logs", { msg: "hello" });
    const res1 = db1.create("logs", { msg: "hello" });
    console.log("Create duplicate in default collection:", res1.err); 
    // Expected: Duplicate data (because default is true)

    console.log("\n--- TEST 2: Collection-level noRepeat: false ---");
    const config2: EveloDBConfig = {
        directory: "./test_nr_2",
        schema: {
            history: { noRepeat: false }
        }
    };
    const db2 = new EveDB(config2);
    db2.drop("history");
    db2.create("history", { event: "login" });
    const res2 = db2.create("history", { event: "login" });
    console.log("Create duplicate with noRepeat: false:", res2.success ? "SUCCESS" : res2.err);
    // Expected: SUCCESS

    console.log("\n--- TEST 3: Enhanced Backup Metadata ---");
    const config3: EveloDBConfig = {
        directory: "./test_nr_3",
        schema: {
            users: {
                fields: { name: { type: String, required: true } },
                objectIdKey: "userId",
                noRepeat: true,
                indexes: ["name"]
            }
        }
    };
    const db3 = new EveDB(config3);
    db3.drop("users");
    db3.create("users", { name: "Alice" });
    
    const backup = db3.createBackup("users", { type: "json", path: "./backups" });
    if (backup.success && backup.backupPath) {
        const info = db3.readBackupFile(backup.backupPath);
        console.log("Backup Schema Metadata:", JSON.stringify(info.schema, null, 2));
        
        if (info.schema.objectIdKey === "userId" && info.schema.noRepeat === true) {
            console.log("SUCCESS: Backup contains full schema metadata");
        } else {
            console.log("FAILED: Missing metadata in backup");
        }
    }

    db1.closeAll();
    db2.closeAll();
    db3.closeAll();
}

runTest().catch(console.error);
