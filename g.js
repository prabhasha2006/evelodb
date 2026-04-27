const EveloDB = require("evelodb-global");


const db = new EveloDB({
    host: "127.0.0.1",
    port: 7962,
    user: "test",
    key: "1234"
});

async function main() {
    await db.writeData("users", [ { name: 'AAAA', age: 30, _id: 'mohh98hh2fdptigv' }, { name: 'BBBB', age: 40, _id: 'mohh98hh2fdptihh' } ])
    await db.create("users", {
        name: "John",
        age: 30
    });
    const data = await db.find("users", {
        age: { $gte: 30 }
    });
    console.log(data);
}

main();