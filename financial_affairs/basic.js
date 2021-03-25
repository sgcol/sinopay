const db_event=require('../dbwatcher')
	, getDB=require('../db')
	, {num2dec}=require('../etc')
	, ObjectId=require('mongodb').ObjectId
	, providerManager =require('../providers')
	, argv =require('yargs').argv
	, debugout=require('debugout')(argv.debugout)

const noOrder={ordered:false};

(async function order_received() {
	var {db}=await getDB();
	db_event.when('bills', 'update', async (rec)=>{
		if (rec.updateDescription && rec.updateDescription.updatedFields && rec.updateDescription.updatedFields.used===true) {
			console.log(rec.updateDescription.updatedFields);
			var {used, merchantid, money, provider, paidmoney, _id, time, rec_id}=rec.fullDocument;
			var session=db.mongoClient.startSession();
			try {
				await session.withTransaction(async ()=>{
					var now=time, rec_id=new ObjectId();
					var op2={account:provider, receivable:num2dec(paidmoney), recharge:num2dec(-paidmoney), time:now, ref_id:_id, op_id:rec_id};
					await db.outstandingAccounts.insertOne(op2,{session});
					await db.accounts.insertOne({...op2, account:merchantid}, {session});
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
	db_event.when('withdrawal', 'insert', async (rec)=>{
		var {money, merchantid, provider, money, _id, time, rec_id}=rec.fullDocument;

		if (rec_id==null) {
			var session=db.mongoClient.startSession();
			try {
				await session.withTransaction(async ()=>{
					var now=time, rec_id=new ObjectId();
					var op1={account:provider, balance:num2dec(-money), payable:num2dec(money), time:now, ref_id:_id, op_id:rec_id}
						, op3={account:merchantid, balance:num2dec(-money), payable:num2dec(money), time:now, ref_id:_id, op_id:rec_id}
					op2.account=provider;
					var chg_receivable={};
					await db.outstandingAccounts.insertOne(op1, {session});
					await db.accounts.insertOne(op3,{session});
					await db.withdrawal.updateOne({_id:_id}, {$set:{rec_id}}, {session});
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

async function reconciliation(date, providerName) {
	var {db}=await getDB();
	var forceRecon=false, from, end;
	if (date) {
		forceRecon=true;
		from=new Date(date);
		end=new Date(date);
	} else {
		from=new Date();
		end=new Date();
		from.setDate(from.getDate()-1);
		end.setDate(end.getDate()-1);
	}
	from.setHours(0, 0, 0, 0);
	end.setHours(23, 59, 59, 999);
	// var allProvidersNeedsCheck=await db.outstandingAccounts.aggregate({$match:{time:{$gte:from, $lte:end}, subject:'receivable'}}, {$group:{_id:'$account', receivable:{$sum:'$amount'}}}).toArray();
	var allProviders=providerName?
		(()=>{var ret={}; ret[providerName]=providerManager.getProvider(providerName); return ret})()
		:providerManager.getProvider()
		, checklist=[]
		, checked=[];//, merchantIncoming={};
	for (const providerName in allProviders) {
		checklist.push((async ()=>{
			// balance
			var prd=allProviders[providerName];
			if (!prd.getReconciliation) return 'reconciliation is not supported by '+providerName;
			try {
			var {received, commission, confirmedOrders, recon_tag, recon_time=end}=await prd.getReconciliation(from,end, forceRecon);
			} catch(e) {
				return;
			}
			var recon_id=providerName+recon_tag;
			received=Number(received)||0;
			commission=Number(commission)||0;
			checked.push({_id:recon_id, account:providerName, received, commission, recon_tag, time:recon_time});
			var upds=[];
			for (const order of confirmedOrders) {
				var {orderId, money} =order;
				money=Number(money)||0;
				if (!money) continue;
				var {value:bill} =await db.bills.findOneAndUpdate({_id:ObjectId(orderId)}, {$set:{recon_id}});
				if (!bill) continue;
				if (bill.recon_id) continue;
				var {merchantid, _id:ref_id, time, share}=bill;
				if (time.getDate()!=recon_time.getDate()) time=recon_time;
				var rec_id=new ObjectId();
				if (!await db.outstandingAccounts.findOne({account:providerName, ref_id})) {
					db.outstandingAccounts.insertOne(
						{account:providerName, receivable:num2dec(money), recharge:num2dec(-money), time, ref_id, op_id:rec_id}
					);
				}
				if (!await db.accounts.findOne({account:merchantid, ref_id})) {
					db.accounts.insertOne(
						{account:merchantid, receivable:num2dec(money), recharge:num2dec(-money), time, ref_id, op_id:rec_id}
					);
				}
				var ids={ref_id, recon_id, time};
				var commission=Number((money*(1-share)).toFixed(2));
				upds.push({updateOne:{
					filter:{account:merchantid, recon_id}, 
					update:{$set:{account:merchantid, recharge:num2dec(-money), balance:num2dec(money-commission), commission:num2dec(commission), ...ids}}, 
					upsert:true}
				});
				// merchantIncoming[merchantid]=merchantIncoming[merchantid]||{recharge:0, commission:0};
				// merchantIncoming[merchantid].recharge+=paidmoney;
				// merchantIncoming[merchantid].commission+=commission;
			}
			upds.length && db.accounts.bulkWrite(upds, noOrder);
		})());
	}
	if (checklist.length) {
		var ret=await Promise.all(checklist);
		if (checked.length==0) return 0;
		db.reconciliation.bulkWrite(checked.map(item=>({updateOne:{filter:{_id:item._id}, update:{$set:item}, upsert:true}})), noOrder);
		// var ops=[];
		// for (const merchantid in merchantIncoming) {
		//     ops.push({updateOne:{filter:{_id:recon_id}, update:{account:merchantid, ...merchantIncoming[merchantid], time:end}, upsert:true}})
		// }
		// db.statements.bulkWrite(ops, noOrder);
		var upds=[];
		for (const checked_item of checked) {
			var {_id:ref_id, received, commission, account, time}=checked_item;
			if (received==0 && commission==0) continue;
			var b=received-commission;
			upds.push({updateOne:{
				filter:{account:checked_item.account, ref_id}, 
				update:{$set:{account, receivable:num2dec(-received), balance:num2dec(b), commission:num2dec(commission), time, ref_id}}, 
				upsert:true}
			});
			// upds.push({updateMany:{filter:{account:checked_item.account, recon_id:null}, update:{$set:{recon_id:checked_item._id}}}})
		}
		db.outstandingAccounts.bulkWrite(upds, noOrder);

		return checked.length;
	}
	return 0;
}

setInterval(reconciliation, 30*60*1000);

const get=async (table, subject, account) =>{
	var {db}=getDB();
	var op=[];
	if (account) op.push({$match:{account}});
	op.push({$group:{_id:'1', sum:{$sum:`${subject}`}}});
	var [rec]=await db[table].aggregate(op).toArray();
	return rec.sum;
}

exports.getAccountBalance=get.bind(null, 'accounts', 'balance');
exports.getOutstandingBalance=get.bind(null, 'outstandingAccounts', 'balance');
exports.getOutstandingReceivable=get.bind(null, 'outstandingAccounts', 'receivable')
exports.reconciliation=reconciliation;