
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

console.log(db.find('users', {
    name: { $ne: 'Kumuthu' }
}))