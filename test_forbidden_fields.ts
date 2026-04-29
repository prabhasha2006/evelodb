import EveDB, { type EveloDBConfig } from "./npm-prime/evelodb";

const config: EveloDBConfig = {
    directory: "./evelodb_forbidden_test",
    schema: {
        users: {
            objectIdKey: "userId"
        }
    }
}

async function runTest() {
    const db = new EveDB(config);
    db.drop("users");

    console.log("--- 1. Testing forbidden fields in create() ---");
    
    const try1 = db.create("users", { name: "alice", userId: "123" });
    console.log("Try userId:", try1.err); // Should fail

    const try2 = db.create("users", { name: "bob", _id: "456" });
    console.log("Try _id:", try2.err); // Should fail

    const try3 = db.create("users", { name: "charlie", _createdAt: "today" });
    console.log("Try _createdAt:", try3.err); // Should fail

    console.log("\n--- 2. Testing forbidden fields in edit() ---");
    const ok = db.create("users", { name: "real" });
    const id = ok.userId as string;

    const editTry = db.edit("users", { userId: id }, { name: "new", _modifiedAt: "now" });
    console.log("Edit Try _modifiedAt:", editTry.err); // Should fail

    console.log("\n--- 3. Testing valid usage ---");
    const valid = db.create("users", { name: "valid" });
    console.log("Valid create success:", valid.success);

    db.closeAll();
}

runTest().catch(console.error);
