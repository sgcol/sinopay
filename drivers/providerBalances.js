const {objectId}=require('./dataDrivers.js')
	, {aclgte}=require('../auth')
	, getDB =require('../db.js')
	, {notifyMerchant}=require('../order.js')
	, {dedecimal, isValidNumber} =require('../etc.js')

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
		var rows=await db.outstandingAccounts.aggregate([{$match:filters}, {$group:{_id:'$account', balance:{$sum:'$balance'}, receivable:{$sum:'$receivable'}}}]).toArray();
		dedecimal(rows);
		return {rows, total:rows.length};
	},
}
