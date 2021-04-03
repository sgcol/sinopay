import React, { useState, useEffect } from "react";
import { Form, Label} from 'react-final-form';
import {Box, Card as MuiCard, CardContent, withStyles, Dialog, DialogTitle, Button as MuiButton} from '@material-ui/core';
import {DoneAll, CloudUpload,SportsMotorsports} from '@material-ui/icons';
import { makeStyles } from '@material-ui/core/styles';
import { 
	List, Toolbar, Button,
	TextField, NumberField, DateField,
	SelectInput, TopToolbar, DateInput, 
	FormDataConsumer, SimpleForm,
	useNotify, useDataProvider, useRedirect, useRefresh, 
	sanitizeListRestProps,
	Filter, FilterList, FilterListItem, FilterLiveSearch, TextInput, DateTimeInput, FileInput, FileField, 
	Loading, 
} from 'react-admin';
import {ExtendedDatagrid, DateTimeField} from '../extends'
import classnames from 'classnames';
import {fetchApi} from '../data-provider';

const _noop=()=>{}

const useStyles = makeStyles({
  actionButton: {
	  marginBottom:'29px',
  },
});

const UploadDialogToolbar =(props)=>{
	const {className,variant = 'contained', disabled, }=props;
	const classes = useStyles(props);

	return (
		<Toolbar {...props}>
		<FormDataConsumer>
		{({formData, ...rest})=>(
			<MuiButton className={classnames(classes.button, className)} varirant={variant} disabled={disabled} type="button"
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
			<SimpleForm handleSubmit={_noop} toolbar={<UploadDialogToolbar />}>
				<SelectInput source="provider" choices={[].concat(providers)} />
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

	return (<List {...props} resource="bills" aside={<FilterSidebar providers={providers}/>} filterDefaultValues={{unsettled:true}} actions={<ReconActions providers={providers}/>} bulkActionButtons={<PostBulkActionButtons />} exporter={false}  title='人工对账' sort={{ field: 'time', order: 'DESC' }}>
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