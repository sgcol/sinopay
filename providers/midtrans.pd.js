const url = require('url')
, router=require('express').Router()
, bodyParser =require('body-parser')
, getDB=require('../db.js')
, {ObjectId} =require('mongodb')
, {confirmOrder, updateOrder, getOrderDetail} =require('../order.js')
, {dec2num, dedecaimal}=require('../etc.js')
, httpf =require('httpf')
, fetch=require('node-fetch')
, midtransClient = require('midtrans-client');

const snap = new midtransClient.Snap({
	isProduction : false,
	clientKey : 'SB-Mid-client-pQpp4a2OthNhke9u',
	serverKey : 'SB-Mid-server-A8jFeygO3j5z6DI6hIHCEo42'
});

const _noop=function() {};

exports.bestSell=null;
exports.getBalance=_noop;
exports.sell=_noop;
exports.bestPair=(money, cb)=>{
	return cb(null, -1, 'IDR');
};
exports.name='midtrans';
exports.router=router;
exports.supportedMethods=['credit_card', 'gopay', 'cimb_clicks', 'bca_klikbca', 'bca_klikpay', 'bri_epay', 'telkomsel_cash', 'echannel', 'permata_va', 'other_va', 'bca_va', 'bni_va', 'bri_va', 'indomaret', 'danamon_online', 'akulaku', 'shopeepay'];

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

router.all('/return', (req, res)=>{
})
router.all('/done', bodyParser.json(), async (req, res) =>{
	try {
		var {order_id:orderId, transaction_status:transactionStatus, fraud_status:fraudStatus} =await snap.transaction.notification(req.body)

        console.log(`Transaction notification received. Order ID: ${orderId}. Transaction status: ${transactionStatus}. Fraud status: ${fraudStatus}`);

        // Sample transactionStatus handling logic

        if (transactionStatus == 'capture'){
            // capture only applies to card transaction, which you need to check for the fraudStatus
            if (fraudStatus == 'challenge'){
                // TODO set transaction status on your databaase to 'challenge'
            } else if (fraudStatus == 'accept'){
                // TODO set transaction status on your databaase to 'success'
            }
        } else if (transactionStatus == 'settlement'){
            // TODO set transaction status on your databaase to 'success'
        } else if (transactionStatus == 'deny'){
            // TODO you can ignore 'deny', because most of the time it allows payment retries
            // and later can become success
        } else if (transactionStatus == 'cancel' ||
          transactionStatus == 'expire'){
            // TODO set transaction status on your databaase to 'failure'
        } else if (transactionStatus == 'pending'){
            // TODO set transaction status on your databaase to 'pending' / waiting payment
        }
	} catch (e) {
		res.status(500).send({err:e.message});
	}
});
var forwardOrder =async function(params, callback) {
	callback=callback||function(err, r) {
		if (err) throw err;
		return r;
	}

	try {
		let parameter = {
			"transaction_details": {
				"order_id": params.orderId,
				"gross_amount": params.money
			},
		};
		if (Array.isArray(params.type)) parameter.enabled_payments=type;
		snap.httpClient.http_client.defaults.headers.common['X-Override-Notification'] = params._host+'pvd/midtrans/done';
 
		var transaction =await snap.createTransaction(parameter);
		updateOrder(params.orderId, {status:'待支付', lasttime:new Date(), midtrans_ret:transaction});
		var ret={url:transaction.redirect_url};
		ret.pay_type=params.type;
		return callback(null, ret);
	}catch(e) {
		return callback(e.message);
	}
}

var getReconciliation=async function(from, date, forceRecon) {
	throw 'not impl';
}

exports.forwardOrder=forwardOrder;
exports.getReconciliation=getReconciliation;
exports.withdrawal =async function withdrawal(orderId, account, money) {
	throw 'not impl'
}
if (module===require.main) {
	// debug neat-csv
	(async function readRecon(){
	})()

	// order
}