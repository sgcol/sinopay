const md5=require('md5'), qs=require('querystring'),sortObj=require('sort-object'), {dedecimal}=require('./etc.js');
const getDB=require('./db.js');

async function getMerchant(merchantid, cb) {
	try {
		var {db}=await getDB();
		var r=await db.users.find({merchantid:merchantid}).toArray();
		if (r.length==0) throw ('no such merchant');
		if (!cb) return dedecimal(r[0]);
		return cb(null, dedecimal(r[0]));
	} catch(e) {
		if (!cb) throw e;
		return cb(e);
	}
}
exports.verifySign=	async function verifySign(req, res, next) {
	var _p={...req.query, ...req.body}, sign=_p.sign;
	if (!sign) return next('没有签名sign');
	delete _p.sign;
	var userId=_p.partnerId||_p.partnerid||_p.merchantId||_p.merchantid;
	if (!userId) return next('没有指定商户号');
	try {
		var mer =await getMerchant(userId);
		var wanted=md5(mer.key+qs.stringify(sortObj(_p, {sort:(a, b)=>{return a>b?1:-1}})));
		if (sign!=wanted) {
			var e={err:'签名错误'};
			if (mer.debugMode) {
				e.wanted=wanted;
				e.str=mer.key+qs.stringify(sortObj(_p));
			}
			return next(e);
		}
		req.merchant=mer;
		req.params=_p;
		next();
	} catch(e) {
		next(e);
	}
}
exports.getMerchant=getMerchant;