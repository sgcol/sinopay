const url = require('url')
, router=require('express').Router()
, bodyParser =require('body-parser')
, getDB=require('../db.js')
, {ObjectId} =require('mongodb')
, {confirmOrder, updateOrder, getOrderDetail} =require('../order.js')
, {dec2num, dedecaimal}=require('../etc.js')
, httpf =require('httpf')
, fetch=require('node-fetch')
, path =require('path')
, argv=require('yargs').argv
, debugout=require('debugout')(argv.debugout)
, crypto=require('crypto')
, querystring=require('querystring')

const _noop=function() {};

const signatureKey=argv.espay_signkey||'jvqvatll76wotamq', Password=argv.espay_password||'E#0KNJB/Y^', apiKey=argv.espay_apikey||'a7bec7f98f4683a1b75dbc91bbd17079';

exports.bestSell=null;
exports.getBalance=_noop;
exports.sell=_noop;
exports.bestPair=(money, cb)=>{
	return cb(null, -1, 'IDR');
};
exports.name='espay';
exports.router=router;
exports.supportedMethods=['credit_card', 'ovo', 'bank_va', 'convient_store'];

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
const yyyymmddtimestring =(t)=>{
	if (!t) t=new Date();
	else if (!(t instanceof Date)) t=new Date(t);
	return `${t.getFullYear().pad(4)}-${(t.getMonth()+1).pad()}-${t.getDate().pad()} ${t.getHours().pad()}:${t.getMinutes().pad()}:${t.getSeconds().pad()}`;
}
const timestring =(t)=>{
	if (!t) t=new Date();
	else if (!(t instanceof Date)) t=new Date(t);
	return `${t.getDate().pad()}/${(t.getMonth()+1).pad()}/${t.getFullYear().pad(4)} ${t.getHours().pad()}:${t.getMinutes().pad()}:${t.getSeconds().pad()}`;
}

const signInquiry=(obj)=>{
    var {rq_uuid, rs_datetime, order_id, error_code }=obj;
    var hash=crypto.createHash('sha256');
    hash.update(('##'+[signatureKey, rq_uuid, rs_datetime, order_id, error_code, 'INQUIRY-RS'].join('##')+'##').toUpperCase());
    obj.signature=hash.digest('hex');
    return obj;
}

const signDone=(obj)=>{
    var {rq_uuid, rs_datetime, error_code }=obj;
    var hash=crypto.createHash('sha256');
    hash.update(('##'+[signatureKey, rq_uuid, rs_datetime, error_code, 'PAYMENTREPORT-RS'].join('##')+'##').toUpperCase());
    obj.signature=hash.digest('hex');
    return obj;
}

var verifyInquirySign=(obj)=>{
    // Signature Key + rq_uuid + rq_datetime + order_id + INQUIRY
    var {rq_uuid , rq_datetime , order_id, signature} =obj;
    var hash=crypto.createHash('sha256');
    var str=('##'+[signatureKey, rq_datetime, order_id, 'INQUIRY'].join('##')+'##').toUpperCase();
    debugout(str);
    hash.update(str);
    var sign=hash.digest('hex');
    debugout(sign);
    return (signature===sign)
}

const verifyDoneSign=(obj)=>{
    // Signature Key + rq_uuid + rq_datetime + order_id + amount + PAYMENTREPORT
    var {rq_uuid , rq_datetime , order_id, amount, signature} =obj;
    var hash=crypto.createHash('sha256');
    var str=('##'+[signatureKey, rq_uuid, rq_datetime, order_id, amount, 'PAYMENTREPORT'].join('##')+'##').toUpperCase();
    debugout(str);
    hash.update(str);
    var sign=hash.digest('hex');
    debugout(sign);
    return (signature===sign)
}

router.all('/return', (req, res)=>{
    res.send('everything is done');
})
router.all('/done', bodyParser.urlencoded({extended:true}), async function (req, res) {
    debugout(req.body);
    var {rq_uuid, rq_datetime, order_id:orderId, amount:paid, payment_ref:providerOrderId, Password}=req.body;
    paid=Number(paid);
    try {
        if (password!==Password) throw 'Invalid password';
        if (!verifyDoneSign(req.body)) throw 'Invalid signature';
        var {db}=await getDB();
        var {matchedCount}=await db.bills.updateOne({_id:ObjectId(orderId)}, {$set:{providerOrderId}}, {w:1});
        if (matchedCount==0) throw 'Invalid order id';
        await confirmOrder(orderId, paid);
        var ret=signDone({rq_uuid, rs_datetime:rq_datetime, order_id:orderId, error_code:'0000', error_message:'Success', reconcile_id:orderId, reconcile_datetime:yyyymmddtimestring()});
        return res.send(ret);
    } catch(e) {
        if (e=='used order') e='double payment';
        var ret=signDone({rq_uuid, rs_datetime:rq_datetime, error_code:'0001', error_message:typeof e==='object'?e.message:e});
        return res.send(ret);
    }
});
router.all('/portal', (req, res)=>{
    if (!req.query || !req.query.oid) return res.error('params error');
    var orderId=req.query.oid;
    if (!req.query.rb) {
        var basepath=argv.host||url.format({protocol:req.protocol, host:req.headers.host, pathname:path.resolve(req.baseUrl, '..')});
        if (basepath.slice(-1)!='/') basepath=basepath+'/';
        req.query.rb=basepath+'espay/return';
    }

    var content=`<iframe id="sgoplus-iframe" src="" scrolling="no" frameborder="0"></iframe>
<script type="text/javascript" src="https://sandbox-kit.espay.id/public/signature/js"></script>
<script type="text/javascript">
    window.onload = function() {
        var data = {
            key: "${apiKey}",
            paymentId: "${orderId}",
            backUrl: "${req.query.rb}"
        },
        sgoPlusIframe = document.getElementById("sgoplus-iframe");
        if (sgoPlusIframe !== null) sgoPlusIframe.src = SGOSignature.getIframeURL(data);
        SGOSignature.receiveForm();
    };
</script>`
    res.send(content);
});
// router.post('/inquiry', bodyParser.urlencoded({extended:true}), async function(req, res) {
//     debugout(req.body);
//     var {rq_uuid, rq_datetime:rs_datetime, order_id:orderId, password, signature}=req.body;
//     try {
//         if (password!==Password) throw 'Invalid password';
//         if (!verifyInquirySign(req.body)) throw 'Invalid signature';
//         var {db}=await getDB();
//         var order=await db.bills.findOne({_id:ObjectId(orderId)});
//         if (!order) throw 'Invalid order id';
//         var {money, time}=order;
//         var ret=signInquiry({rq_uuid, rs_datetime, error_code:'0000', error_message:'Success', order_id:orderId, amount:dec2num(money).toFixed(2), ccy:'IDR', trx_date:yyyymmddtimestring(time)});
//         debugout('ret', ret);
//         return res.send(ret)
//     } catch(e) {
//         res.send({rq_uuid, rs_datetime, error_code:'0001', error_message:(typeof e==='object'?e.message:e)})
//     }
// })
router.post('/inquiry', bodyParser.urlencoded({extended:false}), async function(req, res) {
    debugout(req.body);
    var {rq_uuid, rq_datetime:rs_datetime, order_id:orderId, password, signature}=req.body;
    try {
        if (password!==Password) throw 'Invalid password';
        if (!verifyInquirySign(req.body)) throw 'Invalid signature';
        var {db}=await getDB();
        var order=await db.bills.findOne({_id:ObjectId(orderId)});
        if (!order) throw 'Invalid order id';
        var {money, time}=order;
        var ret=signInquiry({rq_uuid, rs_datetime, error_code:'0000', error_message:'Success', order_id:orderId, amount:dec2num(money).toFixed(2), ccy:'IDR', trx_date:yyyymmddtimestring(time)});
        debugout('ret', ret);
        return res.send(ret)
    } catch(e) {
        var ret=signInquiry({rq_uuid, rs_datetime, error_code:'0001', error_message:(typeof e==='object'?e.message:e)});
        debugout('err', ret);
        res.send(ret)
    }
})

router.post('/settle', bodyParser.urlencoded({extended:true}), function(req, res) {
    res.send({error_code:'0000', error_message:'Success', date_settle:yyyymmddtimestring()})
})
var forwardOrder =async function(params, callback) {
	callback=callback||function(err, r) {
		if (err) throw err;
		return r;
	}

    var ret={url:params._host+'pvd/espay/portal?oid='+params.orderId+'&rb='+params.return_url};
    ret.pay_type=params.type;
    return callback(null, ret);
}

var getReconciliation=async function(from, date, forceRecon) {
	throw 'not impl';
}

exports.forwardOrder=forwardOrder;
exports.withdrawal =async function withdrawal(orderId, account, money) {
	throw 'not impl'
}
if (module===require.main) {
	// debug neat-csv
	(async function readRecon(){
	})()
}