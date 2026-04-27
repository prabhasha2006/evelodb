import EveDB, { type EveloDBConfig } from "./publish/evelodb";

const config: EveloDBConfig = {
    extension: "db",
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

const b = db.readData("test");
console.log(b);

//console.log(a);