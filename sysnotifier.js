var notifymsg=[], count=0;
const getDB=require('./db.js');

getDB((err, db)=>{
    db.notify.find({read:{$ne:true}}).toArray((err, r)=>{
        if (err) return;
        notifymsg=r;
    })
})
function add(title, desc, priority, auth) {
    count++;
    var n={title:title, desc:desc, priority:priority, acl:auth||'admin', _id:count, time:new Date(), read:false};
    console.error(title, desc||'', priority||'', auth||'admin', '@'+n.time);
    getDB((err, db)=>{
        if (err) return;
        db.notify.insert(n);
    })
    return notifymsg.push(n)-1;
}

function remove(idx) {
    if (idx>=0) {
        var r=notifymsg.splice(idx, 1);
        getDB((err, db)=>{
            db.notify.updateOne({_id:r[0]._id}, {$set:{read:true}});
        })
    }
}

function all() {
    return notifymsg;
}

module.exports={all, add, remove};