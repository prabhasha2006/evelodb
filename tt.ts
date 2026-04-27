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

/* for (let i = 0; i < 1; i++) {
const a = db.create("cdn", {
    contentHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",

    extension: "png",
    mimeType: "image/png",
    fileSize: 2048,
    checksum: "crc32:ab3f9921",

    createdAt: "2006-07-13T00:00:00Z",
    expireAt: null,
    lastAccessedAt: "2006-07-13T00:00:00Z",

    tokenCount: 1,
    tokens: [
        {
            key: "8872398",
            fileName: "image.png",
            createdBy: "user_abc",
            createdAt: "2006-07-13T00:00:00Z",
            expiresAt: null,
            accessCount: 42,
            lastAccessedAt: "2006-07-13T00:00:00Z",
            permissions: {
                download: true,
                hotlink: true,
                maxDownloads: null
            }
        }
    ],

    totalAccessCount: 42
})
} */

const b = db.writeData("aa",
    [{
        a: "b"
    }, {
        b: "c"
    }, {
        c: "d"
    }, {
        d: "e"
    }]
)
console.log(b);
const c = db.readData("aa");
console.log(c);

//console.log(a);