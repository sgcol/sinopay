const {objectId}=require('./dataDrivers.js')
	, {aclgte}=require('../auth')
	, getDB =require('../db.js')
	, {notifyMerchant}=require('../order.js')
	, {dedecimal, isValidNumber} =require('../etc.js')
	, {balance, commission} =require('../financial_affairs')

module.exports={
	list:async (params, role, req)=>{
		var {filter={}, sort, order, offset, limit} =params;
		try {
			var filters=filter=JSON.parse(filter)
			for (const key in filters) {
				var value=filters[key];
				if (Array.isArray(value)) filter[key]={$in:value};
			}
			if (filters._id) {
				filters.account=filters._id;
				delete filters._id;
			}

			if (filters.period) {
				delete filters.period;
			}
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
			filter={}
		}
		if (!aclgte(role, 'manager')) {
			filter.account=req.auth._id;
		}
		var groupby=null;
		if (!filter.account) filter.account={$nin:['user', 'system']};
		else groupby='$account';

		const {db}=await getDB();
		var [_b, _c, _cnt]=await Promise.all([
			db.accounts.aggregate([{$match:{...filter, balance:{$ne:null}}}, {$group:{_id:groupby, check:{$max:'$_id'}}}, {$lookup:{from:'accounts', localField:'check', foreignField:'_id', as:'data'}}]).toArray(),
			db.accounts.aggregate([{$match:{...filter, commission:{$ne:null}}}, {$group:{_id:groupby, check:{$max:'$_id'}}}, {$lookup:{from:'accounts', localField:'check', foreignField:'_id', as:'data'}}]).toArray(),
			db.accounts.aggregate([{$match:filter}, {$group:{_id:groupby, count:{$sum:1}}}]).toArray(),
		])
		var b=new Map(_b.map(v=>[v.data[0].account, v.data[0].balance]));
		var c=new Map(_c.map(v=>[v.data[0].account, v.data[0].commission]));
		var rows=_cnt.map(v=>({_id:v._id, count:v.count||0, balance:b.get(v._id)||0, commission:c.get(v._id)||0}));
		return {rows, total:rows.length};
	}
}