const {objectId}=require('./dataDrivers.js')
	, {aclgte}=require('../auth')
	, getDB =require('../db.js')
	, {notifyMerchant}=require('../order.js')
	, {dedecimal, isValidNumber} =require('../etc.js')
	, {getProvider} =require('../providers')

const idChanger=objectId;
module.exports={
	list: async (params, role, req)=>{
		if (!aclgte(role, 'manager')) {
			throw 'no privilege to access'
		}
		if (params.filter) {
			var filters=params.filter=JSON.parse(params.filter)
			if (!Array.isArray(filters.account)) throw 'params error';
			var promises=filters.account.map((acc)=>{
				var prd=getProvider(acc);
				if (!prd || !prd.getBalance) return new Promise((resolve, reject)=>{
					reject('not supported');
				})
				return prd.getBalance();
			});
			var r=await Promise.allSettled(promises);
			var ret=[];
			for (var i=0; i<filters.account.length; i++) {
				var {value={}, reason:err}=r[i]
				ret.push({id:filters.account[i], err, ...value})
			}
			return {rows:ret, total:ret.length};
		} else throw 'params error';
	},
}
