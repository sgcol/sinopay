const {objectId}=require('./dataDrivers.js')
	, {aclgte}=require('../auth')
	, getDB =require('../db.js')
	, {notifyMerchant}=require('../order.js')
	, {dedecimal, isValidNumber} =require('../etc.js')
	, {set:_set} =require('object-path')

const idChanger=objectId;
module.exports={
	list: async (params, role, req)=>{
		if (params.filter) {
			try {
				var filters=params.filter=JSON.parse(params.filter)
				for (const key in filters) {
					var value=filters[key];
					if (Array.isArray(value)) params.filter[key]={$in:value};
				}
				if (filters._id) {
					filters.account=filters._id;
					delete filters._id;
				}
				delete filters.period;
				// if (filters.allrec) {
				// 	delete filters.allrec;
				// 	delete filters.used;
				// }
				if (filters.startTime) {
					filters.time={'$gte':new Date(filters.startTime)}
					delete filters.startTime;
				}
				if (filters.endTime) {
					if (filters.time) filters.time['$lte']=new Date(filters.endTime);
					else filters.time={'$lte':new Date(filters.endTime)}
					delete filters.endTime;
				}
			} catch(e) {
				filters={};
			}
		}
		const {db}=await getDB();
		if (!aclgte(role, 'manager')) {
			throw 'no privilege to access'
		}
		var [_b, _r] =await Promise.all([
			db.outstandingAccounts.aggregate([{$match:{...filters, balance:{$ne:null}}}, {$group:{_id:'$account', check:{$max:'$_id'}}}, {$lookup:{from:'outstandingAccounts', localField:'check', foreignField:'_id', as:'data'}}]).toArray(),
			db.outstandingAccounts.aggregate([{$match:{...filters, receivable:{$ne:null}}}, {$group:{_id:'$account', check:{$max:'$_id'}}}, {$lookup:{from:'outstandingAccounts', localField:'check', foreignField:'_id', as:'data'}}]).toArray(),
		])
		var r={};
		_b.forEach(v=>_set(r, [v.data[0].account, 'balance'], v.data[0].balance));
		_r.forEach(v=>_set(r, [v.data[0].account, 'receivable'], v.data[0].receivable));

		var rows=[];
		for (var k in r) {
			rows.push({_id:k, ...r[k]});
		} 

		return {rows, total:rows.length};
	},
}
