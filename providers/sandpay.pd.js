const url = require('url')
, path = require('path')
, {stringify:querystring, parse:queryparse} = require('querystring')
, crypto =require('crypto')
, pem =require('pem')
, router=require('express').Router()
, bodyParser =require('body-parser')
, fse = require('fse')
, getDB=require('../db.js')
, {ObjectId} =require('mongodb')
, {confirmOrder, updateOrder, getOrderDetail} =require('../order.js')
, dec2num =require('../etc.js').dec2num
, dedecaimal=require('../etc.js').dedecimal
, sysevents=require('../sysevents.js')
, objPath=require('object-path')
, Downloader = require('nodejs-file-downloader')
, neatCsv= require('neat-csv')
, httpf =require('httpf')
, fetch=require('node-fetch')

const clearfile_url='https://cashier.sandpay.com.cn/qr/api/clearfile/download', 
	order_url='https://cashier.sandpay.com.cn/qr/api/order/create',
	withdrawal_url='https://caspay.sandpay.com.cn/agent-main/openapi/agentpay'

const _noop=function() {};

exports.order=async function () {throw 'not impl'}

exports.bestSell=null;
exports.getBalance=_noop;
exports.sell=_noop;
exports.bestPair=(money, cb)=>{
	return cb(null, -1, 'CNY');
};
exports.name='杉德支付';
exports.router=router;
exports.supportedMethods=['UNIFIEDQRCODE'];
exports.forecore=true;

Number.prototype.pad = function(size) {
	var s = String(this);
	while (s.length < (size || 2)) {s = "0" + s;}
	return s;
}

const datestring=(t) =>{
	if (!t) t=new Date();
	else if (!(t instanceof Date)) t=new Date(t);
	return `${t.getFullYear().pad(4)}${(t.getMonth()+1).pad()}${t.getDate().pad()}`;
}
const timestring =(t)=>{
	if (!t) t=new Date();
	else if (!(t instanceof Date)) t=new Date(t);
	return `${t.getFullYear().pad(4)}${(t.getMonth()+1).pad()}${t.getDate().pad()}${t.getHours().pad()}${t.getMinutes().pad()}${t.getSeconds().pad()}`;
}

var privateKey;
pem.readPkcs12(path.join(__dirname, './sandpay.pfx'), { p12Password: "123qwe" }, (err, {key})=>{
	privateKey=key;
});

function makeSign(data) {
	const crypto = require("crypto");
	const sign = crypto.createSign('RSA-SHA1');
	sign.update(data);
	const result = sign.sign(privateKey, 'base64')
	return result;
}
/**
	params:{
		method: string,
		productId: string,
		mid: string,
		...rest
	}
 */
function makeRequest(params) {
	var {method, productId='00000012', mid='6888800034756', ...rest}=params;
	var payload=JSON.stringify({
		head:{
			version:'1.0',
			method,
			productId,
			accessType:'1',
			mid,
			channelType:'07',
			reqTime:timestring(new Date())
		},
		body:rest
	});
	return {
		charset:'utf-8',
		data:payload,
		signType:'01',
		sign:makeSign(payload),
		extend:''
	}
}

const supportedType={WECHATPAYQRCODE:'0402', ALIPAYQRCODE:'0401', UNIFIEDQRCODE:'0403'};

router.all('/return', (req, res)=>{
})
router.all('/done', bodyParser.urlencoded(), (req, res) =>{
	var {data, sign}=req.body;
	try {
		var payload=JSON.parse(data);
	} catch(e) {
		return res.end();
	}
	var {orderCode:orderid, buyerPayAmount:total_amount} =payload.body;
	confirmOrder(orderid, total_amount, total_amount, (err)=>{
		if (err && err!='used order') return res.end();
		res.send('respCode=000000');
	})
});
var forwardOrder =async function(params, callback) {
	callback=callback||function(err, r) {
		if (err) throw err;
		return r;
	}

	try {
		var warnings=[];
		var payType=supportedType[params.type];
		if (!payType) {
			params.type='UNIFIEDQRCODE';
			payType=supportedType.UNIFIEDQRCODE;
			warnings.push(`type只能是${Object.keys(supportedType).join(' ')}，使用默认UNIFIEDQRCODE`);
		}
		var data = {
			method:'sandpay.trade.precreate',
			payTool:payType,
			orderCode : params.orderId,
			totalAmount:(params.money*100).toString().padStart(12, '0'),
			subject:params.desc||'Goods',
			body:params.desc||'Goods',
			notifyUrl : url.resolve(params._host, '../../pvd/sandpay/done'),
		};            
		var response =await fetch(order_url, {method:'POST', headers:{'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'}, body:querystring(makeRequest(data))});
		response=JSON.parse(queryparse(decodeURIComponent(await response.text())).data);
		if (response.head.respCode!=='000000') return callback(response.head.respMsg);
		var data=response.body;
		updateOrder(params.orderId, {status:'待支付', providerOrderId:data.orderCode, lasttime:new Date(), sandpay_ret:response});
		// if (!account.used) account.used=1;
		// else account.used++;
		var ret={url:data.qrCode};
		ret.pay_type=params.type;
		if (warnings.length) ret.warnings=warnings;
		return callback(null, ret);
	}catch(e) {
		return callback(e);
	}
}

var getReconciliation=async function(from, date, forceRecon) {
	// var beginOfDay=new Date(date), endOfDay=new Date(date);
	// beginOfDay.setHours(0, 0, 0, 0);
	// endOfDay.setHours(23, 59, 59, 999);
	// var count=await db.outstandingAccounts.find({time:{$gte:beginOfDay, $lte:endOfDay}}).count();
	// if (count==0) throw "没有新数据，无需对账";
	var day=datestring(date), specFileName=path.join(__dirname, "./reconciliation/sandpay", day+'.txt');
	if (!forceRecon) {
		var now=new Date();
		if (date.getDate()>(now.getDate()-1)) throw 'reconciltation file not ready yet';
		if (now.getHours()<=9) throw 'reconciltation file not ready yet';
		try {
			await fse.access(specFileName);
			throw 'reconciliation has been done';
		} catch(e) {
		}
	}
	var data={
		method:'sandpay.trade.download',
		clearDate:day,
		fileType:'1',
		extend:''
	}
	var response =await fetch(clearfile_url, {method:'POST', headers:{'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'}, body:querystring(makeRequest(data))});
	response=JSON.parse(queryparse(decodeURIComponent(await response.text())).data);
	if (response.head.respCode!=='000000') throw response.head.respMsg;
	const downloader = new Downloader({
		url: response.body.content,//If the file name already exists, a new file with the name 200MB1.zip is created.     
		directory: path.join(__dirname, "./reconciliation/sandpay"),//This folder will be created, if it doesn't exist.   
		fileName:day+'.txt',
		maxAttempts:3,
		cloneFiles:false,           
	})
	await downloader.download();//Downloader.download() returns a promise.
	var rs=fse.createReadStream(specFileName);
	var [digest, ...bills]=await neatCsv(rs, {headers:false, separator:'|'});
	if (!digest && !bills) throw 'it seems reconciliation file was not ready';
	var {'0':date, '2':count, '3':received, '8':commission}=digest;
	if ((date==null) || (count==null) || (received==null) || (commission==null)) throw 'it seems reconciliation file was not ready'; 
	if (bills && bills.length) bills.length--;
	return {date, count, received, commission, confirmedOrders:bills.map(({'2':orderId, '3':money})=>({orderId, money})), recon_tag:day};
}

const aesEncrypt=(data, key)=>{
	const algorithm = 'aes-128-ecb';   
    const cipher = crypto.createCipheriv(algorithm, key, null);
    cipher.setAutoPadding(true);
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted
}

const encryptWithPublicKey = function(toEncrypt) {
  
  var publicKey = fse.readFileSync(path.join(__dirname, 'sand.pem'));
  
  var buffer = Buffer.from(toEncrypt, 'utf8');
  var encrypted = crypto.publicEncrypt({key:publicKey, padding : crypto.constants.RSA_PKCS1_PADDING}, buffer)
  return  encrypted.toString("base64");
  
}
exports.forwardOrder=forwardOrder;
exports.getReconciliation=getReconciliation;
exports.withdrawal =async function withdrawal(orderId, account, money) {
	var data = {
		method:'sandpay.trade.precreate',
		productId:'00000004',
		payTool:payType,
		orderCode : params.orderId,
		totalAmount:(params.money*100).toString().padStart(12, '0'),
		subject:params.desc||'Goods',
		body:params.desc||'Goods',
		notifyUrl : url.resolve(params._host, '../../pvd/sandpay/done'),
	};            
}
if (module===require.main) {
	// debug neat-csv
	(async function readRecon(){
		var rs=fse.createReadStream(path.join(__dirname, '../docs/接口下载对账单格式.txt'));
		var [digest, ...bills]=await neatCsv(rs, {headers:false, separator:'|'});
		var {'0':date, '2':count, '3':total, '8':commission}=digest;
		console.log({date, count, total, commission});
		var {'2':orderId, '3':money}=bills[0];
		var confirmedOrders=bills.map(({'2':orderId, '3':money})=>({orderId, money}));
		console.log(confirmedOrders);
	})()

	// order
	setTimeout(async ()=>{
		try {
		var date=new Date();
		date.setDate(date.getDate()-1);
		console.log(await getReconciliation(date, date));
		var orderId=new ObjectId();
		console.log(orderId, await forwardOrder({
			orderId,
			money:0.01,
			type:'UNIONQRCODE',
			_host:'http://127.0.0.1'
		}))
		}catch(e) {
			console.error(e);
		}
	}, 1000);
}