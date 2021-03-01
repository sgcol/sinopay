const url = require('url')
, request = require('request')
, md5 =require('md5')
, fs = require('fs')
, router=require('express').Router()
, bodyParser=require('body-parser')
, httpf =require('httpf')
, {randstring:randomstring} =require('../etc')
, async =require('async')
, getDB=require('../db.js')
, Decimal128 =require('mongodb').Decimal128
, {confirmOrder, updateOrder, cancelOrder, getOrderDetail}=require('../order.js')
, notifier=require('../sysnotifier.js')
, {dec2num, dedecaimal}=require('../etc.js')
, sysevents=require('../sysevents.js')
, objPath=require('object-path')
, CsvParse=require('csv-parse');

const _noop=function() {};

Number.prototype.pad = function(size) {
	var s = String(this);
	while (s.length < (size || 2)) {s = "0" + s;}
	return s;
}

const timestring =(t)=>{
    return `${t.getUTCFullYear().pad(4)}-${(t.getUTCMonth()+1).pad()}-${t.getUTCDate().pad()} ${t.getUTCHours().pad()}:${t.getUTCMinutes().pad()}:${t.getUTCSeconds().pad()}`;
}

const makeSign=function(data, account, options) {
    delete data.sign;
    var message ='', o=Object.assign({app_id:account.app_id, version:'1.0', format:'JSON', sign_type:'MD5', charset:'UTF-8', timestamp:timestring(new Date())}, data);
    Object.keys(o).sort().map((key)=>{
        if (key=='sign') return;
        if (key=='sign_type' && ((!options) || (!options.includeSignType))) return;
        message+=''+key+'='+o[key]+'&';
    })
    var encoded_sign=md5(message.substr(0, message.length-1)+account.privateKey);
    o['sign'] = encoded_sign.toLowerCase();
    return o;
}
function queryRate(acc, callback) {
    var rateParser=CsvParse({delimiter:'|', columns:['date', 'no', 'currency', 'rate', 'unused']}), out=[];
    request('https://intlmapi.alipay.com/gateway.do?service=forex_rate_file&sign_type=MD5&partner=2088921303608372&sign=75097bd6553e1e94aabc6e47b54ec42e')
    .pipe(rateParser)
    .on('readable', ()=>{
        let record
        while (record = rateParser.read()) {
          out.push(record)
        }
    })
    .on('error', (err)=>{
        callback(err);
    })
    .on('end', ()=>{
        var ret={};
        out.forEach((r)=>{
            ret[r.currency]=Number(r.rate);
        });
        callback(null, ret);
    })
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

exports.order=function() {
	order.apply(null, arguments);
};
exports.bestSell=null;
exports.getBalance=_noop;
exports.sell=_noop;
exports.bestPair=(money, cb)=>{
	return cb(null, -1, 'thb');
};
exports.router=router;
exports.name='CanadaSP+org';
exports.options=[{name:'充值通道', values:['wxNativePay', 'aliPayN']}];

const _auth=require('../auth.js'), aclgt=_auth.aclgt, verifyManager=_auth.verifyManager, verifyAdmin=_auth.verifyAdmin, getAuth=_auth.getAuth, verifyAuth=_auth.verifyAuth;

// get which those accounts availble
var account, snappayLimitation, snappayFee;
(function start(cb) {
	getDB((err, db)=>{
		if (err) return cb(err);
		async.parallel([
            function getAccount(callback) {
                if (process.env.NODE_ENV!='production') {
                    return callback(null, {partner:'901800000116', app_id:'9f00cd9a873c511e', privateKey:'7e2083699dd510575faa1c72f9e35d43'});
                }
                db.snappay_accounts.findOne({_id:'hongkong'}).then((acc)=>{
                    db.snappay_accounts.updateOne({_id:'hongkong'}, {$setOnInsert:{merchant_id:'fill', partner:'fill', privateKey:'fill'}}, {upsert:true, w:1}, (err)=>{
                        if (err) return callback(err);
                        callback(null, {merchant_id:'fill', partner:'fill', privateKey:'fill'});
                    });
                })
                .catch(e=>{
                    callback(e);
                })	
            },
			function getSetting(cb) {
				db.settings.findOne({_id:'snappay_org'}, (err, r)=>{
					cb(err, r||{});
				})
            }
		],
		function (err, results) {
			if (!err) {
                account=results[0];
				snappayLimitation=results[1].limitation||20000;
				snappayFee=results[1].fee||0.015;
			}
			cb(err, db);
		})
	});
})(init);
function init(err, db) {
    if (err) return console.log('启动snappay.pd失败', err);
	router.all('/updateAccount', verifyAuth, verifyManager, httpf({id:'string', privateKey:'?string', merchant_id:'?string', partner:'?string', disable:'?boolean', limitation:'?number', fee:'?number', callback:true}, function(id, privateKey, merchant_id, partner, disable, limitation, fee, callback) {
		var upd={};
		privateKey &&(upd.privateKey=privateKey);
		disable!=null && (upd.disable=disable);
		limitation!=null && (upd.limitation=limitation);
		fee!=null && (upd.fee=normalizeFee(fee));
		var defaultValue={createTime:new Date()};
		if (fee==null) defaultValue.fee=snappayFee;
		db.snappay_accounts.updateOne({_id:'hongkong'}, {$set:upd,$setOnInsert:defaultValue}, {upsert:true, w:1}, (err, r)=>{
			if (err) return callback(err);
			if (r.upsertedCount) {
				sysevents.emit('newsnappayAccount', upd);
			}
			callback();
		});
    }))
    router.all('/listAccounts', verifyAuth, verifyManager, httpf({id:'?string', page:'?number', perPage:'?number', sorts:'?object', queries:'?object', sort:'?string', order:'?string', offset:'?number', limit:'?number', callback:true}, function(id, page, perPage, sorts, queries, sort, order, offset, limit, callback) {
		var key={};
		if (id) {
			key._id=id;
		}
		var cur=db.snappay_accounts.find(key, {privateKey:0});
		if (!id) {
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
    // router.all('/removeAccount', httpf({appId:'string', callback:true}, function(appId, callback) {
	// 	db.snappay_accounts.deleteOne({_id:appId}, {w:1}, (err, r)=>{
	// 		if (err) return callback(err);
	// 		if (r.deletedCount<1) return callback('no such account');
	// 		callback();
	// 	});
	// 	// var pos=allaccounts.findIndex(ele=>{return ele.appId==appId});
	// 	// if (pos<0) return callback('no such account');
	// 	// allaccounts.splice(pos, 1);
	// }));
	router.all('/snappaySettings', httpf({settings:'?object', callback:true}, function(settings, callback) {
		if (!settings) return db.snappay_settings.findOne({}, (err, r)=>{
			if (err) return callback(err);
			callback(null, r?r.settings:{});
		});
		db.snappay_settings.updateOne({_id:'settings'}, {$set:settings}, {w:1, upsert:true}, (err, r)=>{
			if (err) return callback(err);
			if (settings.limitation) snappayLimitation=settings.limitation;
			if (settings.fee) snappayFee=normalizeFee(settings.fee);
			callback();
		});
	}))
	router.all('/statements', httpf({account:'?string', startTime:'?date', endTime:'?date', sort:'?string', order:'?string', offset:'?number', limit:'?number', callback:true}, function(account, startTime, endTime, sort, order, offset, limit, callback) {
		var key={provider:'snappay'};
		if (account) key['snappay_account._id']=account;
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
	router.all('/done', async function(req, res) {
        var r=req.body, sign=r.sign;
        if (makeSign(r).sign!=sign) return res.send({err:'sign error'});
        if (r.errCode!='00') return res.send({err:'code is not double zero'});
		makeItDone(r.orderId, r, (err)=>{
            if (err) return res.send({err:err});
            res.send('SUCCESS');
        });
	});
	function makeItDone(orderid, data, callback) {
		callback=callback||function(){};
		db.snappay_orders.findOne({_id:orderid},function(err, orderData) {
			if (err) callback('no such order');
			var acc=account, net, succrate, total_amount=orderData.rmb, fee;
			if (acc) {
				if (!acc.log) acc.log={};
				if (acc.log.success) acc.log.success++;
				else acc.log.success=1;
				if (!acc.used) acc.used=1;
				fee=Math.ceil(orderData.rmb*(acc.fee||snappayFee)*100)/100;
				net=Number(Number(orderData.rmb-fee).toFixed(2));
				succrate=acc.log.success/acc.used;
			}
			confirmOrder(orderid, orderData.rmb, net, (err)=>{
				if (!err) {
					db.snappay_accounts.updateOne({_id:acc.appId}, {$set:{'log.success':acc.log.success, 'succrate':succrate}, $inc:{daily:Decimal128.fromString(''+net), total:Decimal128.fromString(''+net), 'gross.daily':Decimal128.fromString(''+total_amount), 'gross.total':Decimal128.fromString(''+total_amount)}});
				}
				if (err && err!='used order') return callback(err);
				db.snappay_orders.updateOne({_id:orderid}, {$set:{origin:data}});
				callback(null);
			})
		});
    }

	order =function(orderid, money, merchantdata, mer_userid, coinType, _host, callback) {
        queryRate(account, (err, rates)=>{
            var tongdao=merchantdata.providers.snappay['充值通道']||'aliPayN';
            var data = {
				method:'pay.h5pay',
				merchant_no:account.partner,
				payment_method:'WECHATPAY',
				'out_order_no' : orderid,
				trans_currency:'CAD',
				trans_amount:money,
				description:'ceshi',
                'notify_url' : url.resolve(_host, '../pvd/snappay.org/done'),
                'return_url' : url.resolve(_host, '../pvd/snappay.org/return'),
            };            
            var request_url = 'https://open.snappay.ca/api/gateway';
            request.post({url:request_url, json:makeSign(data, account)}, async (err, header, body)=>{
				var ret=body;
				if (ret.code!='0') return callback(ret.msg);
				var data=ret.data[0];
                updateOrder(orderid, {status:'待支付', providerOrderId:data.out_order_no, snappay_account:account, lasttime:new Date(), snappay_data:ret});
                sysevents.emit('snappayOrderCreated', {snappay_account:account, orderid:orderid, money:money, merchant:merchantdata, mer_userid:mer_userid});
                db.snappay_orders.insert({_id:orderid, rmb:money, t:new Date()});
                if (!account.used) account.used=1;
                else account.used++;
                db.snappay_accounts.updateOne({_id:'hongkong'}, {$inc:{used:1}});
                var ret={to:data.h5pay_url};
                ret.pay_type='wechat';
                callback(null, ret);
            })    
        });
    }
    
    var today=new Date();
	setInterval(()=>{
		var now=new Date();
		if (now.getDate()!=today.getDate()) {
			today=now;
			// log all [in] in the accounts
			db.snappay_accounts && db.snappay_accounts.find().toArray().then((r)=>{
				var logs=r.map((ele)=>{return {net:ele.daily||0, gross:objPath.get(ele, ['gross', 'daily'])||0, thb:ele.daily_thb, t:today, accId:ele._id, accName:ele.name}});
                db.snappay_accounts.updateMany({}, {$set:{daily:0, 'gross.daily':0, daily_thb:0}});
                db.snappay_accounts.updateMany({daily:{$lt:500}}, {$set:{occupied:null}});
				db.snappay_logs.insertMany(logs);
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
    //     'notify_url' : 'http://api.mch.snappay.net/Dspay/NativepayApp/pay_notify'
    // };
    
    // var privatekey_content = fs.readFileSync("./mch_privkey.pem");
    
    // var request_url = 'http://api.mch.snappay.net/snappayPay/native_pay';

    // request.post({url:request_url, form:makeSign(data, privatekey_content)}, (err, header, body)=>{
    //     console.log(body);
    // })
    
    queryRate({partner:'900010000018964', privateKey:'GeEhADcZl75ycvV80yuQ', merchant_id:'900010000018964'}, console.log);

    // request.post('http://127.0.0.1:7008/pvd/snappay/done', {})

    return;
}
