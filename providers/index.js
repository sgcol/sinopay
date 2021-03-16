var external_provider ={}, providerNameMap={}, processed={};
const path=require('path'), argv=require('yargs').argv;
var tt = require('gy-module-loader')(path.join(__dirname, './*.pd.js'), function () {
	var keys = Object.keys(tt);
	for (var i = 0; i < keys.length; i++) {
		var prd=tt[keys[i]];
		prd.internal_name=path.basename(keys[i], '.pd.js')
		if (processed[prd.internal_name]) continue;
		processed[prd.internal_name]=prd;

		if (prd.debugMode && process.env.NODE_ENV=='production') {
			console.log((path.basename(keys[i])+' is a debugMode provider, abandoned').yellow);
			continue;
		}
		if (argv.forecoreOnly && !prd.forecore) {
			console.log((path.basename(keys[i])+' is not a forecore provider, abandoned').yellow);
			continue;
		}
		
		external_provider[prd.internal_name] = prd;
		if (prd.name) providerNameMap[prd.name]=prd.internal_name;
	}
});

exports.getProvider=function(pid) {
	if (pid==null) return external_provider;
	if (external_provider[pid]) return external_provider[pid];
	if (providerNameMap[pid] && external_provider[providerNameMap[pid]]) return external_provider[providerNameMap[pid]] 
	return null;
}

const filter = require('filter-object');
async function bestProvider(money,mer, options) {
	if (!mer.providers) throw ('联系对接小伙伴，他忘记给商户配置渠道了');
	var availbleProvders=filter(external_provider, (v, k)=>{
		var opt= mer.providers[k];
		if (options) {
			if (options.forecoreOnly && !(v.forwardOrder)) return false;
		}
		if (!opt) return true;
		return !opt.disabled;
	})
	return availbleProvders[Object.keys(availbleProvders)[0]];
}
async function order(orderid, money,mer, mer_userid, host) {
	var {prd, coinType}=await bestProvider(money, mer, argv);
	return prd.order(orderid, money, mer, mer_userid, coinType, host);
}
exports.bestProvider=bestProvider;
exports.order=order;

async function sellOrder(orderid, money, providername) {
	var prd=external_provider[providername];
	if (!prd) throw('no such provider');
	return prd.sell(orderid, money);
}