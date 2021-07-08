const {createDriver}=require('./dataDrivers')
	, {aclgte}=require('../auth')
	, getDB =require('../db.js')
	, {dedecimal, isValidNumber} =require('../etc.js')
	, {balance, receivable, payable, commission} =require('../financial_affairs')
	, {set:_set, get:_get} =require('object-path')


var userProvider=createDriver('users'), _list=userProvider.list;

userProvider.list=async (params, role, req)=>{
	if (params.filter) {
		try {
			params.filter=JSON.parse(params.filter)
		} catch(e) {
			params.filter={}
		}
		// for (const key in params.filter) {
		//     var value=params.filter[key];
		//     if (Array.isArray(value)) params.filter[key]={$in:value};
		// }
		// delete params.filter.id;
	}

	if (!aclgte(role, 'manager')) {
		params.filter._id=req.auth._id;
	}
	const {db}=await getDB();
	var cond={};
	var acc=params.filter._id;

	if (acc=='system') {
		var [b, c, r, [{count}], u]=await Promise.all([
			balance(),
			commission(),
			db.accounts.aggregate([{$match:cond}, {$group:{_id:'$account', count:{$sum:1}}}]).toArray(),
			db.users.find({}, {projection:{_id:1, name:1, acl:1}}).toArray(),
		]);
		var role=new Map(u.map((v=>([v._id, v.acl]))));
		var sysB=b.get('system');
		b.forEach((v, k)=>{
			if (role[k]=='agent') sysB-=v;
		})
		c.forEach((v, k)=>{
			if (k=='system') return;
			if (role[k]=='merchant') sysB+=v;
		});
		return {rows:{account:'system', balance:sysB, count}, total:1};
	}

	if (!acc) cond.account={$ne:'system'};
	else {
		if (Array.isArray(acc)) cond.account={$in:acc};
		else cond.account=acc;
	}
	var [b, c, r, _cnt, users]=await Promise.all([
		balance(acc),
		commission(acc),
		receivable(acc),
		db.accounts.aggregate([{$match:cond}, {$group:{_id:'$account', count:{$sum:1}}}]).toArray(),
		_list(params, role, req)
	])
	var cnt=new Map(_cnt.map(v=>[v._id, v.count]));

	// union users.rows & summary
	var total=users.total;
	var rows=users.rows.map(v=>(
		{...v, balance:b.get(v._id)||0, commission:c.get(v._id)||0, receivable:r.get(v._id)||0, count:cnt.get(v._id)||0}
	));
	// summary.forEach(s=>{
	//     if (s.__used) return;
	//     total++;
	//     rows.push(s);
	// })
	return {
		rows, total
	};
}

module.exports=userProvider;