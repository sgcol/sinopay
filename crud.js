const { Router } =require('express')
, bodyParser =require('body-parser')
, {verifyAuth} =require('./auth.js')

/**
 * map crud operator to dataDrivers
 * @typedef DataDrivers
 * @property {string} resource
 * @property {object} operator
 * @param {DataDrivers} dataDrivers
 */
const crud = (
	dataDrivers
) => {
	const router = Router()

	for (const key in dataDrivers) {
		const driver=dataDrivers[key];

		// register all availble drivers
		router.options('*', (req, res)=>{
			res.set({
				'Access-Control-Allow-Origin':'*', 
				'Allow':'POST,PUT,DELETE', 
				'Access-Control-Allow-Methods':'POST,PUT,DELETE,OPTIONS', 
				'Access-Control-Allow-Headers': 'Content-Type, acctoken'
			})
			res.end();
		})
		router.get(`/${key}`, verifyAuth, httpc(driver.list));
		router.post(`/${key}`, verifyAuth, bodyParser.json(), httpc(driver.create));
		router.put(`/${key}/:id`, verifyAuth, bodyParser.json(), httpc(getOperator(driver.update, driver.updateMany)));
		router.delete(`/${key}/:id`, verifyAuth, httpc(getOperator(driver.deleteOne, driver.deleteMany)));

		if (driver.actions) {
			for (var act in driver.actions) {
				router.post(`/${key}/${act}`, verifyAuth, bodyParser.json(), httpc(driver.actions[act]));
			}
		}
	}
	return router
}

function readableErr(e) {
	if (e==null) return 'undefined';
	if (typeof e=='string') return e;
	return e.message||e.msg||e.toString();
}
function httpc(f) {
	return (req, res) =>{
		res.set({'Access-Control-Allow-Origin':'*', 'Cache-Control':'max-age=0'})
		if (!f) return res.send({err:'the operator is not availble'})
		try {
			var ret=f({...req.query, ...req.body, ...req.params}, req.auth.acl, req, res);
		} catch(e) {return res.send({err:readableErr(e)})}

		if (ret instanceof Promise) {
			ret.then((result)=>{
				res.send(result||{result:'ok'});
			}).catch((e)=>{
				res.send({err:readableErr(e)});
			})
		}
		else {
			res.send(ret||{result:'ok'});
		}
	}
}

function getOperator(doOne,doMany) {
	return function(params, role, req, res) {
		if (req.params.id && req.params.id.charAt(0)=='[') {
			try {
				var ids=JSON.parse(req.params.id)
			} catch(e) {
				//do nothing
			}
		}
		if (ids) {
			if (doMany) return doMany(ids, req.body, role, req, res);
			return {err:'the operator is not availble'}
		}
		else {
			if (doOne) return doOne(req.params.id, req.body, role, req, res);
			return {err:'the operator is not availble'}
		}
	}
}
module.exports=crud
