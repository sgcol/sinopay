const {objectId}=require('./dataDrivers.js')
	, {aclgte}=require('../auth')
	, getDB =require('../db.js')
	, {reconciliation}=require('../financial_affairs')
	, {dedecimal, isValidNumber} =require('../etc.js')

const idChanger=objectId;
module.exports={
	list: async (params, role, req)=>{
		var {sort, order, offset, limit} =params;
		const {db}=await getDB();
		if (!aclgte(role, 'manager')) {
			throw 'no privilege to access';
		}

		var cur=db.reconciliation.find();
		if (sort) {
			var so={};
			so[sort]=(order=='ASC'?1:-1);
			cur=cur.sort(so);
		}
		if (offset) cur=cur.skip(Number(offset));
		if (limit) cur=cur.limit(Number(limit));
		var [rows, total]=await Promise.all([
			cur.toArray(),
			cur.count(),
		]);
		return {rows:dedecimal(rows), total};
	},
	actions: {
		check: async (params, role, req) =>{
			if (!aclgte(role, 'manager')) {
				throw 'no privilege to access';
			}
			var {date, provider}=params;
			return {modified:await reconciliation(new Date(date), provider)};
		},
	}
}
