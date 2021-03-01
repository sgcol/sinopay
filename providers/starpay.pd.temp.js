const url = require('url')
, path = require('path')
, request = require('request')
, qs = require('querystring')
, sortObj=require('sort-object')
, merge = require('gy-merge')
, clone =require('clone')
, fs = require('fs')
, router=require('express').Router()
, httpf =require('httpf')
// , subdirs = require('subdirs')
// , del = require('delete')
, randomstring =require('random-string')
, async =require('async')
, md5 = require('md5')
, getDB=require('../db.js')
, Decimal128 =require('mongodb').Decimal128
, confirmOrder =require('../order.js').confirmOrder
, updateOrder =require('../order.js').updateOrder
, cancelOrder =require('../order.js').cancelOrder
, getOrderDetail=require('../order.js').getOrderDetail
, pify =require('pify')
, getvalue=require('get-value')
, notifier=require('../sysnotifier.js')
, argv=require('yargs').argv
, dec2num =require('../etc.js').dec2num
, dedecaimal=require('../etc.js').dedecimal
, sysevents=require('../sysevents.js')
, objPath=require('object-path');

const _noop=function() {};

var order=function(){
	var callback=arguments[arguments.length-1];
	if (typeof callback=='function') callback('启动中');
};
exports.order=function() {
	order.apply(null, arguments);
};
exports.bestSell=null;
exports.getBalance=_noop;
exports.sell=_noop;
exports.bestPair=(money, cb)=>{
	return cb(null, -1, 'CNY');
};
exports.router=router;
exports.name='支付宝StarPay';

const _auth=require('../auth.js'), aclgt=_auth.aclgt, verifyManager=_auth.verifyManager, verifyAdmin=_auth.verifyAdmin, getAuth=_auth.getAuth, verifyAuth=_auth.verifyAuth;

// get which those accounts availble
var allaccounts=[], alipayLimitation, alipayFee;
(function start(cb) {
	getDB((err, db)=>{
		if (err) return cb(err);
		async.parallel([
			function fillUsedAccount(cb){
				db.bills.find({status:'待支付', 'provider':'支付宝'}).toArray((err, r)=>{
					if (err) return cb(err);
					for (var i=0; i<r.length; i++) {
						usedAccount[r[i]._id.toHexString()]=r[i].alipay_account;
					}
					cb(null, db);
				});		
			},
			function getSetting(cb) {
				db.alipay_settings.findOne({}, (err, r)=>{
					cb(err, r||{});
				})
			}
		],
		function (err, results) {
			if (!err) {
				alipayLimitation=results[1].limitation||200000;
				alipayFee=results[1].fee||0.006;
			}
			cb(err, results[0]);
		})
	});
})(init);
function init(err, db) {
	if (err) return console.log('启动starpay.pd失败', err);
	// db.alipay_accounts.find({}).toArray((err, r)=>{
	// 	if (err) return;
	// 	allaccounts=r.sort((a, b)=>{return a.disable?1:a.usedCount-b.usedCount});
	// 	allaccounts.forEach(ele=>{ele.appId=ele._id});
	// });
	router.all('/updateAccount', verifyAuth, verifyManager, httpf({appId:'string', privateKey:'?string', alipayPublicKey:'?string', name:'?string', pwd:'?string', disable:'?boolean', limitation:'?number', fee:'?number', callback:true}, function(appId, privateKey, alipayPublicKey, name, pwd, disable, limitation, fee, callback) {
		var upd={}
		privateKey &&(upd.privateKey=privateKey);
		alipayPublicKey && (upd.alipayPublicKey=alipayPublicKey);
		name && (upd.name=name);
		pwd && (upd.pwd=pwd);
		disable!=null && (upd.disable=disable);
		limitation!=null && (upd.limitation=limitation);
		fee!=null && (upd.fee=normalizeFee(fee));
		var defaultValue={createTime:new Date()};
		if (fee==null) defaultValue.fee=alipayFee;
		db.alipay_accounts.updateOne({_id:appId}, {$set:upd,$setOnInsert:defaultValue}, {upsert:true, w:1}, (err, r)=>{
			if (err) return callback(err);
			if (r.upsertedCount) {
				sysevents.emit('newAlipayAccount', upd);
			}
			callback();
		});
	}))
	router.all('/listAccounts', verifyAuth, verifyManager, httpf({appId:'?string', page:'?number', perPage:'?number', sorts:'?object', queries:'?object', sort:'?string', order:'?string', offset:'?number', limit:'?number', callback:true}, function(appId, page, perPage, sorts, queries, sort, order, offset, limit, callback) {
		var key={};
		if (appId) {
			key._id=appId;
		}
		var cur=db.alipay_accounts.find(key, {alipayPublicKey:0, privateKey:0});
		if (!appId) {
			if (sort) {
				var so={};
				so[sort]=(order=='asc'?1:-1);
				cur=cur.sort(so);
			}
			if (offset) cur=cur.skip(offset);
			if (limit) cur=cur.limit(limit);
		}
		cur.toArray()
		.then(r=>{
			cur.count((err, c)=>{
				if (err) return callback(err);
				callback(null, {total:c, rows:dedecaimal(r)});
			});
		})
		.catch(e=>{
			callback(e);
		})
	}));
	router.all('/removeAccount', httpf({appId:'string', callback:true}, function(appId, callback) {
		db.alipay_accounts.deleteOne({_id:appId}, {w:1}, (err, r)=>{
			if (err) return callback(err);
			if (r.deletedCount<1) return callback('no such account');
			callback();
		});
	}));
	router.all('/alipaySettings', httpf({settings:'?object', callback:true}, function(settings, callback) {
		if (!settings) return db.alipay_settings.findOne({}, (err, r)=>{
			if (err) return callback(err);
			callback(null, r?r.settings:{});
		});
		db.alipay_settings.updateOne({_id:'settings'}, {$set:settings}, {w:1, upsert:true}, (err, r)=>{
			if (err) return callback(err);
			if (settings.limitation) alipayLimitation=settings.limitation;
			if (settings.fee) alipayFee=normalizeFee(settings.fee);
			callback();
		});
	}))
	router.all('/statements', httpf({account:'?string', startTime:'?date', endTime:'?date', sort:'?string', order:'?string', offset:'?number', limit:'?number', callback:true}, function(account, startTime, endTime, sort, order, offset, limit, callback) {
		var key={provider:'支付宝'};
		if (account) key['alipay_account.name']=account;
		if (startTime) key.lasttime={'$gte':startTime}
		if (endTime) {
			if (key.lasttime) key.lasttime['$lte']=endTime;
			else key.lasttime={'$lte':endTime}
		}
		var cur=db.bills.find(key);
		if (sort) {
			var so={};
			so[sort]=(order=='asc'?1:-1);
			cur=cur.sort(so);
		}
		if (offset) cur=cur.skip(offset);
		if (limit) cur=cur.limit(limit);

		cur.toArray()
		.then(r=>{
			cur.count((err, c)=>{
				if (err) return callback(err);
				db.bills.aggregate([
					{$match:key},
					{$group:{_id:null, totalMoney:{$sum:'$paidmoney'}, net:{$sum:'$net'}}}
				]).toArray((err, tm)=>{
					var totalmoney, totalnet;
					if (!err && tm.length>0) {
						totalmoney=dec2num(tm[0].totalMoney); 
						totalnet=dec2num(tm[0].net);
					}
					callback(null, {total:c, rows:r, totalmoney:totalmoney, totalnet:totalnet});
				})
			});
		})
		.catch(e=>{
			callback(e);
		})
	}))
	/*
	a return
	{"q":{"charset":"utf-8","out_trade_no":"5d1b6a959df22346c840fb9e","method":"alipay.trade.page.pay.return","total_amount":"1.00","sign":"Ml5/C+ZCe2cY4HpgW/SVTT7+gxCOyFDp58PCrO6AKJrTuPpnZgbwzkzZeaM/feOWfPCztexfzJ3Xehby2mIYTRTjYJV3MfHR2CmqhkQCV9vxZtvNE7gwms7eAuPO0MgUNTVeFdJ652ayV+zvX3nEm8Ebv1sriEw0qTUiPCqVi4tYFSFhiy4uK+V5zDPGL+N0S/Prc4VKOl2mOX1sd7d1ECOFG40c/eOnZvyfJzy+0j8K7t9g9XeP5G6UPo9wevkLzch5P8HzNjXD3vykV7D5ekDfWKRKWa2lOdRzOf2Mb1o2OWosOqwrXaTdWmiRvgH8k2W69wQnC09kvcGjMT1aTQ==","trade_no":"2019070222001453091040186309","auth_app_id":"2019022863436492","version":"1.0","app_id":"2019022863436492","sign_type":"RSA2","seller_id":"2088431661537352","timestamp":"2019-07-02 22:31:26"},"b":{}}
	*/
	router.all('/echo', (req, res)=>{
		res.send({q:req.query, b:req.body});
	})
	router.all('/return', (req, res)=>{
		var orderid=req.query.out_trade_no;
		(function tryUseMerchantReturnUrl(cb) {
			if (!orderid) return cb('orderid not defined');
			getOrderDetail(orderid, (err, merchantid, money, mer_userid, cb_url, return_url)=>{
				if (err) return cb(err);
				if (!return_url) return cb('use default page');
				res.redirect(return_url);
				cb();
			})	
		})(function ifFailed(err) {
			if (!err) return;
			//show default page
			res.send('充值完成');
		})
	})
	router.all('/done', httpf({out_trade_no:'string', total_amount:'number', trade_status:'string', passback_params:'?string', callback:true}, function(orderid, total_amount, status, passback_params, callback) {
		makeItDone(orderid, total_amount, callback);
	}));
	function makeItDone(orderid, total_amount, callback) {
		callback=callback||function(){};
		var acc=usedAccount[orderid], net, succrate;
		if (acc) {
			if (!acc.log) acc.log={};
			if (acc.log.success) acc.log.success++;
			else acc.log.success=1;
			if (!acc.used) acc.used=1;
			else acc.used++;
			var fee=Math.ceil(total_amount*(acc.fee||alipayFee)*100)/100;
			net=Number(Number(total_amount-fee).toFixed(2));
			succrate=acc.log.success/acc.used;
		}
		confirmOrder(orderid, total_amount, net, (err)=>{
			if (!err) {
				db.alipay_accounts.updateOne({_id:acc.appId}, {$set:{'log.success':acc.log.success, 'succrate':succrate}, $inc:{daily:Decimal128.fromString(''+net), total:Decimal128.fromString(''+net), 'gross.daily':Decimal128.fromString(''+total_amount), 'gross.total':Decimal128.fromString(''+total_amount), used:1}});
				delete usedAccount[orderid];
			}
			if (err && err!='used order') return callback(err);
			callback(null, httpf.text('success'));
		})
	}
	order =function(orderid, money, merchantdata, mer_userid, coinType, _host, callback) {
		nextAccount(merchantdata, mer_userid, (err, account)=>{
			if (err) return callback(err);
			if (!account) return callback('没有可用的支付宝账号');
			account.appId=account._id;
			usedAccount[orderid]=account;
			account.keyType='PKCS8';
			var alipayInst=new AlipaySdk(account);
			const formData = new AlipayFormData();
			formData.setMethod('get');
			formData.addField('return_url', url.resolve(_host, '../pvd/alipay/return'));
			formData.addField('notify_url', url.resolve(_host, '../pvd/alipay/done'));
			formData.addField('bizContent', {
			  outTradeNo: orderid,
			  productCode: 'FAST_INSTANT_TRADE_PAY',
			  totalAmount: ''+money,
			  subject: '商品',
			  body: '商品详情',
			});
			// formData.addField('passback_params', encodeURI(JSON.stringify({idx:idx, id:account.appId})));
			alipayInst.exec(
				'alipay.trade.page.pay',
				{},
				{ formData: formData },
			).then((result)=>{
				// result 为可以跳转到支付链接的 url
				updateOrder(orderid, {status:'待支付', alipay_account:account, lasttime:new Date()})
				sysevents.emit('alipayOrderCreated', {alipay_account:account, orderid:orderid, money:money, merchant:merchantdata, mer_userid:mer_userid});
				callback(null, {to:result});		
			}).catch((err)=>{
				callback(err)
			})	
		})
	}
	var today=new Date();
	setInterval(()=>{
		var now=new Date();
		if (now.getDate()!=today.getDate()) {
			today=now;
			// log all [in] in the accounts
			db.alipay_accounts && db.alipay_accounts.find().toArray().then((r)=>{
				var logs=r.map((ele)=>{
					var ret={net:ele.daily||0, gross:objPath.get(ele, ['gross', 'daily'])||0, t:today, accId:ele._id, accName:ele.name};
					return ret;
				});
				db.alipay_accounts.updateMany({}, {$set:{daily:0, 'gross.daily':0}});
				db.alipay_accounts.updateMany({daily:{$lt:500}}, {$set:{occupied:null}});
				db.alipay_logs.insertMany(logs);
			}).catch((e)=>{
				console.error(e);
			});
		}
	}, 5*1000);
}
