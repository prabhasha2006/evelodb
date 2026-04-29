import EveDB, { type EveloDBConfig } from "./npm-prime/evelodb";
import * as fs from 'fs';
import * as path from 'path';

const config: EveloDBConfig = {
    directory: "./evelodb_id_test",
    noRepeat: true,
    schema: {
        users: {
            fields: {
                name: { type: String, required: true }
            },
            objectIdKey: "userId"
        }
    }
}

async function runTest() {
    const db = new EveDB(config);
    db.drop("users"); // Start fresh

    console.log("--- 1. Testing Create with objectIdKey ---");
    const createRes = db.create("users", { name: "John Doe" });
    console.log("Create Result:", createRes);
    
    if (createRes.userId) {
        console.log("SUCCESS: Returned 'userId' instead of '_id'");
    } else {
        console.log("FAILED: Did not return 'userId'");
    }

    const userId = createRes.userId as string;

    console.log("\n--- 2. Testing FindOne with virtual ID key ---");
    const user = db.findOne("users", { userId: userId });
    console.log("FindOne Result:", user);

    if (user && user.userId === userId && !user._id) {
        console.log("SUCCESS: Found user and result contains 'userId' and NO '_id'");
    } else {
        console.log("FAILED: Result mapping incorrect");
    }

    console.log("\n--- 3. Testing Edit with virtual ID key ---");
    const editRes = db.edit("users", { userId: userId }, { name: "John Updated" });
    console.log("Edit Result:", editRes);

    const updatedUser = db.findOne("users", { userId: userId });
    if (updatedUser && updatedUser.name === "John Updated") {
        console.log("SUCCESS: User updated using 'userId' as condition");
    } else {
        console.log("FAILED: User update failed");
    }

    console.log("\n--- 4. Testing Get All Mapping ---");
    const allUsers = db.get("users").all();
    console.log("All Users:", allUsers);
    if (Array.isArray(allUsers) && allUsers[0].userId) {
        console.log("SUCCESS: 'all()' returns mapped 'userId'");
    } else {
        console.log("FAILED: 'all()' mapping failed");
    }

    console.log("\n--- 5. Testing Backup (Raw Data) ---");
    const backupRes = db.createBackup("users", { type: "json", path: "./backups" });
    console.log("Backup Result:", backupRes);
    
    if (backupRes.success && backupRes.backupPath) {
        const backupData = JSON.parse(fs.readFileSync(backupRes.backupPath, "utf-8"));
        const firstRecord = backupData.data[0];
        console.log("First Record in Backup:", firstRecord);
        if (firstRecord._id && !firstRecord.userId) {
            console.log("SUCCESS: Backup contains raw '_id' and NO 'userId'");
        } else {
            console.log("FAILED: Backup should contain raw data");
        }
    }

    console.log("\n--- Test Complete ---");
    db.closeAll();
}

runTest().catch(console.error);
