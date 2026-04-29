import EveDB, { type EveloDBConfig } from "./npm-prime/evelodb";
import * as fs from 'fs';
import * as path from 'path';

const config: EveloDBConfig = {
    directory: "./evelodb_backup_test",
    noRepeat: true,
    schema: {
        users: {
            fields: {
                username: { type: String, required: true },
                email: { type: String, required: true },
                age: { type: Number, required: true }
            },
            indexes: ["email"],
            uniqueKeys: ["email"],
            objectIdKey: "_id"
        }
    }
}
    const db = new EveDB(config);

async function runTest() {
    db.drop("users"); // Start fresh

    console.log("--- Creating Records ---");
    db.create("users", { username: "alice", email: "alice@example.com", age: 25 });
    db.create("users", { username: "bob", email: "bob@example.com", age: 30 });

    console.log("\n--- Creating Binary Backup (Encrypted) ---");
    const backupRes = db.createBackup("users", {
        type: "binary",
        path: "./backups",
        password: "secret_password",
        title: "Test Backup Title"
    });
    console.log("Backup Result:", backupRes);

    if (!backupRes.success || !backupRes.backupPath) {
        console.error("Backup failed!");
        return;
    }

    console.log("\n--- Reading Backup Info ---");
    const info = db.readBackupFile(backupRes.backupPath, "secret_password");
    console.log("Backup Info:", info);

    console.log("\n--- Dropping Collection and Restoring ---");
    db.drop("users");
    console.log("Count after drop:", db.count("users").count);

    const restoreRes = db.restoreBackup("users", {
        type: "binary",
        file: backupRes.backupPath,
        password: "secret_password"
    });
    console.log("Restore Result:", restoreRes);

    const finalRecords = db.get("users").all();
    console.log("\n--- Final Records after Restore ---");
    console.log(finalRecords);

    if (Array.isArray(finalRecords) && finalRecords.length === 2) {
        console.log("\n✅ SUCCESS: Backup and Restore worked perfectly!");
    } else {
        console.error("\n❌ FAILED: Records missing after restore.");
    }

    db.closeAll();
}

function restore() {
    // clear backup folder
    /* const backupDir = path.join(__dirname, "backups");
    if (fs.existsSync(backupDir)) {
        fs.rmSync(backupDir, { recursive: true });
    } */

    const v = db.readBackupFile("./backups/users_backup_2026-04-28T12-38-25-561Z.backup", "1234")
    console.log(v)
    return


    db.create("users", { username: "alice", email: "alice@example.com", age: 25 });
    db.create("users", { username: "bob", email: "bob@example.com", age: 30 });
    const a = db.createBackup("users", {
        type: "binary",
        path: "./backups",
        title: "Test Backup Title",
        password: "1234"
    });
    const b = db.restoreBackup("users", {
        type: "binary",
        file: a.backupPath!,
        password: "1234"
    })
    console.log(a)
    console.log(b)
    console.log(db.get("users").all())
}

restore();
