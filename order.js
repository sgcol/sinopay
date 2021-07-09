const getDB=require('./db.js'), pify=require('pify'), getMerchant=require('./merchants.js').getMerchant,ObjectID = require('mongodb').ObjectID, Decimal128=require('mongodb').Decimal128
	,fetch=require('node-fetch')
	, sortObj=require('sort-object'), qs=require('querystring').stringify, url=require('url'), sysnotifier=require('./sysnotifier.js')
	, md5=require('md5'), sysevents=require('./sysevents.js'), {decimalfy, dedecimal}=require('./etc');

const argv=require('yargs').argv
	, debugout=require('debugout')(argv.debugout);

function getr(t1, isEnd) {
	var h=(t1.getUTCHours()-16)%24;
	if (h<0) h+=24;
	if (h==0 && isEnd) h=24;
	return h*3600+t1.getUTCMinutes()*60+t1.getUTCSeconds()
}
async function createOrder(merchant, userid, merchantOrderId, money, preferredPay, cb_url, return_url, callback) {
	if (typeof preferredPay=='function') {
		callback=preferredPay;
		preferredPay=null;
	}
	callback=callback||((e, res)=>{
		if (e) throw e;
		return res;
	})
	var {db}=await getDB();
	var r=await db.bills.findOne({merchantid:merchant._id, merchantOrderId:merchantOrderId});
	if (r) return callback('orderid重复');
	// var mer=await getMerchant(merchantid)
	var mer=merchant;
	if (mer.limitation!=null && ((mer.daily||0)+money)>(mer.limitation)) return callback('超出每日收款上限');
	var start=new Date(mer.validfrom||Date.UTC(1970, 11,31, 16, 0, 0))
	, end=new Date(mer.validend||Date.UTC(1971, 0, 1, 16, 0, 0));
	var nowtime=new Date();
	var s=getr(start), e=getr(end, true), n=getr(nowtime);
	if (s<=e) {
		if (n<s || n>e) return callback('本时段不开放充值');
	}
	else {
		if (n<s && n>e ) return callback('本时段不开放充值');
	}
	// if ((getr(nowtime)>2*3600) && (getr(nowtime)<10*3600)) throw '本时段不开放充值';
	if (mer.limitationPerOrder!=null && money>mer.limitationPerOrder) return callback("单笔订单不能超出"+mer.limitationPerOrder)
	r=await db.bills.insertOne({snapshot:{merchant:merchant, order:{merchantOrderId, money, preferredPay, cb_url, return_url}}, ...decimalfy({merchantOrderId:merchantOrderId, testMode:mer.debugMode, delay:mer.delay, shareholders:mer.shareholders, userid:mer._id, merchantid:merchantid, mer_userid:userid, provider:'', providerOrderId:'', share:mer.share, money:money, paidmoney:-1, time:new Date(), lasttime:new Date(), lasterr:'', preferredPay:preferredPay, cb_url:cb_url, return_url:return_url, status:'created'})}, {w:1});
	sysevents.emit('orderCreated', r.ops[0]);
	return callback(null, r.insertedId.toHexString());            
}
function createSellOrder(merchantid, money, provider, coin, callback) {
	getDB((err, db)=>{
		if (err) return callback(err);
		db.bills.insertOne({type:'sell', merchantid:merchantid, provider:provider||'unknown', providerOrderId:'', coin:coin, money:money, time:new Date(), lasttime:new Date(), lasterr:'', status:'created'}, {w:1})
		.then((r)=>{
			callback(null, r.insertedId.toHexString());            
		}).catch((e)=>{
			callback(e);
		})
	})    
}
function getOrderDetail(orderid, callback) {
	getDB((err, db) =>{
		if (err) return callback(err);
		try {
			db.bills.findOne({_id:ObjectID(orderid)}, (err, r)=>{
				if (err) return callback(err);
				if (!r) return callback('no such order');
				callback(null, r.merchantid, r.money, r.mer_userid, r.cb_url, r.return_url);
			})
		}catch(e){callback(e)}
	});
}
// function cancelOrder(orderid, callback) {
// 	getDB((err, db)=>{
// 		if (err) return callback(err);
// 		try {
// 			db.bills.find({_id:ObjectID(orderid), status:{$ne:'canceled'}}).toArray((err, r)=>{
// 				if (err) return callback(err);
// 				if (r.length==0) return callback('no such order');
// 				db.bills.updateOne({_id:ObjectID(orderid)}, {$set:{status:'canceled'}});
// 				// if (r[0].type=='sell') notifySellSystem(r[0]);
// 				callback();
// 			})
// 		}catch(e) {callback(e)}
// 	});
// }

async function cancelOrder(orderid, extra) {
	var {db}=await getDB(), _id=ObjectID(orderid);

	var {value:r}=await db.bills.findOneAndUpdate({_id, paymentMethod:'disbursement', used:{$ne:true}}, {$set:{...extra, used:true, notify_status:'通知商户', status:'CANCELED', lasttime:new Date()}})
	if (!r) {
		var bill=await db.bills.findOne({_id});
		if (!bill) throw 'no such orderid';
		if (bill.paymentMethod!='disbursement') throw 'only the disburse order can be canceled'.
		throw ('used order');
	}
	bill.paidmoney=recieved;
	sysevents.emit('orderConfirmed', bill);
	notifyMerchant(bill);
}
async function confirmOrder(orderid, recieved, extra) {
	var testMode=false;
	var {db}=await getDB(), _id=ObjectID(orderid);
	var bill=await db.bills.findOne({_id});
	if (!bill) throw 'no such orderid';

	var {value:r}=await db.bills.findOneAndUpdate({_id, used:{$ne:true}}, {$set:{used:true, notify_status:'通知商户', status:'PAID', paidmoney:recieved, lasttime:new Date(), ...extra}})
	if (!r) throw ('used order');
	bill.paidmoney=recieved;
	bill.status='PAID';
	sysevents.emit('orderConfirmed', bill);
	notifyMerchant(bill);
}
function merSign(merchantData, o) {
	if (o.sign) delete o.sign;
	o.sign=md5(merchantData.key+qs(sortObj(o,{sort:(a, b)=>{return a>b?1:-1}})));
	return o;
}
function normalizeError(e) {
	if (typeof e=='string') return e;
	if (e instanceof Error) return e.message;
	return e;
}
async function notifyMerchant(orderdata) {
	var {db}=await getDB(), mer =await getMerchant(orderdata.partnerId||orderdata.merchantid), body;
	try {
		var custom_params=url.parse(orderdata.cb_url, true).query;
		var params=merSign(mer, Object.assign(custom_params, dedecimal(
			{outOrderId:orderdata.merchantOrderId
			, money:orderdata.paidmoney
			, currency:orderdata.currency
			, orderId:orderdata._id.toHexString()
			, providerOrderId:orderdata.providerOrderId
			, status:orderdata.status
		})))
		debugout('notifyMerchant', params);
		const response=await fetch(orderdata.cb_url, {
			method:'post',
			body:JSON.stringify(params),
			headers: {'Content-Type': 'application/json'}
		});
		if (!response.ok) throw response.statusText;
		body=await response.text();
		try {
			var ret=JSON.parse(body);
		} catch(e) {}
		if (ret && ret.err) throw ret.err;
		retryNotifyList.delete(orderdata._id);
		db.bills.updateOne({_id:orderdata._id}, {$set:{status:'COMPLETED', lasttime:new Date(), merchant_return:body}, $unset:{notify_status:1}});
	} catch (err) {
		var rn=retryNotifyList.get(orderdata._id);
		if (!rn) {
			rn=orderdata;
			rn.retrytimes=1;
			retryNotifyList.set(orderdata._id, rn);
			db.bills.updateOne({_id:orderdata._id}, {$set:{lasttime:new Date(), notify_status:'通知商户', lasterr:normalizeError(err), merchant_return:body}});
		}
		else {
			rn.retrytimes++;
			db.bills.updateOne({_id:orderdata._id}, {$set:{lasttime:new Date(), notify_status:'通知失败', lasterr:normalizeError(err), merchant_return:body}});
			if (rn.retrytimes>5) {
				retryNotifyList.delete(orderdata._id);
			}
		}
	}
}
var retryNotifyList=new Map();
(function() {
	getDB((err, db)=>{
		db.bills.find({notify_status:'通知商户'}).toArray((err, r)=>{
			if (err) return;
			for (var i=0; i<r.length; i++) {
				retryNotifyList.set(r[i]._id, r[i]);
			}
		});
	})
	setInterval(()=>{
		retryNotifyList.forEach(notifyMerchant);
	}, 60*1000);
})();

function updateOrder(orderid, upd, callback) {
	if (!callback) callback=function() {};
	if (typeof upd!='object') return callback('param error');
	if (typeof orderid!='string') 
		return callback('orderid error '+orderid);
	getDB((err, db)=>{
		db.bills.updateOne({_id:ObjectID(orderid)}, {$set:upd}, function(err, r) {
			callback(err, r);
		});
	});
}

function balancelog(user, delta, desc) {
	(function check(cb) {
		if (typeof user=='object') return cb(null, user);
		// get from db
		getDB((err, db)=>{
			db.users.findOne({_id:user}, (err, r)=>{
				if (err) return cb(err);
				if (!r) return cb('no such user');
				cb(err, r);
			})    
		})
	})((err, userdata) =>{
		db.balance.insertOne({user:userdata._id, before:userdata.total||0, delta:delta, desc:desc});
	});
}
function updateWithLog(user, delta, desc, orderid, provider) {
	(function check(cb) {
		if (typeof user=='object') return cb(null, user);
		// get from db
		cb(null, {_id:user});
	})((err, userdata) =>{
		getDB((err, db)=>{
			db.balance.insertOne({user:userdata, delta:delta, desc:desc, orderid:orderid, t:new Date()});
			var inc={};
			inc[`in.${provider}`]=Decimal128.fromString(''+delta);
			inc.daily=Decimal128.fromString(''+delta);
			db.users.update({_id:userdata._id}, {$inc:inc}, {upsert:true});
			// if (!userdata.total) {
			//     userdata.total={};
			//     userdata.total[provider]=delta;
			// }else {
			//     if (!userdata.total[provider]) userdata.total[provider]=delta;
			//     else userdata.total[provider]+=delta;
			// }    
		})
	});    
}
var today=new Date();
setInterval(()=>{
	var now=new Date();
	if (now.getDate()!=today.getDate()) {
		today=now;
		getDB((err, db)=>{
			!err && db.users.updateMany({}, {$set:{daily:0}});
		})
	}
}, 30*60*1000);

module.exports={
	updateOrder:updateOrder,
	createOrder:createOrder,
	getOrderDetail:getOrderDetail,
	confirmOrder:confirmOrder,
	notifyMerchant:notifyMerchant,
	createSellOrder:createSellOrder,
	merSign:merSign
}