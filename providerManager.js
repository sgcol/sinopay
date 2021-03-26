var external_provider ={}, providerNameMap={}, processed={};
const path=require('path'), async=require('async'), argv=require('yargs').argv;
var tt = require('gy-module-loader')(path.join(__dirname, 'provider/*.pd.js'), function () {
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
function bestProvider(money,mer, options, callback) {
    if (typeof options=='function') {callback=options; options=null}
    if (!mer.providers) return callback('联系对接小伙伴，他忘记给商户配置渠道了');
    async.map(filter(external_provider, (v, k)=>{
        var opt= mer.providers[k];
        if (options) {
            if (options.forecoreOnly && !(v.forecore)) return false;
        }
        if (!opt) return true;
        return !opt.disabled;
    }), function(prd, cb) {
        if (!prd.bestPair) return cb(null, {gap:Number.MAX_VALUE, coinType:'rmb'});
        prd.bestPair(money, function(err, gap, coinType){
            if (err) return cb(null, {gap:Number.MAX_VALUE, coinType:''});
            // if (options && options.currency && options.currency!=coinType) return cb(null, {gap:Number.MAX_VALUE, coinType:''});
            return cb(null, {gap:gap, coinType:coinType, prd:prd});
        });
    }, function(err, r) {
        if (r.length>1) r.sort((a, b)=>{return (a.gap-b.gap)});
        for (var i=0; i<r.length; i++) {
            if (r[i].coinType) break;
        }
        if (!r[i].coinType) return callback('没有可用的交易提供方');
        callback(null, r[i].prd, r[i].coinType);
    });
}
function order(orderid, money,mer, mer_userid, host, callback) {
    bestProvider(money, mer, (err, prd, coinType)=>{
        if (err) return callback(err);
        prd.order(orderid, money, mer, mer_userid, coinType, host, callback);
    });
}
exports.bestProvider=bestProvider;
exports.order=order;

function sellOrder(orderid, money, providername, callback) {
    var prd=external_provider[providername];
    if (!prd) return callback('no such provider');
    prd.sell(orderid, money, callback);
}