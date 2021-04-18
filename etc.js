function dec2num(dec) {
	if (dec==null) return null;
	if (dec._bsontype && dec._bsontype=='Decimal128') return Number(dec.toString());
	return dec;
}
(function(exports) {
	const sortObj=require('sort-object'), qs=require('querystring').stringify, url=require('url'), crypto=require('crypto');
	const merge=require('gy-merge');
	const Decimal128=require('mongodb').Decimal128;
	const accessKey='8ec6e926-fa23645b-1aba961a-9ad42', secretKey='760252a2-0b814bfb-dd6e61d0-2f102';
	exports.md5 = function (str, length) {
		var buf = new Buffer(str.length * 2 + 1);
		var len = buf.write(str, 0);
		str = buf.toString('binary', 0, len);
		var md5sum = crypto.createHash('md5');
		md5sum.update(str);
		str = md5sum.digest('hex');
		if (length == 16) {
			str = str.substr(8, 16);
		}
		return str;
	}
	exports.randstring = function (len=20) {
		return crypto.randomBytes(len).toString('hex');
	}
	exports.sign=function(obj, method, url) {
		assert(!obj.Signature);
		obj.AccessKeyId=accessKey;
		obj.SignatureMethod='HmacSHA256';
		obj.SignatureVersion=2;
		obj.Timestamp=new Date().toISOString();
		var hmac=crypto.createHmac('sha256', secretKey);
		hmac.update(method+'\n');
		hmac.update(url+'\n');
		hmac.update(qs(sortObj(obj)));
		obj.Signature=hmac.digest('base64');
		return obj;
	}
	exports.dec2num=function(dec) {
		if (dec==null) return null;
		if (dec._bsontype && dec._bsontype=='Decimal128') return Number(dec.toString());
		return dec;
	}
	exports.dec2num=dec2num;
	function dedecimal(obj) {
		for (var k in obj) {
			if (!obj[k] || typeof obj[k]!='object') continue;
			if (obj[k]._bsontype && obj[k]._bsontype=='Decimal128') obj[k]=Number(obj[k].toString());
			else dedecimal(obj[k]);
		}
		return obj;
	}
	exports.num2dec=(n)=>{
		return Decimal128.fromString(''+n);
	}
	exports.dedecimal=dedecimal;
	function decimalfy(o) {
		for (var k in o) {
			if (typeof o[k]=='number') o[k]=Decimal128.fromString(''+o[k]);
			if (o[k]!==null && typeof o[k]=='object') {
				if (o[k]._bsontype) continue;
				decimalfy(o[k]);
			}
		}
		return o;
	}
	exports.decimalfy=decimalfy;

	exports.isValidNumber =(x)=>{
		if (x==null) return false;
		if (isNaN(Number(x))) return false;
		return true;
	}
	exports.errfy=(e)=>{
		if (e instanceof Error) return e.message;
		return e;
	}
})(module.exports);
