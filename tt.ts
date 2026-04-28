import EveDB, { type EveloDBConfig } from "./npm-prime/evelodb";

const config: EveloDBConfig = {
    directory: "./evelodbprime_test",
    noRepeat: true,
    schema: {
        users: {
            fields: {
                username: { type: String, required: true, min: 5, max: 30 },
                email: { type: String, required: true },
                name: { type: String, required: true, min: 5, max: 30 },
                age: { type: Number, required: true, min: 18, max: 90 },
                cards: { type: Array, required: true, min: 0, max: 10 },
                profile: { type: Object, required: false },
                vehicle: {
                    type: {
                        color: { type: String, required: true },
                        type: { type: String, required: true }
                    }, required: false
                }
            },
            indexes: ["email", "username"],
            uniqueKeys: ["email", "username"]
        }
    }
}

const db = new EveDB(config);

console.log("--- Testing Valid Create ---");
const a = db.create("users", {
    username: "johndoe",
    email: "john@example.com",
    name: "John Doe",
    age: 30,
    cards: ["Visa", "Mastercard"],
    profile: { bio: "Hello world" }
});
console.log("Result:", a);

console.log("\n--- Testing Unique Key (Duplicate Email) ---");
const b = db.create("users", {
    username: "john_new",
    email: "john@example.com", // Duplicate
    name: "John Smith",
    age: 35,
    cards: []
});
console.log("Result:", b);

console.log("\n--- Testing Indexed Find (by email) ---");
const start = Date.now();
const found = db.find("users", { email: "john@example.com" }).all();
const end = Date.now();
console.log(`Found records (in ${end - start}ms):`, found);

console.log("\n--- Testing Edit with Unique Violation ---");
const c = db.create("users", {
    username: "alice99",
    email: "alice@example.com",
    name: "Alice Wonderland",
    age: 22,
    cards: []
});
if (c._id) {
    const editRes = db.edit("users", { _id: c._id }, { email: "john@example.com" });
    console.log("Edit Result (duplicate email):", editRes);
}

console.log("\n--- Testing Compact and Indexes ---");
db.compact("users");
const afterCompact = db.find("users", { username: "johndoe" }).all();
console.log("Found after compact:", afterCompact);

console.log("\n--- Testing Delete and Indexes ---");
db.delete("users", { username: "johndoe" });
const afterDelete = db.find("users", { username: "johndoe" }).all();
console.log("Found after delete (should be empty):", afterDelete);

const all = db.get("users").all();
console.log("\nFinal Records in DB:", all);