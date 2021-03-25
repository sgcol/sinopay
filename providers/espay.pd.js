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
, argv=require('yargs').argv;

const _noop=function() {};

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

router.all('/return', (req, res)=>{
})
router.all('/done', bodyParser.urlencoded({limit:'100k'}), async function (req, res) {
    var {order_id:orderId, amount:paid, payment_ref:providerOrderId}=req.body;
    paid=Number(paid);
    try {
        var {db}=await getDB();
        var {matchedCount}=await db.bills.updateOne({_id:ObjectId(orderId)}, {$set:{providerOrderId}}, {w:1});
        if (matchedCount==0) throw 'Invalid Order Id';
        await confirmOrder(orderId, paid);
        return res.send(`0, Success, ${orderId}, ${orderId}, ${yyyymmddtimestring()}`);
    } catch(e) {
        return res.send(`1, ${typeof e==='object'?e.message:e},,,`);
    }
});
router.all('/portal', (req, res)=>{
    if (!req.query || !req.query.oid) return res.error('params error');
    var orderId=req.query.oid;
    var basepath=argv.host||url.format({protocol:req.protocol, host:req.headers.host, pathname:path.resolve(req.baseUrl, '..')});
    if (basepath.slice(-1)!='/') basepath=basepath+'/';

    var content=`<iframe id="sgoplus-iframe" src="" scrolling="no" frameborder="0"></iframe>
<script type="text/javascript" src="https://sandbox-kit.espay.id/public/signature/js"></script>
<script type="text/javascript">
    window.onload = function() {
        var data = {
            key: "a7bec7f98f4683a1b75dbc91bbd17079",
            paymentId: "${orderId}",
            backUrl: "${basepath+'done'}"
        },
        sgoPlusIframe = document.getElementById("sgoplus-iframe");
        if (sgoPlusIframe !== null) sgoPlusIframe.src = SGOSignature.getIframeURL(data);
        SGOSignature.receiveForm();
    };
</script>`
    res.send(content);
});
router.post('/inquiry', bodyParser.urlencoded({limit:'100k'}), async function(req, res) {
    var orderId=req.body.order_id;
    var {db}=await getDB();
    var order=await db.bills.findOne({_id:ObjectId(orderId)});
    if (!order) return res.send('1;Invalid Order Id;;;;;');
    var {money, time}=order;
    return res.send(`0;Success;${orderId};${dec2num(money).toFixed(2)};IDR;Recharge;${timestring(time)}`)
})
var forwardOrder =async function(params, callback) {
	callback=callback||function(err, r) {
		if (err) throw err;
		return r;
	}

    var ret={url:params._host+'pvd/espay/portal?oid='+params.orderId};
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