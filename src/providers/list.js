import React , {useEffect, useState} from "react";
import { 
	List, Datagrid, TextField, BooleanField, ArrayField, FunctionField, SingleFieldList, Loading, useDataProvider, useNotify, useListContext
} from 'react-admin';
import {ChipField} from '../extends'

const showBalance=(record)=> {
	var amount=(record.balance||0)+(record.receivable||0);
	if (amount===0) return '0';
	return `${amount}=B${record.balance}+R${record.receivable}`;
}
const showOutstanding=(record)=> {
	if (record.outstandingBalanceError) return record.outstandingBalanceError;
	var amount=(record.outstandingBalance||0)+(record.outstandingReceivable||0);
	if (amount===0) return '0';
	return `${amount}=B${record.outstandingBalance}+R${record.outstandingReceivable}`;
}
const FullProviderInfo =({data, ids, ...rest})=>{
	const dp=useDataProvider();
	const notify=useNotify();
	const [pb, setPB]=useState();
	const [oa, setOA]=useState();

	useEffect(()=>{
		if (ids.length===0) return;
		dp.getList('providerBalances', {filter:{account:ids}})
		.then(({data})=>{
			setPB(data);
		})
		.catch((e)=>{
			notify(typeof e==='object'?e.message:e.toString(), 'warning');
		})
		dp.getList('outstandingBalances', {filter:{account:ids}})
		.then(({data})=>setOA(data))
		.catch((e)=>{
			notify(typeof e==='object'?e.message:e.toString(), 'warning')
		})
	}, [ids])

	if (!pb|| !oa) return <Loading />
	pb.forEach((b)=>{
		data[b.id].balance=b.balance||0;
		data[b.id].receivable=b.receivable||0;
	})
	oa.forEach((b)=>{
		if (b.err) data[b.id].outstandingBalanceError=b.err;
		else { 
			data[b.id].outstandingBalance=b.balance;
			data[b.id].outstandingReceivable=b.receivable;
		}
	})
	return 	(<Datagrid>
		<TextField source="name" />
		<BooleanField source="forecore" label="四方"/>
		<BooleanField source="withdrawal" label="支持代付"/>
		<BooleanField source="reconciliation" label="自动对账"/>
		<ArrayField source="supportedMethods" label="支付方式">
			<SingleFieldList>
				<ChipField />
			</SingleFieldList>
		</ArrayField>
		<FunctionField label="Local Account" render={showBalance} />
		<FunctionField label="Outstanding Account" render={showOutstanding} />
	</Datagrid>)
}
export default props => (
	<List {...props} exporter={false} title="供应商" bulkActionButtons={false}>
		{/* <Datagrid rowClick="expand">
			<TextField source="name" />
			<BooleanField source="forecore" label="四方"/>
			<BooleanField source="withdrawal" label="支持提款"/>
			<BooleanField source="reconciliation" label="自动对账"/>
			<ArrayField source="supportedMethods" label="支付方式">
				<SingleFieldList>
					<ChipField />
				</SingleFieldList>
			</ArrayField>
		</Datagrid> */}
		<FullProviderInfo {...props}/>
	</List>
);