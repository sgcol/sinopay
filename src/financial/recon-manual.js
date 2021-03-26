import React, { useState, useEffect } from "react";
import { Form, Label} from 'react-final-form';
import {Box, Card as MuiCard, CardContent, withStyles} from '@material-ui/core';
import {DoneAll, CloudUpload,SportsMotorsports} from '@material-ui/icons';
import { makeStyles } from '@material-ui/core/styles';
import { 
	List, Toolbar, Button,
	TextField, NumberField, DateField,
	SelectInput, TopToolbar, DateInput, 
	FormDataConsumer, SimpleForm,
	useNotify, useDataProvider, useRedirect, useRefresh, 
	sanitizeListRestProps,
    Filter, FilterList, FilterListItem, FilterLiveSearch, TextInput, DateTimeInput,
} from 'react-admin';
import {ExtendedDatagrid, DateTimeField} from '../extends'
import {fetchApi} from '../data-provider';

const _noop=()=>{}

const useStyles = makeStyles({
  actionButton: {
	  marginBottom:'29px',
  },
});

const ReconActions = (props) => {
	const {
		className,
		...rest
	} = props;
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
	return (
		<TopToolbar className={className} {...sanitizeListRestProps(rest)}>
            <Button onClick={_noop} label="UPLOAD"><CloudUpload /></Button>
            <Button onClick={_noop} label="BATCH"><DoneAll /></Button>
		</TopToolbar>
	);
};
const PostBulkActionButtons = props => (
    <Button label="Settlement"><DoneAll/></Button>
);
const ProviderFilter =props=>{
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

const FilterSidebar = () => (
    <Card>
        <CardContent>
            <FilterLiveSearch source="id" />
            <ProviderFilter />
            <HasReconId />
        </CardContent>
    </Card>
);

const Ops=({record, ...rest})=>(
    record.recon_id?null:<Button label="Settle"></Button>
)
const ReconList = (props) => {
	return (<List {...props} resource="bills" aside={<FilterSidebar />} filterDefaultValues={{unsettled:true}} actions={<ReconActions />} bulkActionButtons={<PostBulkActionButtons />} exporter={false}  title='人工对账' sort={{ field: 'time', order: 'DESC' }}>
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