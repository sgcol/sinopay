const easym=require('gy-easy-mongo')
, Queue=require('promise-queue')
, argv =require('yargs')
	.demand('mongo')
	.describe('mongo', '--mongo=[mongodb://][usr:pwd@]ip[:port][,[usr:pwd@]ip[:port]]/db, 参考https://docs.mongodb.com/manual/reference/connection-string/')
	.argv;

var __stored_db=null;
var queue = new Queue(1, Infinity);
module.exports=function(cb) {
	var prms=queue.add(function() {
		return new Promise((r, j)=>{
			if (__stored_db) return r({db:__stored_db, easym:easym});
			new easym.DbProvider().init(argv.mongo, 
			{exists:[
				{bills:{index:['status', 'time', 'type', 'checkout',
					{userid:1, used:1, time:-1, lasttime:-1, paidmoney:1, money:1},
					{time:1, provider:1, merchantName:1, status:1, checkout:1},
				]}},
				{withdrawal:{index:['status', 'time']}},
				{users:{index:['acl', 'merchantid']}},
				{'balance':{index:['user._id', 'orderid']}},
				{'accounts':{index:[{time:-1,  account:-1, subject:-1}]}},
				{'outstandingAccounts':{index:[{time:-1,  account:-1, subject:-1}]}},
				{'logs':{capped:true, size:200*1024*1024, max:3650000}},
				{'settlements':{index:['time', 'mchId']}},
				{notify:{capped:true, size:100*1024, max:1000000, index:'read'}},
				'event_tracer',
			]}, 
			function(err, db) {
				if (err) return j(err);
				__stored_db=db;
				r({db, easym});
			});
		})
	});
	if (!cb) return prms;
	prms
	.then(({db, easym})=>cb(null, db, easym))
	.catch(e=>cb(e))
}