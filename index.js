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
, multer=require('multer')
, upload=multer({dest:'./providers/reconciliation/manual'})

require('./financial_affairs');

const app = new express()

app.set('trust proxy', true);

var getProviders = require('./providers').getProvider;

if (argv.debugout) {
	app.use(bodyParser.json(), function (req, res, next) {
		debugout('access', req.url, req.body||'');
		next();
	});
}

app.post('/upload', upload.single('settle'), function (req, res) {
	console.log(req.file, req.body);
})

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
	res.end('pvd ' + req.provider + ' not defined');
});

app.use(crud(dataDrivers));

const {addAuth}=require('./auth.js');
app.use(compression());
app.use(express.static(path.join(__dirname, 'build'), 	{
		maxAge:7*24*3600*1000, 
		index: 'index.html',
		extensions:['html'],
		setHeaders:(res, fn)=>{
			if (path.extname(fn)=='.html') res.setHeader('Cache-Control', 'public, max-age=0');
		},
	}
))
getDB((err, db)=>{
	app.use(bodyParser.json());
	app.use('/forecore', require('./forecore.js').router);
	app.all('/admin/login', httpf({u:'string', p:'?string', c:'?string', callback:true}, async function(username, password, encryptedPassword, callback) {
		var res=this.res;
		try {
			var r=await db.users.findOne({_id:username});
			if (!r) throw ('用户名密码错');
			if (encryptedPassword) {
				if (r.password!=encryptedPassword) throw ('用户名密码错');
			} else if (password) {
				if (r.password!==md5(r.salt+password)) throw ('用户名密码错');
			} else throw ('用户名密码错');
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
// demo
app.all('/demo/result', httpf(()=>'got it'))

app.listen(argv.port, function() {
	console.log(('server is running @ '+argv.port).green);
})

