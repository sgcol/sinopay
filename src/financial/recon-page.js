import React, { useState, useEffect } from "react";
import { Form, Label} from 'react-final-form';
import { Box} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import { 
	List, Button, Toolbar, 
	TextField, NumberField, DateField,
	SelectInput, TopToolbar, DateInput, 
	FormDataConsumer, SimpleForm,
	useNotify, useDataProvider, useRedirect, useRefresh, 
	sanitizeListRestProps
} from 'react-admin';
import {ExtendedDatagrid, DateTimeField} from '../extends'
import {fetchApi} from '../data-provider';

const _noop=()=>{}

const useStyles = makeStyles({
  actionButton: {
	  marginBottom:'29px',
  },
});

const ReconInitPage =(props)=> {
	const redirect=useRedirect();
	const dp=useDataProvider(), notify=useNotify();
	return (<Form onSubmit={_noop}>
		{({ handleSubmit }) => (
			<form onSubmit={handleSubmit}>
				<p>选择初始对账的日期</p>
				<DateInput label="日期" source="date"/>
				<FormDataConsumer>
				{({formData, ...rest})=>(
					<Toolbar>
					<Button variant="contained" size="medium" label="初始化对账数据"
					onClick={
						async ()=>{
							if (!formData.date) return notify('Date must be specified', 'error');
							try {
								var ret=await dp.actions('recon', {method:'check', end:new Date(), ...formData});
								if (!ret) return;
								if (ret.data.modified===0) return notify('no data received, system will check data per 30 mins. you will see the results if ', 'warning');
								redirect('/recon');
							} catch(e) {
								notify(e.message, 'warning');
							}
						}
					}
					/>
					</Toolbar>
				)}
				</FormDataConsumer>
			</form>
		)}
	</Form>)
}
const ReconActions = (props) => {
	const {
		className,
		...rest
	} = props;
	const dp=useDataProvider();
	const [providers, setProviders] =useState();

	const notify=useNotify(); 

	useEffect(()=>{
		dp.getList('providers')
		.then(({data})=>{
			setProviders(data);
		}).catch((e)=>{
			notify(e.message, 'warning');
		})
	}, []);

	var classes=useStyles();
	var refresh=useRefresh();

	var choices=[{id:null, name:'All'}];
	if (providers) choices=choices.concat(providers);
	return (
		<TopToolbar className={className} {...sanitizeListRestProps(rest)}>
			<Form onSubmit={_noop}>
				{({ handleSubmit }) => (
		            <form onSubmit={handleSubmit}>
						<Box display="flex" alignItems="flex-end" mb={1}>
							<Box component="span" mr={2}>
								<SelectInput label="供应商" choices={choices} source="provider" />
							</Box>
							<Box component="span" mr={2}>
								<DateInput label="日期" source="date"/>
							</Box>
							<Box component="span" mr={2}>
							<FormDataConsumer>
								{
									({formData, ...rest})=><Button className={classes.actionButton} variant="contained" size="medium"
										onClick={async () => {
											if (!formData.date) return notify('Date must be specified', 'error');
											try {
												var ret=await dp.actions('recon', {method:'check', ...formData});
												if (!ret) return;
												refresh();
												notify(`${ret.data.modified} records updated`, 'info');
											} catch(e) {
												notify(e.message, 'warning');
											}
										}}
										label="重新对账"
									/>
								}
							</FormDataConsumer>
							</Box>
						</Box>
					</form>
				)}
			</Form>
		</TopToolbar>
	);
};

const ReconList = (props) => {
	return (<List {...props} exporter={false} actions={<ReconActions />} title='对账单' bulkActionButtons={false} sort={{ field: 'time', order: 'DESC' }}>
		<ExtendedDatagrid>
			<DateField source="time" label="时间"/>
			<TextField source="account" label="供应商"/>
			<TextField source="recon_tag" label="对账标记"/>
			<NumberField source="received" label="收款"/>
			<NumberField source="commission" label="手续费"/>
		</ExtendedDatagrid>
	</List>);
}

export default {
	list:ReconList,
	create:ReconInitPage
}