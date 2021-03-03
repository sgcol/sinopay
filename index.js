const express =require('express')
, path =require('path')
, crud =require('./crud.js')
, dataDrivers =require('./drivers')
, compression = require('compression')
, bodyParser=require('body-parser')
, httpf =require('httpf')
, getDB= require('./db.js')
, {md5, randstring} =require('./etc.js')
, argv = require('yargs')
	.default('port', 80)
	.boolean('debugout')
	.default('authtimeout', 3*60*1000)
	.boolean('forecoreOnly')
	.default('forecoreOnly', false)
	.describe('host', 'bypass default host for testing alipay notification')
	.argv
, debugout=require('debugout')(argv.debugout)

require('./financial_affairs');

const app = new express()

var getProviders = require('./providerManager.js').getProvider;

if (argv.debugout) {
	app.use(function (req, res, next) {
		debugout('access', req.url, req.body||'');
		next();
	});
}

app.param('provider', function (req, res, next, external_provider) {
	req.provider = external_provider;
	next();
});
app.use('/pvd/:provider', function (req, res, next) {
	debugout('provider', req.provider);
	var pvd=getProviders(req.provider);
	if (pvd) {
		console.log('access pvd', req.url, req.body||'');
		var router=pvd.router;
		return router && router.call(null, req, res, function (err) { 
			if (err) {
				if (err instanceof Error) {
					var o={message:err.message};
					if (argv.debugout) o.stack=err.stack;
					err=o;
				}
				return res.status(500).send({err:err});
			}
			return res.status(404).send({err:'no such function ' + req.url, detail:arguments}); 
		});
	}
	res.end('pf ' + req.provider + ' not defined');
});

app.use(crud(dataDrivers));

const {addAuth}=require('./auth.js');
app.use(compression());
app.use(express.static(path.join(__dirname, 'build'), {maxAge:0, index: 'index.html' }))
getDB((err, db)=>{
	app.use(bodyParser.json());
	app.use(require('./forecore.js').router);
	app.all('/admin/login', httpf({u:'string', p:'?string', c:'?string', callback:true}, async function(username, password, encryptedPassword, callback) {
		var res=this.res;
		try {
			var r=await db.users.findOne({_id:username});
			if (!r) throw ('用户名密码错');
			if (encryptedPassword) {
				if (r.password!=encryptedPassword) throw callback('用户名密码错');
			} else if (password) {
				if (r.password!==md5(r.salt+password)) throw callback('用户名密码错');
			} else throw callback('用户名密码错');
			var now=new Date();
			var rstr=randstring()+now.getTime();
			var o=addAuth(rstr, r);//authedClients[rstr]=r[0];
			o.validUntil=new Date(now.getTime()+argv.auth_timeout);
			o.acl=o.acl||o.identity;
			o.name=o.name||o._id;
			callback(null, {a:rstr, o})
		} catch(e) {
			callback(e);
		}
	}));
})

app.listen(argv.port, function() {
	console.log(('server is running @ '+argv.port).green);
})

