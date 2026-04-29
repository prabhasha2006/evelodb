import EveDB, { type EveloDBConfig } from "./npm-prime/evelodb";

async function runTest() {
    console.log("--- TEST 1: Strict Collections ---");
    const config1: EveloDBConfig = {
        directory: "./test_strict_1",
        schema: {
            users: {
                fields: { name: { type: String, required: true } }
            }
        }
    };
    const db1 = new EveDB(config1);
    db1.drop("users");

    const res1 = db1.create("items", { name: "bag" });
    console.log("Create 'items' (not in schema):", res1.err); 
    // Expected: Collection 'items' is not defined in schema

    const res2 = db1.create("users", { name: "John", age: 30 });
    console.log("Create 'users' with unknown field 'age':", res2.err);
    // Expected: Field 'age' is not defined in schema

    const res3 = db1.create("users", { name: "John" });
    console.log("Create 'users' with valid fields:", res3.success ? "SUCCESS" : res3.err);

    console.log("\n--- TEST 2: Open Database (No Schema) ---");
    const db2 = new EveDB({ directory: "./test_strict_2" });
    const res4 = db2.create("any_collection", { any_field: "any_value" });
    console.log("Create in any collection without schema:", res4.success ? "SUCCESS" : res4.err);

    console.log("\n--- TEST 3: Nested Object Strictness ---");
    const config3: EveloDBConfig = {
        directory: "./test_strict_3",
        schema: {
            posts: {
                fields: {
                    title: { type: String, required: true },
                    meta: {
                        type: {
                            tags: { type: Array, required: true }
                        },
                        required: true
                    }
                }
            }
        }
    };
    const db3 = new EveDB(config3);
    const res5 = db3.create("posts", { 
        title: "Hello", 
        meta: { tags: ["news"], unknown: 1 } 
    });
    console.log("Create with unknown nested field:", res5.err);
    // Expected: meta.Field 'unknown' is not defined in schema

    db1.closeAll();
    db2.closeAll();
    db3.closeAll();
}

runTest().catch(console.error);
