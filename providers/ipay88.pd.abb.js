const url = require('url')
, request = require('request')
, async =require('async')
, router=require('express').Router()
, httpf =require('httpf')
, getDB=require('../db.js')
, confirmOrder =require('../order.js').confirmOrder
, getOrderDetail=require('../order.js').getOrderDetail
, dec2num =require('../etc.js').dec2num
, crypto =require('crypto')
, xmlBuilder= require('xml2js').Builder
, XmlParse= require('xml2js').Parser
, objPath =require('object-path')
, soap =require('soap')

const pify=require('pify');

const _noop=function() {};
var checkingList=[];

var signWith=['MerchantCode','RefNo','Amount','Currency','xField1','BarcodeNo','TerminalID'];
const makeSign=function(data, key, options) {
    delete data.sign;
    var defaultValues={
        Currency:'MYR',
        SignatureType:'SHA256',
        Lang:'UTF-8'
    }
    var message =key, o=Object.assign(defaultValues, data);
    signWith.forEach((k)=>{
        var value=o[k];
        // if (k=='Amount') value=value.replace('.', '');
        message+=value||'';
    })
    var encoded_sign=crypto.createHash('sha256').update(message).digest('hex');
    o['Signature'] = encoded_sign;
    return o;
}
var order=forwardOrder=function() {
    var callback=arguments[arguments.length-1];
    if (typeof callback=='function') callback('启动中');
}

function normalizeFee(f) {
    f=Number(f);
    if (f>=1) return f/100;
    return f;
}

const tongdaoMap={
    'alipayUserScan' :233,
    'alipayMerchantScan':234,
    'wechatpayUserScan':317,
    'wechatpayMerchantScan':305,
}

exports.order=function() {
	order.apply(null, arguments);
};
exports.forwardOrder= function(){
    forwardOrder.apply(null, arguments);
}
exports.bestSell=null;
exports.getBalance=_noop;
exports.sell=_noop;
exports.bestPair=(money, cb)=>{
	return cb(null, 0.008, 'MYR');
};
exports.router=router;
exports.name='MAS_P8';
exports.params=['merchantId', 'key'];
exports.forecore=true;
exports.checkParams=function(params) {
    if (!params.userContact) return 'userContact must be set';
    if (!params.userEmail) return 'userEmail must be set';
    if (!params.userName) return 'userName must be set';
    return false;
}

// get which those accounts availble
var account, ipay88Limitation, ipay88Fee;
(async function start(cb) {
    try {
        var init_params=await Promise.all([
            pify(getDB)(),
            soap.createClientAsync('https://payment.ipay88.com.my/ePayment/WebService/MHGatewayService/GatewayService.svc?singleWsdl')
        ]);
    } catch(e) {
        cb(e);
    } 
    cb.apply(null, [null].concat(init_params));
})(init);
function init(err, db, soapClient) {
    if (err) return console.log('启动ipay88.pd失败', err);
	router.all('/ipay88Settings', httpf({settings:'?object', callback:true}, function(settings, callback) {
		if (!settings) return db.ipay88_settings.findOne({}, (err, r)=>{
			if (err) return callback(err);
			callback(null, r?r.settings:{});
		});
		db.ipay88_settings.updateOne({_id:'settings'}, {$set:settings}, {w:1, upsert:true}, (err, r)=>{
			if (err) return callback(err);
			if (settings.limitation) ipay88Limitation=settings.limitation;
			if (settings.fee) ipay88Fee=normalizeFee(settings.fee);
			callback();
		});
	}))
	router.all('/statements', httpf({account:'?string', startTime:'?date', endTime:'?date', sort:'?string', order:'?string', offset:'?number', limit:'?number', callback:true}, function(account, startTime, endTime, sort, order, offset, limit, callback) {
		var key={provider:'ipay88'};
		if (account) key['ipay88_account._id']=account;
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
			res.send('支付完成');
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
        confirmOrder(orderid, data.Amount, net, (err)=>{
            if (err && err!='used order') return callback(err);
            callback(null);
        })
    }
    var q=async.queue(function (task, callback) {
        task(callback);
    });
    setInterval(()=>{
        // check forward order status
        if (q.length()>0) return;
        q.push(function (callback) {
            async.forEachOf(checkingList, (order, idx, cb)=>{
                if (!order) return;
                request.post({uri:'https://payment.ipay88.com.my/ePayment/Webservice/TxInquiryCardDetails/TxDetailsInquiry.asmx', body:xmlBuilder(order), headers: {'Content-Type': 'text/xml'}}, async function(err, header, body) {
                    try {
                        var xmlparse=new XmlParse({explicitArray:false}).parseStringPromise;
                        var ret =await xmlparse(body);
                        if (ret.Status=='1') {
                            //done
                            makeItDone(ret.RefNo, ret, ()=>{
                                checkingList[idx]=undefined;
                                db.ipay88.checklist.updateOne({ReferenceNo:ret.RefNo}, {$set:{status:'complete', time:new Date()}});
                                cb();
                            })
                        }
                    } catch(e) {console.error(e); cb()}
                } )
            }, callback)
        });
        q.push(function clearCheckinglist(callback) {
            //clear the array
            let i, j
            for (i = 0, j = 0; i < checkingList.length; ++i) {
                if (checkingList[i]) {
                    checkingList[j] = checkingList[i];
                    ++j;
                }
            }
            while (j < checkingList.length) {
                checkingList.pop();
            }
            callback();
        })
    }, 5000);
    
    forwardOrder=function(params, callback) {
        if (params.providerSpec) {
            var spec=params.providerSpec;
            params.providerSpec=undefined
            params=Object.assign(spec, params);
        }
        var tongdao=tongdaoMap[params.payType]||'233';
        var account={merchantId:objPath.get(params, 'merchant.providers.ipay88.merchantId'), key:objPath.get(params, 'merchant.providers.ipay88.key')}
        if (process.env.NODE_ENV!='production') {
            if (!account.merchantId) account.merchantId='M15137';
            if (!account.key) account.key='Vx7AbhyzGK';
        }
        var data = {
            'MerchantCode' : account.merchantId,
            'RefNo' : params.orderId,
            'PaymentId' : tongdao,
            'ProdDesc' : params.desc||'Goods',
            'Amount' : params.money.toFixed(2),
            // 'BackendURL' : url.resolve(_host, '../pvd/ipay88/done'),
            'UserContact' : params.userContact,
            'UserEmail' : params.userEmail,
            'UserName' : params.userName
        };
        soapClient.GatewayService.BasicHttpsBinding_IGatewayService.EntryPageFunctionality(makeSign(data, account.key), function(err, ret) {
        // var request_url = 'https://payment.ipay88.com.my/ePayment/WebService/MHGatewayService/GatewayService.svc';
        // var builder = new xmlBuilder();
        // var xml=builder.buildObject(makeSign(data, account.key));
        // request.post({url:request_url, body:xml, headers: {'Content-Type': 'text/xml'}}, async function (err, header, body) {
        //     try {
        //         var xmlparse=new XmlParse({explicitArray:false}).parseStringPromise;
        //         var ret =await xmlparse(body);
                if (!ret.Status=='1') return callback(ret.ErrDesc);
                var checkOrder={Amount:data.Amount, MerchantCode:data.MerchantCode, ReferenceNo:data.RefNo};
                db.ipay88.checklist.insertOne(checkingList);
                checkingList.push(checkOrder);
                callback(null, {
                    money:Number(ret.Amount),
                    currency:ret.Currency,
                    qrValue:ret.QRValue,
                    providerOrderId:ret.TransId,
                });
            // }catch(e) {callback(e)}
        });
    }
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
    //     'notify_url' : 'http://api.mch.ipay88.net/Dspay/NativepayApp/pay_notify'
    // };
    
    // var privatekey_content = fs.readFileSync("./mch_privkey.pem");
    
    // var request_url = 'http://api.mch.ipay88.net/ipay88Pay/native_pay';

    // request.post({url:request_url, form:makeSign(data, privatekey_content)}, (err, header, body)=>{
    //     console.log(body);
    // })

    setTimeout(()=>{
        forwardOrder({
            orderId:'12233',
            money:1,
            desc:'test goods',
            userContact:'122334',
            userEmail:'test@aa.com',
            userName:'Mr. Testing'
        }, '')
    
    }, 5000);

    // request.post('http://127.0.0.1:7008/pvd/ipay88/done', {})

    return;
}
