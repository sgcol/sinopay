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
, CsvParse=require('csv-parse')
, pify =require('pify')
, JSZip =require('jszip')
, multer=require('multer')
, ip6addr=require('ip6addr')
, argv=require('yargs')
	.describe('wxhost', 'a base url used to access wechat func')
	.describe('wxproxy', 'proxy to access wechat interfaces, ip[:port]')
	.argv
, { Wechat, Payment } = require('gy-wechat-jssdk')
, debugout =require('debugout')(argv.debugout)
, bodyParser =require('body-parser')
, fs =require('fs-extra')
, path =require('path')
, cookieParser = require('cookie-parser')
, XLSX =require('xlsx')
, moment =require('moment')


const _noop=function() {};
const supportedType={'WECHATPAYH5':{type:'WECHATPAY', method:'pay.h5pay'}, 'ALIPAYH5':{type:'ALIPAY', method:'pay.h5pay'}}
, supportedCurrency=['CAD', 'USD'];

var config = {
	//set your oauth redirect url, defaults to localhost
	"wechatRedirectUrl": `${argv.wxhost}/wechat/oauth-callback`,
	//"wechatToken": "wechat_token", //not necessary required
	"appId": "wxec73fe538fbc098e",
	"appSecret": "748ab991ec1ca243670f811bb86e2eee",
	card: true, //enable cards
	payment: true, //enable payment support
	merchantId: '1497853112', //
	paymentKey: '748ab991ec1ca243670f811bb86e2eee', //API key to gen payment sign
	paymentCertificatePfx: fs.readFileSync(path.join(__dirname, 'snappay.p12')),
	//default payment notify url
	paymentNotifyUrl: `${argv.wxhost}/wechatpay/pvd/snappay_base/wechat/done`,
};
if (argv.wxproxy) {
	var wxproxy=argv.wxproxy;
	Object.assign(config, {
		ticketUrl: `${wxproxy}/api.weixin.qq.com/cgi-bin/ticket/getticket`,
		accessTokenUrl: `${wxproxy}/api.weixin.qq.com/cgi-bin/token`,
		oAuthUrl: `${wxproxy}/open.weixin.qq.com/connect/oauth2/authorize`,
		paymentUrls : {
			UNIFIED_ORDER: `${wxproxy}/api.mch.weixin.qq.com/pay/unifiedorder`,
			QUERY_ORDER: `${wxproxy}/api.mch.weixin.qq.com/pay/orderquery`,
			CLOSE_ORDER: `${wxproxy}/api.mch.weixin.qq.com/pay/closeorder`,
			// REFUND: `${wxproxy}/api.mch.weixin.qq.com/secapi/pay/refund`,
			QUERY_REFUND: `${wxproxy}/api.mch.weixin.qq.com/pay/refundquery`,
			DOWNLOAD_BILL: `${wxproxy}/api.mch.weixin.qq.com/pay/downloadbill`,
			SHORT_URL: `${wxproxy}/api.mch.weixin.qq.com/tools/shorturl`,
			REPORT: `${wxproxy}/api.mch.weixin.qq.com/payitil/report`,
			SIGN_KEY: `${wxproxy}/api.mch.weixin.qq.com/pay/getsignkey`,
			DOWNLOAD_FUND_FLOW: `${wxproxy}/api.mch.weixin.qq.com/pay/downloadfundflow`,
			BATCH_QUERY_COMMENT:
			`${wxproxy}/api.mch.weixin.qq.com/billcommentsp/batchquerycomment`,
			QUERY_SETTLEMENT: `${wxproxy}/api.mch.weixin.qq.com/pay/settlementquery`,
			// yes this is correct, spelling "exchange" correctly is difficult 🤷️
			QUERY_EXCHANGE_RATE: '${wxproxy}/api.mch.weixin.qq.com/pay/queryexchagerate',
		}
	})
}
const wx = new Wechat(config);

// Number.prototype.pad = function(size) {
// 	var s = String(this);
// 	while (s.length < (size || 2)) {s = "0" + s;}
// 	return s;
// }
function simplifyStatus(status) {
	if (status=='complete' ||status=='通知商户' || status=='通知失败') return 'success';
	if (status=='refund') return 'refund';
	return 'waitpay';
}

// function pad(n, size) {
// 	const temp='00000000000000';
// 	size=size||2;
// 	return (temp+n).slice(-size);
// }

// const timestring =(t)=>{
// 	return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth()+1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`;
// }
const shortDate =(t)=>{
	// var str =t.toLocaleString('zh-Hans-CN', { timeZone:'Asia/Shanghai', hourCycle:'h24', year:'numeric', month:'2-digit', day:'2-digit'})
	// return str.replace(/\//g, '');
	return moment(t).utcOffset(8).format('YYYYMMDD');
}

const localtimestring =(t)=>{
	return `${t.getFullYear().pad(4)}-${(t.getMonth()+1).pad()}-${t.getDate().pad()} ${t.getHours().pad()}:${t.getMinutes().pad()}`;
}

// const makeSign=function(data, account, options) {
// 	delete data.sign;
// 	var message ='', o=Object.assign({app_id:account.app_id, version:'1.0', format:'JSON', sign_type:'MD5', charset:'UTF-8', timestamp:timestring(new Date())}, data);
// 	Object.keys(o).sort().map((key)=>{
// 		if (key=='sign') return;
// 		if (key=='sign_type' && ((!options) || (!options.includeSignType))) return;
// 		if (!o[key]) return;
// 		message+=''+key+'='+o[key]+'&';
// 	})
// 	var encoded_sign=md5(message.substr(0, message.length-1)+account.key);
// 	o['sign'] = encoded_sign.toLowerCase();
// 	return o;
// }

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
		name:'结算清单',
		url:'settlements.ae'
	}
]

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
exports.name='snappay_base';
exports.params=['accountNumber', 'customName', 'customNumber', 'timezone'];
// exports.options=[{name:'通道', values:['ALIPAYH5', 'WECHATPAYH5']}];
exports.forecore=true;
var refund=function() {
	var callback=arguments[arguments.length-1];
	if (typeof callback=='function') callback('启动中');
}
exports.refund=function() {
	return refund.apply(null, arguments);
}
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

//'merchant_no', 'app_id', 'key', 'supportedCurrency'

const _auth=require('../auth.js'), aclgt=_auth.aclgt, verifyManager=_auth.verifyManager, verifyAdmin=_auth.verifyAdmin, getAuth=_auth.getAuth, verifyAuth=_auth.verifyAuth;

const defaultBankData={
	clientNumber:'4806920000'
	, clientName: 'SnapPay Inc.'
	, RoyalBankProcessingCentre:'00320'
	, transactionCode:'729'
	, CADFinancialInstitution:'088855555'
}
Number.prototype.pad=function(size) {
	var s=String(this);
	return s.padStart(size, '0');
}
function daysIntoYear(date){
	return Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / 24 / 60 / 60 / 1000);
}
function transaction(arr, dates, setting, warning, c_record) {
	var {transactionCode, clientName,clientNumber}=setting;
	var total=0, ret='';
	for (var i=0; i<(arr.length); i++) {
		var {amount, accountNumber, customName, customNumber, mchName}=Object.assign({accountNumber:'', customName:'', customNumber:''}, arr[i]);
		if (!amount) {
			amount=0;
			warning.push(`C${c_record+1}/${i+1}支付金额异常，已调整为0`);
		}
		if (!customName) {
			customName='';
			warning.push(`C${c_record+1}/${i+1} customName`);
		} else if (customName.length>30) {
			customName=customName.substring(0, 30);
			warning.push(`${customName} 超过30Bytes，截短`);
		}
		if (!accountNumber) {
			accountName='';
			warning.push(`C${c_record+1}/${i+1} ${mchName} accountNumber为空`);
		} else if (accountNumber.length>20) {
			accountNumber=accountNumber.substring(0, 20);
			warning.push(`C${c_record+1}/${i+1} ${mchName} accountNumber超过20byts`)
		}
		if (!customNumber) {
			customNumber='XXXXXXXXXX';
			warning.push(`C${c_record+1}/${i+1} ${mchName} customNumber`);
		} else if (customNumber.length>10) {
			customNumber=customNumber.substring(0, 10);
			warning.push(`C${c_record+1}/${i+1} ${mchName} customNumber超过10byts`)
		}
		// var money=Math.floor(Math.random()*100000), accountNumber=randstring(12), customName=randstring(5), customNumber=randstring(19);
		amount=Math.floor(amount*100);
		total+=amount;
		var trans=`${transactionCode}${(''+amount).padStart(10, '0')}${dates}0${accountNumber.padEnd(20, ' ')}${''.padEnd(25, '0')}${clientName.padEnd(15, ' ')}${customName.padEnd(30, ' ')}${clientName.padEnd(30, ' ')}${clientNumber}${customNumber.padEnd(19, ' ')}${''.padEnd(9, '0')}${''.padEnd(12, ' ')}${'settlement'.padEnd(15, ' ')}${''.padEnd(35, ' ')}`;
		ret+=trans;
	}
	return {str:ret.padEnd(1464-24, ' '), total:total};
}

function renameKeys(o, map) {
	var ret={};
	map.forEach((old_key, new_key)=>{
		var k=old_key.split('|'), v=null;
		for (var i=0; i<k.length; i++) {
			v=objPath.get(o, k[i]);
			if (v) break;
		}
		ret[new_key]=v;
	})
	return ret;
}
function makeBTF(currency, arr, testMode, setting, warning) {
	setting=Object.assign(defaultBankData, setting)
	var {clientNumber, RoyalBankProcessingCentre} =setting;
	var year=String(new Date().getUTCFullYear()), doy=daysIntoYear(new Date(new Date().toLocaleString('en-US', {timeZone:'America/Toronto', dateStyle:'short'}).split(',')[0])), dates=`${year.substring(year.length-3)}${doy.pad(3)}`;
	if (testMode) {
	  var uniqueTag='TEST';
	} else {
	  var now=Date.now(), sec=String(Math.floor(now/10000)), uniqueTag=sec.substring(sec.length-4);
	}

	var out=`$$AA01CPA1464[${testMode?'TEST':'PROD'}[NL$$\r\n`, count=0;
	// first, a A record
	if (!clientNumber||clientNumber.length!=10) warning.push('clientNumber必须是10Bytes的字符串');
	if (!RoyalBankProcessingCentre||RoyalBankProcessingCentre.length!=5) warning.push('RoyalBankProcessingCentre必须是5Bytes的字符串');
	out+=`A${(++count).pad(9)}${clientNumber}${uniqueTag}${dates}${RoyalBankProcessingCentre}${''.padEnd(20, ' ')}${currency}${''.padEnd(1406, ' ')}\r\n`;
	// next a C record
	var total=0, c_record=0;;
	for (var i=0; i<arr.length; i+=6) {
		out+=`C${(++count).pad(9)}${clientNumber}${uniqueTag}`
		var ret =transaction(arr.slice(i, i+6), dates, setting, warning, (++c_record));
		out+=ret.str+'\r\n';
		total+=ret.total;
	}
	// finally, Z record
	out+=`Z${(++count).pad(9)}${clientNumber}${uniqueTag}${''.padEnd(22, '0')}${(''+total).padStart(14, '0')}${arr.length.pad(8)}${''.padEnd(1396, '0')}`
	out+='\r\n';
	return out;
}
// get which those accounts availble
var snappayGlobalSetting, snappayFee;
(function start(cb) {
	getDB((err, db)=>{
		if (err) return cb(err);
		async.parallel([
			function getSetting(cb) {
				db.snappay_base_settings.findOne({}, (err, r)=>{
					cb(err, r||{});
				})
			}
		],
		function (err, results) {
			if (!err) {
				snappayGlobalSetting=results[0];
				snappayFee=snappayGlobalSetting.tollfee||0.007;
			}
			cb(err, db);
		})
	});
})(init);
function init(err, db) {
	if (err) return console.log('启动snappay_base.pd失败', err);
	router.all('/updateAccount', verifyAuth, verifyManager, httpf({_id:'?string', mch_id:'?string', name:'?string', supportedCurrency:'?string', disable:'?boolean', callback:true}, 
	function(id, mch_id, name, supportedCurrency, disable, callback) {
		var upd={}
		mch_id && (upd.mch_id=mch_id);
		name && (upd.name=name);
		supportedCurrency &&(upd.supportedCurrency=supportedCurrency);
		disable!=null && (upd.disable=disable);
		var defaultValue={createTime:new Date()};
		id=id?ObjectID(id):new ObjectID();
		db.snappay_base_accounts.updateOne({_id:id}, {$set:upd,$setOnInsert:defaultValue}, {upsert:true, w:1}, (err, r)=>{
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
		var cur=db.snappay_base_accounts.find(cond);
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
		db.snappay_base_accounts.deleteOne({_id:ObjectID(id)}, {w:1}, (err, r)=>{
			if (err) return callback(err);
			if (r.deletedCount<1) return callback('no such account');
			callback();
		});
	}));
	var storage = multer.memoryStorage()
	var upload = multer({ storage: storage });

	router.post('/uploadAccounts', verifyAuth, verifyManager, upload.single('file'), (req, res)=>{
		var now=new Date();
		CsvParse(req.file.buffer, {columns:true}, async (err, accounts)=>{
			if (err) return res.send({err:err});
			var count=0;
			if (accounts.length>10000) return res.send({err:'记录数超过了10000，每次提交请减少到10000以内'})
			for (var i=0; i<accounts.length; i++) {
				var acc=accounts[i];
				if (!(acc.mch_id &&acc.supportedCurrency)) {
					accounts[i]=accounts[accounts.length-1];
					accounts.pop();
					i--;
					continue;
				}
				acc.name=acc.name||acc.mch_id;
				acc.createTime=now;
				// acc._id=acc.merchant_no;
				count++;
			}
			if (accounts.length) {
				try {
					var r=await db.snappay_base_accounts.insertMany(accounts, {w:1,ignoreUndefined:true});
					res.send({count:r.insertedCount});
				} catch(e) {res.send({err:e})}
			}else res.send({count:0});
		})
	});
	router.all('/BTF', verifyAuth, verifyManager, httpf({
		from:'date'
		, to:'date'
		, testMode:'boolean'
		, CADFinancialInstitution: "?string"
		, RoyalBankProcessingCentre: "?string"
		, clientName: "?string"
		, clientNumber: "?string"
		, transactionCode: "?string"
		, callback:true
	}
	, async function(from, to, testMode, CADFinancialInstitution, RoyalBankProcessingCentre, clientName,clientNumber,transactionCode, callback) {
		const session=db.mongoClient.startSession(), 
		opt={
			readPreference: 'secondaryPreferred',
			readConcern: { level: 'majority' },
			writeConcern: { w: 'majority' }
		}
		var checkoutTime=new Date();
		try {
			var setting=await db.snappay_base_settings.findOne({_id:'setting'});
			setting=setting||{};
			var upd=Object.assign(this.req.query, this.req.body);
			upd.from=upd.to=upd.testMode=undefined;
			var warning=[];
			if (!testMode) {
				upd.lastExportTime=to;
			}
			await session.withTransaction(async ()=>{
				// lock the transaction;
				await db.bills.findOneAndUpdate({_id:'btf_lock'}, {$set:{time:checkoutTime, lock:new ObjectID()}}, {upsert:true});
				var cond={time:{$lt:to}, provider:'snappay_base', status:{$in:['SUCCESS', 'refundclosed', 'refund', 'complete', '已支付', '通知商户', '通知失败']}, checkout:null};
				var rec=await db.bills.find(cond).sort({time:1}).toArray();
				if (!rec.length) return callback('没有记录');
				// var rec=await dbBills.find({checkout:checkoutTime}).sort({time:1}).toArray();
				var stat=await db.bills.aggregate([
					{$match:cond},
					{$addFields:{holding:{$multiply:['$paidmoney', '$share']}}},
					{$group:{
						_id:{currency:'$currency', mchId:'$userid'}
						, amount:{$sum:{$round:['$holding', 2]}}
					}},
					{$lookup:{
						localField:'_id.mchId',
						from:'users',
						foreignField:'_id',
						as:'userData'
					}}
				]).toArray()
				db.snappay_base_settings.updateOne({_id:'setting'}, {$set:upd}, {upsert:true});
				dedecimal(rec);dedecimal(stat);
				var mapper=new Map([
					['Created Time', 'time']
					, ['Completed Time', 'lasttime']
					, ['Trans No.', '_id']
					, ['Original.Trans No.', 'relative|_id']
					, ['Merchant Order No.', 'merchantOrderId']
					, ['Channel trans No.', 'wechat_result.transaction_id']
					, ['Type', 'wechat_result.trade_type']
					, ['Status', 'status']
					, ['Pay Mode Name', 'payment_method']
					, ['Store ID', 'blank']
					, ['Device EN', 'blank']
					, ['Cashier ID', 'blank']
					, ['Reference No.', 'blank']
					, ['Batch No.', 'blank']
					, ['Vouncher No.', 'blank']
					, ['Merchant ID', 'userid']
					, ['Terminal ID', 'blank']
					, ['Agent ID', 'unknown']
					, ['Trans Amount', 'paidmoney']
					, ['Order Amount', 'money']
					, ['Discount by merchant on channel', 'blank']
					, ['Discount by merchant by acquiring', 'blank']
					, ['Channel Disc', 'blank']
					, ['Total Paid', 'paidmoney']
					, ['Net Amount', 'net']
					, ['Service Fee%', 'snappayFee']
					, ['Tip', 'blank']
					, ['Tax', 'blank']
					, ['Merchant Service Fee', 'fee']
					, ['SnapPay Service Fee', 'sp_fee']
					, ['Apay Service Fee', 'ap_fee']
					, ['Payment Channel Fee', 'pc_fee']
					, ['Custom Service Fee', 'blank']
					, ['Currency', 'currency']
					, ['Exchange Rate', 'wechat_result.rate_value']
					, ['Time Zone', 'blank']
				])
				var renamed_rec =rec.map((item)=>{
					var snappay_result=item.snappay_result;
					item.snappay_result=undefined;
					Object.assign(item, snappay_result);
					item._id=item._id.toHexString()
					item.snappayFee=''+(snappayFee*100).toFixed(2)+'%';
					if (item.paidmoney>0) {
						item.sp_fee=item.paidmoney*(item.sp_fee||snappayFee);
						item.ap_fee=item.paidmoney*(item.ap_fee || 0.006);
						item.net=Number((item.paidmoney*item.share).toFixed(2));
						item.fee=(item.paidmoney-item.net);
						// adjust sp_fee & ap_fee;
						var t=item.sp_fee+item.ap_fee;
						item.sp_fee=item.fee*item.sp_fee/t;
						item.ap_fee=item.fee*item.ap_fee/t;
						item.pc_fee=item.net*item.pc_fee;
						objPath.set(item, 'wechat_result.rate_value', Number(objPath.get(item, 'wechat_result.rate_value', 0))/100000000)
					} else {
						item.sp_fee=item.ap_fee=item.fee=0;
						item.net=item.paidmoney;
						item.pc_fee=item.net*item.pc_fee;
					}
					return renameKeys(item, mapper);
				});
				var BTFs=new Map();
				stat.forEach((item)=>{
					var arr=BTFs.get(item._id.currency);
					if (!arr) {
						arr=[];
						BTFs.set(item._id.currency, arr);
					}
					if (item.amount>0) {
						arr.push(Object.assign({
							amount:item.amount,
							currency:item._id.currency,
							mchId:item._id.mchId,
							mchName: objPath.get(item, ['userData', 0, 'name'], ''),
							pc_fee: objPath.get(item, ['userData', 0, 'pc_fee'], 0.015)
						}, objPath.get(item, ['userData', 0, 'providers', 'snappay_base'], {})));
					} else {
						objPath.push(cond, 'userid.$nin', item._id.mchId);
					}
				});

				var zip=new JSZip(), files=[], content;
				BTFs.forEach((arr, currency)=>{
					content=makeBTF(currency, arr, testMode, setting, warning);
					zip.file(`${currency}.txt`, content);
					files.push({name:`${currency}.txt`, content:content});
				})
				if (warning.length) {
					content=warning.join('\r\n')
					zip.file('warning.txt', content);
					files.push({name:'warning.txt', content:content})
				}
				// content=stringify(rec, 
				// 	{
				// 		header:true
				// 		, cast:{
				// 			date:(v)=>{
				// 				var t=Math.floor(v.getTime()/1000);
				// 				return ((t+8*3600)/86400+70*365+19).toFixed(5);
				// 			}
				// 		}
				// 		, columns:Array.from(mapper.keys())
				// 	}
				// )
				var wb=XLSX.utils.book_new();
				var ws=XLSX.utils.json_to_sheet(renamed_rec);
				XLSX.utils.book_append_sheet(wb, ws, "SheetJS");
				var content=XLSX.write(wb, {type:'buffer', bookType:'xlsx'})
				zip.file('orders.xlsx', content);
				files.push({name:'orders.xlsx', content:content});
				var v =await zip.generateAsync({type : "nodebuffer"});
				callback(null, {src:v.toString('base64')});

				if (!testMode) {
					await db.bills.updateMany(cond, {$set:{checkout:checkoutTime}});
					BTFs.forEach((arr)=>{
						db.settlements.insertMany(
							arr.map(v=>
							Object.assign(
								{time:checkoutTime}, 
								v, 
								{
									relative:rec.map((item)=>{
										if (item.userid!=v.mchId) return null;
										return {outOrderId:item.merchantOrderId||item.relative, orderId:item._id, type:item.money>0?'charge':'refund', orderMoney:item.money, recieved:item.paidmoney, settlement:(item.net-item.pc_fee), time:item.time}
									}).filter(item=>item)
								}
							))
						);
					})
					files.forEach((fi)=>{
						fs.outputFile(path.join(__dirname, '../fore/payments/', ''+checkoutTime.getTime(), fi.name), fi.content)
					})
				}
			}, opt);
		}
		catch(e) {
			callback(e)
		}
		finally {
			await session.endSession();
		}
	}))
	// router.all('/history', verifyAuth, verifyManager, httpf({callback:true}, async function(callback) {
	// 	callback(null, await fs.readdir(path.join(__dirname, '../fore/payments/')));
	// }))
	// router.all('/downloadHistory', verifyAuth, verifyManager, httpf({checkoutTime:'number', no_return:true}, async function(checkoutTime) {
	// 	var exists=await fs.pathExists(path.join(__dirname, '../fore/payments', checkoutTime));
	// 	if (!exists) return res.status(404).end();
	// 	var zip=new JSZip();
	// 	var files=await fs.readdir(path.join(__dirname, '../fore/payments/', checkoutTime));
	// 	files.forEach((name)=>{
	// 		zip.file(name, fs.readFileSync(path.join(__dirname, '../fore/payments/', checkoutTime, name)));
	// 	})
	// 	zip.generateNodeStream({type:'nodebuffer',streamFiles:true})
	// 	.pipe(res)
	// }))
	router.all('/availbeAccounts', verifyAuth, verifyManager, httpf({belongs:'string', callback:true}, async function(belongs, callback) {
		try {
			return callback(null, {rows:await db.snappay_base_accounts.find({belongs:{$in:[null, belongs]}}).toArray()});
		} catch(e) {return callback(e)}
	}))

	async function getLastWxSettlement(est) {
		var today=new Date();
		if (est>today) est=today;
		var from=new Date(est.getTime()-15*24*3600*1000), to=new Date(est.getTime()+15*24*3600*1000);
		if (to>today) to=today;
		var start=shortDate(from).replace(/-/g, ''), end=shortDate(to).replace(/-/g, ''), off=0, last;
		while (true) {
			debugout('query wx settle', start, end, today);
			var {responseData} =await wx.payment.querySettlement({sub_mch_id:'346992738', usetag:1, offset:off, limit:10, date_start:start, date_end:end});
			var num=Number(responseData.record_num);
			if (num==0) {
				if (!last) throw '没有找到微信结算记录';
				return new Date(last.date_end+' 24:00 GMT +0800');
			}
			last=responseData['setteinfo_'+(num-1)];
			if (num<10) {
				return new Date(last.date_end+' 24:00 GMT +0800');
			}
			off+=10;
		}
	}
	router.all('/wxSettlementDate', verifyAuth, verifyManager, httpf({d:'date', callback:true}, async function(d, callback) {
		try {
			callback(null, {date:await getLastWxSettlement(d)});
		} catch(e) {
			callback(e);
		}
	}))
	router.all('/settings', verifyAuth, verifyManager, httpf({settings:'?object', callback:true}, async function(settings, callback) {
		try {
			if (!settings) {
				var r=await db.snappay_base_settings.findOne({_id:'setting'});
				// r.wxSettlementTime=await getLastWxSettlement(r.lastExportTime||0);
				return callback(null, r||{});
			};
			await db.snappay_base_settings.updateOne({_id:'settings'}, {$set:settings}, {w:1, upsert:true});
			Object.assign(snappayGlobalSetting, setting);
			if (settings.fee) snappayFee=normalizeFee(settings.fee);
			callback();
		} catch(e) {
			callback(e);
		}
	}))
	router.all('/statement', verifyAuth, verifyManager, httpf({name:'?string', from:'?date', to:'?date', timezone:'?string', sort:'?string', order:'?string', limit:'?number', offset:'?number', callback:true},
	async function(name, from, to, timezone, sort, order, limit, offset, callback) {
	try {
		var cond={};
		if (name) cond.name={'$regex':name}
		if (from) cond.time={$gte:from}
		if (to) {
			cond.time=cond.time||{};
			cond.time.$lt=to;
		}
		cond.provider='snappay_base';
		//cond.used=true;cond.status={$ne:'refund'}
		cond.status={$in:['SUCCESS', 'refundclosed', 'refund', 'complete', '已支付', '通知商户', '通知失败']}
		var groupby={currency:'$currency', mchId:'$userid'}, 
		af={
			value:{$round:[{$multiply:['$paidmoney', '$share']}, 2]}
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
				holding:{
					$cond:[
						{$gte:['$money', 0]},					// if money>0
						'$value',								// then money*share
						0										// else 0
					]
				},
				refund:{
					$cond:[
						{$lt:['$money', 0]},					// if money<0
						'$value',								// then money
						0										// else 0
					]
				},
				profit:{
					$cond:[
						{$gte:['$money', 0]},
						{$subtract:['$paidmoney', '$value']},
						0
					]
				},
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
				_id:groupby, 
				amount:{$sum:'$holding'}, 
				net:{$sum: '$paidmoney'}, 
				refund:{$sum:'$refund'}, 
				count:{$sum:1}, 
				profit:{$sum:'$profit'},
				settlements:{$sum:'$settlement'},
				unpaid:{$sum:'$unpaid'}
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
					unpaid:'$unpaid'
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
				unpaid:{$sum:'$doc.unpaid'}, 
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
	router.all('/done', bodyParser.text({type:'text/*'}), async function(req, res) {
		debugout('done', req.headers, req.body)
		try {
			var data =await wx.payment.parseNotifyData(req.body);
			const sign = data.sign;
			if (!sign) {
				var ret=await wx.payment.replyData(false);
				return res.send(ret);
			}
			data.sign = undefined;
			const genSignData = wx.payment.generateSignature(data, data.sign_type);
			//case test, only case 6 will return sign
			if (sign != genSignData.sign) {
				debugout('sign err', genSignData.sign, sign);
				var ret=await wx.payment.replyData(false);
				return res.send(ret);
			}
			const tradeNo = data.out_trade_no;
			//sign check and send back
			await pify(makeItDone)(tradeNo, data);
			var ret =await wx.payment.replyData(true)
			return res.send(ret);
		} catch(e) {
			debugout(e);
			res.send(await wx.payment.replyData(false));
		}
    })
	function makeItDone(orderid, data, callback) {
		callback=callback||function(){};
		db.bills.findOne({_id:ObjectID(orderid)},function(err, orderData) {
			if (err) callback('no such order');
			var acc=orderData.snappay_account, net, succrate, total_amount=Number(data.total_fee)/100, fee;
			if (acc) {
				if (!acc.log) acc.log={};
				if (acc.log.success) acc.log.success++;
				else acc.log.success=1;
				if (!acc.used) acc.used=1;
				fee=Math.round(total_amount*(acc.fee||snappayFee)*100)/100;
				net=Number((total_amount-fee).toFixed(2));
				succrate=acc.log.success/acc.used;
			}
			db.users.updateOne({_id:orderData.userid}, {$inc:{succOrder:1, balance:total_amount}});
			db.risky.updateOne({openid:orderData.wechat_param.openid}, {$set:{risky:0}});
			db.snappay_base_accounts.updateOne({_id:acc._id}, {$set:{risky:0}});
			confirmOrder(orderid, total_amount, net, (err)=>{
				if (!err) {
					updateOrder(orderid, {wechat_result:data, providerOrderId:data.transaction_id});
					var upd={daily:net, total:net, 'gross.daily':total_amount, 'gross.total':total_amount}
					db.snappay_base_accounts.updateOne({_id:acc._id}, {
						$set:{'log.success':acc.log.success, 'succrate':succrate},
						$inc:decimalfy(upd)
					});
				}
				if (err && err!='used order') return callback(err);
				callback(null);
			})
		});
	}

	const cooldown=[0, 0, 0, 3600*1000, 2*3600*1000, 8*3600*1000, 24*3600*1000];

	async function bestAccount(money, merchantid, userid, currency, openid) {
		if (process.env.NODE_ENV=='debugmode') {
			if (currency!='CAD') return null;
			return {_id:'testAccount', mch_id:'224339062', supportedCurrency:'CAD'}
		}
		let merchantData=await db.users.findOne({_id:merchantid});
		if (merchantData && merchantData.debugMode) {
			let [acc]= await db.snappay_base_accounts.find({name:'测试', supportedCurrency:currency}).sort({daily:1}).limit(1).toArray();
			if (acc) return acc;
		}
		var isBlocked=await db.forbidden.findOne({_id:openid});
		if (isBlocked) throw '系统无法提供服务';
		// let acc_list= await db.snappay_base_accounts.find({disable:{$ne:true}, name:{$ne:'测试'}, supportedCurrency:currency}).toArray();
		// let [risk]=db.risky.find({openid:openid, accid:{$in:acc_list.map(a=>a._id)}}).sort({risky:1}).limit(1).toArray();
		// if (risk.risky>10 && (new Date()-risk.lasttime)<30*60*1000) throw '暂时不提供服务，请30分钟后再试'; 
		// return acc_list.find(acc=>acc._id==risk.accid);
		let now=new Date(), user_risky=await db.risky.findOne({openid:openid});
		if (user_risky && user_risky.risky) {
			var cooldown_time=(user_risky.risky>(cooldown.length-1))?cooldown[cooldown.length-1]:cooldown[user_risky.risky];
			if ((now-user_risky.lasttime)<cooldown_time) throw '暂时无法提供服务，请等待一段时间再试';
		}
		let acc_arr =await db.snappay_base_accounts.find({disable:{$ne:true}, name:{$ne:'测试'}, supportedCurrency:currency, $or:[{lasttime:{$lt:new Date(now-5*60*1000)}}, {lasttime:{$eq:null}}]}).sort({risky:1}).toArray();
		if (acc_arr.length==0) return null;
		if (acc_arr.length==1) return acc_arr[0];
		let anticipates=[];
		acc_arr.forEach((acc)=>{
			for (var i=0; i<(11-(acc.risky||0)); i++) {
				anticipates.push(acc);
			}
		})
		if (anticipates.length==0) return null;
		var ret =anticipates[Math.floor(Math.random()*anticipates.length)];
		if (ret) {
			db.snappay_base_accounts.updateOne({_id:ret._id}, {$set:{lasttime:now}});
		}
		return ret;
	}
	function retreiveClientIp(req) {
		return ip6addr.parse(req.headers['CF-Connecting-IP']||
		(req.headers['x-forwarded-for'] || '').split(',').pop() || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress || 
         req.connection.socket.remoteAddress||'127.0.0.1').toString({format:'v4'})
	}
	var notsupportedrightnow=async function(params, callback) {
		if (params.providerSpec) {
			var spec=params.providerSpec;
			params.providerSpec=undefined
			params=Object.assign(spec, params);
		}
		var account =await bestAccount(params.money, params.merchant, params.userId, params.currency);
		if (!account) return callback('没有可用的收款账户');
		var warnings=[];
		try {
			var ret =await api.unifiedOrder({
				out_trade_no:params.orderId,
				body:params.desc||'Goods',
				notify_url: url.resolve(params._host, 'http://27.102.102.50:7007', '../../pvd/wechat-oversea/done'),
				spbill_create_ip : retreiveClientIp(params._req),
				sub_mch_id :account.mch_id||account.sub_mch_id,
				fee_type : params.currency,
				total_fee : Math.floor(params.money*100),
				trade_type:'MWEB',
				scene_info :JSON.stringify({h5_info:{type:'Wap', wap_url:'https://pay.qq.com',"wap_name": "腾讯充值"}})
			})
		} catch(e) {
			return callback(e);
		}
		if (ret.return_code!='SUCCESS') return callback(ret.return_msg);
		if (ret.result_code!='SUCCESS') return callback(ret.err_code_des);
		updateOrder(params.orderId, {status:'待支付', snappay_account:account, lasttime:new Date(), wechat_unifiedorder:ret});
		sysevents.emit('snappayOrderCreated', {snappay_account:account, orderId:params.orderId, money:params.money, merchant:params.merchant, mchUserId:params.userId});
		// if (!account.used) account.used=1;
		// else account.used++;
		db.snappay_base_accounts.updateOne({_id:account._id}, {$inc:{used:1}});
		db.users.updateOne({_id:params.merchant._id}, {$inc:{orderCount:1}});
		var toPartner={
			url:ret.mweb_url
			, pay_type:params.type
		};
		if (warnings.length) toPartner.warnings=warnings;
		callback(null, toPartner);
	}
	var last={money:null, acc:null, time:null};
	forwardOrder =async function(params, callback) {
		callback=callback||((err, r)=>{
			if (err) throw err;
			else return r
		});
		var upd={};
		if (params.account) {
			var acc=await db.snappay_base_accounts.findOne({_id:ObjectID(params.account)});
			if (acc) upd.snappay_account=acc;
		}
		// wechat risk control
		// change money if necessary
		if (params.money==last.money) {
			upd.money=Decimal128.fromString((params.money*(1+(0.5-Math.random())/10)).toFixed(2));
		}
		last.money=params.money;
		if (Object.keys(upd).length>0) await pify(updateOrder)(params.orderId, upd);
		// for debug
		// var acc=await bestAccount(params.money, params.userid, params.mer_userid, params.currency, 'wx24234');
		// build a wechat h5 page
		callback(null, {
			url:url.resolve(argv.wxhost, '/wechatpay/cc')+'?state='+params.orderId
			,pay_type:params.type,
			money:upd.money||params.money
		})
	}
	router.all('/wechat/cc', cookieParser(), async (req, res)=>{
		var uo_data, ret, account;
		try {
			var params=Object.assign(req.query, req.body);
			if (!params.code && !params.state) throw '请勿自行访问本页面';
			var key=req.cookies.k;
			try {
				if (!key) {
					key=new ObjectID().toHexString();
					res.cookie('k', key);
					throw 'no key';
				}
				var {openid}=await wx.oauth.getUserBaseInfo(params.code, key);
			} catch(e) {
				debugout('no key or key expired');
				return res.redirect(wx.oauth.generateOAuthUrl(url.resolve(argv.wxhost, 'cc'), 'snsapi_base', params.state));
			}
			debugout('got openid', openid);
			// get an account
			var order=await db.bills.findOne({_id:ObjectID(params.state)});
			if (order.snappay_account) account=order.snappay_account;
			else account =await bestAccount(order.money, order.userid, order.mer_userid, order.currency, openid);
			if (!account) throw '没有可用的收款账户';
			debugout('use acc', account);
			// preorder
			uo_data={
				out_trade_no:params.state,
				body:objPath.get(order, 'desc', 'Goods'),
				notify_url: url.resolve(argv.wxhost, 'pvd/snappay_base/done'),
				spbill_create_ip : retreiveClientIp(req),
				sub_mch_id :account.mch_id||account.sub_mch_id,
				fee_type : objPath.get(order, 'currency', 'CAD'),
				total_fee : Math.floor(objPath.get(order, 'money', 0)*100),
				openid:openid
			};
			ret =await wx.payment.unifiedOrder(uo_data);
			debugout('preorder', uo_data, ret);
			ret=ret.responseData;
			if (ret.return_code!='SUCCESS') throw ret.return_msg;
			if (ret.result_code!='SUCCESS') throw ret.err_code_des;
			updateOrder(params.state, {status:'进入收银台', snappay_account:account, lasttime:new Date(), wechat_param:uo_data, wechat_unifiedorder:ret});
			// get signature
			var payData=await wx.payment.generateChooseWXPayInfo(ret.prepay_id);
			payData.timeStamp=payData.timestamp;
			delete payData.timestamp;
			var ccdata={
				payData:Object.assign({appId:config.appId}, payData), 
				return_url:order.return_url||url.resolve(argv.wxhost, 'pvd/snappay_base/return')
			}
			debugout('pay params', ccdata)
			res.render('cashcounter', ccdata);
			// account的风险很大，付款不成功不算做用户的risky
			var now=new Date();
			if (!account.risky || account.risky<10) db.risky.updateOne({openid:openid}, {$inc:{'risky':1},  $set:{lasttime:now}}, {upsert:true});
			db.snappay_base_accounts.updateOne({_id:account._id}, {$inc:{risky:1}, $set:{lasttime:now}});
		}catch(e) {
			debugout(e);
			var msg=objPath.get(e, 'return_msg', '');
			if (account && msg.indexOf('特约子商户该产品权限已被冻结')>=0) {
				db.snappay_base_accounts.updateOne({_id:account._id}, {$set:{disable:true, lasttime:new Date()}});
			}
			if (objPath.get(e, 'err_code_des')=='该订单已支付') return res.render('error', {err:'请勿重复支付'})
			updateOrder(params.state, {status:'error', snappay_account:account, lasttime:new Date(), wechat_param:uo_data, wechat_unifiedorder:ret, error:e});
			return res.render('error', {err:errstr(e)})
		}
	})
	db.bills.find({'error.return_msg':'特约子商户该产品权限已被冻结，请前往商户平台>产品中心检查后重试', 'snappay_account.name':'Mias baby shop'}, {time:1, wechat_result:1, error:1}).sort({time:1}).limit(2)

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
	refund =async function(orderData, money, merchant, callback) {
		callback=callback||((err, r)=>{
			if (err) throw err;
			else return r
		});
		if (!orderData.snappay_account) return callback('订单不属于snapppay');

		var dbBills=db.db.collection('bills', {readPreference:'secondaryPreferred', readConcern:{level:'majority'}});
		var [b]=await dbBills.aggregate([
			{$match:{provider:'snappay_base', status:{$in:['SUCEESS', 'REFUNDING', 'refundclosed', 'refund', 'refunding', 'complete', '已支付', '通知商户', '通知失败']}, checkout:null}},
			{$addFields:{holding:{$multiply:['$paidmoney', '$share']}}},
			{$group:
				{
					_id:'balance',
					'amount':{$sum:'$holding'}
				}
			}
		]).toArray();
		if (!b) return callback('余额不足');
		var balance=dedecimal(b).amount;
		// var {balance}=await db.users.findOneAndUpdate({_id:orderData.userid, balance:{$gte:money}}, {$inc:{balance:-money}});
		if (balance<money) return callback('余额不足');
		var refundOrderId=new ObjectID();
		var data={
			out_trade_no: orderData._id.toHexString(),
			out_refund_no:refundOrderId.toHexString(),
			total_fee:orderData.money*100,
			refund_fee:money*100,
			sub_mch_id : orderData.snappay_account.mch_id
		}
		var ret=await wx.payment.refund(data);
		if (ret.return_code!='SUCCESS' || ret.result_code!='SUCCESS') {
			if (ret.err_code_des=="订单已全额退款") {
				await Promise.all([
					db.bills.updateOne({relative:orderData._id.toHexString()}, 
						{
							$set:{status:'SUCCESS', wechat_result:ret, lasttime:new Date()},
							$setOnInsert:decimalfy({_id:refundOrderId, money:-money, paidmoney:-money, share:1, sp_fee:merchant.sp_fee, ap_fee:merchant.ap_fee, pc_fee:merchant.pc_fee, provider:'snappay_base', providerOrderId:ret.refund_id, currency:orderData.currency, relative:orderData._id.toHexString(), userid:orderData.userid, merchantid:orderData.merchantid, sub_mch_id:orderData.snappay_account.mch_id, type:'refund', time:new Date()})
						},
						{upsert:true,w:1}
					),
					db.bills.updateOne({_id:orderData._id}, {$set:{status:'refund', lasttime:new Date()}})
				]);
				return callback(null, {trans_no:ret.refund_id, out_order_no:orderData.merchantOrderId, out_refund_no:refundOrderId.toHexString(), refund:ret.refund_fee/100, trans_status:'SUCCESS'});
			}
			// get money back
			return callback(ret.err_code_des||ret.return_msg);
		}
		db.bills.insertOne(decimalfy({_id:refundOrderId, money:-money, paidmoney:-money, share:1, sp_fee:merchant.sp_fee, ap_fee:merchant.ap_fee, pc_fee:merchant.pc_fee, provider:'snappay_base', providerOrderId:ret.refund_id, currency:orderData.currency, relative:orderData._id.toHexString(), userid:orderData.userid, merchantid:orderData.merchantid, sub_mch_id:orderData.snappay_account.mch_id, type:'refund', status:'REFUNDING', time:new Date()}));
		db.bills.updateOne({_id:orderData._id}, {$set:{status:'refunding', lasttime:new Date()}});
		return callback(null, {trans_no:ret.refund_id, out_order_no:orderData.merchantOrderId, out_refund_no:refundOrderId.toHexString(), refund:ret.refund_fee/100, trans_status:'REFUNDING'});
	}
	var today=new Date();
	setInterval(()=>{
		var now=new Date();
		if (now.getDate()!=today.getDate()) {
			today=now;
			// log all [in] in the accounts
			db.snappay_base_accounts && db.snappay_base_accounts.find().toArray().then((r)=>{
				var logs=r.map((ele)=>{return {net:ele.daily||0, gross:objPath.get(ele, ['gross', 'daily'])||0, t:today, accId:ele._id, accName:ele.name}});
				db.snappay_base_accounts.updateMany({}, {$set:{daily:0, 'gross.daily':0}});
				db.snappay_base_accounts.updateMany({daily:{$lt:500}}, {$set:{occupied:null}});
				db.snappay_logs.insertMany(logs);
			}).catch((e)=>{
				console.error(e);
			});
		}
	}, 5*1000);
	// check all refunding orders every 10 minutes
	setInterval(async ()=>{
		try {
			var orders=await db.bills.find({status:'REFUNDING'}).toArray();
			orders.forEach(async (order)=> {
				var {responseData} =await wx.payment.queryRefund({
					sub_mch_id:order.sub_mch_id,
					out_trade_no: order.relative,
					refund_id:order.providerOrderId
				});
				var ret=responseData;
				if (ret.return_code!='SUCCESS' || ret.result_code!='SUCCESS') {
					db.bills.updateOne({_id:order._id}, {$set:{wechat_result:ret, lasttime:new Date()}});
					return;
				}
				switch (ret.refund_status_0) {
					case 'SUCCESS':
						db.bills.updateOne({_id:order._id}, {$set:{status:'SUCCESS', lasttime:new Date(), wechat_result:ret}})
						db.bills.updateOne({_id:ObjectID(order.relative)}, {$set:{status:'refund', lasttime:new Date()}});
						break;
					case 'REFUNDCLOSE':
						db.bills.updateOne({_id:order._id}, {$set:{status:'CLOSE', lasttime: new Date(), wechat_result:ret}});
						db.bills.updateOne({_id:ObjectID(order.relative)}, {$set:{status:'refundclosed'}})
						// db.users.updateOne({_id:order.userid}, {$inc:{balance:-order.money}});
						break;
					case 'PROCESSING':
						break;
				}
			});
		}catch(e) {}
	}, 10*60*1000)
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
