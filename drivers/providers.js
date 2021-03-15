const providers=require('../providers')

module.exports={
	list: (params)=>{
		var allp=providers.getProvider();
		var all=[];
		for (var prd in allp) {
			var p=allp[prd];
			all.push({_id:prd, ...p, forecore:!!p.forwardOrder, reconciliation:!!p.getReconciliation, withdrawal:!!p.withdrawal})
		}
		return {
			rows:all,
			total:all.length
		}
	},
}