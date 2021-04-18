const {ObjectId} =require('mongodb')
	, {aclgte}=require('../auth')
	, getDB =require('../db.js')
	, {notifyMerchant}=require('../order.js')
	, {dedecimal, isValidNumber} =require('../etc.js')
	, argv=require('yargs').argv
	, debugout=require('debugout')(argv.debugout)

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
		} catch(e) {}
		if (!aclgte(role, 'manager')) {
			filter.account=req.auth._id;
		}
		if (!filter.account) filter.account={$nin:['user', 'system']}
		filter.balance={$ne:null}

		var groupby={dot:'$dot', account:'$account', currency:'$currency'}, af={dot:{$dateToString:{date:'$time', format:'%Y-%m-%d'}}};

		const {db}=await getDB();

		var stage=[
			{$match:filter},
			{$addFields:af},
			{$group:{_id:groupby, balance:{$sum:'$balance'}, commission:{$sum:'$commission'}, count:{$sum:'$transactionNum'}}}
		];
		if (sort) {
			var so={};
			so[sort]=(order=='asc'?1:-1);
			stage.push({$sort:so});
		}
		stage=stage.concat([
			{$project:{
				doc:{
					time:'$_id.dot',
					account:'$_id.account',
					currency:'$_id.currency',
					balance:'$balance',
					commission:'$commission',
					count:'$count',
				}
			}},
			{$group:{_id:null, total:{$sum:1}, rows:{$push:'$doc'}}},
		])

		var cur=db.accounts.aggregate(stage);
		// if (sort) {
		// 	var so={};
		// 	so[sort]=(order=='ASC'?1:-1);
		// 	cur=cur.sort(so);
		// }

		if (offset) cur=cur.skip(Number(offset));
		if (limit) cur=cur.limit(Number(limit));
		var [ret]=await cur.toArray();
		if (!ret) return {total:0, rows:[]}
		dedecimal(ret.rows);
		var num=0;
		ret.rows.forEach((item)=>{item._id=num++});
		return ret;
	}
}