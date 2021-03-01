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

const AlipaySdk= require('alipay-sdk').default, AlipayFormData=require('alipay-sdk/lib/form').default;
if (process.env.NODE_ENV=='production') {
	var defaultAccount=null;
} else {
	// var defaultAccount={
	// 	appId: '2019022263286427',
	// 	privateKey:'MIIEpAIBAAKCAQEA64lxRLj2Np8x5YTwhpTA3f0WfU+f5TAtnfkIT/eeRCC37H0unXQeBOPNRFVJoBMXRWyHe2a9tQnFyRP9hsaGDehi3cfETvcPsL97nGWNGWI/Q8MII6Ss/ufs0lm28W0NB7MVIu6qdBeJR4DudgMbAJ3b2F8E3iZev3NsAE3zv3BChyh4tj+fhPZIRbBmAFw72Bj7YljHM87MMpna+zQa3dNiokUH821UwplnAagUh2DVcJB4VeqGCKyzxDo7lGg1JdFrWTu4YbT8xvV44l21WYi7Ku3PhN1c1ml+f9b+xty+b7LbYSCS+pW0kFEzRCWOKVToG/1oyw2r569EN60mWwIDAQABAoIBAATmB+AJBL3gE7aVTDdQUq6LO/OBO28V0G0Pp9eZ68W49HpLpDOMHa+2WSeJqo1UuFAuUKcFXP6t5FopO0WZTWJuqde49uE5jC793IFFL2kOvQgYv0uWei6W/jrluMNOpE27sL3YPt1JPAarrMnxiJc7sT3PxBcmryPGL8HV3TLnBZRZYCCoBvBM3MwNR+izKqGYlMNKJSWU4/bu+QNxBR+FwOlscTGNyq40e2z3r82k55eJ01wy7z7Gix+W/Y9AI7Vq64uEO7iqyCIL0svz66k4+4LC2hO7uyKwEKMnha/Tz1B2o5wLc0CzFq6dQMxF+V2qKrA4a3IM8FDLD7UrgTkCgYEA9zAzfyX6HIJklAhKio3UddeYCTtEvXYx4imXIIb1o0ECjhFRtWU9bsmajdQDsZNjNfy/cIBpkzytIuePLZZPdhZ3m7TcIRdX+0f3wuJCVmmKmUui6rauCGiAwL5S9ReRlnusUbshEpx1ZPRajlSEoO+i3HXnHsH2kAUMv970Vd0CgYEA8+7pnbaO1odlXCr6DimkQpJmlWSzaoUSYzZ5oQU8S4+A7MMIPhVrxOqwyMDfZ8Y3nX2xTtNh3+GjLUq1u35vVucJ/oPsCVEHxc0h/WoXT7J0UmDSJ79iEOxGZyEWMT/SjGLZQlX5n4SQvnq7NyZTzMzY266EymqvXOv0gCvK9ZcCgYEAlql5adEy7feH6DZZgLPLwHvEvjOyxSvqYafp5jh8NaIlNYRW4hIv7HvSyQllqvFjsf84jBCoyMZd3P14ZlfMXPR6uJv24/B/frgxykXwGw0/Hgpc5WStFJDlkRUwKRTRdwAwWqyNDvPwFbVeEIxxPkpxYKA4W6Xra4K4b6YsFL0CgYEA7Wxg3izOImhuc6Mw94/4XQN57XayWr9jAkYHZH5gDXuDlO7Pmv3mgyebIgr4Z106zIOGjJ6Z6PsJhA/viqqpXABMbfmhSAAifJgIuUsFnYCoT3YFlsJkhOw0KjS+EPl5yUJ9DF/6MxUofP2gMzGO5wuLF2dpwErOnLbcp9P4G8kCgYBcTMJBH6AQS3sjbfcYQNKht/jKyjZIj/Td5T2C5eF9OuFrf38Ssj7kD58kdKwaVBAtb3VPi2av1Vxv9LwUfi4mEDWLRwZYPdwBZI9v1DgcUt54ZzuMRzCgnRDr/wli8IjUlK4ghfXE+19kA/fznRB5buZphAnFu5CYSbCQoWf8Ww==',
	// 	alipayPublicKey:'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoV47NhH8Cf/aCqJf0FXSRRgFxTMq230L3zQsVKgW5mu3FOqtmrZFKgxRxGndtWBxBhF/C8iAF81V8KzPPqY6kJLslpFaiNVL03RrQqIcYXhY2xbpp2Ya415sRFBJvRfIZddzuxr3U9dFY6iQMRpcK4IOA7nS/JfZThd8O99N2I/XlcucSwQndEMddPhB46aLjva8LJhA3agvvEVo4UWj/bNyLpJx0DlU1CJutXQ32ZYUcAcNL29Alt0EuSE45jpHPUfJViikDzekpx0ON/Dr7MmRq+TjlLvY+G8ELYYX7vfCabEHSHohTxqSuOHkyr4YocgaEk6jwXICiVPLKv9l2wIDAQAB'
	// };
	var defaultAccount={
		appId: '2019030563468077',
		privateKey:'MIIEpAIBAAKCAQEArmCrYHeMDf0uemOofTJTPKomtoAWHDb7f2UG5Mf5Lj2a9JZsyUiT7y/gpCgXleWtRAaVCJX4KHfKgbUsz3/Hxj9xaqm40h8d9VHrvqQiKgpZEhKQbl2x/2/l/jgSAVkniEe3MX0sxY6oh6jgiG9pjbPc0dwGK8EG7cvHnqtGh9ITFeII9ylkcIenGN8GwVuBpCQbZeJMIK4y00AtmLIx2flKKdAfbnlo+CIAVyIFGA9SSFFlw3fLlrHslD9bplP0vd/eiL0dyNyCrRFUkM1hupdLVOtY9QYTIgFpD86jNbrU7PDSHf2uemEfeS74CNzpdMPqniKJ0vSUlUuuAc3XTQIDAQABAoIBAQCap/g3Ra/81Dk9qVfNOi4i1tIg+LcjbQxfr62OiWGSRmdBWIzBdNJnyDHXxgstEhg7Bg92HvSKh7wekB5fJnh7dtdTf5YBHkIGyxJn8dCvMqBO7BIXIJh28bqtXvNxKK5sKxbqGJf125HTR89kklOurwBBTIBYnAlWLG8uZb/XQt2jxcMOfeUkNXgwoJE20iEfxnqLzOoW5CrVwbZOpCZ0DmK3MNG8TXM6vOvL3WBp29FxF2HyUZXvoR/KK/evDMnDIhYK4Ui1Cn2ZQ/UiOySVcJj1sbMF85nbQyI3Oos4FcKidKYt5KSp+iCFaILme7dyOa6ppq16JTTqe/7lJe1hAoGBAOKEblwFkNsPAubaZSaiKbD2CWOUngJFGkl+RXolsZQQqi8s4DKK7hNSP/yI7DCHboXTtFTBSe7SzmuHgf4IQxrKfT7LFUeyk+OnY58R4zNAKcrKs/NrCK1yt4cxOXqsPlut7Ct2P8zN5BbFKtVrpiDA6n+XbZcAQ+PcjjYsVydZAoGBAMUS8OG8qkh/DjY6/ku/gDZC5YjhLE2cbYL1bhNlNwWzVi8ju3qwbnmpP0GHQHcqkzXGphl4cgxzGa8Ybgb52FBuYWPXrd86nAbqk5FTqc8hoJ7+jrjSTSIuO9td+4aKKQEpdTacoWV/BhN3Bna22mZRy7d/IdOh7VraMzGCfeUVAoGAMjza2Q/m856dryOKwYm/o1698Fb6wFghH2Gg+Rk5DDSx+eqDAtKrQJ/CTzjy4UR4L7gnS5De29fnLhQMsZGViHCWXIHgA1nI0PnD73ihIjG90xsn0/nOH+HMcHBrZhijb+Pf+DeuqLaVOrOZ72GDo8oFeCzWgmHtrLCy3bLx1WkCgYBsy6wXsuP+6cWawq6oeqv5SK0XB9hBcF40sfF226Woi/zEQWG6tbQHjhvRvS0lnGdwhJ4l6Yxsuw4uz7nOOBfnL0isqeDfH6gLWWzmCd3w74uQus9n0RGsEQISdKvq9lL0xUJkR8wCEEH2dPsohoHDgtyIDLNL9lTmlxcz+eoukQKBgQCKu4Nc2UdnuwQAWtsu2XXgD89OYzZy8L3ucalUyUroU/T5f75VoEVN1W0n/u3mYY/PySx3+JDZ/VHZbHQCnjyM/ND+u+YxZ3hfZP4UCY2gTHRMimqnxbH1S4K3CQfFeLyGI3/FiHVdu+z3dg0TYxO3J8435GqIROc6c3vbYuPHWg==',
		alipayPublicKey:'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkxTUY1NA6qrjhY8Z6SGqSz0koMAxsCNUSOUtMgxOUa7DPV1o//aJX4TJHuJRTpJv/QrWowRwznjVxlJzusZ7F2yaz/dji8BMChHF640vGd1vw97r64b6jMbNW941BaXjFKP6arLcROz7/MIOdR766P+Nazps1J0kmNcajTH8Shsa6sGEbj9JltnylOh3NwnKSEzq8EwzyNpbQe6fdiBLydbM9s4XnBNhrzSoDkeCOj9p6IAePV6PEZTzVjA7QDumUHnPvy/x2iuh/manrjvVWiN8DSPep3L94LSNmKWe0+w2RSV1CFvqodL5o0oggLoHO9h06Xh2XXOGmId2Si9s/wIDAQAB'
	};
}

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
exports.name='支付宝';

const _auth=require('../auth.js'), aclgt=_auth.aclgt, verifyManager=_auth.verifyManager, verifyAdmin=_auth.verifyAdmin, getAuth=_auth.getAuth, verifyAuth=_auth.verifyAuth;

//求给定数最小的2^n
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
				db.settings.findOne({_id:'alipay'}, (err, r)=>{
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
	if (err) return console.log('启动alipay.pd失败', err);
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
		// if (sorts) {
		// 	var sortBySucc=sorts['成功率'];
		// 	if (sortBySucc!=null) {
		// 		allaccounts.sort((a, b)=>{
		// 			var valueOfA, valueOfB;
		// 			if (!a.log) a.log={success:0};
		// 			if (!a.usedCount) valueOfA=0;
		// 			else valueOfA=a.log.success/a.usedCount;

		// 			if (!b.log) b.log={success:0};
		// 			if (!b.usedCount) valueOfB=0;
		// 			else valueOfB=b.log.success/b.usedCount;

		// 			return sortBySucc*valueOfA-sortBySucc*valueOfB;
		// 		})
		// 	} else {
		// 		var map={'账号':'name', 'AppID':'appId', '创建时间':'createTime', 'appId':'appId'};
		// 		var key=Object.keys(sorts)[0];
		// 		var sortBy=map[key], dir=sorts[key];
		// 		if (sortBy) {
		// 			allaccounts.sort((a, b)=>{
		// 				var ret;
		// 				if (a[sortBy]<b[sortBy]) ret=-1;
		// 				else if (a[sortBy]==b[sortBy]) ret=0;
		// 				else ret=1;
		// 				return dir*ret;
		// 			})
		// 		}
		// 	}
		// }
		// var copy;
		// if (perPage) {
		// 	page=page||1;
		// 	if (page<1) page=1;
		// 	copy=allaccounts.slice((page-1)*perPage, page*perPage);
		// } else copy=allaccounts;
		// return callback(null, {records:copy, queryRecordCount:copy.length, totalRecordCount:allaccounts.length});
	}));
	router.all('/removeAccount', httpf({appId:'string', callback:true}, function(appId, callback) {
		db.alipay_accounts.deleteOne({_id:appId}, {w:1}, (err, r)=>{
			if (err) return callback(err);
			if (r.deletedCount<1) return callback('no such account');
			callback();
		});
		// var pos=allaccounts.findIndex(ele=>{return ele.appId==appId});
		// if (pos<0) return callback('no such account');
		// allaccounts.splice(pos, 1);
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
		// var acc=usedAccount[orderid], net, succrate;
		// if (acc) {
		// 	if (!acc.log) acc.log={};
		// 	if (acc.log.success) acc.log.success++;
		// 	else acc.log.success=1;
		// 	if (!acc.used) acc.used=1;
		// 	else acc.used++;
		// 	var fee=Math.ceil(total_amount*(acc.fee||alipayFee)*100)/100;
		// 	net=Number(Number(total_amount-fee).toFixed(2));
		// 	succrate=acc.log.success/acc.used;
		// }
		// confirmOrder(orderid, total_amount, net, (err)=>{
		// 	if (!err) {
		// 		db.alipay_accounts.update({_id:acc.appId}, {$set:{'log.success':acc.log.success, 'succrate':succrate}, $inc:{daily:net, total:net, used:1}});
		// 		delete usedAccount[orderid];
		// 	}
		// 	if (err && err!='used order') return callback(err);
		// 	callback(null, httpf.text('success'));
		// })
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
	function normalizeFee(f) {
		f=Number(f);
		if (f>=1) return f/1000;
		return f;
	}
	function nextAccount(merchantdata, mer_userid, callback) {
		var merid=merchantdata._id;//+'.'+mer_userid;
		db.alipay_accounts.findOne({occupied:merid, daily:{$lt:alipayLimitation}}, {sort:{daily:1}}).then((acc)=>{
			if (acc) return callback(null, acc);
			// 商户没有足够的alipayAccount了
			// 增加商户的alipayAccount
			db.alipay_accounts.find({occupied:merid}).count((err, c)=> {
				if (err) return callback(err);
				var enlarge=tableSizeFor(c);
				if (c<enlarge) enlarge-=c;
				db.alipay_accounts.find({occupied:null}).limit(enlarge).toArray().then((freeAccounts)=>{
					if (freeAccounts.length!=enlarge) {
						// send a notify that accounts not enough;
						if (!freeAccounts.length) {
							notifier.add('支付宝账号已用完，请添加');
							throw '暂时没有可用通道';	
						}
						notifier.add('支付宝账号不足');
					}
					 
					db.alipay_accounts.updateMany({_id:{$in:freeAccounts.map(acc=>acc._id)}}, {$set:{occupied:merid, daily:0}}, {w:1}).then(()=>{
						return db.alipay_accounts.find({occupied:merid}, {sort:{daily:1}, limit:1}).toArray();
					})
					.then((accArr)=>{
						if (accArr.length==0) {
							notifier.add(`${merchantdata.name}要求充值时，没有支付宝账号可用`);
							return callback('支付宝通道不可用');
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
		// var x=allaccounts[pos], y,ypos;
		// if (pos>=allaccounts.length) {
		// 	y=allaccounts[0];
		// 	ypos=0;
		// } else {
		// 	ypos=pos+1;
		// 	y=allaccounts[ypos];
		// }
		// if (!x && !y) return null;
		// if (!x && y) {
		// 	pos=ypos;
		// 	y.useCount++;
		// 	return y;
		// }
		// if (x && !y) {
		// 	x.useCount++;
		// 	return x;
		// }
		// if (x.useCount>y.useCount) {
		// 	pos=ypos;
		// 	y.useCount++;
		// 	return y;
		// }
		// x.useCount++;
		// return x;
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
			db.alipay_accont && db.alipay_accounts.find().toArray().then((r)=>{
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
var pos=0;
var usedAccount={};

(function () {
	function chkAlipayOrderStatus() {
		async.eachOf(usedAccount, (acc, orderid, cb)=>{
			var alipayInst=new AlipaySdk(acc);
			alipayInst.exec('alipay.trade.query', {bizContent:{
				out_trade_no:orderid
			}}).then(result=>{
				if (result.code!='10000') return cb();
				if (result.alipay_trade_query_response.trade_status!='WAIT_BUYER_PAY') {
					// remove this one from usedAccount
					if (result.alipay_trade_query_response.subCode!='SUCCESS') {
						if (!acc.log) acc.log={};
						var errcode=result.alipay_trade_query_response.subCode;
						if (!acc.log[errcode]) acc.log[errcode]=0;
						else acc.log[errcode]++;
						var op={};
						op['log.'+errcode]=acc.log[errcode];
						acc.usedCount+=10;
						op.usedCount=acc.usedCount;
						if (!acc.used) acc.used=1;
						else acc.used++;
						op.succrate=(acc.log.success||0)/acc.used;
						op.used=acc.used;
						db.alipay_accounts.updateOne({_id:acc.appId}, {$set:op});
					} else {
						makeItDone(orderid, result.alipay_trade_query_response.total_amount);
					}
					delete usedAccount[orderid];
				}

				cb();
			}).catch(e=>{
				cb();
			});
		}, ()=>{
			// usedAccount=usedAccount.filter(v=>v);
		});
	}
	setInterval(chkAlipayOrderStatus, 30*1000);
})();

exports.router=router;