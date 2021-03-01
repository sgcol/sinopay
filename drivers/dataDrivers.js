const getDB =require('../db.js')
, {ObjectId} =require('mongodb')
, {dedecimal, decimalfy, isValidNumber} =require('../etc.js')
, {randomBytes} =require('crypto')

function objectId(id) {
    return ObjectId(id)
}
function keepOrignId(id) {
    return id;
}
function guessId(id) {
    try {
        return ObjectId(id);
    } catch(e) {
        return id;
    }
}
function createDriver(collectName, options) {
    var {idChanger, beforeFind, afterFind, beforeUpdate}=options||{};
    idChanger=idChanger||guessId;
    return {
        list: async (params, role)=>{
            if (params.filter) {
                try {
                    params.filter=JSON.parse(params.filter)
                } catch(e) {
                    params.filter={}
                }
                for (const key in params.filter) {
                    var value=params.filter[key];
                    if (key=='_id') {
                        if (Array.isArray(params.filter._id)) {
                            params.filter._id={$in:value.map(idChanger)}
                        }
                        else params.filter._id=idChanger(value);                        
                    } else {
                        if (Array.isArray(value)) params.filter[key]={$in:value};
                    }
                }
                delete params.filter.id;
            }
            const {db}=await getDB();
            if (beforeFind) params.filter=beforeFind(params.filter, params, role);
            var cur=db[collectName].find(params.filter);
            if (params.sort) {
                if (params.order=="ASC" || params.order=='asc') 
                    cur.sort({[params.sort]:1});
                else cur.sort({[params.sort]:-1});
            }
            if (isValidNumber(params.offset)) cur.skip(Number(params.offset));
            if (isValidNumber(params.limit)) cur.limit(Number(params.limit));
            var [rows, total]=await Promise.all([cur.toArray(), cur.count()]);
            dedecimal(rows);
            if (afterFind) rows=afterFind(rows, params, role);
            return {rows, total};
        },
        create:async(params, role) => {
            if (role!='admin') throw 'no privilege to create one';
            if (params.id) {
                params._id=idChanger(params.id);
                delete params.id;
            }
            const {db}=await getDB();

            const {insertedId:_id, ...rest} =await db[collectName].insertOne(decimalfy({createTime:new Date(), key:randomBytes(20).toString('hex'), merchantid:new ObjectId().toHexString(), debugMode:true, ...params}), {w:1});
            return {_id, ...params};
        },
        update:async(id, params, role) =>{
            const {db}=await getDB();
            var filter={_id:idChanger(id)}, upd={$set:decimalfy(params)};
            if (beforeUpdate) {
                var changed=beforeUpdate(filter, upd, params, role);
                filter=changed.filter;
                upd=changed.upd;
            }
            await db[collectName].updateOne(filter, upd, {w:1});
            return {id, ...params};
        },
        updateMany:async(ids, params, role)=>{
            const {db}=await getDB();
            var filter={_id:idChanger(id)}, upd={$set:decimalfy(params)};
            if (beforeUpdate) {
                var changed=beforeUpdate(filter, upd, params, role);
                filter=changed.filter;
                upd=changed.upd;
            }
            await db.tets.updateMany(filter, upd, {w:1});
            return ids;
        },
        deleteOne:async(id, params, role) =>{
            const {db}=await getDB();
            var filter={_id:idChanger(id)};
            if (beforeFind) filter=beforeUpdate(filter, params, role);
            await db[collectName].remove(filter);
            return {id:id}
        },
        deleteMany:async(ids, params, role)=>{
            const {db}=await getDB();
            var filter={_id:{$in:ids.map(idChanger)}};
            if (beforeFind) filter=beforeUpdate(filter, params, role);
            await db[collectName].remove(filter);
            return ids;
        }
    }
}

module.exports= {createDriver, keepOrignId, objectId};
