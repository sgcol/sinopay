const {objectId}=require('./dataDrivers.js')
	, {aclgte}=require('../auth')
	, getDB =require('../db.js')
	, {reconciliation}=require('../financial_affairs')
	, {dedecimal, isValidNumber} =require('../etc.js')
	, fs =require('fs')
	, router =require('express').Router()
	, multer =require('multer')
	, path =require('path')
	, upload =multer({dest:path.join(__dirname, '../providers/reconciliation/manual')})
	, csvParser =require('csv-parser')
	, {handleReconciliation} =require('../financial_affairs')

const idChanger=objectId;
// function guessField(obj, possibleName, context) {
// 	var testName=possibleName.toLowerCase;
// 	var {cache={}, name_list=[]}=context;
// 	if (cache[testName]) return obj[cache[testName]];
// 	if (name_list.length==0) {
// 		context.name_list=name_list=Object.keys(obj);
// 	}
// 	var directHit=name_list.findIndex(n=>n.toLowerCase()===testName);
// 	if (directHit>=0) {
// 		cache[testName]=name_list[directHit];
// 		context.cache=cache;
// 		return obj[cache[testName]];
// 	}
// 	var possibleHit=name_list.findIndex(n=>(n.toLowerCase().search(testName)>=0))
// 	if (possibleHit>=0) {
// 		cache[testName]=name_list[directHit];
// 		context.cache=cache;
// 		return obj[cache[testName]];
// 	}
// }
router.post('/upload', upload.single('settlement'), (req, res)=>{
	res.set({'Access-Control-Allow-Origin':'*', 'Cache-Control':'max-age=0'})
	var confirmedOrders=[], received=0, commission=0, context={};
	fs.createReadStream(req.file.path)
	.pipe(csvParser())
	.on('data', (line)=>{
		var money=Number(line.amount), orderId=line['Transaction ID'], fee=Number(line['Settlement Amount'])-amount;
		received+=money;
		commission+=fee;

		confirmedOrders.push({orderId, money, fee});
	})
	.on('end', async ()=>{
		// call financial affare
		handleReconciliation({received, commission, confirmedOrders, recon_tag:path.basename(req.file.path)}, req.body.provider);
	})
	.on('error', (e)=>{
		res.send({err:e});
	})
});
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
	},
	router,
}
