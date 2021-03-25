import React, {useEffect, useState} from 'react'
import { 
	SimpleForm, SelectInput, TextInput, useDataProvider, useListContext, useNotify, Toolbar, Button, NumberInput, Loading, Title
} from 'react-admin';
import {useFormState} from 'react-final-form';
import {Card} from '@material-ui/core';
import md5 from 'md5';
import Qs from 'querystring';
import url from 'url';
import sortObj from 'sort-object';

const Go=({providers, users})=>{
    var {values}=useFormState();
    const notify=useNotify();

    return (
        <Toolbar>
            <Button variant="contained" label="Jump to the recharge page" onClick={()=>{
                console.log(values);
                var partner=users.find(u=>u.id==values.partner);
                if (!partner) return notify('no such partner', 'error');
                var apiUrl=window.location.origin;
                if (window.location.search) {
                    var {server}=Qs.parse(window.location.search.slice(1));
                    if (server) apiUrl=url.format({protocol:window.location.protocol, host:server});
                }
                var now=new Date();
                var params={
                    cb_url:apiUrl+'/demo/result',
                    currency:'CNY',
                    partnerId:partner.merchantid,
                    money:values.money,
                    outOrderId:'TESTORDER'+now.getTime(),
                    return_url:window.location.href,
                    time:now.getTime(),
                    userId:values.userId,
                    provider:values.provider
                };
                if (!params.userId || !params.money) return notify('请正确填写参数', 'warning');
                var key=partner.key;
                params.sign=md5(key+Qs.stringify(sortObj(params)));
                fetch(apiUrl+'/forecore/order?'+Qs.stringify(params), {mode: 'cors',})
                .then(response=>response.json())
                .then(({err, detail, url})=>{
                    if (err) return notify(detail, 'warning');
                    window.location.href=url;
                })
                .catch((e)=>notify(e.message, 'warning'))
            }}/>
        </Toolbar>
    )
}

const Demo =({options, permissions, ...rest})=> {
	const dp=useDataProvider();
	var [providers, setProviders]=useState();
    var [users, setUsers] =useState();
	useEffect(()=>{
        dp.getList('providers')
        .then(({data})=>setProviders(data))
        .catch(()=>{})

        dp.getList('users', {filter:{acl:'merchant'}})
        .then(({data})=>setUsers(data))
        .catch(()=>{})
	}, []);

    return (
        <Card>
            <Title defaultTitle={options.label} />
            {
                (providers==null || users==null)?<Loading />
                :
                <SimpleForm toolbar={<Go providers={providers} users={users} />} submitOnEnter={false}>
                    <SelectInput source="partner" label="Partner" choices={users}/>
                    <TextInput source="userId" label="UserId"/>
                    <NumberInput source="money" label="money" />
                    {(permissions=='merchant' || permissions=='agent')?
                        null:
                        <SelectInput source="provider" label="Provider" choices={providers.map(p=>({id:p.name, name:p.name}))} />
                    }
                </SimpleForm>
            }
        </Card>
)}

export default {
	list:Demo,
}