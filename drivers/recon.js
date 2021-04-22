const {objectId}=require('./dataDrivers.js')
	, {aclgte}=require('../auth')
	, getDB =require('../db.js')
	, {reconciliation}=require('../financial_affairs')
	, {dedecimal, isValidNumber, num2dec} =require('../etc.js')
	, fs =require('fs')
	, path =require('path')
	, router =require('express').Router()
	, multer =require('multer')
	, storage = multer.diskStorage({
		destination: path.join(__dirname, '../logs/reconciliation/manual'),
		filename: function (req, file, cb) {
			cb(null, file.originalname)
		}
	})
	, upload =multer({storage})
	, csvParser =require('csv-parser')
	, {handleReconciliation} =require('../financial_affairs')
	, {errfy} =require('../etc')

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
const xenditPayment={
	'VIRTUAL_ACCOUNT_AGGREGATOR':'va',
	'EWALLET':'eWallet',
	'CREDIT_CARD':'creditCard',
	'DISBURSEMENT':'disbursement',
}
router.post('/upload', upload.single('settlement'), (req, res)=>{
	res.set({'Access-Control-Allow-Origin':'*', 'Cache-Control':'max-age=0'})
	var confirmedOrders=[], received=0, commission=0, context={}, outstandingAccountsUpds=[];
	if (req.body.provider=='xendit') var fee_ids={};
	fs.createReadStream(req.file.path)
	.pipe(csvParser())
	.on('data', (line)=>{
		var money=Number(line.amount), 
			orderId=line['Transaction ID']||line.reference, 
			settled=Number(line['Settlement Amount']), 
			fee=0, 
			paymentMethod=line.payment_method, 
			time=new Date(line['created_date_iso']),
			status=line.status;
		if (req.body.provider=='xendit') {
			if (status!=='COMPLETED') return;
			var reg_orderId=(/[a-f0-9]+/);
			var selected=reg_orderId.exec(orderId);
			if (!selected) return;
			orderId=selected[0];

			paymentMethod=xenditPayment[paymentMethod];

			var type=line.type;

			if (type=='DIRECT_DISBURSEMENT_REFUND') return;
			// check if it is a deposit
			if (type==='VIRTUAL_ACCOUNT_DIRECT_DEPOSIT') {
				confirmedOrders.push({originData:line, orderId, money, paymentMethod:'topup', time})
				return;
			}

			//check if it is a withdrawal
			if (type==='SETTLEMENT_DISBURSEMENT_CREATED') {
				confirmedOrders.push({originData:line, orderId, money, paymentMethod:'withdrawal', time});
				// outstandingAccountsUpds.push({updateOne:{
				// 	filter:{account:'xendit', recon_id:'xendit/'+orderId},
				// 	update:{$set:{balance:num2dec(-money), withdrawal:num2dec(money), time:new Date()}},
				// 	upsert:true
				// }})
				return;
			}

			var reg=/[\b_](fee)\b/i;
			// the line is fee
			if (reg.exec(type)) {
				if (!fee_ids[orderId]) fee_ids[orderId]=money;
				else {
					if (typeof fee_ids[orderId]==='number') fee_ids[orderId]+=money;
					else {
						fee_ids[orderId].fee+=money;
						commission+=money;
					}
				}
				return;
			}
			fee=fee_ids[orderId];
		} else 	if (money && settled) fee=money-settled;

		received+=money;
		commission+=fee||0;

		var co={originData:line, orderId, money, fee, paymentMethod:paymentMethod, time};
		confirmedOrders.push(co);
		if (req.body.provider=='xendit') {
			fee_ids[orderId]=co;
		}
	})
	.on('end', async ()=>{
		// call financial affare
		try {
			// if (outstandingAccountsUpds.length) {
			// 	var {db}=await getDB();
			// 	await db.outstandingAccounts.bulkWrite(outstandingAccountsUpds, {ordered:false})
			// }
			var upds=await handleReconciliation({received, commission, confirmedOrders, recon_tag:path.basename(req.file.path)}, req.body.provider);
			res.send({modified:upds});
		}catch(e) {
			res.send({err:errfy(e)})
		}
	})
	.on('error', (e)=>{
		res.send({err:errfy(e)});
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
