const providers=require('../providers')

module.exports={
	list: (params)=>{
		var allp=providers.getProvider();
		var all=[];
		for (var prd in allp) {
			all.push({_id:prd, ...allp[prd]})
		}
		return {
			rows:all,
			total:all.length
		}
	},
}