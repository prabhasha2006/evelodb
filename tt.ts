import EveDB, { type EveloDBConfig } from "evelodb";

const config: EveloDBConfig = {
    extension: "bson",
    tabspace: 3,
    encode: "bson",
    encryption: null,
    encryptionKey: null,
    noRepeat: false,
    autoPrimaryKey: true,
    objectId: false,
}

const db = new EveDB(config);

const a = db.create("test", {
    password: "password",
    state: "accept",
});

console.log(a);