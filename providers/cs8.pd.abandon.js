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
, randomstring =require('random-string')
, async =require('async')
, makeOTCSign =require('../otc.js').makeOTCSign
, md5 = require('md5')
, getDB=require('../db.js')
, confirmOrder =require('../order.js').confirmOrder
, updateOrder =require('../order.js').updateOrder
, cancelOrder =require('../order.js').cancelOrder
, pify =require('pify')
, argv=require('yargs').argv;

const USDT=require('../usdt.js'), _baseURL=url.parse('http://usdt.cs8.us:89');

const monsterrKey='Qztbet4J8uznaBeP';
monsterVerifySign =function(req, res, next) {
    var _p=merge(req.query, req.body), sign=_p.sign;
    if (!sign) return res.send({err:'没有签名sign'});

    delete _p.sign;
    var wanted=md5(monsterrKey+qs.stringify(sortObj(_p)));
    if (sign!=wanted) {
        var e={err:'签名错误'};
        if (argv.debugout) {
            e.wanted=wanted;
            e.str=monsterrKey+qs.stringify(sortObj(_p));
        }
        return res.send(e);
    }
    next();
}

var db;
(function start(cb) {
	async.parallel([getDB], function(err, results) {
		if (err) return cb(err);
		cb(err, results[0][0]);
		// restore all running order
		// db.monster.find({status:'runnning'}).toArray((err, r)=>{
		// 	if (err) return cb(err);
		// 	for (var i=0; i<r.length; i++) {
		// 		var product=r[i].product, plist=byCoins[product.coinId][product.sellOrBuy];
		// 		for (var j=0; j<plist.length; j++) {
		// 			if (plist[j].productId==product.productId) {
		// 				occupied.add(plist[j]);
		// 				break;
		// 			}
		// 		}
		// 	}
		// 	cb(err, db);
		// })
	})
})(init);
function init(err, db) {
	if (err) {
		console.error(err);
		process.exit(-1);
	}
	db=db;
    router.all('/afterbuy', monsterVerifySign, httpf({orderid:'string', money:'number', status:'string', time:'string', callback:true}, function(orderid, money, status, time, callback) {
		console.log(orderid, money, status, time);
		db.monster.find({exOrderId:orderid}).toArray((err, r)=>{
			if (err) return callback(err);
			if (r.length==0) return callback('no such orderid');
			var p=byCoins.id[r[0].product.productId];
			if (status=='cancel') cancelOrder(r[0].orderid, ()=>{callback()});
			else {
				(function(cb) {
					if (req.query.usdt!=null || req.body.usdt!=null) updateOrder(r[0].orderid, {usdt:Number(req.body.usdt||req.query.usdt)}, cb);
					cb();
				})(function() {
					confirmOrder(r[0].orderid, ()=>{callback()})
				})
				if (req.query.usdt!=null || req.body.usdt!=null) updateOrder(r[0].orderid, {usdt:Number(req.body.usdt||req.query.usdt)})
			}
		})
    }))
    router.all('/aftersell', monsterVerifySign, httpf({orderid:'string', money:'number', status:'string', time:'string', callback:true}, function(orderid, money, status, time, callback) {
        callback();
    }))
}

var byCoins={id:{}, updateTime:new Date(0)};
function getAllProducts(cb) {
	var now=new Date();
	if ((now-byCoins.updateTime)<3*60*1000) return cb();
	queryProducts(null, function(err, r) {
		if (err) return cb(err);
		byCoins={id:{}, updateTime:now};
		for (var i=0; i<r.length; i++) {
			var p=r[i];
			byCoins.id[p.dealid]=p;
			var t=byCoins[p.coinType];
			if (!t) {
				t=byCoins[p.coinType]={B:[], S:[]};
			}
			switch(p.sellOrBuy) {
				case 'sell':
				t.B.push(p);
				break;
				case 'buy':
				t.S.push(p);
				break;
				default:
			}
		}
		makeProductsSorted();
		cb&& cb();
	})
}
function makeProductsSorted() {
	for (var coins in byCoins) {
		if (coins=='id' ||coins=='updateTime') continue;
		var t=byCoins[coins];
		t.B.sort((a, b)=>{return b.price-a.price});
		t.S.sort((a, b)=>{return a.price-b.price});
	}
}
function bestPair(money, callback) {
	callback(null, 0, 'USDT');
}
function bestBuy(money, coinType, callback) {
	getAllProducts(function(err) {
		var coin=byCoins[coinType];
		if (!coin) return callback('no such coin');
		if (coin.S.length==0) return callback('no data yet');
		for (var i=0; i<coin.S.length; i++) {
			var p=coin.S[i];
			var coinNum=money/p.price;
			if ((p.min &&p.min>coinNum) || (p.left &&p.left<coinNum) || (p.max && p.max<coinNum)) continue;
			return callback(null, p);
		}
		return callback('暂时没有通道');	
	})
}
function bestSell(coinType, callback) {
	getAllProducts((err)=>{
		var coin=byCoins[coinType];
		if (!coin) return callback('no such coin');
		if (coin.B.length==0) return callback('no data yet');
		var allp=[];
		for (var i=0; i<coin.B.length; i++) {
			var p=coin.B[i];
			// if (occupied.has(p)) continue;
			// var coinNum=money/p.price;
			// if (p.minOrderQuantity>coinNum || p.leftQuantity<coinNum || p.maxOrderQuantity<coinNum || p.payMethodList.indexOf('2')<0) continue;
			p.left=p.leftQuantity*p.price;
			p.leftCoins=p.leftQuantity;	
			allp.push(p);
		}
		allp.sort((a, b)=>{return b.price-a.price});
		return callback(null, allp);
	})
}
function queryProducts(isBuy, callback) {
	var desturl=clone(_baseURL);
	desturl.pathname=url.resolve(desturl.pathname, '/api/market/list');
	var data={coinType:'usdt'};
	if (isBuy!=null) {
		data.sellorbuy=isBuy?'sell':'buy';
	}
	request.get(url.format(desturl), {qs:makeOTCSign(data)}, function(err, header, body) {
		if (err) return callback(err)
		try{
			var ret=JSON.parse(body);
		} catch(e) {
			return callback(e);
		}
		if (ret.err) return callback(ret.err);
		if (ret.data) {
			for (var i=0; i<ret.data.length; i++) {
				var d=ret.data[i];
				d.coinType=d.coinType.toUpperCase();
				d.min=Number(d.min);
				d.max=Number(d.max);
				d.price=Number(d.price);
				d.unitPrice=d.price;
			}
			return callback(null, ret.data);
		}
		callback('market/list ret no data field');
	})
}

function putorder(orderid, merchantdata, product, money, host, callback) {
	var desturl=clone(_baseURL);
	desturl.pathname='/api/createorder';
	request.post({uri:url.format(desturl), form:makeOTCSign({
		userid:merchantdata.providers.cs8.id, amount:money, dealid:product.dealid, notify_url:url.resolve(host, './pf/cs8/afterbuy')})
	}, function(err, header, body) {
		console.log('order ret', body);
		if (err) return callback(err)
		try {
			var ret=JSON.parse(body);
		}catch(e) {
			return callback(e);
		}
		if (ret.err) return callback(ret.err);
		pify(getDB)().then((db)=>{
			if (product.sellOrBuy=='buy') updateOrder(orderid, {status:'待支付', coin:'USDT', lasttime:new Date(), providerOrderId:ret.data.orderid, usdt:ret.data.usdt});
			return db.monster.insertOne({orderid:orderid, exOrderId:ret.data.orderid, product:product, money:money, time:new Date()});
		}).then(()=>{
			ret.data.url=ret.data.qrcode;
			callback(null, ret.data);
		}).catch((e)=>{
			callback(null, ret.data);
		});
	})
}

// function afterPutOrder(monsterOrderId, ownerId, callback) {
// 	var desturl=clone(_baseURL);
// 	desturl.pathname='/market/coin/v1/c2c/pay/order';
// 	request.post({uri:url.format(desturl), json:makeObj({ownerId:ownerId, payMethod:'2', orderId:monsterOrderId})}, function(err, header, body) {
// 		console.log('pay/order ret', body);
// 		if (err) return callback(err);
// 		if (body.error) return callback(body.message);
// 		return callback(null, body);
// 	})
// }

function confirmSell(monsterOrderId, callback) {
	var desturl=clone(_baseURL);
	desturl.pathname='/api/market/coin/v1/c2c/confirm/order';
	request.post({uri:url.format(desturl), json:makeOTCSign({ orderId:monsterOrderId})}, function(err, header, body) {
		console.log('confirm/order ret', body);
		if (err) return callback(err);
		if (body.error) return callback(body.message);
		return callback(null, body);
	})	
}
var host;
function sell(orderid, coin, money, product, callback) {
	putorder(orderid, product, money, host, (err, order)=>{
		if (err) return callback(err);
		// confirmSell(order.orderId, ownerId, (err, header, body)=>{console.log(body)})
	})
}
exports.order=function order(orderid, money, merchantdata, coinType, _host, callback) {
	host=_host;
	var product, exOrder;
	pify(bestBuy)(money, coinType).then((bestBuy)=> {
		product=bestBuy;
		return pify(putorder)(orderid, merchantdata, product, money, host);
	}).then((order)=>{
		callback(null, order);
	}).catch((e)=> {
		// if (e=='C2C买币下单时用户还存在未完成的买币订单') {
		// 	occupied.add(product);
		// 	return order(orderid, money, callback);
		// }
		callback(e);
	})
}
function getBalance(coin, callback){
	if (typeof coin=='function') {
		callback=coin;
		coin='USDT';
	}
	if (coin!='USDT') return callback(coin+' is not supported');
	USDT.getspendable(callback);
}
exports.bestSell=bestSell;
exports.getBalance=getBalance;
exports.sell=sell;
exports.bestPair=bestPair;
exports.router=router;
exports.name='18usdt';
exports.params=['id'];

if (module==require.main) {
	// test mode
	console.log('start', new Date().getTime());
	// bestBuy(8000, 'USDT', function(err, bestBuy) {
	// 	if (err) return err;
	// 	if (bestBuy) {
	// 		console.log('choose product', bestBuy.productId);
	// 		putorder('111', bestBuy, 8000, ownerId, function(err, order) {
	// 			if (err) return console.log(err);
	// 			afterPutOrder(order.orderId, ownerId, console.log);
	// 		});   
	// 	}
	// });
	// bestSell(10000, 'USDT', (err, p)=> {
	// 	if (err) return console.log(err);
	// 	if (p) {
	// 		console.log('choose product', p.productId);
	// 		putorder('222', p, 10000, ownerId, (err, order)=>{
	// 			if (err) return console.log(err);
	// 			confirmSell(order.orderId, ownerId, (err, header, body)=>{console.log(body)})
	// 		})
	// 	}
	// })

	// confirmSell('C2CORD20181112153640618671368700', ownerId, (err, header, body)=>{console.log(body)})
	getBalance(console.log);
}
