const db_event=require('../dbwatcher')
	, getDB=require('../db')
	, {num2dec, dec2num, decimalfy, dedecimal}=require('../etc')
	, ObjectId=require('mongodb').ObjectId
	, providerManager =require('../providers')
	, {set:_set, get:_get} =require('object-path')
	, argv =require('yargs').argv
	, debugout=require('debugout')(argv.debugout)

const noOrder={ordered:false};

const doTransaction=async (asyncf, mongoClient) => {
	var session=mongoClient.startSession({retryWrites:true});
	try {
		await session.withTransaction(async ()=>{
			await asyncf(session);
		}, {
			readPreference: 'primary',
			readConcern: { level: 'majority' },
			writeConcern: { w: 'majority' }
		});
	} finally {
		session.endSession();
	}
}
function guessId(id) {
	try {
		return ObjectId(id);
	} catch(e) {
		return id;
	}
}
const eleIn0=(name, arr, defaultValue)=>{
	if (!Array.isArray(arr) || arr.length==0) return defaultValue;
	return arr[0][name]||defaultValue;
}

const lastBalance=async(collection, account) =>{
	return dec2num(eleIn0('balance', await collection.find({account, balance:{$ne:null}}).sort({_id:-1}).limit(1).toArray(), 0));
}

const lastReceivable=async(collection, account) =>{
	return dec2num(eleIn0('receivable', await collection.find({account, receivable:{$ne:null}}).sort({_id:-1}).limit(1).toArray(), 0));
}

const lastPayable=async(collection, account) =>{
	return dec2num(eleIn0('payable', await collection.find({account, payable:{$ne:null}}).sort({_id:-1}).limit(1).toArray(), 0));
}

const lastCommission=async(collection, account) =>{
	return dec2num(eleIn0('commission', await collection.find({account, commission:{$ne:null}}).sort({_id:-1}).limit(1).toArray(), 0));
}

async function order_received2() {
	var {db}=await getDB();
	db_event.when('bills', 'insert', async (rec)=>{
		console.log('disburs', rec);
		var {used, userid:merchantid, money, provider, _id, time, rec_id=new ObjectId(), payment, paymentMethod, status, commission=0}=rec.fullDocument;
		if (paymentMethod!=='disbursement') return; 
		var now=time;
		money=dec2num(money);
		await doTransaction(async (session)=>{
			// locks
			await db.locks.updateMany({_id:{$in:['accounts', 'outstandingAccounts']}}, {$set:{pseudoRandom: ObjectId()}}, {upsert:true, session});
			var [accB, accP, accC, oaB, oaP, accRecs=[], oaRecs=[]]=await Promise.all([
				lastBalance(db.accounts, merchantid),
				lastPayable(db.accounts, merchantid),
				lastCommission(db.accounts, merchantid),
				lastBalance(db.outstandingAccounts, provider),
				lastPayable(db.outstandingAccounts, provider),
				db.accounts.find({ref_id:_id}, {session}).toArray(),
				db.outstandingAccounts.find({ref_id:_id}, {session}).toArray()
			]);
			var record={ref_id:_id, rec_id, account:merchantid, op_id:rec_id, time:now, amount:money};
			var ops=[];
			var accUpds=[];
			if (accRecs.findIndex(v=>v.type=='disbursement_create')<0) {
				accP+=(money-commission);
				accB-=money;
				accC+=commission;
				accUpds.push({insertOne:{document:{...record, type:'disbursment_create', balance:accB, commission:accC, payable:accP}}});
			}
			if (status=='FAILED') {
				if (accRecs.findIndex(v=>v.type=='disbursement_refund')<0) {
					accP-=money-commission;
					accB+=money;
					accC-=commission;
					accUpds.push({insertOne:{document:{...record, balance:accB, commission:accC, payable:accP}}});
				}
			} else {
				if (accRecs.findIndex(v=>v.type=='disbursement_complete')<0) {
					accP-=money-commission;
					accUpds.push({insertOne:{document:{ref_id:_id, account:merchantid, type:'disbursement_complete', payable:accP, time:now, op_id:rec_id, amount:money}}});
				}
			}
			ops.push(db.accounts.bulkWrite(accUpds, {session, ...noOrder}));
			if (accUpds.length>0) ops.push(db.bills.updateOne({_id}, {$set:{rec_id}}, {session}));

			record.account=provider;
			record.amount=(money-commission);
			var oaUpds=[];
			if (oaRecs.findIndex(v=>v.type=='disbursement_create')<0) {
				oaB-=record.amount;
				oaP+=record.amount;
				oaUpds.push({insertOne:{document:{...record, account:provider, balance:oaB, payable:oaP, type:'disbursment_create'}}});
			}
			if (status=='FAILED') {
				if (oaRecs.findIndex(v=>v.type=='disbursement_refund')<0) {
					oaB+=record.amount;
					oaP-=record.amount;
					oaUpds.push({insertOne:{document:{...record, account:provider, balance:oaB, payable:oaP, type:'disbursement_refund'}}});
				}
			}
			// when order success, we should deal it at reconcinalition
			ops.push(db.outstandingAccounts.bulkWrite(oaUpds, {session, ...noOrder}));

			await Promise.all(ops);
		}, db.mongoClient);
	});
	db_event.when('bills', {$in:['update', 'insert']}, async (rec)=>{
		console.log('bill upd', rec);
		var {used, userid:merchantid, money, provider, rec_id=new ObjectId(), paidmoney, _id, time, payment, paymentMethod, status, commission=0}=rec.fullDocument;
		if (!used) return;
		if (paymentMethod==='disbursement') return;
		var now=time;
		paidmoney=dec2num(paidmoney)||dec2num(money);
		await doTransaction(async (session)=>{
			// lock
			await db.locks.updateMany({_id:{$in:['accounts', 'outstandingAccounts']}}, {$set:{pseudoRandom: ObjectId()}}, {upsert:true, session});
			var accIns={ref_id:_id, rec_id, time:now, account:merchantid, amount:paidmoney, type:paymentMethod}
				, oaIns={ref_id:_id, rec_id, time:now, account:provider, amount:paidmoney, type:paymentMethod};
			var [accB, oaB, accR, oaR, accRecs=[], oaRecs=[]]=await Promise.all([
				lastBalance(db.accounts, merchantid),
				lastBalance(db.outstandingAccounts, provider),
				lastReceivable(db.accounts, merchantid),
				lastReceivable(db.outstandingAccounts, provider),
				db.accounts.find({ref_id:_id}, {session}).toArray(),
				db.outstandingAccounts.find({ref_id:_id}, {session}).toArray()
			]);
			switch (paymentMethod) {
			case 'withdrawal':
				accIns.balance=accB-paidmoney;
				oaIns.balance=oaB-paidmoney;
			break;
			case 'topup':
				accIns.balance=accB+paidmoney;
				oaIns.balance=oaB+paidmoney;
			break;
			default:
				accIns.receivable=accR+paidmoney;
				oaIns.receivable=oaR+paidmoney;
			break;
			}
			var ops=[];
			if (accRecs.length==0) {
				ops.push(db.accounts.insertOne(accIns, {session}));
				ops.push( db.bills.updateOne({_id}, {$set:{rec_id}}, {session}));
			}
			if (oaRecs.length==0) {
				ops.push(db.outstandingAccounts.insertOne(oaIns, {session}))
			}
			await Promise.all(ops);
		}, db.mongoClient);
		return true;
	})
}

order_received2();

async function handleReconciliation(reconContent, providerName) {
	var {db}=await getDB();
	var accountsUpds=[], outstandingAccountsUpds=[], billsUpds=[];
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

	await doTransaction(async(session)=>{
		await db.locks.updateMany({_id:{$in:['accounts', 'outstandingAccounts']}}, {$set:{pseudoRandom: ObjectId()}}, {upsert:true, session});
		var [accB, accR, accC, accP, oaB, oaR, oaC, oaP] =await Promise.all([
			exports.balance(),
			exports.receivable(),
			exports.commission(),
			exports.payable(),
			exports.outstandingBalance(),
			exports.outstandingReceivable(),
			exports.outstandingCommission(),
			exports.outstandingPayable(),
		])
		for (const order of confirmedOrders) {
			var {orderId, money=0, fee=0, paymentMethod='default', time} =order;
			money=Number(money);
			fee=Number(fee);
			var bill=await db.bills.findOne({_id:guessId(orderId)}, {session});
			if (!bill) {
				err.push({err:'orderId not exists', ...order})
				continue;
			}
			if (!bill.rec_id) {
				err.push({err:'order is in recording state, please try later'})
				continue;
			}

			switch (paymentMethod) {
			case 'disbursement':
				var oaRecs =await db.outstandingAccounts.find({ref_id:bill._id}, {session}).toArray();
				if (!oaRecs || oaRecs.findIndex(v=>v.type=='disbursement_complete')<0) {
					oaP.set(providerName, oaP.get(providerName)-money);
					oaB.set(providerName, oaB.get(providerName)-fee);
					oaC.set(providerName, oaC.get(providerName)+fee);
					outstandingAccountsUpds.push({updateOne:{
						filter:{account:providerName, ref_id:bill._id, type:'disbursement_complete'}, 
						update:{$set:{time:now, recon_id, payable:oaP.get(providerName), balance:oaB.get(providerName), commission:oaC.get(providerName), amount:fee}}, 
						upsert:true
					}});
					billsUpds.push({updateOne:{filter:{_id:bill._id}, update:{$set:{recon_id}}}});
				}
				providerCommission+=fee;
			break;
			case 'topup':
			case 'withdrawal':
			break;
			default:
				var {_id:ref_id, userid:merchantid, time:billTime, share, payment}=bill;
				var {mdr=1-share, fix_fee=0}=_get(payment, paymentMethod, await (async()=>{
					var u=await getUser(merchantid);
					return _get(u, ['paymentMethod', paymentMethod], {mdr:u.mdr, fix_fee:u.fix_fee});
				}));
				var commission=Number((money*mdr).toFixed(2))+fix_fee;
				if (money<commission) {
					commission=fee;
				}
				var accRecs=await db.accounts.find({ref_id}, {session}).toArray();
				if (!accRecs || accRecs.length===0) {
					err.push({err:'order is in recording state, please try later'})
					continue;
				}
				if (accRecs.findIndex(r=>r.type.substr(-10)==='_confirmed')<0) {
					accR.set(merchantid, (accR.get(merchantid)||0)-money);
					accC.set(merchantid, (accC.get(merchantid)||0)+commission);
					accB.set(merchantid, (accB.get(merchantid)||0)+money-commission);
					accountsUpds.push({updateOne:{
						filter:{account:merchantid, ref_id:bill._id, type:accRecs[0].type+'_confirmed'}, 
						update:{$set:{amount:money, time:now, recon_id,receivable:accR.get(merchantid), commission:accC.get(merchantid), balance:accB.get(merchantid)}},
						upsert:true
					}});
					billsUpds.push({updateOne:{filter:{_id:bill._id}, update:{$set:{recon_id}}}});
				}
				var oaRecs=await db.outstandingAccounts.find({ref_id}, {session}).toArray();
				if (!oaRecs || oaRecs.length===0) {
					err.push({err:'order is in recording state, please try later'})
					continue;
				}
				if (oaRecs.findIndex(r=>r.type.substr(-10)==='_confirmed')<0) {
					oaR.set(providerName, (oaR.get(providerName)||0)-money);
					oaC.set(providerName, (oaC.get(providerName)||0)+fee);
					oaB.set(providerName, (oaB.get(providerName)||0)+money-fee);
					outstandingAccountsUpds.push({updateOne:{
						filter:{account:providerName, ref_id:bill._id, type:oaRecs[0].type+'_confirmed'},
						update:{$set:{time:now, recon_id, amount:money, receivable:oaR.get(providerName), commission:oaC.get(providerName), balance:oaB.get(providerName)}},
						upsert:true
					}});
				}
				providerCommission+=fee;
				received+=money;
			break;
			}
		}

		if (err.length!=0) throw err;

		var ops=[];
		if (billsUpds.length>0) ops.push(db.bills.bulkWrite(billsUpds, {...noOrder, session}));
		if (accountsUpds.length>0) ops.push(db.accounts.bulkWrite(accountsUpds, {...noOrder, session}));
		if (outstandingAccountsUpds.length>0) ops.push(db.outstandingAccounts.bulkWrite(outstandingAccountsUpds, {...noOrder, session}));
		if (accountsUpds.length>0 || outstandingAccountsUpds.length>0) 	ops.push(db.reconciliation.updateOne({_id:recon_id}, {$set:{account:providerName, recon_id, received, providerCommission, time:now}}, {upsert:true, session}));
		await Promise.all(ops)
	}, db.mongoClient);

	return 1;
}


exports.balance=async (accounts)=>{
	var {db}=await getDB();
	if (accounts!=null) {
		if (!Array.isArray(accounts)) return new Map([[accounts, await lastBalance(db.accounts, accounts)]]);
		if (accounts.length===1) return new Map([[accounts[0], await lastBalance(db.accounts, accounts[0])]]);
	}
	var cond={balance:{$ne:null}};
	if (accounts!=null) {
		cond.account={$in:accounts}
	}
    var b=await db.accounts.aggregate([{$match:cond}, {$group:{_id:'$account', check:{$max:'$_id'}}}, {$lookup:{from:'accounts', localField:'check', foreignField:'_id', as:'data'}}]).toArray();
	return new Map(b.map(v=>[v.data[0].account, v.data[0].balance]));
}

exports.receivable=async (accounts)=>{
	var {db}=await getDB();
	if (accounts!=null) {
		if (!Array.isArray(accounts)) return new Map([[accounts, await lastReceivable(db.accounts, accounts)]]);
		if (accounts.length===1) return new Map([[accounts[0], await lastReceivable(db.accounts, accounts[0])]]);
	}
	var cond={receivable:{$ne:null}};
	if (accounts!=null) {
		cond.account={$in:accounts}
	}
    var b=await db.accounts.aggregate([{$match:cond}, {$group:{_id:'$account', check:{$max:'$_id'}}}, {$lookup:{from:'accounts', localField:'check', foreignField:'_id', as:'data'}}]).toArray();
	return new Map(b.map(v=>[v.data[0].account, v.data[0].receivable]));
}

exports.payable=async (accounts) =>{
	var {db}=await getDB();
	if (accounts!=null) {
		if (!Array.isArray(accounts)) return new Map([[accounts, await lastPayable(db.accounts, accounts)]]);
		if (accounts.length===1) return new Map([[accounts[0], await lastPayable(db.accounts, accounts[0])]]);
	}
	var cond={payable:{$ne:null}};
	if (accounts!=null) {
		cond.account={$in:accounts}
	}
    var b=await db.accounts.aggregate([{$match:cond}, {$group:{_id:'$account', check:{$max:'$_id'}}}, {$lookup:{from:'accounts', localField:'check', foreignField:'_id', as:'data'}}]).toArray();
	return new Map(b.map(v=>[v.data[0].account, v.data[0].payable]));
}

exports.commission=async (accounts) =>{
	var {db}=await getDB();
	if (accounts!=null) {
		if (!Array.isArray(accounts)) return new Map([[accounts, await lastCommission(db.accounts, accounts)]]);
		if (accounts.length===1) return new Map([[accounts[0], await lastCommission(db.accounts, accounts[0])]]);
	}
	var cond={commission:{$ne:null}};
	if (accounts!=null) {
		cond.account={$in:accounts}
	}
    var b=await db.accounts.aggregate([{$match:cond}, {$group:{_id:'$account', check:{$max:'$_id'}}}, {$lookup:{from:'accounts', localField:'check', foreignField:'_id', as:'data'}}]).toArray();
	return new Map(b.map(v=>[v.data[0].account, v.data[0].commission]));
}

exports.outstandingBalance=async (accounts)=>{
	var {db}=await getDB();
	if (accounts!=null) {
		if (!Array.isArray(accounts)) return new Map([[accounts, await lastBalance(db.outstandingAccounts, accounts)]]);
		if (accounts.length===1) return new Map([[accounts[0], await lastBalance(db.outstandingAccounts, accounts[0])]]);
	}
	var cond={balance:{$ne:null}};
	if (accounts!=null) {
		cond.account={$in:accounts}
	}
    var b=await db.outstandingAccounts.aggregate([{$match:cond}, {$group:{_id:'$account', check:{$max:'$_id'}}}, {$lookup:{from:'outstandingAccounts', localField:'check', foreignField:'_id', as:'data'}}]).toArray();
	return new Map(b.map(v=>[v.data[0].account, v.data[0].balance]));
}

exports.outstandingReceivable=async (accounts)=>{
	var {db}=await getDB();
	if (accounts!=null) {
		if (!Array.isArray(accounts)) return new Map([[accounts, await lastReceivable(db.outstandingAccounts, accounts)]]);
		if (accounts.length===1) return new Map([[accounts[0], await lastReceivable(db.outstandingAccounts, accounts[0])]]);
	}
	var cond={receivable:{$ne:null}};
	if (accounts!=null) {
		cond.account={$in:accounts}
	}
    var b=await db.outstandingAccounts.aggregate([{$match:cond}, {$group:{_id:'$account', check:{$max:'$_id'}}}, {$lookup:{from:'outstandingAccounts', localField:'check', foreignField:'_id', as:'data'}}]).toArray();
	return new Map(b.map(v=>[v.data[0].account, v.data[0].receivable]));
}

exports.outstandingPayable=async (accounts) =>{
	var {db}=await getDB();
	if (accounts!=null) {
		if (!Array.isArray(accounts)) return new Map([[accounts, await lastPayable(db.outstandingAccounts, accounts)]]);
		if (accounts.length===1) return new Map([[accounts[0], await lastPayable(db.outstandingAccounts, accounts[0])]]);
	}
	var cond={payable:{$ne:null}};
	if (accounts!=null) {
		cond.account={$in:accounts}
	}
    var b=await db.outstandingAccounts.aggregate([{$match:cond}, {$group:{_id:'$account', check:{$max:'$_id'}}}, {$lookup:{from:'outstandingAccounts', localField:'check', foreignField:'_id', as:'data'}}]).toArray();
	return new Map(b.map(v=>[v.data[0].account, v.data[0].payable]));
}

exports.outstandingCommission=async (accounts) =>{
	var {db}=await getDB();
	if (accounts!=null) {
		if (!Array.isArray(accounts)) return new Map([[accounts, await lastCommission(db.outstandingAccounts, accounts)]]);
		if (accounts.length===1) return new Map([[accounts[0], await lastCommission(db.outstandingAccounts, accounts[0])]]);
	}
	var cond={commission:{$ne:null}};
	if (accounts!=null) {
		cond.account={$in:accounts}
	}
    var b=await db.outstandingAccounts.aggregate([{$match:cond}, {$group:{_id:'$account', check:{$max:'$_id'}}}, {$lookup:{from:'outstandingAccounts', localField:'check', foreignField:'_id', as:'data'}}]).toArray();
	return new Map(b.map(v=>[v.data[0].account, v.data[0].commission]));
}

exports.handleReconciliation=handleReconciliation;
