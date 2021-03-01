const getDB =require('./db.js');

// (async function _go() {
//     var {db}=await getDB();
//     db.bills.watch(null, {resumeAfter:{_data: '825FC3C591000000012B022C0100296E5A1004AF48725301CD455B8EC541FF740FDD5346645F696400645E50ADEBA8357C0869A8ECA70004'}})
//     .on('change', console.log);
// })();


exports.when=function(collectionName, op, handler) {
    if (typeof op=='function') {
        handler=op;
        op=null;
    }
    (async function _go() {
        var {db}=await getDB();
        var col=db[collectionName];
        if (!col) throw 'no such collection';
        var watched=await db.event_tracer.findOne({_id:collectionName}, {last:1});
        col.watch(null, {resumeAfter:watched?watched.last:null})
        .on('change', async (rec)=>{
            try {
                await handler(rec);
                db.event_tracer.updateOne({_id:collectionName}, {$set:{last:rec._id}});
            } catch(e) {
                console.error(e);
            }
        });
    })();
}