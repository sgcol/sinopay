const url = require('url')
, request = require('request')
, crypto =require('crypto')
, fs = require('fs')
, router=require('express').Router()
, bodyParser=require('body-parser')
, httpf =require('httpf')
, {randstring : randomstring} =require('../etc')
, async =require('async')
, getDB=require('../db.js')
, Decimal128 =require('mongodb').Decimal128
, confirmOrder =require('../order.js').confirmOrder
, updateOrder =require('../order.js').updateOrder
, cancelOrder =require('../order.js').cancelOrder
, getOrderDetail=require('../order.js').getOrderDetail
, notifier=require('../sysnotifier.js')
, dec2num =require('../etc.js').dec2num
, dedecaimal=require('../etc.js').dedecimal
, sysevents=require('../sysevents.js')
, objPath=require('object-path');

const _noop=function() {};

const makeSign=function(data, pem) {
    var message ='';
    Object.keys(data).sort().map((key)=>{
        message+=''+key+'='+data[key];
    })
    var encoded_sign=crypto.createSign('md5').update(message, 'utf8').sign(pem, 'hex');
    data['sign'] = encoded_sign;
    return data;
}

const queryRate=function(account, callback) {
    request.post('http://api.mch.ksher.net/KsherPay/rate_query', {form:makeSign({
        appid:account.appId,
        nonce_str:randomstring(16),
        channel:'wechat',
        fee_type:'THB',
        date:new Date().toLocaleDateString()
    }, account.privateKey)}, (err, header, body)=>{
        try {
            var ret=JSON.parse(body);
        } catch(e) {
            return callback(e);
        }
        var rate=objPath.get(ret, ['data', 'rate']);
        if (!rate) return callback('query rate failed');
        callback(null, Number(rate));
    })
}

function tableSizeFor(cap) {
    var n = cap - 1;
    n |= n >>> 1;//现将n无符号右移1位，并将结果与右移前的n做按位或操作，结果赋给n；
    n |= n >>> 2;
    n |= n >>> 4;
    n |= n >>> 8;
    n |= n >>> 16;
    //中间过程的目的就是使n的二进制数的低位全部变为1，比如10，11变为11，100，101，110，111变为111；
    return (n < 0) ? 1 : n + 1;
}

var order=function() {
    var callback=arguments[arguments.length-1];
    if (typeof callback=='function') callback('启动中');
}

function normalizeFee(f) {
    f=Number(f);
    if (f>=1) return f/100;
    return f;
}

var usedAccount={};

exports.order=function() {
	order.apply(null, arguments);
};
exports.bestSell=null;
exports.getBalance=_noop;
exports.sell=_noop;
exports.bestPair=(money, cb)=>{
	return cb(null, -1, 'THB');
};
exports.router=router;
exports.name='泰国kp';
exports.options=[{name:'充值通道', values:['wechat', 'alipay']}];

const _auth=require('../auth.js'), aclgt=_auth.aclgt, verifyManager=_auth.verifyManager, verifyAdmin=_auth.verifyAdmin, getAuth=_auth.getAuth, verifyAuth=_auth.verifyAuth;

// get which those accounts availble
var allaccounts=[], ksherLimitation, ksherFee;
(function start(cb) {
	getDB((err, db)=>{
		if (err) return cb(err);
		async.parallel([
			function fillUsedAccount(cb){
				db.bills.find({status:'待支付', 'provider':'ksher'}).toArray((err, r)=>{
					if (err) return cb(err);
					for (var i=0; i<r.length; i++) {
						usedAccount[r[i]._id.toHexString()]=r[i].ksher_account;
					}
					cb(null, db);
				});		
			},
			function getSetting(cb) {
				db.settings.findOne({_id:'ksher'}, (err, r)=>{
					cb(err, r||{});
				})
			}
		],
		function (err, results) {
			if (!err) {
				ksherLimitation=results[1].limitation||20000;
				ksherFee=results[1].fee||0.014;
			}
			cb(err, results[0]);
		})
	});
})(init);
function init(err, db) {
    if (err) return console.log('启动ksher.pd失败', err);
	router.all('/updateAccount', verifyAuth, verifyManager, httpf({appId:'string', privateKey:'?string', ksherPublicKey:'?string', name:'?string', pwd:'?string', disable:'?boolean', limitation:'?number', fee:'?number', callback:true}, function(appId, privateKey, ksherPublicKey, name, pwd, disable, limitation, fee, callback) {
		var upd={}
		privateKey &&(upd.privateKey=privateKey);
		ksherPublicKey && (upd.ksherPublicKey=ksherPublicKey);
		name && (upd.name=name);
		pwd && (upd.pwd=pwd);
		disable!=null && (upd.disable=disable);
		limitation!=null && (upd.limitation=limitation);
		fee!=null && (upd.fee=normalizeFee(fee));
		var defaultValue={createTime:new Date()};
		if (fee==null) defaultValue.fee=ksherFee;
		db.ksher_accounts.updateOne({_id:appId}, {$set:upd,$setOnInsert:defaultValue}, {upsert:true, w:1}, (err, r)=>{
			if (err) return callback(err);
			if (r.upsertedCount) {
				sysevents.emit('newKsherAccount', upd);
			}
			callback();
		});
    }))
    router.all('/listAccounts', verifyAuth, verifyManager, httpf({appId:'?string', page:'?number', perPage:'?number', sorts:'?object', queries:'?object', sort:'?string', order:'?string', offset:'?number', limit:'?number', callback:true}, function(appId, page, perPage, sorts, queries, sort, order, offset, limit, callback) {
		var key={};
		if (appId) {
			key._id=appId;
		}
		var cur=db.ksher_accounts.find(key, {ksherPublicKey:0, privateKey:0});
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
		db.ksher_accounts.deleteOne({_id:appId}, {w:1}, (err, r)=>{
			if (err) return callback(err);
			if (r.deletedCount<1) return callback('no such account');
			callback();
		});
		// var pos=allaccounts.findIndex(ele=>{return ele.appId==appId});
		// if (pos<0) return callback('no such account');
		// allaccounts.splice(pos, 1);
	}));
	router.all('/ksherSettings', httpf({settings:'?object', callback:true}, function(settings, callback) {
		if (!settings) return db.ksher_settings.findOne({}, (err, r)=>{
			if (err) return callback(err);
			callback(null, r?r.settings:{});
		});
		db.ksher_settings.updateOne({_id:'settings'}, {$set:settings}, {w:1, upsert:true}, (err, r)=>{
			if (err) return callback(err);
			if (settings.limitation) ksherLimitation=settings.limitation;
			if (settings.fee) ksherFee=normalizeFee(settings.fee);
			callback();
		});
	}))
	router.all('/statements', httpf({account:'?string', startTime:'?date', endTime:'?date', sort:'?string', order:'?string', offset:'?number', limit:'?number', callback:true}, function(account, startTime, endTime, sort, order, offset, limit, callback) {
		var key={provider:'ksher'};
		if (account) key['ksher_account.name']=account;
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
	router.all('/done', function(req, res) {
        try {
            var r=JSON.parse(req.body);
        } catch(e) {
            return res.send({code:'-1', status_msg:e});
        }
        if (r.code!=0) return res.send({code:'-1', status_msg:'code is not zero'});
		makeItDone(r.data.mch_order_no, r.data.cash_fee/100, r.data, (err)=>{
            if (err) return res.send({code:'-1', status_msg:err});
            res.send({code:'0', status_msg:'done'});
        });
	});
	function makeItDone(orderid, total_amount, data, callback) {
		callback=callback||function(){};
		db.ksher_orders.findOne({_id:orderid},function(err, orderData) {
			if (err) callback('no such order');
			// function getAccount(orderid, callback) {
			// 	var acc=usedAccount[orderid], net, succrate;
			// 	if (acc) return callback(null, acc);
			// 	db.bills.find({_id:ObjectId})
			// }
			var acc=usedAccount[orderid], net, succrate;
			if (acc) {
				if (!acc.log) acc.log={};
				if (acc.log.success) acc.log.success++;
				else acc.log.success=1;
				if (!acc.used) acc.used=1;
				else acc.used++;
				var fee=Math.ceil(orderData.rmb*(acc.fee||ksherFee)*100)/100;
				net=Number(Number(orderData.rmb-fee).toFixed(2));
				succrate=acc.log.success/acc.used;
			}
			confirmOrder(orderid, orderData.rmb, net, (err)=>{
				if (!err) {
					db.ksher_accounts.updateOne({_id:acc.appId}, {$set:{'log.success':acc.log.success, 'succrate':succrate}, $inc:{daily:Decimal128.fromString(''+net), total:Decimal128.fromString(''+net), 'gross.daily':Decimal128.fromString(''+total_amount), 'gross.total':Decimal128.fromString(''+total_amount), used:1, thb_daily:Decimal128.fromString(''+data.total_fee/100), thb:Decimal128.fromString(''+data.total_fee/100)}});
					delete usedAccount[orderid];
				}
				if (err && err!='used order') return callback(err);
				db.ksher_orders.updateOne({_id:orderid}, {$set:{recieved_thb:data.total_fee, origin:data}});
				callback(null);
			})
		});
    }
    function nextAccount(merchantdata, mer_userid, callback) {
		var merid=merchantdata._id;//+'.'+mer_userid;
		db.ksher_accounts.findOne({occupied:merid, daily:{$lt:ksherLimitation}, disable:{$ne:true}}, {sort:{daily:1}}).then((acc)=>{
			if (acc) return callback(null, acc);
			// 商户没有足够的ksherAccount了
			// 增加商户的ksherAccount
			db.ksher_accounts.find({occupied:merid}).count((err, c)=> {
				if (err) return callback(err);
				var enlarge=tableSizeFor(c);
				if (c<enlarge) enlarge-=c;
				db.ksher_accounts.find({occupied:null}).limit(enlarge).toArray().then((freeAccounts)=>{
					if (freeAccounts.length!=enlarge) {
						// send a notify that accounts not enough;
						if (!freeAccounts.length) {
							notifier.add('ksher账号已用完，请添加');
							// throw '暂时没有可用通道';	
						}
						notifier.add('ksher账号不足');

						return db.ksher_accounts.find().sort({daily:1}).limit(1).toArray().then((backupAccounts)=>{
							return callback(null, backupAccounts[0]);
						});
					}
					 
					db.ksher_accounts.updateMany({_id:{$in:freeAccounts.map(acc=>acc._id)}}, {$set:{occupied:merid, daily:0}}, {w:1}).then(()=>{
						return db.ksher_accounts.find({occupied:merid}, {sort:{daily:1}, limit:1}).toArray();
					})
					.then((accArr)=>{
						if (accArr.length==0) {
							notifier.add(`${merchantdata.name}要求充值时，没有ksher账号可用`);
							return callback('ksher通道不可用');
						}
						callback(null, accArr[1]);
					})
					.catch(e=>{
						callback(e);
					});
				})
				.catch(e=>{
					callback(e);
				});
			});
		})
		.catch(e=>{
			callback(e);
		})	
	}
	order =function(orderid, money, merchantdata, mer_userid, coinType, _host, callback) {
		nextAccount(merchantdata, mer_userid, (err, account)=>{
			if (err) return callback(err);
			if (!account) return callback('没有可用的ksher账号');
			account.appId=account._id;
			var tongdao=merchantdata.providers.ksher['充值通道']||'wechat';
            queryRate(account, (err, rate)=>{
                if (err) return callback(err);
                usedAccount[orderid]=account;
                var thb=Math.floor(money/rate*100)
                var data = {
                    'appid' : account.appId,
                    'nonce_str' : randomstring(16),
                    'mch_order_no' : orderid,
                    'channel' : tongdao,
                    'total_fee' : thb,
                    'fee_type' : 'THB',
                    // 'img_type' : 'png',
                    'notify_url' : url.resolve(_host, '../pvd/ksher/done')
                };            
                var request_url = 'http://api.mch.ksher.net/KsherPay/native_pay';
                request.post({url:request_url, form:makeSign(data, account.privateKey)}, (err, header, body)=>{
                    try {
                        var data=JSON.parse(body);
                    } catch(e) {
                        return console.error('ksher.createOrder failed', e);
					}
					if (data.result=="FAIL") return callback(data.result);
                    // result 为可以跳转到支付链接的 url
                    updateOrder(orderid, {status:'待支付', ksher_account:account, lasttime:new Date(), ksher_data:data});
                    sysevents.emit('ksherOrderCreated', {ksher_account:account, orderid:orderid, money:money, merchant:merchantdata, mer_userid:mer_userid});
					db.ksher_orders.insert({_id:orderid, rmb:money, thb:thb, rate:rate, t:new Date()});
					var ret={url:data.data.code_url};
					ret.pay_type=tongdao;
                    callback(null, ret);
                })
            })
		})
    }
    
    var today=new Date();
	setInterval(()=>{
		var now=new Date();
		if (now.getDate()!=today.getDate()) {
			today=now;
			// log all [in] in the accounts
			db.ksher_accounts && db.ksher_accounts.find().toArray().then((r)=>{
				var logs=r.map((ele)=>{return {net:ele.daily||0, gross:objPath.get(ele, ['gross', 'daily'])||0, thb:ele.daily_thb, t:today, accId:ele._id, accName:ele.name}});
                db.ksher_accounts.updateMany({}, {$set:{daily:0, 'gross.daily':0, daily_thb:0}});
                db.ksher_accounts.updateMany({daily:{$lt:500}}, {$set:{occupied:null}});
				db.ksher_logs.insertMany(logs);
			}).catch((e)=>{
				console.error(e);
			});
		}
	}, 5*1000);
}

if (module==require.main) {
    // const appid='mch21377';
    // //test code
    // var data = {
    //     'appid' : appid,
    //     'nonce_str' : randomstring(16),
    //     'mch_order_no' : randomstring(16),
    //     'channel' : 'wechat',
    //     'total_fee' : 43400,
    //     'fee_type' : 'THB',
    //     // 'img_type' : 'png',
    //     'notify_url' : 'http://api.mch.ksher.net/Dspay/NativepayApp/pay_notify'
    // };
    
    // var privatekey_content = fs.readFileSync("./mch_privkey.pem");
    
    // var request_url = 'http://api.mch.ksher.net/KsherPay/native_pay';

    // request.post({url:request_url, form:makeSign(data, privatekey_content)}, (err, header, body)=>{
    //     console.log(body);
    // })
    
    // queryRate({appId:appid, privateKey:privatekey_content}, console.log);

    request.post('http://127.0.0.1:7008/pvd/ksher/done', {})
    return;
}
