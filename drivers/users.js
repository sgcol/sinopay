const {createDriver}=require('./dataDrivers')
	, {aclgte}=require('../auth')
	, getDB =require('../db.js')
	, {dedecimal, isValidNumber} =require('../etc.js')


var userProvider=createDriver('users'), _list=userProvider.list;

userProvider.list=async (params, role, req)=>{
    if (params.filter) {
        try {
            params.filter=JSON.parse(params.filter)
        } catch(e) {
            params.filter={}
        }
        for (const key in params.filter) {
            var value=params.filter[key];
            if (Array.isArray(value)) params.filter[key]={$in:value};
        }
        delete params.filter.id;
    }

    if (!aclgte(role, 'manager')) {
        params.filter._id=req.auth._id;
    }
    var cond={account:{$ne:'user'}};
    if (params.filter._id) cond.account=params.filter._id;
    var groupby='$account';

    const {db}=await getDB();
    var [summary, users]=await Promise.all([
        db.accounts.aggregate([{$match:cond}, {$group:{_id:groupby, balance:{$sum:'$balance'}, commission:{$sum:'$commission'}, count:{$sum:1}}}]).toArray(),
        _list(params, role, req)
    ]);
    dedecimal(summary);
    var _map={};
    summary.forEach(v=>{_map[v._id]=v});
    return {
        rows:users.rows.map(v=>{
            var s=_map[v._id];
            if (s) return {...v, ...s};
            return v;
        }), 
        total:users.total
    };
}

module.exports=userProvider;