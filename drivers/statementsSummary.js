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
		const {db}=await getDB();
		var rows=await db.accounts.aggregate([{$match:filter}, {$group:{_id:null, balance:{$sum:'$balance'}, commission:{$sum:'$commission'}, count:{$sum:1}}}]).toArray();
		dedecimal(rows);
		return {rows};
	}
}