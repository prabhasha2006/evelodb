
const eveloDB = require('./evelodb.js');
let db
try {
    db = new eveloDB({
        noRepeat: true,
        autoPrimaryKey: 'key'
    })
} catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
}

//console.log(db.create('users', { name:'Kumuthu', age: 30}))
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
(async () => {
    getAIResponse()

})()