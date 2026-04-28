import EveDB, { type EveloDBConfig } from "./publish/evelodb";

const config: EveloDBConfig = {
    extension: "db",
    tabspace: 3,
    encode: "bson",
    encryption: null,
    encryptionKey: null,
    noRepeat: true,
    autoPrimaryKey: true,
    objectId: false,
}

const db = new EveDB(config);

/* const a = db.create("ffff", {
    contentHash: "4298fc1c14",

    extension: "mp4",
    mimeType: "video/mp4",
    fileSize: 2048,
    checksum: "crc32:ab3f9921",

    createdAt: "2006-07-13T00:00:00Z",
    expireAt: null,
    lastAccessedAt: "2006-07-13T00:00:00Z",

    tokenCount: 2,
    totalAccessCount: 42
})

console.log(a); */
const c = db.readData("ffff");
const ca = db.writeData("ffff", [
  {
    contentHash: 'e3b0c44298fc1c14',
    extension: 'png',
    mimeType: 'image/png',
    fileSize: 2048,
    checksum: 'crc32:ab3f9921',
    createdAt: '2006-07-13T00:00:00Z',
    expireAt: null,
    lastAccessedAt: '2006-07-13T00:00:00Z',
    tokenCount: 1,
    totalAccessCount: 42,
    fuck: 'moiawql7adobcvib'
  },
  {
    contentHash: '4298fc1c14',
    extension: 'mp4',
    mimeType: 'video/mp4',
    fileSize: 2048,
    checksum: 'crc32:ab3f9921',
    createdAt: '2006-07-13T00:00:00Z',
    expireAt: null,
    lastAccessedAt: '2006-07-13T00:00:00Z',
    tokenCount: 2,
    totalAccessCount: 42,
    fuck: 'moiayynnuqmwrx17'
  }
])
//const c = db.findOne("ffff", { fuck: 'moiayynnuqmwrx17' })
console.log(c);

//console.log(a);