import React, {useState, useEffect} from "react";
import {ButtonGroup, Button, Chip} from '@material-ui/core';
import { 
	List, TextField, NumberField,
	TextInput, SelectInput,
	Show, SimpleShowLayout,
	useNotify, useDataProvider, 
	Filter,
	DateTimeInput,
} from 'react-admin';
import {DateTimeField} from './extends/fields';
import { useDispatch } from 'react-redux';
import { refreshView } from 'ra-core';
import {fetchApi} from './data-provider';
import {ExtendedDatagrid} from './extends'

export const BillShow =props=> (
	<Show {...props}>
		<SimpleShowLayout>
			<TextField source="name" label="显示名"/>
			<TextField source="key" />
			<TextField source="merchantid" />
			<NumberField source="daily" label="当日收入" options={{ minimumFractionDigits: 2, maximumFractionDigits: 2}}/>
			<NumberField source="profit" label="账户余额" options={{ minimumFractionDigits: 2, maximumFractionDigits: 2}}/>
		</SimpleShowLayout>
	</Show>
)

// const QuickFilter = ({ label }) => {
//     return <Chip label={label} />;
// };

const BillFilter =props=>{
	const dp=useDataProvider(), notify=useNotify();
	var [merchants, setMerchants]=useState();
	useEffect(()=>{
		dp.getList('users', {filter:{acl:'merchant'}})
		.then(({data})=>setMerchants(data))
		.catch(e=>notify(e.message, 'warning'))
	}, []);
	return (
	<Filter {...props}>
		<TextInput label="订单id" source="id"/>
		<TextInput label="商户订单" source="merchantOrderId" alwaysOn/>
		<TextInput label="供应商订单" source="providerOrderId"/>
		<TextInput label="商户" source="merchantName" alwaysOn/>
		<DateTimeInput label="开始日期" source="startTime"/>
		<DateTimeInput label="结束日期" source="endTime"/>
		<SelectInput label="订单状态" source="used" choices={[
			{id:true, name:'已完成'},
			{id:{$ne:true}, name:'未完成'},
			{id:undefined, name:'全部'},
		]} />
		<TextInput label="供应商" source="provider"/>
	</Filter>)
}

const OptionButtons =({permissions, ...props})=>{
	const {record}=props;
	var dispatch = useDispatch();
	const notify=useNotify();

	function TakeAction(resource, params) {
		return fetchApi(`${resource}/${params.action}`, {
			method:'POST',
			body:JSON.stringify({_id:decodeURIComponent(params.id)})
		}).then(({json})=>{
			notify('done', 'info');
			return {data:json};
		}).catch((e)=>{
			notify(e.message, 'warning');
		})
	}

	return (
		<ButtonGroup variant="text" color="primary" aria-label="text primary button group">
			<Button onClick={()=>{TakeAction('bills', {action:'notify', id:record.id})}}>notify</Button>
			{permissions==='admin'?<Button onClick={()=>{TakeAction('bills', {action:'debugBill', id:record.id}).then(()=>{dispatch(refreshView())})}}>debug</Button>:null}
			{permissions==='admin'?<Button onClick={()=>{TakeAction('bills', {action:'adminUseBill', id:record.id}).then(()=>{dispatch(refreshView())})}}>force</Button>:null}
			<Button onClick={()=>{TakeAction('bills', {action:'refund', id:record.id}).then(()=>{dispatch(refreshView())})}}>refund</Button>
		</ButtonGroup>
	)
}

export const BillList = ({permissions, ...props}) => {
	return (
		<List {...props} filters={<BillFilter/>} exporter={false} title="充值订单" bulkActionButtons={false} sort={{ field: 'time', order: 'DESC' }}>
			<ExtendedDatagrid footerResource="billsSummary">
				<TextField source="id" footerText="Total"/>
				<TextField source="merchantName" label="商户"/>
				<TextField source="merchantOrderId" label="商户订单"/>
				<TextField source="providerOrderId" label="供应商订单"/>
				<TextField source="provider" label="供应商"/>
				<NumberField source="share" label="分成" options={{style:"percent"}}/>
				<NumberField source="money" footerSource="money"/>
				<TextField source="currency"/>
				<DateTimeField source="time" label="创建时间"/>
				<TextField source="status" />
				<OptionButtons permissions={permissions} alwaysOn={true}/>
			</ExtendedDatagrid>
		</List>
	);
}

export default {
	list:BillList,
	show:BillShow,
}