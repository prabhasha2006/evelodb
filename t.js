
const eveloDB = require('./evelodb')
const fs = require('fs');
let db
try {
    db = new eveloDB({
        noRepeat: true,
        encode: 'json',
        autoPrimaryKey: 'id',
    })
} catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
}

const user = {
    name: "Kumuthu",
    age: 13,
    state: 'pending',
    data: {
        url: "kp"
    },
    hobbies: ["a", "b"]
}

//console.log(db.create('users', user))


//intellisense not working
console.log(db.find('users', {
    name: "Kumuthu",
    age: 13,
    state: 'pending',
    data: {
        url: "kp"
    }
}).all())
//console.log(db.edit('users', { id: "mjo0m3vom1cha41g" }, { state: 'accept' }))
