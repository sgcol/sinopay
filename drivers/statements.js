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
				filter={_id:{$ne:'btf_lock'}}
			}
		}
		const {db}=await getDB();
		if (!aclgte(role, 'manager')) {
			filter.userid=req.auth._id;
		}

		var cur=db.bills.find(filter);
		if (sort) {
			var so={};
			so[sort]=(order=='asc'?1:-1);
			cur=cur.sort(so);
		}
		if (offset) cur=cur.skip(Number(offset));
		if (limit) cur=cur.limit(Number(limit));
		var [rows, total]=await Promise.all([
			cur.toArray(),
			cur.count(),
			// db.bills.aggregate([
			// 	{$match:key},
			// 	{$group:{_id:null, totalMoney:{$sum:'$paidmoney'}, net:{$sum:'$net'}}}
			// ]).toArray()
		]);
		return {rows:dedecimal(rows), total};
	}
}