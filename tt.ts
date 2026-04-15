import EveDB, { type EveloDBConfig } from "evelodb";

const config: EveloDBConfig = {
    extension: "json",
    tabspace: 3,
    encode: "json",
    encryption: null,
    encryptionKey: null,
    noRepeat: false,
    autoPrimaryKey: true,
    objectId: false,
}

const db = new EveDB(config);

const a = db.create("test", {
    password: "password",
    
});

console.log(a);