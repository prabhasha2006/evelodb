
const EveloDB = require('evelodb')

const config = {
    extension: "db",
    tabspace: 3,
    encode: "bson",
    encryption: null,
    encryptionKey: null,
    noRepeat: false,
    autoPrimaryKey: true,
    objectId: false,    
}

const db = new EveloDB(config);

const b = db.get("cdn").count()
console.log(b);