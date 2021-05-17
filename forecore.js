const router=require('express').Router()
, httpf =require('httpf')
, {bestProvider, getProvider}=require('./providers')
, getDB=require('./db.js')
, ObjectId =require('mongodb').ObjectId
, verifyMchSign =require('./merchants').verifySign
, mchSign =require('./order').merSign
, pify =require('pify')
, url =require('url')
, path =require('path')
, {num2dec, decimalfy, dedecimal} =require('./etc')
, objPath=require('object-path')
, stringify=require('csv-stringify/lib/sync')
, argv=require('yargs').argv
, fse =require('fs-extra')
, JSZip =require('jszip')
, XLSX =require('xlsx')
, {getAccountBalance, getOutstandingBalance} =require('./financial_affairs')

const allPayType=['ALIPAYH5', 'WECHATPAYH5', 'UNIONPAYH5', 'ALIPAYAPP', 'WECHATPAYAPP', 'ALIPAYMINI', 'WECHATPAYMINI', 'ALIPAYPC', 'WECHATPAYPC', 'UNIONPAYPC'];

const {verifyAuth, verifyManager}=require('./auth.js');

exports.router=router;

function err_h(err, req, res, next) {
	if (err) {
		res.set({'Access-Control-Allow-Origin':'*', 'Cache-Control':'max-age=0'});
		res.send({err:err});
	}
	else next();
}
(function init(cb) {
	getDB(cb);
})(start);

function start(err, db) {
	if (err) return console.error(err);

	//currecny defined at https://intlmapi.alipay.com/gateway.do?service=forex_rate_file&sign_type=MD5&partner=2088921303608372&sign=75097bd6553e1e94aabc6e47b54ec42e, uppercase
	router.all('/order', verifyMchSign, err_h, httpf({partnerId:'?string', merchantId:'?string', userId:'string', outOrderId:'string', money:'number', currency:'string', provider:'?string', cb_url:'string', return_url:'?string', callback:true}, 
	async function(partnerId, merchantId, mchuserid, outOrderId, money, currency, providerName, cb_url, return_url, callback){
		// var userId=partnerId||merchantId;
		// if (!sign) return callback('sign must be set');
		// if (!userId) return callback('partnerId or merchantId must be set');
		// var user =await db.users.findOne({_id:userId});
		// var params=Object.assign(this.req.query, this.req.body);
		// if (merSign(user, params).sign!=sign) return callback('sign error, use sign-verify-url to find what is wrong');

		if (money==0) return callback('金额异常，能不为0');

		var params ={...this.req.params, ...this.req.body};
		var isDuplicatedOutOrderId=await db.bills.findOne({merchantOrderId:params.outOrderId}, {projection:{_id:1}});
		if (isDuplicatedOutOrderId) return callback('订单重复');

		var merchant =this.req.merchant;
		var provider;
		if (providerName) provider=getProvider(providerName);
		else provider=await bestProvider(money, merchant, {forecoreOnly:true, currency:currency});
		
		var req=this.req;
		var basepath=argv.host||url.format({protocol:req.protocol, host:req.headers.host, pathname:path.resolve(req.baseUrl, '..')});
		if (basepath.slice(-1)!='/') basepath=basepath+'/';

		params._host=basepath;
		params._req=req;
		// if (provider.checkParams) {
		// 	var paramsErr=provider.checkParams(params);
		// 	if (paramsErr) return callback(paramsErr);
		// }

		var orderId=new ObjectId();
		params.merchant=merchant;
		params.orderId=orderId.toHexString();
		try {
			// var [ret] =await Promise.all([
			await	db.bills.insertOne(decimalfy({
					_id:orderId
					, merchantOrderId:outOrderId
					, parnterId:partnerId
					, userid:merchant._id
					, merchantid:merchant.merchantid
					, merchantName:merchant.name
					, mer_userid:mchuserid
					, provider:provider.name||provider.internal_name
					, providerOrderId:''
					, share:merchant.share
					, payment:merchant.paymentMethod
					, money:money
					, paidmoney:-1
					, currency: currency
					, type: params.type
					, time:new Date()
					, lasttime:new Date()
					, lasterr:''
					, cb_url:cb_url
					, return_url:return_url
					, status:'prepare'})
					,{w:1})
			// ])
			var ret=await provider.forwardOrder(params);
			var upd={status:'forward'};
			if (ret.providerOrderId) upd.providerOrderId=ret.providerOrderId;
			db.bills.updateOne({_id:orderId}, {$set:upd});
			return callback(null, mchSign(merchant, {...ret, outOrderId, orderId:params.orderId}));
		}catch(e) {
			return callback(e)
		}
	}));
	router.all('/queryOrder', verifyMchSign, err_h, httpf({outOrderId:'string', partnerId:'string', callback:true},
	async function(outOrderId, partnerId, callback) {
		try {
			var order = await db.bills.findOne({merchantOrderId:outOrderId}, {projection:{share:0},readPreference:'secondaryPreferred'});
			if (!order) return callback('无此订单');
			if (order.merchantid!=partnerId) return callback('该订单不属于指定的partner');
			var pvd=getProvider(order.provider);
			if (pvd.queryOrder) {
				try {
					var data=await pvd.queryOrder(order);
					order.received=data && data.paidmoney;
				} catch(e) {
					order.err=e;
				}
			} else order.received=order.paidmoney;
			order.provider=undefined;
			order.snappay_account=undefined;
			order.snappay_data=undefined;
			order.outOrderId=order.merchantOrderId
			order.paidmoney=undefined;
			order.settleDate=order.checkout;
			order.checkout=undefined;
			callback(null, dedecimal(order));
		}catch(e) {callback(e)}
	}))
	router.all('/exchangeRate', verifyMchSign, err_h, httpf({currency:'string', payment:'?string', callback:true}, async function(currency, payment, callback) {
		try {
			callback(null, await getProvider('snappay-toll').exchangeRate(currency, payment||'WECHATH5'));
		}catch(e) {callback(e)}
	}));
	router.all('/refund', verifyMchSign, err_h, httpf({partnerId:'string', outOrderId:'string', money:'number', callback:true}, async function(partnerId, outOrderId, money, callback) {
		try {
			var order=await db.bills.findOne({merchantOrderId:outOrderId});
			if (!order) return callback('无此订单');
			if (order.merchantid!=partnerId) return callback('该订单不属于指定的partner');
			if (!order.provider || !order.paidmoney) return callback('订单尚未支付');
			var pvd=getProvider(order.provider);
			if (!pvd) return callback('订单尚未支付');
			if (!pvd.refund) return callback('提供方不支持退单');
			var merchant=await db.users.findOne({_id:partnerId});
			var result=await pvd.refund(order, money, merchant);
			// await db.bills.updateOne({_id:order._id}, {$set:{status:'refund'}}, {w:1});
			callback(null, result);
		} catch(e) {callback(e)}
	}));
	router.all('/disburse', verifyMchSign, err_h, httpf({partnerId:'string', outOrderId:'string', money:'number', bank:'string', branch:'?string', owner:'string', account:'string', province:'?string', city:'?string', cb_url:'string', callback:true}, 
	async function(partnerId, outOrderId, money, bank, branch, owner, account, cb_url, province, city, callback) {
		var req=this.req;
		var basepath=argv.host||url.format({protocol:req.protocol, host:req.headers.host, pathname:path.resolve(req.baseUrl, '..')});
		if (basepath.slice(-1)!='/') basepath=basepath+'/';

		var session=db.mongoClient.startSession();
		try {
			var time=new Date();
			var mer=this.req.merchant;
			var {mdr, fix_fee}=objPath.get(mer, ['paymentMethod', 'disbursement'], {mdr:0, fix_fee:0});
			var commission=Number((money*mdr+fix_fee).toFixed(2));

			var provider=await bestProvider(money, mer);
			if (!provider) throw 'no provider found ';
			if (!provider.disburse) throw 'the provider do not support disbursement';
			var providerName=provider.name, orderId, providerOrderId;

			await session.withTransaction( async ()=>{
				// lock the account & outstandingAccount
				await db.locks.findOneAndUpdate({_id:mer._id}, {$set:{disburseLock:{account:mer._id, pseudoRandom: ObjectId() }}}, {session});
				var accountBalance=await getAccountBalance(mer._id);
				if (accountBalance< (money+commission)) throw 'balance is not enough';
				var orderId=new ObjectId();
				var [,,providerOrderId]= await Promise.all([
					db.bills.insertOne({_id:orderId, merchantOrderId:outOrderId, partnerId, merchantName:mer.name, userid:mer._id, money:money, paymentMethod:'disbursement', bank, branch, owner, account, provider:providerName, province, city, payment:mer.paymentMethod, cb_url, time}, {session}),
					db.accounts.insertOne({account:mer._id, balance:num2dec(-money-commission), payable:num2dec(money), commission:num2dec(commission), time, provider:providerName, ref_id:orderId, transactionNum:1}, {session}),
					provider.disburse(orderId.toString(), bank, owner, account, money, branch, province, city, basepath)
					// db.outstandingAccounts.insertOne({account:providerName, balance:num2dec(-money), payable:num2dec(money), time, ref_id:insertedId})
				]);
			},{
				readPreference: 'primary',
				readConcern: { level: 'local' },
				writeConcern: { w: 'majority' }
			})
			callback(null, {outOrderId, orderId, providerOrderId, money, bank, branch, owner, account, province, city});
		} catch(e) {
			callback(e);
		} finally {
			await session.endSession();
		}
	}));
	router.all('/settlements', verifyAuth, httpf({from:'?date', to:'?date', sort:'?string', order:'?string', offset:'?number', limit:'?number', callback:true}, 
	async function(from, to, sort, order, offset, limit, callback) {
		try {
			var cond={};
			if (this.req.auth.acl=='merchant') cond.mchId=this.req.auth._id;
			if (from) cond.time={$gte:from};
			if (to) objPath.set(cond, 'time.$lte', to);
			var cur=db.settlements.find(cond, {readPreference:'secondaryPreferred', projection:{relative:0}});
			var so={time:-1};
			if (sort) {
				var so={};
				so[sort]=(order=='asc'?1:-1);
			}
			cur=cur.sort(so);
			if (offset) cur=cur.skip(offset);
			if (limit) cur=cur.limit(limit);

			var dbBills=db.db.collection('bills', {readPreference:'secondaryPreferred'});
			var cond2={};
			if (cond.mchId) cond2.userid=cond.mchId;
			cond2.status={$in:['SUCCESS', 'refundclosed', 'refund', 'complete', '已支付', '通知商户', '通知失败']}
			var [c, rows, unpaidset]=await Promise.all([
				cur.count(), 
				cur.toArray(), 
				dbBills.aggregate([
					{$match:cond2},
					{$addFields:{
						value:{
							$cond:{
								if: {$gt:['$money', 0]},
								then : {
									$round:[
										{
											$multiply:[
												{$round:[{$multiply:['$paidmoney', '$share']}, 2]}, 
												{$subtract:[1, {$ifNull:['$pc_fee', 0.015]}]}
											]
										},
										2
									]
								},
								else :'$money'
							}
						}
					}},
					{$project:{
						settlement:{
							$cond:[
								{$ne:[{$ifNull:['$checkout', null]}, null]},
								'$value',
								0
							]
						},
						unpaid:{
							$cond:[
								{$eq:[{$ifNull:['$checkout', null]}, null]},
								'$value',
								0
							]
						}
					}},
					{$group:{
						_id:1,
						settlement:{$sum:'$settlement'},
						unpaid:{$sum:'$unpaid'}
					}}
				]).toArray()
			]);
			return callback(null, dedecimal({total:c, settlements:objPath.get(unpaidset, [0, 'settlement'], 0), unpaid:objPath.get(unpaidset, [0, 'unpaid'], 0), rows:rows}));
		} catch(e) {
			callback(e);
		}
	}))
	router.all('/downloadOrdersInSettlement', verifyAuth, httpf({id:'string', no_return:true}, async function(id) {
		var res=this.res;
		try {
			var {relative}=await db.settlements.findOne({_id:ObjectId(id)}, {projection:{relative:1}});
			if (!relative) throw '没有数据';

			var ws=XLSX.utils.json_to_sheet(relative);
			var wb=XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(wb, ws, "SheetJS");
			res.set({
				'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition':`inline; filename="download-${Date.now()}.xlsx"`,
				'Cache-Control': 'no-cache',
				'Pragma': 'no-cache'
			})
			.send(XLSX.write(wb, {type:'buffer', bookType:'xlsx'}));		
		} catch(e) {
			res.send({err:e})
		}

	}))
	router.all('/settleOrders', verifyMchSign, err_h, httpf({partnerId:'string', from:'date', to:'date', sort:'?string', order:'?string', offset:'?number', limit:'?number', callback:true}, async function(partnerId, from, to, sort, order, offset, limit, callback) {
		try {
			var cond={mchId:partnerId};
			if (from) cond.time={$gte:from};
			if (to) objPath.set(cond, 'time.$lte', to);
			var cur=db.settlements.find(cond, {projection:{amount:1, currency:1, checkout:1, mchId:1, mchName:1}, readPreference:'secondaryPreferred'});
			if (sort) {
				var so={};
				so[sort]=(order=='asc'?1:-1);
				cur=cur.sort(so);
			}
			if (offset) cur=cur.skip(offset);
			if (limit) cur=cur.limit(limit);
			var [c, rows]=await Promise.all([cur.count(), cur.toArray()]);
			var dbBills=db.db.collection('bills', {readPreference:'secondaryPreferred', readConcern:{level:'majority'}});
			var actions=rows.map((item)=>{
				return new Promise((resolve, reject)=>{
					dbBills.find({checkout:item.time, userid:partnerId}, {projection:{_id:1}})
					.toArray()
					.then((ids)=>{
						item.relative=ids.map(obj=>obj._id);
						resolve();
					})
					.catch((e)=>{
						reject(e);
					});
				})
			});
			await Promise.all(actions);
			return callback(null, {total:c, rows:rows});		
		} catch(e) {
			callback(e);
		}
	}));
	router.all('/admin/refund', verifyAuth, httpf({orderid:'string', callback:true}, async function(orderid, callback) {
		try {
			var cond={_id:ObjectId(orderid)};
			if (this.req.auth.acl!='admin' && this.req.auth.acl!='mamager') {
				cond.userid=this.req.auth._id;
			}
			var order=await db.bills.findOne(cond);
			if (!order) return callback('无此订单');
			if (order.status=='refund') return callback('已经退单');
			if (!order.used && ['进入收银台'].indexOf(order.status)<0) return callback('订单尚未提交');
			dedecimal(order);
			var pvd=getProvider(order.provider);
			if (!pvd) return callback('订单尚未支付');
			if (!pvd.refund) return callback('提供方不支持退单')
			var result=await pvd.refund(order, order.paidmoney, await db.users.findOne({_id:order.userid}));
			// await db.bills.updateOne({_id:order._id}, {$set:{status:'refund'}}, {w:1});
			callback(null, result);
		} catch(e) {callback(e)}
	}));
	router.all('/admin/invalidOrder', verifyAuth, verifyManager, httpf({orderid:'string', callback:true}, async function(orderid, callback) {
		try {
			var {order}=await db.bills.findOneAndUpdate({_id:ObjectId(orderid)}, {status:'作废'});
			if (!order) return callback('无此订单');
			callback(null);
		} catch(e) {callback(e)}
	}));
	router.all('/admin/settlements', verifyAuth, verifyManager, httpf({from:'?date', to:'?date', sort:'?string', order:'?string', offset:'?number', limit:'?number', callback:true}, async function(from, to, sort, order, offset, limit, callback) {
		try {
			var content=await fse.readdir(path.join(__dirname, 'fore/payments'));
			content=content.filter(num => !isNaN(num));
			if (from) {
				from=from.getTime();
				content.splice(0, content.findIndex((ele)=>ele>=from));
			}
			if (to) {
				to=to.getTime();
				content.splice(content.findIndex((ele)=>ele>to));
			}
			var total=content.length;
			if (order=='asc') {
				content.sort((a, b)=>b-a);
			}
			if (offset) {
				content.splice(0, offset);
			}
			if (limit) {
				content.splice(limit);
			}
			callback(null, {total:total, rows:content});
		} catch(e) {
			callback(e);
		}
	}))
	router.all('/admin/downloadSettle', verifyAuth, verifyManager, async function(req, res) {
		var params=Object.assign(req.query, req.body);
		if (!params.id) return res.render('error', {err:'必须指定id'});
		var filenames=await fse.readdir(path.join(__dirname, 'fore/payments', params.id));
		if (filenames.length==0) return res.render('error', {err:'没有相应的数据'});
		var zip=new JSZip();
		for (var i=0; i<filenames.length; i++) {
			var fn=filenames[i];
			zip.file(fn, await fse.readFile(path.join(__dirname, 'fore/payments', params.id, fn)));
		}
		res.attachment(params.id+'.zip');
		zip.generateNodeStream({type:'nodebuffer',streamFiles:true})
		.pipe(res)
		.on('finish', ()=>{
			res.end();
		});
	})
	router.all('/renderCC', function(req, res) {
		res.render('cashcounter', {init_config:{init_config:1}, payData:{payData:1}, return_url:'dummyAddress'});
	})
	router.all('/dailyreport', verifyAuth, httpf({partnerId:'?string', from:'?date', to:'?date', timezone:'?string', sort:'?string', order:'?string', offset:'?number', limit:'?number', callback:true}, async function(partnerId, from, to, timezone, sort, order, offset, limit, callback) {
		try {
			var cond={testOrder:{$ne:true}};
			if (this.req.auth.acl=='merchant') cond.userid=this.req.auth._id;
			else if (partnerId) cond.userid=partnerId;
			if (from) cond.time={$gte:from};
			if (to) objPath.set(cond, 'time.$lte', to);
			var dot={$dateToString:{date:'$time', format:'%Y%m%d'}};
			if (timezone) dot.$dateToString.timezone=timezone;
			// cond.status={$in:['SUCCESS', 'refundclosed', 'refund', 'complete', '已支付', '通知商户', '通知失败']}
			var dbBills=db.db.collection('bills', {readPreference:'secondaryPreferred', readConcern:{level:'majority'}});
			var cur=dbBills.aggregate([
				{$match:cond},
				{$addFields:{
					payOrder: {
						$cond:{
							if : {$ne:['$type', 'refund']},
							then : 1,
							else : 0
						}
					},
					succ:{
						$cond:{
							if:{$and:[{$eq:['$used', true]}, {$ne:['$type', 'refund']}]},
							then :1,
							else :0
						}
					}
				}},
				{$addFields:{
					value:{
						$cond:{
							if: {$eq:['$succ', 1]},
							then :  {$round:[{$multiply:['$paidmoney', '$share']}, 2]},
							else :0
						}
					},
					dot:dot
				}},
				{$project:{
					dot:'$dot',
					paidmoney:{
						$cond:{
							if : {$eq:['$succ', 1]},
							then : '$paidmoney',
							else :0
						}
					},
					payOrder:'$payOrder',
					succ:'$succ',
					holding:{
						$cond:{
							if: {$eq:['$payOrder', 1]},
							then : {$round:[
								{$multiply:['$value',{$subtract:[1, {$ifNull:['$pc_fee', 0.015]}]}]},
								2
							]},
							else : 0
						}
					},
					refund:{
						$cond:{
							if: {$eq:['$payOrder', 0]},
							then :'$money',
							else :0
						}
					},
				}},
				{$group:{
					_id:'$dot',
					paidmoney:{$sum:'$paidmoney'},
					holding:{$sum:'$holding'},
					refund:{$sum:'refund'},
					succ:{$sum:'$succ'},
					orderCount:{$sum:'$payOrder'},
				}},
				{$sort:{_id:-1}},
				{$group:{
					_id:null, 
					total: {$sum:1},
					total_recieved: {$sum:'$paidmoney'},
					total_holding:{$sum:'$holding'},
					total_refund:{$sum:'$refund'},
					rows:{$push:{dot:'$_id', paidmoney:'$paidmoney', holding:'$holding', refund:'$refund', succ:'$succ', orderCount:'$orderCount'}}
				}}
			]);
			if (sort) {
				var so={};
				so[sort]=(order=='asc'?1:-1);
				cur=cur.sort(so);
			}
			if (offset) cur=cur.skip(offset);
			if (limit) cur=cur.limit(limit);
			var [set]=await cur.toArray();
			return callback(null, dedecimal(set));		
		} catch(e) {
			callback(e);
		}
	}))
}

if (module==require.main) {
	// debug

}