import React, { useState, useEffect} from "react";
import {Link} from "react-router-dom";
import { Form, Label} from 'react-final-form';
import {Box, Card as MuiCard, CardContent, withStyles, Dialog, DialogTitle, Button as MuiButton, Collapse} from '@material-ui/core';
import {DoneAll, CloudUpload,SportsMotorsports} from '@material-ui/icons';
import { makeStyles } from '@material-ui/core/styles';
import { 
	List, Toolbar, Button,
	TextField, NumberField, DateField,
	SelectInput, TopToolbar, DateInput, 
	FormDataConsumer, SimpleForm,
	useNotify, useDataProvider, useRedirect, useRefresh, useLogout,
	sanitizeListRestProps,
	Filter, FilterList, FilterListItem, FilterLiveSearch, TextInput, DateTimeInput, FileInput, FileField, 
	Loading, 
} from 'react-admin';
import {ExtendedDatagrid, DateTimeField} from '../extends'
import classnames from 'classnames';
import {fetchApi} from '../data-provider';

const _noop=()=>{}

const useStyles = makeStyles(theme=>({
	actionButton: {
		marginBottom:'29px',
	},
	leftIcon: {
		marginRight: theme.spacing(1),
	},
}));

const UploadDialogToolbar =(props)=>{
	const {className,variant = 'contained', disabled, history}=props;
	const logout=useLogout();
	const notify=useNotify();
	const classes = useStyles(props);
	const [err, setErr] =useState();

	return (
		<Toolbar>
		<FormDataConsumer>
		{({formData, ...rest})=>(
			<MuiButton varirant="contained" disabled={disabled} type="button" color="primary" 
				onClick={()=>{
					const fmdt = new FormData();
					fmdt.append(
						"settlement",
						formData.file.rawFile,
						formData.file.title
					);
					fmdt.append("provider", formData.provider);
					fetchApi('recon/upload', {
						method:'POST',
						body:fmdt
					}).then(({headers, json})=>{
						var {modified}=json;
						notify(`${modified} records updated`, 'success');
					}).catch(({message, status})=>{
						if (status === 401 || status === 403) {
							return logout();
						}
						if (message) {
							if (Array.isArray(message)) {
								if (message.findIndex(v=>v.err=='orderId not exists')>=0) return history.push({pathname:'/refill-bills', state:{bills:message, provider:formData.provider}})//return setErr(message); return notify(`Orders ${message.map(item=>item.orderId).join(',')} are not exists, add them in bills first`, 'warning')
								var msg=message.find(v=>v.err!='orderId not exists');
								if (msg) return notify(msg.err, 'warning');
							}
							return notify(message.toString(), 'warning');
						}
					})
				}}
			>
				<CloudUpload
                    size={18}
                    thickness={2}
                    className={classes.leftIcon}
                />Upload
			</MuiButton>
		)}
		</FormDataConsumer>
		</Toolbar>
	)
}
const UploadDialog=({onClose, selectedValue, open, providers, ...rest})=>{
	if (!open) return null;
	return (
		<Dialog onClose={onClose} aria-labelledby="upload-dialog" open={open}>
			<DialogTitle id="upload-dialog">Select settlement file</DialogTitle>
			<SimpleForm handleSubmit={_noop} toolbar={<UploadDialogToolbar {...rest}/>}>
				<SelectInput source="provider" choices={[].concat(providers)} variant="standard"/>
				<FileInput source="file" accept="text/csv">
					<FileField source="src" title="title" />
				</FileInput>
			</SimpleForm>
		</Dialog>
	)
}

const ReconActions = (props) => {
	const {
		className,
		providers,
		...rest
	} = props;
	const [open, setOpen]=useState();
	// const dp=useDataProvider();
	// const [providers, setProviders] =useState();

	// const notify=useNotify(); 

	// useEffect(()=>{
	// 	dp.getList('providers')
	// 	.then(({data})=>{
	// 		setProviders(data);
	// 	}).catch((e)=>{
	// 		notify(e.message, 'warning');
	// 	})
	// }, []);

	// var classes=useStyles();
	// var refresh=useRefresh();

	// var choices=[{id:null, name:'All'}];
	// if (providers) choices=choices.concat(providers);

	const openUpload=()=>{
		// console.log('clicked')
		setOpen(true);
	}
	const closeUpload=()=>setOpen(false);

	return (
		<>
		<UploadDialog open={open} onClose={closeUpload} {...props}/>
		<TopToolbar className={className} {...sanitizeListRestProps(rest)}>
			<Button label="upload" onClick={openUpload}><CloudUpload /></Button>
			<Button onClick={_noop} label="batch"><DoneAll /></Button>
		</TopToolbar>
		</>
	);
};
const PostBulkActionButtons = props => (
	<Button label="Settlement"><DoneAll/></Button>
);
const ProviderFilter =({providers})=>{
	var choices=[];
	if (providers) choices=choices.concat(providers);

	return (
	<FilterList label="Providers" icon={<SportsMotorsports />}>
		{
			choices.map(item=>(
				<FilterListItem label={item.name} value={{provider:item.id}} />
			))
		}
	</FilterList>)
}

const HasReconId =props=>(
	<FilterList label="unsettled Only" icon={<DoneAll />}>
		<FilterListItem label='Yes' value={{unsettled:true}} />
		<FilterListItem label='No' value={{unsettled:false}} />
	</FilterList>)

const Card = withStyles(theme => ({
	root: {
		[theme.breakpoints.up('sm')]: {
			order: -1, // display on the left rather than on the right of the list
			width: '15em',
			marginRight: '1em',
		},
		[theme.breakpoints.down('sm')]: {
			display: 'none',
		},
	},
}))(MuiCard);

const FilterSidebar = (props) => (
	<Card>
		<CardContent>
			<FilterLiveSearch source="id" />
			<ProviderFilter {...props}/>
			<HasReconId {...props}/>
		</CardContent>
	</Card>
);

const Ops=({record, ...rest})=>(
	record.recon_id?null:<Button label="Settle"></Button>
)
const ReconList = (props) => {
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
	
	if (!providers) return <Loading />

	return (<List {...props} resource="recon" aside={<FilterSidebar providers={providers} {...props}/>} filterDefaultValues={{unsettled:true}} actions={<ReconActions providers={providers} {...props}/>} bulkActionButtons={<PostBulkActionButtons {...props} />} exporter={false}  title='人工对账' sort={{ field: 'time', order: 'DESC' }}>
		<ExtendedDatagrid>
			<TextField source="id"/>
			<TextField source="merchantName" label="商户"/>
			<TextField source="providerOrderId" label="供应商订单"/>
			<TextField source="provider" label="供应商"/>
			<NumberField source="money" footerSource="money"/>
			<TextField source="currency"/>
			<DateTimeField source="time" label="创建时间"/>
			<TextField label="对账ID" source="recon_id" alwaysOn={true}/>
			<Ops alwaysOn={true}/>
		</ExtendedDatagrid>
	</List>);
}

export default {
	list:ReconList,
}