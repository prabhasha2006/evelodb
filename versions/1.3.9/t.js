
const eveloDB = require('./evelodb.js');
const fs = require('fs');
let db
try {
    db = new eveloDB({
        noRepeat: false,
        encode: 'bson',
        autoPrimaryKey: 'key',
        //objectId: true
    })
} catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
}

const bigData = {
    name: 'img',
    data: [
        fs.readFileSync('./img.jpg').toString('base64'),
    ]
}

async function a() {
    const img = await db.readImage('image.jpg', {
        returnBase64: false,
        quality: 0.9,
        pixels: 1000000,
        mirror: false,
        invert: false,
        blackAndWhite: false,
        brightness: 0.1,
        contrast: 1,
        maxWidth: 10,
        maxHeight: 10,
    })
    console.log(img)
    fs.writeFileSync('out.jpg', img.data) 
}

//console.log(db.readFile('image.jpg').data)
console.log(db.find('big', {key: 'mf0z1grw_18fxwjz9'}).all())
//console.log(db.create('big', {name: 'img', data: 'hello'}))
//console.log(db.edit('users', { age: 30}, { age: 40}))
/* console.log(db.create('users', {
    name: 'Anuki',
    age: 16,
    weight: 30,
})) */

/* console.log(
    db.get('users', {
        age: 12
    }).all(0, 3)
) */

async function getAIResponse(prompt) {
    const data = [
        {
            id: 1,
            name: "JohnDoe",
            bio: "I'm a friendly programmer who loves open source!",
            age: 28
        },
        {
            id: 2,
            name: "Hey123",
            bio: "Fuck you bitch!",
            age: 22
        },
        {
            id: 3,
            name: "ToxicPlayer",
            bio: "Bloody hell man!",
            age: 18
        },
        {
            id: 4,
            name: "NicePerson",
            bio: "Let's spread kindness and positivity!",
            age: 25
        },
        {
            id: 5,
            name: "AngryGamer",
            bio: "This game is trash and so are its developers!",
            age: 20
        }
    ];

    const res = await db.analyse({
        //collection: 'users2',
        //filter: { age: { $gt: 18 } },
        data: data,
        model: 'gemini-2.5-flash',
        apiKey: 'AIzaSyDcXJL5_qGbkVoeIurMwHcKv5JKF3VnXv0',
        query: 'Find users with potentially offensive bios'
    })
    console.log(res)
}

// Example usage
/* (async () => {
    getAIResponse()

})() */