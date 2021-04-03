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

async function handle_profit() {
	var {db}=getDB();
	db_event.when('accounts', 'insert', async (rec)=>{
		console.log(rec);
		var {account, profit}=rec.fullDocument;
		if (profit) {
			var merchant=await db.users.findOne({_id:account});
			if (!merchant) return;
			if (!merchant.parent) return;
			var agent=await db.users.findOne({_id:merchant.parent});
			var commission=num2dec(Number((profit*agent.share).toFixed(2)))
			// db.users.updateOne({_id:agent._id}, {$inc:{commission}});
			db.accounts.insertOne({account:agent._id, balance:num2dec(commission), commission:num2dec(-commission)});
		}
	})
}

handle_profit();

async function handleReconciliation(reconContent, providerName) {
	var accountsUpds=[], outstandingAccountsUpds=[], reconcileUpds=[];
	var {received, commission, confirmedOrders, recon_tag, recon_time=new Date()}=reconContent;
	var recon_id=providerName+recon_tag;
	received=Number(received)||0;
	commission=Number(commission)||0;

	// recociliation logs
	reconcileUpds.push({updateOne:{
		filter:{_id:recon_id}, 
		update:{$set:{account:providerName, received, commission, recon_tag, time:recon_time}}, 
		upsert:true
	}});
	if (received!=0 || commission!=0) {
		// outstandAccount balance
		var b=received-commission;
		outstandingAccountsUpds.push({updateOne:{
			filter:{account:providerName, ref_id:recon_id}, 
			update:{$set:{receivable:num2dec(-received), balance:num2dec(b), commission:num2dec(commission), time:recon_time}}
		}});

		var accChg={};
		for (const order of confirmedOrders) {
			var {orderId, money=0, fee=0} =order;
			money=Number(money);
			fee=Number(fee);
			if (!money) continue;
			// check all confirmedOrder exists
			var {value:bill} =await db.bills.findOneAndUpdate({_id:ObjectId(orderId)}, {$set:{recon_id}}, {projection:{_id:1, merchantid:1, time:1, share:1, mdr:1, fix_fee:1}});
			if (!bill) continue; //should yield a notification to the admin a missing bill must be added by manual
			if (bill.recon_id) continue;
			var {merchantid, _id:ref_id, time, share, mdr, fix_fee=0}=bill;	 
			if (time.getDate()!=recon_time.getDate()) time=recon_time;
			// ensure all confirmed order exists in outstandingAccount & accounts
			var rec_id=new ObjectId();
			outstandingAccountsUpds.push({updateOne:{
				filter:{account:providerName, ref_id},
				update:{$set:{receivable:num2dec(money), recharge:num2dec(-money), time, op_id:rec_id}},
				upsert:true
			}});
			accountsUpds.push({updateOne:{
				filter:{account:merchantid, ref_id},
				update:{$set:{receivable:num2dec(money), recharge:num2dec(-money), time, op_id:rec_id}},
				upsert:true
			}});

			if (!accChg[merchantid]) accChg[merchantid]={received:0, commission:0, profit:0, fee:0};
			var chg=accChg[merchantid];
			// sum all commissions & profits on 
			if (!mdr) mdr=1-share;
			var sys_commission=Number((money*mdr).toFixed(2))+fix_fee;
			chg.received+=money;
			chg.commission+=sys_commission;
			chg.profit+=(sys_commission-fee);
			chg.fee+=fee;
		}
		for (var merchantid in accChg) {
			var {received, commission, profit, fee}=accChg[merchantid];
			accountsUpds.push({updateOne:{
				filter:{account:merchantid, recon_id},
				update:{$set:decimalfy({receivable:-received, balance:received, profit, fee, time:recon_time})},
				upsert:true
			}})
		}
	}
	if (accountsUpds.length) db.accounts.bulkWrite(accountsUpds, noOrder);
	if (outstandingAccountsUpds.length) db.outstandingAccounts.bulkWrite(outstandingAccountsUpds, noOrder);
	if (reconcileUpds.length) db.reconciliation.bulkWrite(reconcileUpds, noOrder);

	return reconcileUpds.length;
}

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
		, updsNum=0;
	for (const providerName in allProviders) {
		var prd=allProviders[providerName];
		if (!prd.getReconciliation) return 'reconciliation is not supported by '+providerName;
		try {
			var reconContent=await prd.getReconciliation(from,end, forceRecon);
		} catch(e) {
			continue;
		}
		updsNum+=await handleReconciliation(reconContent, providerName);
	}
	return updsNum;
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
exports.handleReconciliation=handleReconciliation;