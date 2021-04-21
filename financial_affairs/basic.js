const db_event=require('../dbwatcher')
	, getDB=require('../db')
	, {num2dec, decimalfy, dedecimal}=require('../etc')
	, ObjectId=require('mongodb').ObjectId
	, providerManager =require('../providers')
	, {set:_set, get:_get} =require('object-path')
	, argv =require('yargs').argv
	, debugout=require('debugout')(argv.debugout)

const noOrder={ordered:false};

function guessId(id) {
    try {
        return ObjectId(id);
    } catch(e) {
        return id;
    }
}

(async function order_received() {
	var {db}=await getDB();
	db_event.when('bills', 'update', async (rec)=>{
		if (rec.updateDescription && rec.updateDescription.updatedFields && rec.updateDescription.updatedFields.used===true) {
			console.log(rec.updateDescription.updatedFields);
			var {used, merchantid, money, provider, paidmoney, _id, time, rec_id, paymentMethod, status}=rec.fullDocument;
			paidmoney=paidmoney||money;
			switch (paymentMethod) {
				case 'recharge':
				case null:
					// only recharge order
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
				break;
				case 'disbursement':
					if (status!='COMPLETED') {
						// refund, commission will be deduct anyway?
						db.accounts.insertOne({account:merchantid, time:now, refund:true, ref_id:_id, op_id:rec_id, balance:num2dec(money), payable:num2dec(-money)});
					}
				break;
			}
			return true;
		}
	})
	// db_event.when('withdrawal', 'insert', async (rec)=>{
	// 	var {money, merchantid, provider, money, _id, time, rec_id}=rec.fullDocument;

	// 	if (rec_id==null) {
	// 		var session=db.mongoClient.startSession();
	// 		try {
	// 			await session.withTransaction(async ()=>{
	// 				var now=time, rec_id=new ObjectId();
	// 				var op1={account:provider, balance:num2dec(-money), payable:num2dec(money), time:now, ref_id:_id, op_id:rec_id}
	// 					, op3={account:merchantid, balance:num2dec(-money), payable:num2dec(money), time:now, ref_id:_id, op_id:rec_id}
	// 				op2.account=provider;
	// 				var chg_receivable={};
	// 				await db.outstandingAccounts.insertOne(op1, {session});
	// 				await db.accounts.insertOne(op3,{session});
	// 				await db.withdrawal.updateOne({_id:_id}, {$set:{rec_id}}, {session});
	// 			}, {
	// 				readPreference: 'primary',
	// 				readConcern: { level: 'local' },
	// 				writeConcern: { w: 'majority' }
	// 			});
	// 		} finally {
	// 			await session.endSession();
	// 		}
	// 		return true;
	// 	}
	// })
})()

async function handle_profit() {
	var {db}=await getDB();
	db_event.when('accounts', 'update', async (rec)=>{
		if (rec.updateDescription && rec.updateDescription.updatedFields && rec.updateDescription.updatedFields.fee) {
			console.log(rec);
			var {account, balance, commission, fee, transactionNum=1, paymentMethod, provider}=dedecimal(rec.fullDocument);
			var merchant=await db.users.findOne({_id:account});
			if (!merchant) return;
			if (!merchant.parent) return;
			var agent=await db.users.findOne({_id:merchant.parent});
			var baseprice=_get(agent, ['baseprice', paymentMethod], null)
			var profit;
			if (baseprice) {
				profit=((-balance)*baseprice.mdr+transactionNum*baseprice.fix_fee)-fee;
			} else {
				profit=commission-fee;
			}
			if (profit>0) {
				var commission=num2dec(Number((profit*agent.share).toFixed(2)))
				// db.users.updateOne({_id:agent._id}, {$inc:{commission}});
				db.accounts.insertOne({account:agent._id, balance:num2dec(commission), commission:num2dec(-commission), provider});
			}	
		}
	})
}

handle_profit();

async function handleReconciliation(reconContent, providerName) {
	var {db}=await getDB();
	var accountsUpds=[], outstandingAccountsUpds=[], reconcileUpds=[];
	var {confirmedOrders, recon_tag, recon_time=new Date()}=reconContent;
	var recon_id=providerName+recon_tag;
	var received=0, providerCommission=0;
	var err=[];
	var now=new Date();

	const getUser=(()=>{
		var users={};
		return async(id)=>{
			if (users[id]) return users[id];
			var u=users[id]=dedecimal(await db.users.findOne({_id:id}));
			return u;
		}
	})();

	var accChg={};
	for (const order of confirmedOrders) {
		var {orderId, money=0, fee=0, paymentMethod='default', time} =order;
		money=Number(money);
		fee=Number(fee);
		var {value:bill}=await db.bills.findOneAndUpdate({_id:guessId(orderId)}, {$set:{recon_id, paidmoney:money, used:true}});
		if (!bill) {
			err.push({err:'orderId not exists', ...order})
			continue;
		}
		if (bill.recon_id) continue;
		switch(paymentMethod) {
			case 'disbursement':
				var {_id:ref_id, userid:merchantid, share, payment}=bill;
				var nfee=num2dec(fee);
				// disbursement bill have exists, that has verified early
				accountsUpds.push({updateOne:{
					filter:{account:merchantid, ref_id, deduction:true},
					update:{$set:{payable:num2dec(-money), time:recon_time}},
					upsert:true
				}});
				var paymentParams=payment.disbursement;
				if (!paymentParams) {
					var u=await getUser(merchantid);
					paymentParams=_get(u, ['paymentMethod', 'disbursement'], {})
				}
				var {mdr=0, fix_fee=0}=paymentParams;
				var commission=Number((money*mdr+fix_fee).toFixed(2));
				accountsUpds.push({updateOne:{
					filter:{account:merchantid, ref_id, deduction:{$ne:true}, refund:{$ne:true}},
					update:{$set:{fee:nfee, time},
							$setOnInsert:{balance:num2dec(-money-commission), payable:num2dec(money), commission:num2dec(commission), provider:providerName, transactionNum:1}
					},
					upsert:true
				}})
				outstandingAccountsUpds.push({updateOne:{
					filter:{account:providerName, ref_id, deduction:{$ne:true}},
					update:{$setOnInsert:{balance:num2dec(-money), payable:num2dec(money), time}},
					upsert:true
				}})
				outstandingAccountsUpds.push({updateOne:{
					filter:{account:providerName, ref_id, deduction:true},
					update:{$set:{balance:num2dec(-fee), payable:num2dec(-money), commission:nfee, time:recon_time}},
					upsert:true
				}})
			break;
			case 'topup':
				money=Number(money);
				fee=Number(fee);
				if (!money) continue;
				var {userid:account, _id:ref_id}=bill;
				if (account=='system') {
					accountsUpds.push({updateOne:{
						filter:{account, ref_id},
						update:{$set:{commission:num2dec(money), provider:providerName, time, topup:num2dec(-money)}},
						upsert:true
					}})
				} else {
					accountsUpds.push({updateOne:{
						filter:{account, ref_id},
						update:{$set:{balance:num2dec(money), provider:providerName, time, topup:num2dec(-money)}},
						upsert:true
					}})
				}
				outstandingAccountsUpds.push({updateOne:{
					filter:{account:providerName, ref_id},
					update:{$set:{balance:num2dec(money), time, topup:num2dec(-money)}},
					upsert:true
				}})
			break;
			case 'withdrawal':
				money=Number(money);
				fee=Number(fee);
				if (!money) continue;
				var {userid:account, _id:ref_id}=bill;
				if (account=='system') {
					accountsUpds.push({updateOne:{
						filter:{account, ref_id},
						update:{$set:{commission:num2dec(-money), provider:providerName, time, withdrawal:num2dec(money)}},
						upsert:true
					}})
				} else {
					accountsUpds.push({updateOne:{
						filter:{account, ref_id},
						update:{$set:{balance:num2dec(-money), provider:providerName, time, withdrawal:num2dec(money)}},
						upsert:true
					}})
				}
				outstandingAccountsUpds.push({updateOne:{
					filter:{account:providerName, ref_id},
					update:{$set:{balance:num2dec(-money), time, withdrawal:num2dec(money)}},
					upsert:true
				}})
			break;
			default:
				money=Number(money);
				fee=Number(fee);
				if (!money) continue;
				// check all confirmedOrder exists
				var {_id:ref_id, userid:merchantid, time:billTime, share, payment={}}=bill;
				if (!billTime) billTime=time;	 
				if (!(billTime instanceof Date)) billTime=new Date(billTime);

				// ensure all confirmed order exists in outstandingAccount & accounts
				var rec_id=new ObjectId();
				outstandingAccountsUpds.push({updateOne:{
					filter:{account:providerName, ref_id},
					update:{$set:{receivable:num2dec(money), recharge:num2dec(-money), time:billTime, op_id:rec_id}},
					upsert:true
				}});
				accountsUpds.push({updateOne:{
					filter:{account:merchantid, ref_id},
					update:{$set:{receivable:num2dec(money), recharge:num2dec(-money), provider:providerName, time:billTime, op_id:rec_id}},
					upsert:true
				}});

				if (!accChg[merchantid]) accChg[merchantid]={};
				if (!accChg[merchantid][paymentMethod]) accChg[merchantid][paymentMethod]={received:0, commission:0, profit:0, fee:0, transactionNum:0};
				var chg=accChg[merchantid][paymentMethod];
				// sum all commissions & profits on 
				var paymentParams=payment[paymentMethod];
				if (!paymentParams) {
					var u=await getUser(merchantid);
					paymentParams=u.paymentMethod[paymentMethod];
					if (paymentParams==null) paymentParams={mdr:u.mdr, fix_fee:u.fix_fee};
				}
				var {mdr, fix_fee}=paymentParams||{};
				if (!mdr) mdr=1-share;
				if (!fix_fee) fix_fee=0;
				var sys_commission=Number((money*mdr).toFixed(2))+fix_fee;
				if (money<sys_commission) {
					sys_commission=fee;
				}
				chg.received+=money;
				chg.commission+=sys_commission;
				chg.profit+=(sys_commission-fee);
				chg.fee+=fee;
				chg.transactionNum++;

				received+=money;
				providerCommission+=fee;
			break;
		}
	}
	for (var merchantid in accChg) {
		var plist=accChg[merchantid];
		for (var payment in plist) {
			var {received, commission, profit, fee, transactionNum}=plist[payment];
			accountsUpds.push({updateOne:{
				filter:{account:merchantid, paymentMethod:payment, recon_id},
				update:{$set:decimalfy({receivable:-received, balance:received-commission, commission, fee, transactionNum, provider:providerName, time:recon_time})},
				upsert:true
			}})
		}
	}
	if (err.length!=0) throw err;
	// recociliation logs
	if (received!=0 || providerCommission!=0) {
		reconcileUpds.push({updateOne:{
			filter:{_id:recon_id}, 
			update:{$set:{account:providerName, received, providerCommission, recon_tag, time:recon_time}}, 
			upsert:true
		}});
		var b=received-providerCommission;
		outstandingAccountsUpds.push({updateOne:{
			filter:{account:providerName, recon_id}, 
			update:{$set:{receivable:num2dec(-received), balance:num2dec(b), commission:num2dec(providerCommission), time:recon_time}},
			upsert:true
		}});
	}
	if (accountsUpds.length) db.accounts.bulkWrite(accountsUpds, noOrder);
	if (outstandingAccountsUpds.length) db.outstandingAccounts.bulkWrite(outstandingAccountsUpds, noOrder);
	if (reconcileUpds.length) db.reconciliation.bulkWrite(reconcileUpds, noOrder);

	return reconcileUpds.length;
}

async function reconciliation(date, providerName) {
	// var {db}=await getDB();
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