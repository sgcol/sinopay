const url = require('url')
, path = require('path')
, {stringify:querystring, parse:queryparse} = require('querystring')
, router=require('express').Router()
, bodyParser =require('body-parser')
, getDB=require('../db.js')
, {ObjectId} =require('mongodb')
, {confirmOrder, updateOrder, getOrderDetail} =require('../order.js')
, dec2num =require('../etc.js').dec2num
, dedecaimal=require('../etc.js').dedecimal
, Downloader = require('nodejs-file-downloader')
, neatCsv= require('neat-csv')
, httpf =require('httpf')
, fetch=require('node-fetch')
, md5=require('md5')
, argv=require('yargs').argv
, debugout=require('debugout')(argv.debugout)

const clearfile_url='https://cashier.sandpay.com.cn/qr/api/clearfile/download', 
	order_url='http://dreamyun.net/api/submit',
	withdrawal_url='http://fu82l.cn/api/daifu/submit'

const _noop=function() {};

const customerid='20080165', userkey='2145d4b8509366485b1dbd7b916862d009862b33';

exports.bestSell=null;
exports.getBalance=_noop;
exports.sell=_noop;
exports.bestPair=(money, cb)=>{
	return cb(null, -1, 'CNY');
};
exports.name='云捷支付';
exports.router=router;
exports.supportedMethods=['alipay', 'weixin'];
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

function makePaymentSign(data) {
	var {version, customerid, total_fee, sdorderno, notifyurl, returnurl}=data;
	return md5(`version=${version}&customerid=${customerid}&total_fee=${total_fee}&sdorderno=${sdorderno}&notifyurl=${notifyurl}&returnurl=${returnurl}&${userkey}`);
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
	var payload={
		version:'1.0',
		customerid,
		is_qrcode:3,
		...params
	}
	payload.sign=makePaymentSign(payload);
	return payload;
}

router.all('/return', (req, res)=>{
})
router.all('/done', bodyParser.urlencoded({extended:true}), async (req, res) =>{
	var {status, customerid, sdpayno, sdorderno, total_fee, paytype, sign}=req.body;
	var wantedSign=md5(`customerid=${customerid}&status=${status}&sdpayno=${sdpayno}&sdorderno=${sdorderno}&total_fee=${total_fee}&paytype=${paytype}&${userkey}`);
	if (wantedSign!=sign) return res.status(500).send('sign err');
	total_fee=Number(total_fee);
	try {
		await confirmOrder(sdorderno, total_fee, total_fee, {providerOrderId:sdpayno});
		res.send('success');
	} catch(e) {
		res.status(500).send(e);
	}
});
router.all('/disburse_notify', bodyParser.urlencoded({extended:true}), async (req, res)=>{

});

var forwardOrder =async function(params, callback) {
	callback=callback||function(err, r) {
		if (err) throw err;
		return r;
	}
	var {type, money, orderId, _host, return_url, desc='充值卡'} =params;
	try {
		if (money<1) throw '最小支付金额为1.00';
		if (money>5000) throw '最大支付金额为5000.00'

		var warnings=[];
		type=params.type='weixin'
		// var payType=exports.supportedMethods.indexOf(type);
		// if (payType<0) {
		// 	params.type='weixin';
		// 	payType='weixin';
		// 	warnings.push(`type只能是${exports.supportedMethods.join(' ')}，使用默认weixin`);
		// }
		var data = {
			paytype:type,
			sdorderno : ''+orderId,
			total_fee:money,
			notifyurl : url.resolve(_host, '../../pvd/dreamyun/done'),
			returnurl: return_url || url.resolve(_host, '../../pvd/dreamyun/return'),
		};
		var body=querystring(makeRequest(data));
		debugout(body);
		var response =await fetch(order_url, {method:'POST', headers:{'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'}, body});
		response=JSON.parse(await response.text());
		if (response.status!=='1')  throw response.msg;
		// var data=response.body;
		updateOrder(params.orderId, {status:'待支付', /*providerOrderId:data.orderCode, */lasttime:new Date(), dreamyun_ret:response});
		// if (!account.used) account.used=1;
		// else account.used++;
		var ret={url:response.url};
		ret.pay_type=params.type;
		if (warnings.length) ret.warnings=warnings;
		return callback(null, ret);
	}catch(e) {
		return callback(e);
	}
}

var getReconciliation=async function(from, date, forceRecon) {
	var {db}=await getDB();
	var day=datestring(date)
	var bills=await db.bills.find({used:true, recon_id:null}).toArray();
	bills.forEach(bill=>{
		bill.fee=Number(bill.money*0.014);
	});
	return {date, confirmedOrders:bills, recon_tag:day}
}

exports.forwardOrder=forwardOrder;
exports.getReconciliation=getReconciliation;

exports.disburse =async function withdrawal(orderId, bank, owner, account, money, branch, province, city, _host) {
	var bankcode=supportedBanks[bank];
	if (!bankcode) throw '不支持的银行';
	var data = {
		customerid,
		sdorderno : orderId,
		money:params.money,
		paytype:'weixin',
		bankcode:supportedBanks[bank],
		branchname:branch,
		accountname:owner,
		cardno:account,
		province,
		city,
		notifyUrl : url.resolve(_host, '../../pvd/dreamyun/disburse_notify'),
	};
	data.sign=md5(`customerid=${customerid}&money=${data.money}&sdorderno=${data.sdorderno}&paytype=${data.paytype}&bankcode=${data.bankcode}&cardno=${data.cardno}&${userkey}`);
	var body=querystring(data);
	debugout(body);
	var response =await fetch(withdrawal_url, {method:'POST', headers:{'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'}, body});
	response=JSON.parse(await response.text());
	if (response.status!=='0' || response.status!=='2' || response.status!=='10006') throw(response.msg);
	return response.sdpayno;
}

const supportedBanks={
'国家开发银行':'CDB',
'中国农业银行':'ABC',
'中国建设银行':'CCB',
'交通银行':'COMM',
'上海浦东发展银行':'SPDB',
'华夏银行':'HXBANK',
'中国民生银行':'CMBC',
'中国光大银行':'CEB',
'浙商银行':'CZBANK',
'平安银行':'SPABANK',
'玉溪市商业银行':'YXCCB',
'北京银行':'BJBANK',
'江苏银行':'JSBANK',
'南京银行':'NJCB',
'徽商银行':'HSBANK',
'成都银行':'CDCB',
'大连银行':'DLB',
'福建海峡银行':'FJHXBC',
'温州银行':'WZCB',
'台州银行':'TZCB',
'常熟农村商业银行':'CSRCB',
'常州农村信用联社':'CZRCB',
'绍兴银行':'SXCB',
'吴江农商银行':'WJRCB',
'贵阳市商业银行':'GYCB',
'湖州市商业银行':'HZCCB',
'晋城银行JCBANK':'JINCHB',
'广东省农村信用社联合社':'GDRCC',
'浙江民泰商业银行':'MTBANK',
'辽阳市商业银行':'LYCB',
'廊坊银行':'LANGFB',
'德阳商业银行':'DYCB',
'苏州银行':'BOSZ',
'乌鲁木齐市商业银行':'URMQCCB',
'张家港农村商业银行':'ZRCBANK',
'莱商银行':'LSBANK',
'天津农商银行':'TRCB',
'富滇银行':'FDB',
'鞍山银行':'ASCB',
'河北银行':'BHB',
'自贡市商业银行':'ZGCCB',
'吉林银行':'JLBANK',
'昆仑银行':'KLB',
'邢台银行':'XTB',
'天津银行':'TCCB',
'吉林农信':'JLRCU',
'西安银行':'XABANK',
'宁夏黄河农村商业银行':'NXRCU',
'阜新银行':'FXCB',
'浙江省农村信用社联合社':'ZJNX',
'湖北银行宜昌分行':'HBYCBANK',
'江苏太仓农村商业银行':'TCRCB',
'赣州银行':'GZB',
'广西北部湾银行':'BGB',
'江苏江阴农村商业银行':'JRCB',
'泰安市商业银行':'TACCB',
'重庆三峡银行':'CCQTGB',
'邯郸银行':'HDBANK',
'锦州银行':'BOJZ',
'青海银行':'BOQH',
'盛京银行':'SJBANK',
'郑州银行':'ZZBANK',
'潍坊银行':'BANKWF',
'江西省农村信用':'JXRCU',
'甘肃省农村信用':'GSRCU',
'广西省农村信用':'GXRCU',
'武汉农村商业银行':'WHRCB',
'昆山农村商业银行':'KSRB',
'衡水银行':'HSBK',
'鄞州银行':'NBYZ',
'许昌银行':'XCYH',
'开封市商业银行':'CBKF',
'湖北银行':'HBC',
'丹东银行':'BODD',
'朝阳银行':'BOCY',
'包商银行':'BSB',
'周口银行':'BOZK',
'三门峡银行':'SCCB',
'安徽省农村信用社':'ARCU',
'湖南省农村信用社':'HNRCC',
'洛阳银行':'LYBANK',
'城市商业银行资金清算中心':'CBBQS',
'中国工商银行':'ICBC',
'中国银行':'BOC',
'中国邮政储蓄银行':'PSBC',
'招商银行':'CMB',
'兴业银行':'CIB',
'广东发展银行':'GDB',
'中信银行':'CITIC',
'恒丰银行':'EGBANK',
'渤海银行':'BOHAIB',
'上海农村商业银行':'SHRCB',
'尧都农商行':'YDRCB',
'上海银行':'SHBANK',
'杭州银行':'HZCB',
'宁波银行':'NBBANK',
'长沙银行':'CSCB',
'重庆银行':'CQBANK',
'南昌银行':'NCB',
'汉口银行':'HKB',
'青岛银行':'QDCCB',
'嘉兴银行':'JXBANK',
'南海农村信用联社':'NHB',
'内蒙古银行':'H3CB',
'顺德农商银行':'SDEB',
'齐商银行':'ZBCB',
'遵义市商业银行':'ZYCBANK',
'龙江银行':'DAQINGB',
'浙江泰隆商业银行':'ZJTLCB',
'东莞农村商业银行':'DRCBCL',
'广州银行':'GCB',
'江苏省农村信用联合社':'JSRCU',
'浙江稠州商业银行':'CZCB',
'晋中市商业银行':'JZBANK',
'桂林银行':'GLBANK',
'成都农商银行':'CDRCB',
'东莞银行':'BOD',
'北京农村商业银行':'BJRCB',
'上饶银行':'SRBANK',
'重庆农村商业银行':'CRCBANK',
'宁夏银行':'NXBANK',
'华融湘江银行':'HRXJB',
'云南省农村信用社':'YNRCC',
'东营市商业银行':'DYCCB',
'鄂尔多斯银行':'ORBANK',
'晋商银行':'JSB',
'营口银行':'BOYK',
'山东农信':'SDRCU',
'河北省农村信用社':'HBRCU',
'贵州省农村信用社':'GZRCU',
'湖北银行黄石分行':'HBHSBANK',
'新乡银行':'XXBANK',
'乐山市商业银行':'LSCCB',
'驻马店银行':'BZMD',
'无锡农村商业银行':'WRCB',
'广州农商银行':'GRCB',
'平顶山银行':'BOP',
'南充市商业银行':'CGNB',
'中山小榄村镇银行':'XLBANK',
'库尔勒市商业银行':'KORLABANK',
'齐鲁银行':'QLBANK',
'阳泉银行':'YQCCB',
'抚顺银行':'FSCB',
'深圳农村商业银行':'SRCB',
'九江银行':'JJBANK',
'河南省农村信用':'HNRCU',
'四川省农村信用':'SCRCU',
'陕西信合':'SXRCCU',
'宜宾市商业银行':'YBCCB',
'石嘴山银行':'SZSBK',
'信阳银行':'XYBANK',
'张家口市商业银行':'ZJKCCB',
'济宁银行':'JNBANK',
'威海市商业银行':'WHCCB',
'承德银行':'BOCD',
'金华银行':'JHBANK',
'临商银行':'LSBC',
'兰州银行':'LZYH',
'德州银行':'DZBANK',
'安阳银行':'AYCB',
'湖北省农村信用社':'HURCB',
'广东南粤银行':'NYNB',
'农信银清算中心':'NHQS',
}
if (module===require.main) {
	// order
	setTimeout(async ()=>{
		try {
		// var date=new Date();
		// date.setDate(date.getDate()-1);
		// console.log(await getReconciliation(date, date));
		var orderId=new ObjectId();
		console.log(orderId, await forwardOrder({
			orderId,
			money:1,
			type:'alipay',
			_host:'http://127.0.0.1'
		}))
		}catch(e) {
			console.error(e);
		}
	}, 1000);
}