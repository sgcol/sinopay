const {objectId}=require('./dataDrivers.js')
	, {aclgte}=require('../auth')
	, getDB =require('../db.js')
	, {notifyMerchant}=require('../order.js')
	, {dedecimal, isValidNumber} =require('../etc.js')

module.exports={
	list:async (params, role, req)=>{
		var {filter, sort, order, offset, limit} =params;
		if (filter) {
			try {
				var filters=filter=JSON.parse(filter)
				for (const key in filters) {
					var value=filters[key];
					if (Array.isArray(value)) filter[key]={$in:value};
				}
				if (filters._id) {
					if (Array.isArray(filters._id)) {
						filters._id={$in:value.map(idChanger)}
					}
					else filters._id=idChanger(value);                        
				} else {
					filters._id={$ne:'btf_lock'}
				}
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
				filter={_id:{$ne:'btf_lock'}}
			}
		}
		const {db}=await getDB();
		if (!aclgte(role, 'manager')) {
			filter.userid=req.auth._id;
		}
		var rows=await db.bills.aggregate([{$match:filter}, {$group:{_id:null, money:{$sum:'$money'}}}]).toArray();
		dedecimal(rows);
		return {rows};
	}
}