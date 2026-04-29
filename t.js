import EveDB from "./npm-prime/dist/esm/evelodb.js";
import * as fs from 'fs';
import * as path from 'path';

const config = {
    directory: "./evelodb_backup_test",
    schema: {
        users: {
            fields: {
                username: { type: String, required: true },
                email: { type: String, required: true },
                age: { type: Number, required: true },
                married: { type: Boolean, required: true },
            },
            indexes: ["email"],
            uniqueKeys: ["email"],
            objectIdKey: "user",
            noRepeat: true
        }
    }
}
const db = new EveDB(config);

function restore() {
    //const c = db.create("users", { username: "John", email: "john@john.com", age: 18, married: true });
    const g = db.get("users").all()
    const c = db.inject("users", g, { method: 'overwrite' })
    console.log(c)
    //const ed = db.edit("users", { user: '69f1c6486266d6824c7680e4' }, { user: '69f1c6486266d6824c7680e4', username: "fuck" })
    //console.log(c1)
}

restore();
