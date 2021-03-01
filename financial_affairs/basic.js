const db_event=require('../dbwatcher')
    , getDB=require('../db')
    , {num2dec}=require('../etc')
    , ObjectId=require('mongodb').ObjectId
    , providerManager =require('../providerManager.js')

const noOrder={ordered:false};

(async function order_received() {
    var {db}=await getDB();
    db_event.when('bills', 'update', async (rec)=>{
        var {used, money, provider, paidmoney, _id, time, rec_id}=rec.fullDocument;
        if (used && rec_id==null) {
            var session=db.startSession();
            try {
                await session.withTransaction(async ()=>{
                    var now=time, rec_id=new ObjectId();
                    var op1={account:'user', subject:'recharge', amount:paidmoney, time:now, ref_id:_id, op_id:rec_id}
                        , op2={account:provider, amount:paidmoney, subject:'receivable', time:now, ref_id:_id, op_id:rec_id};
                    op2.account=provider;
                    var chg_receivable={};
                    await db.outstandingAccounts.bulkWrite([
                        {insertOne:op1}, 
                        {insertOne:op2},
                    ], {...noOrder, session});
                    await db.bills.updateOne({_id:_id}, {$set:{rec_id}}, {session});
                }, {
                    readPreference: 'primary',
                    readConcern: { level: 'local' },
                    writeConcern: { w: 'majority' }
                });
            } finally {
                await session.endSession();
            }
            return true;
        }
    })
})()

async function reconciliation() {
    var {db}=getDB();
    var from=end=new Date();
    from.setDate(from.getDate()-1);
    from.setHours(0, 0, 0, 0);
    end.setDate(end.getDate()-1);
    end.setHours(23, 59, 59, 999);
    // var allProvidersNeedsCheck=await db.outstandingAccounts.aggregate({$match:{time:{$gte:from, $lte:end}, subject:'receivable'}}, {$group:{_id:'$account', receivable:{$sum:'$amount'}}}).toArray();
    var allProviders=providerManager.getProvider(), checklist=[], checked=[], merchantIncoming={};
    for (const providerName in allProviders) {
        checklist.push(async ()=>{
            // balance
            var {received, commission, confirmedOrders, recon_tag}=await providerManager.getProvider(provider).getReconciliation(from,end)
            var recon_id=new ObjectId();
            checked.push({_id:recon_id, account:providerName, received, commission, recon_tag, time:end});
            var upds=[];
            for (const order in confirmedOrders) {
                var {orderId} =order;
                var {merchantid, provider, paidmoney, _id:ref_id, time, share} =await db.bills.findOne({_id:ObjectId(orderId)});
                upds.push({insertOne:{account:'user', subject:'recharge', amount:-paidmoney, time, ref_id, recon_id}});
                var commission=Number((paidmoney*(1-share)).toFixed(2));
                upds.push({insertOne:{account:merchantid, subject:'balance', amount:paidmoney-commission, time, ref_id, recon_id}});
                upds.push({insertOne:{account:'commission', subject:'balance', amount:commission, time, ref_id, recon_id}});
                merchantIncoming[merchantid]=merchantIncoming[merchantid]||{recharge:0, commission:0};
                merchantIncoming[merchantid].recharge+=paidmoney;
                merchantIncoming[merchantid].commission+=commission;
            }
            db.accounts.bulkWrite(upds, noOrder);
        });
    }
    if (checklist.length) {
        await Promise.all(checklist);
        db.statements.insertMany(checked, noOrder);
        var ops=[];
        for (const merchantid in merchantIncoming) {
            ops.push({account:merchantid, ...merchantIncoming[merchantid], time:end})
        }
        db.statements.insertMany(ops, noOrder);
        var upds=[];
        var now=new Date();
        for (const checked_item of checked) {
            var op_id=new ObjectId();
            upds.push({insertOne:{account:checked_item.account, subject:'receivable', amount:-checked_item.received, time:now, ref_id:checked_item._id, op_id}});
            upds.push({insertOne:{account:checked_item.account, subject:'balance', amount:checked_item.received, time:now, ref_id:checked_item._id, op_id}});

            upds.push({updateMany:{filter:{account:checked_item.account, recon_id:null}, update:{$set:{recon_id:checked_item._id}}}})
        }
        db.outstandingAccounts.bulkWrite(upds, noOrder);

    }
}

setInterval(reconciliation, 30*60*1000);
