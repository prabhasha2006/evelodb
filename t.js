
const eveloDB = require('./evelodb')
const fs = require('fs');
let db
try {
    db = new eveloDB({
        noRepeat: true,
        encode: 'json',
        autoPrimaryKey: 'id',
        //objectId: true
    })
} catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
}

const user = {
    name: "Kumuthu",
    age: 19,
    state: 'pending'
}

//console.log(db.create('users', user))


//intellisense not working
//console.log(db.find('users', {key: 'mf0z1grw_18fxwjz9'}).all())
console.log(db.edit('users', { id: "mjk1v8mbcco74rd6" }, { state: 'accept' }))

async function a() {
    const img = await db.readImage('image.jpg', {
        returnBase64: false,
        quality: 0.9,
        pixels: 1000000,
        mirror: false,
        invert: false,
        blackAndWhite: false,
        brightness: 1,
        contrast: 1,
        maxWidth: 10,
        maxHeight: 10,
    })
    console.log(img)

    const a = await db.readImage('image.jpg', )
    fs.writeFileSync('out.jpg', img.data)
}
