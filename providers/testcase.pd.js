const url = require('url')
, path = require('path')
, {stringify:querystring, parse:queryparse} = require('querystring')
, router=require('express').Router()
, bodyParser =require('body-parser')
, {confirmOrder, updateOrder, getOrderDetail} =require('../order.js')
, httpf =require('httpf')

const _noop=function() {};

exports.bestSell=null;
exports.getBalance=_noop;
exports.sell=_noop;
exports.bestPair=(money, cb)=>{
	return cb(null, -1, 'TESTCOIN');
};
exports.name='调试用支付网关';
exports.router=router;
exports.supportedMethods=['ANY'];
exports.forecore=true;

router.all('/portal', httpf({orderId:'string', money:'number', currency:'?string', notify_url:'string', return_url:'string', no_return:true}, function (orderId, money, currency, notify_url, return_url) {
    this.res.send(`
    <!DOCTYPE html>
    <html>
    <body>
        <p>
        你正在使用测试接口，请点击 完成充值 
        <br>
        本次充值金额${currency||'¥'}${money}
        </p>
        <p>
            <a href="#" onclick="handle_notify()">完成充值</a>
        </p>
    </body>
    <script>
        async function handle_notify() {
            await fetch("${notify_url}", {
                method:'POST',
                mode:'cors',
                cache: 'no-cache',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({orderId:"${orderId}", money:${money}})
            });
            window.location="${return_url}";
        }
    </script>
    </html>
    `)
}));

router.all('/return', (req, res)=>{
})
router.all('/done', bodyParser.json(), async (req, res) =>{
	var {orderId, money}=req.body;
    await confirmOrder(orderId, money, money);
    res.send('respCode=000000');
});
var forwardOrder =async function(params, callback) {
	callback=callback||function(err, r) {
		if (err) throw err;
		return r;
	}
    var ret={url:url.format({
        pathname:url.resolve(params._host, '../../pvd/testcase/portal'),
        query:{
            orderId:params.orderId,
            money:params.money,
            notify_url:url.resolve(params._host, '../../pvd/testcase/done'),
            return_url:params.return_url,
            currency:params.currency
        }
    })};
    ret.pay_type=params.type;
    return callback(null, ret);
}
exports.forwardOrder=forwardOrder;

if (module===require.main) {
	// debug neat-csv
}