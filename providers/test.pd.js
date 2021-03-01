const confirmOrder =require('../order.js').confirmOrder
    , _noop=()=>{}

exports.debugMode=true;
exports.name='测试用';
exports.order=function(orderid, money, merchantdata, mer_userid, coinType, _host, callback) {
	confirmOrder(orderid, money, money, callback);
};
exports.bestSell=null;
exports.getBalance=_noop;
exports.sell=_noop;
exports.bestPair=(money, cb)=>{
	return cb(null, 99999999, 'CNY');
};

