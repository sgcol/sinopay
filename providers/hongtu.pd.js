const url = require('url')
, request = require('request')
, md5 =require('md5')
, router=require('express').Router()
, httpf =require('httpf')
, async =require('async')
, getDB=require('../db.js')
, ObjectID =require('mongodb').ObjectID
, confirmOrder =require('../order.js').confirmOrder
, updateOrder =require('../order.js').updateOrder
, getOrderDetail=require('../order.js').getOrderDetail
, decimalfy =require('../etc.js').decimalfy
, dedecimal=require('../etc').dedecimal
, Decimal128 =require('mongodb').Decimal128
, sysevents=require('../sysevents.js')
, objPath=require('object-path')
, pify =require('pify')
, ip6addr=require('ip6addr')
, argv=require('yargs')
	.describe('wxhost', 'a base url used to access wechat func')
	.describe('wxproxy', 'proxy to access wechat interfaces, ip[:port]')
	.argv
, debugout =require('debugout')(argv.debugout)
, fs =require('fs-extra')
, path =require('path')
, moment =require('moment')
, ejs=require('ejs')


const _noop=function() {};
const supportedType={'WECHATPAYH5':{type:'WECHATPAY', method:'pay.h5pay'}, 'ALIPAYH5':{type:'ALIPAY', method:'pay.h5pay'}}
, supportedCurrency=['CAD', 'USD'];

const shortDate =(t)=>{
	// var str =t.toLocaleString('zh-Hans-CN', { timeZone:'Asia/Shanghai', hourCycle:'h24', year:'numeric', month:'2-digit', day:'2-digit'})
	// return str.replace(/\//g, '');
	return moment(t).utcOffset(8).format('YYYYMMDD');
}

const localtimestring =(t)=>{
	return `${t.getFullYear().pad(4)}-${(t.getMonth()+1).pad()}-${t.getDate().pad()} ${t.getHours().pad()}:${t.getMinutes().pad()}:${t.getSeconds().pad()}`;
}

function simplifyStatus(status) {
	if (status=='complete' ||status=='通知商户' || status=='通知失败') return 'success';
	if (status=='refund') return 'refund';
	return 'waitpay';
}

const makeSign=function(data, account, options) {
	var message ='', o=Object.assign({}, data);
	Object.keys(o).sort().map((key)=>{
		if (key=='sign' || key=='pay_md5sign' || key=='pay_productname' || key=='attach' || key=='pay_attach') return;
		if (!o[key]) return;
		message+=''+key+'='+o[key]+'&';
	})
	var encoded_sign=md5(message+'key='+account.key);
	o['pay_md5sign'] = encoded_sign.toUpperCase();
	return o;
}

var order=function() {
	var callback=arguments[arguments.length-1];
	if (typeof callback=='function') callback('启动中');
}
var forwardOrder=function() {
	var callback=arguments[arguments.length-1];
	if (typeof callback=='function') callback('启动中');
}

function normalizeFee(f) {
	f=Number(f);
	if (f>=1) return f/100;
	return f;
}

const request_url = 'https://open.snappay.ca/api/gateway';

exports.menus=[
	{
		name:'提款',
		url: 'withdraw.ae',
		for: 'merchant'
	}
];
exports.order=function() {
	order.apply(null, arguments);
};
exports.forwardOrder=function () {
	forwardOrder.apply(this, arguments);
}
exports.bestSell=null;
exports.getBalance=_noop;
exports.sell=_noop;
exports.bestPair=(money, cb)=>{
	return cb(null, 0.007, ['USD', 'CAD']);
};
exports.router=router;
exports.name='hongtu';
// exports.options=[{name:'通道', values:['ALIPAYH5', 'WECHATPAYH5']}];
exports.forecore=true;
exports.exchangeRate=async function(currency, payment, callback) {
	callback=callback||((err, r)=>{
		if (err) throw err;
		else return r
	});
	var data={
		fee_type:currency,
		date:shortDate(new Date()),
	};
	var ret =await wx.payment.queryExchangeRate(data);
	if (ret.return_code!='SUCCESS') return callback(ret.return_msg);
	return callback(null, {exchange_rate:ret.rate});
}
var queryOrder=async function(order, callback) {
	callback=callback||((err, r)=>{
		if (err) throw err;
		else return r
	});
	callback('启动中');
}
exports.queryOrder=async function(order, callback) {
	queryOrder.apply(null, arguments);
}

const _auth=require('../auth.js'), aclgt=_auth.aclgt, verifyManager=_auth.verifyManager, verifyAdmin=_auth.verifyAdmin, getAuth=_auth.getAuth, verifyAuth=_auth.verifyAuth;

Number.prototype.pad=function(size) {
	var s=String(this);
	return s.padStart(size, '0');
}
function daysIntoYear(date){
	return Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / 24 / 60 / 60 / 1000);
}

// get which those accounts availble
var hongtuGlobalSetting, hongtuFee;
(function start(cb) {
	getDB((err, db)=>{
		if (err) return cb(err);
		async.parallel([
			function getSetting(cb) {
				db.settings.findOne({_id:'provider.hongtu'}, (err, r)=>{
					cb(err, r||{});
				})
			}
		],
		function (err, results) {
			if (!err) {
				hongtuGlobalSetting=results[0];
				hongtuFee=normalizeFee(hongtuGlobalSetting.fee)||0.035;
			}
			cb(err, db);
		})
	});
})(init);
function init(err, db) {
	if (err) return console.log('启动hongtu.pd失败', err);
	router.all('/updateAccount', verifyAuth, verifyManager, httpf({_id:'?string', callback:true}, 
	function(id, callback) {
		var upd={...this.req.query, ...this.req.body};
		delete upd._id;
		var defaultValue={createTime:new Date()};
		id=id?ObjectID(id):new ObjectID();
		db.hongtu_accounts.updateOne({_id:id}, {$set:upd,$setOnInsert:defaultValue}, {upsert:true, w:1}, (err, r)=>{
			if (err) return callback(err);
			if (r.upsertedCount) {
				sysevents.emit('newSnapPayBaseAccount', upd);
			}
			callback();
		});
	}))
	router.all('/listAccounts', verifyAuth, verifyManager, httpf({name:'?string', sort:'?string', order:'?string', offset:'?number', limit:'?number', callback:true}, 
	async function(name, sort, order, offset, limit, callback) {
	try {
		var cond={};
		if (name) cond.name={'$regex':name};
		var cur=db.hongtu_accounts.find(cond);
		if (sort) {
			var so={};
			so[sort]=(order=='asc'?1:-1);
			cur=cur.sort(so);
		}
		if (offset) cur=cur.skip(offset);
		if (limit) cur=cur.limit(limit);

		var [c, rows]=await Promise.all([cur.count(), cur.toArray()]);
		callback(null, {total:c, rows:dedecimal(rows)});
	} catch(e) {callback(e)}
	}));
	router.all('/removeAccount', httpf({_id:'string', callback:true}, function(id, callback) {
		db.hongtu_accounts.deleteOne({_id:ObjectID(id)}, {w:1}, (err, r)=>{
			if (err) return callback(err);
			if (r.deletedCount<1) return callback('no such account');
			callback();
		});
	}));

	router.all('/availbeAccounts', verifyAuth, verifyManager, httpf({belongs:'string', callback:true}, async function(belongs, callback) {
		try {
			return callback(null, {rows:await db.hongtu_accounts.find({belongs:{$in:[null, belongs]}}).toArray()});
		} catch(e) {return callback(e)}
	}))

	router.all('/settings', verifyAuth, verifyManager, httpf({settings:'?object', callback:true}, async function(settings, callback) {
		try {
			if (!settings) {
				var r=await db.settings.findOne({_id:'provider.hongtu'});
				// r.wxSettlementTime=await getLastWxSettlement(r.lastExportTime||0);
				return callback(null, r||{});
			};
			await db.settings.updateOne({_id:'provider.hongtu'}, {$set:settings}, {w:1, upsert:true});
			Object.assign(hongtuGlobalSetting, settings);
			if (settings.fee) hongtuFee=normalizeFee(settings.fee);
			callback();
		} catch(e) {
			callback(e);
		}
	}))
	router.all('/statement', verifyAuth, verifyManager, httpf({name:'?string', from:'?date', to:'?date', timezone:'?string', sort:'?string', order:'?string', limit:'?number', offset:'?number', callback:true},
	async function(name, from, to, timezone, sort, order, limit, offset, callback) {
	try {
		var cond={testOrder:{$ne:true}};
		if (name) cond.name={'$regex':name}
		if (from) cond.time={$gte:from}
		if (to) {
			cond.time=cond.time||{};
			cond.time.$lt=to;
		}
		cond.provider='hongtu';
		//cond.used=true;cond.status={$ne:'refund'}
		cond.status={$in:['SUCCESS', 'refundclosed', 'refund', 'complete', '已支付', '通知商户', '通知失败']}
		var groupby={mchId:'$userid'}, 
		af={
			value:{$round:[{$multiply:['$paidmoney', '$share']}, 2]},
			hongtu:{$round:[{$multiply:['$paidmoney', hongtuFee]}, 2]}
		};
		if(!cond.time) {
			//不指定时间按照天统计
			af.dot={$dateToString:{date:'$time', format:'%Y%m%d'}};
			if (timezone) af.dot.$dateToString.timezone=timezone;
			groupby.dot='$dot'
		}
		var dbBills=db.db.collection('bills', {readPreference:'secondaryPreferred'});
		var cursor =dbBills.aggregate([
			{$match:cond},
			{$addFields:af},
			{$addFields:{
				holding:'$value',
				profit:{$subtract:['$paidmoney', {$add:['$value', '$hongtu']}]},
				settlement:{
					$cond:[
						{$ne:[{$ifNull:['$checkout', null]}, null]},
						'$value',
						0
					]
				},
				// unpaid:{
				// 	$cond:[
				// 		{$eq:[{$ifNull:['$checkout', null]}, null]},
				// 		'$value',
				// 		0
				// 	]
				// }
			}},
			{$group:{
				_id:groupby, 
				amount:{$sum:'$holding'}, 
				net:{$sum: '$paidmoney'}, 
				refund:{$sum:'$refund'}, 
				count:{$sum:1}, 
				profit:{$sum:'$profit'},
				settlements:{$sum:'$settlement'},
				// unpaid:{$sum:'$unpaid'}
			}},
			{$lookup:{
				localField:'_id.mchId',
				from:'users',
				foreignField:'_id',
				as:'userData'
			}},
			{$addFields:{
				dot:'$_id.dot'
				,mchId:'$_id.mchId'
				,currency:'$_id.currency'
			}},
			{$sort:{dot:-1}},
			{$project:{
				doc:{
					dot:'$dot',
					mchId:'$mchId',
					currency:'$currency',
					merchantName:'$userData.name',
					share:'$userData.share',
					amount:'$amount',
					profit:'$profit',
					refund:'$refund',
					count:'$count',
					time:'$time',
					succOrder:'$userData.succOrder', 
					orderCount: '$userData.orderCount',
					settlements:'$settlements',
					// unpaid:'$userData.profit'
				}
			}},
			{$group:{
				_id:null, 
				total:{$sum:1}, 
				total_count:{$sum:'$doc.count'}, 
				total_amount:{$sum:'$doc.amount'}, 
				total_refund:{$sum:'$doc.refund'}, 
				total_profit:{$sum:'$doc.profit'},
				settlements:{$sum:'$doc.settlements'},
				// unpaid:{$sum:'$doc.unpaid'}, 
				rows:{$push:'$doc'}
			}},
		]);
		if (sort) {
			var so={};
			so[sort]=(order=='asc'?1:-1);
			cursor=cursor.sort(so);
		}
		if (offset) {
			cursor=cursor.skip(offset);
		}
		if (limit) cursor=cursor.limit(limit);
		var ret =await cursor.toArray();
		callback(null, dedecimal(ret[0]));
	} catch(e) {callback(e)}
	}))
	router.all('/return', (req, res)=>{
		res.send('充值完成');
	})
	router.all('/done', async function(req, res) {
		debugout('done', req.headers, req.body)
		var params={...req.query, ...req.body};
		try {
			params=makeSign(params, await bestAccount());
			if (params.pay_md5sign!=params.sign) return res.send({err:'sign error'});
			await pify(makeItDone)(params.orderid, params);
			return res.send('OK');
		} catch(e) {
			debugout(e);
			res.send({err:e});
		}
	})
	function makeItDone(orderid, data, callback) {
		callback=callback||function(){};
		db.bills.findOne({_id:ObjectID(orderid)},function(err, orderData) {
			if (err || !orderData) callback('no such order');
			var net, succrate, total_amount=Number(data.amount||orderData.money), fee;
			db.users.updateOne({_id:orderData.userid}, {$inc:{succOrder:1}});
			confirmOrder(orderid, total_amount, net, (err)=>{
				if (!err) {
					updateOrder(orderid, {provider_result:data, providerOrderId:data.transaction_id||orderData._id.toHexString()});
				}
				if (err && err!='used order') return callback(err);
				callback(null);
			})
		});
	}

	const cooldown=[0, 0, 0, 3600*1000, 2*3600*1000, 8*3600*1000, 24*3600*1000];

	async function bestAccount() {
		let acc_arr =await db.hongtu_accounts.find({disable:{$ne:true}, name:{$ne:'测试'}}).toArray();
		if (acc_arr.length==0) return null;
		return acc_arr[0];
	}
	function retreiveClientIp(req) {
		return ip6addr.parse(req.headers['CF-Connecting-IP']||
		(req.headers['x-forwarded-for'] || '').split(',').pop() || 
		 req.connection.remoteAddress || 
		 req.socket.remoteAddress || 
		 req.connection.socket.remoteAddress||'127.0.0.1').toString({format:'v4'})
	}
	var last={money:null, acc:null, time:null};
	forwardOrder =async function(params, callback) {
		callback=callback||((err, r)=>{
			if (err) throw err;
			else return r
		});
		// return a link to order.html
		callback(null, {
			url:url.resolve(params._host, '/pvd/hongtu/casher')+'?id='+params.orderId
			,pay_type:params.type,
			money:params.money
		})
	}
	const template=ejs.compile(`
		<!DOCTYPE html>
		<body>
			<Form id="cc" style="display:none" method=post action="<%=api%>">
				<% Object.keys(order).forEach((key) => { %>
					<input type="hidden" name="<%=key%>" value="<%=order[key]%>">
				<% }) %>
			</Form>
			<script>
				window.onload=()=>{
					document.getElementById('cc').submit();
				}
			</script>
		</body>
	`);

	router.all('/casher', async (req, res)=>{
		var id=req.query.id;
		var basepath=argv.host||url.format({protocol:req.protocol, host:req.headers.host, pathname:path.resolve(req.baseUrl, '..')});
		if (basepath.slice(-1)!='/') basepath=basepath+'/';

		try {
			var order=await db.bills.findOne({_id:ObjectID(id)});
			var account =await bestAccount(order.money);
			if (!account) throw '没有可用的收款账户';
			debugout('use acc', account);
			// preorder
			uo_data={
				pay_memberid:account.memberid,
				pay_orderid:id,
				pay_applydate :localtimestring(new Date()),
				pay_bankcode: ({'WECHATPAYH5':'901', "ALIPAYH5":'904'}[order.type])||'901',
				pay_notifyurl: url.resolve(basepath, 'hongtu/done'),
				pay_callbackurl: order.return_url||url.resolve(basepath, 'hongtu/return'),
				pay_amount: order.money,
				pay_productname: objPath.get(order, 'desc', '充值'),
			};
			uo_data=makeSign(uo_data, account);
			updateOrder(id, {status:'进入收银台', lasttime:new Date()});
			// get signature
			res.send(template({order:uo_data, api:account.api}));
			// account的风险很大，付款不成功不算做用户的risky
		}catch(e) {
			debugout(e);
			return res.render('error', {err:errstr(e)})
		}
	});

	function errstr(e) {
		if (typeof e=='string') return e;
		if (typeof e.message=='string') return e.message;
		if (typeof e.msg=='string') return e.msg;
		if (typeof e.errmsg=='string') return e.errmsg;
		return JSON.stringify(e);
	}
	queryOrder=async (order, callback)=>{
		callback=callback||((err, r)=>{
			if (err) throw err;
			else return r
		});
		if (!order.wechat_unifiedorder) return callback('订单尚未提交');
		var orderId=order._id.toHexString();
		var orderInfo={
			outOrderId:order.merchantOrderId,
			orderId:orderId,
			money:order.money,
			currency:order.currency
		}
		if (order.used) return callback(null, Object.assign({
			received:order.paidmoney, 
			status:simplifyStatus(order.status),
			rate:order.wechat_result.rate/100000000
		}, orderInfo));

		var ret =await wx.payment.queryOrder(Object.assign({
			sub_mch_id:order.snappay_account.mch_id||order.snappay_account.sub_mch_id,
			out_trade_no:orderId
		}, config));
		updateOrder(orderId, {wechat_result:ret});
		if (ret.return_code!='SUCCESS' || ret.result_code!='SUCCESS') {
			return callback(null, Object.assign({status:'waitpay'}, orderInfo));
		}
		if (ret.trade_state=='SUCCESS') makeItDone(orderId, ret);
		return callback(null, Object.assign({
			received:ret.total_fee/100, 
			status:'success',
			rate:ret.rate/100000000
		}, orderInfo));
	}
	var today=new Date();
	setInterval(()=>{
		var now=new Date();
		if (now.getDate()!=today.getDate()) {
			today=now;
			// log all [in] in the accounts
			db.hongtu_accounts && db.hongtu_accounts.find().toArray().then((r)=>{
				var logs=r.map((ele)=>{return {net:ele.daily||0, gross:objPath.get(ele, ['gross', 'daily'])||0, t:today, accId:ele._id, accName:ele.name}});
				db.hongtu_accounts.updateMany({}, {$set:{daily:0, 'gross.daily':0}});
				db.hongtu_accounts.updateMany({daily:{$lt:500}}, {$set:{occupied:null}});
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
	
	// request.post('http://127.0.0.1:7008/pvd/snappay/done', {})

	return;
}
