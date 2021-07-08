const getDB= require('../db.js')
, ObjectId=require('mongodb').ObjectId
, argv = require('yargs')
    .default('sublock', false)
    .argv
, readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const getLine = (function () {
    const getLineGen = (async function* () {
        for await (const line of rl) {
            yield line;
        }
    })();
    return async () => ((await getLineGen.next()).value);
})();

(async ()=>{
    var {db}=await getDB();
    var session=db.mongoClient.startSession();
    try {
        await session.withTransaction(async ()=>{
            // lock
            var lck={$set:{lock:new ObjectId()}};
            await db.locks.updateOne({_id:'accounts'}, lck, {upsert:true, session});
            console.log('green light');
            var [{_id, balance}]=await db.accounts.find({balance:{$ne:null}}).sort({_id:-1}).limit(1).toArray();
            console.log('_id, balance is', _id, balance);
            await db.accounts.updateOne({_id}, {$inc:{balance:100}}, {session});
            console.log('balance changed to', balance+100);
            await getLine();
        }, {
            readPreference: 'primary',
            readConcern: { level: 'local' },
            writeConcern: { w: 'majority' }
        })
    } finally {
        session.endSession();
    }
    console.log('done')
    process.exit(0);
})();

