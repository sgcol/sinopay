const {objectId}=require('./dataDrivers.js')
	, {aclgte}=require('../auth')
	, getDB =require('../db.js')
	, {notifyMerchant}=require('../order.js')
	, {dedecimal, isValidNumber} =require('../etc.js')

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
		var rows=await db.accounts.aggregate([{$match:filter}, {$group:{_id:groupby, balance:{$sum:'$balance'}, commission:{$sum:'$commission'}, count:{$sum:1}}}]).toArray();
		dedecimal(rows);
		return {rows, total:rows.length};
	}
}