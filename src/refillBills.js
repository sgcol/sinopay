import * as React  from 'react';
import {
    useState,
    useEffect
} from 'react';
import get from 'lodash/get';
import {Typography, Button, Card, FormHelperText, makeStyles, Table, TableCell, TableHead, TableBody, TableFooter, TableRow} from '@material-ui/core';
import Alert from '@material-ui/lab/Alert';
import SaveIcon from '@material-ui/icons/Save';
import { useTranslate, ValidationError, Record } from 'ra-core';
import classnames from 'classnames';

import {FormInput, useDatagridStyles, useNotify, Loading, Error, useDataProvider, Toolbar, Title, SimpleForm, SelectInput, useLogout} from 'react-admin';
import {useFormState} from 'react-final-form'

import {DateTimeField} from './extends'

import {fetchApi} from './data-provider'

const useStyles = makeStyles(
    theme => ({
        root: {
            padding: 0,
            marginBottom: 0,
            '& > li:last-child': {
                borderBottom: 'none',
            },
        },
        line: {
            display: 'flex',
            listStyleType: 'none',
            borderBottom: `solid 1px ${theme.palette.divider}`,
            [theme.breakpoints.down('xs')]: { display: 'block' },
            '&.fade-enter': {
                opacity: 0.01,
                transform: 'translateX(100vw)',
            },
            '&.fade-enter-active': {
                opacity: 1,
                transform: 'translateX(0)',
                transition: 'all 500ms ease-in',
            },
            '&.fade-exit': {
                opacity: 1,
                transform: 'translateX(0)',
            },
            '&.fade-exit-active': {
                opacity: 0.01,
                transform: 'translateX(100vw)',
                transition: 'all 500ms ease-in',
            },
        },
        index: {
            width: '3em',
            paddingTop: '1em',
            [theme.breakpoints.down('sm')]: { display: 'none' },
        },
        form: { flex: 2 },
        action: {
            paddingTop: '0.5em',
        },
        leftIcon: {
            marginRight: theme.spacing(1),
        },
    }),
    { name: 'RaArrayFormIterator' }
);

const Save=({history, bills, users:userArray, ...rest})=>{
	const classes = useStyles()
	const dp=useDataProvider(), notify=useNotify(), {values}=useFormState(), logout=useLogout();
	const handleClick=()=>{
		var users={};
		userArray.forEach((u)=>{
			users[u.id]=u;
		})
		var ops=bills.map((bill)=>{
			var {orderId:_id, money, time, paymentMethod}=bill;
			var userid=values['order'+_id];
			if (!userid) return notify('all the owner must be specified');
			if (userid==='system') return {_id, userid, paymentMethod, time};
			else {
				var {share, paymentMethod:payment, name:merchantName}=users[userid];
				return {_id, money, userid, merchantName, share, payment, paymentMethod, time};
			}
		})
		
		fetchApi('/bills/add', {
			method:'POST',
			body:JSON.stringify(ops)
		})
		.then(({headers, json})=>{
			var {insertedCount}=json;
			notify(`${insertedCount} records inserted`, 'success');
			setTimeout(()=>{history.goBack()}, 800);
		}).catch(({message, status})=>{
			if (status === 401 || status === 403) {
				return logout();
			}
			notify(message, 'warning');
		})
	}
	return <Toolbar>
			<Button
				variant="contained"
				type="button"
				color="primary"
				aria-label="Save"
				onClick={handleClick}
			>
				<SaveIcon className={classes.leftIcon}/>Save
			</Button>
		</Toolbar>
}
const RefillBills=(props)=>{
	const {options, history, className}=props;
	const classes = useDatagridStyles(props);
	const bills=history.location.state;
	const dp=useDataProvider(), notify=useNotify();
	const [users, setUsers]=useState();
	useEffect(()=>{
		dp.getList('users', {filter:{acl:['agent', 'merchant']}})
		.then(({data})=>{
			setUsers(data);
		})
		.catch((e)=>{
			notify(e.message, 'error')
		})
	}, []);

	if (!bills) return <Error error="bills not found, you may enter this page by accident"/>
	if (!users) return <Loading />

	var merchants=[], agents=[];
	users.forEach(({acl, name, id})=>{
		if (acl=='merchant') merchants.push({name, id});
		else if (acl=='agent') agents.push({name, id});
	})
	var userList={
		'recharge':merchants,
		'disbursment':merchants.concat(agents),
		'withdrawal':[{id:'system', name:'system'}].concat(agents),
		'topup':[{id:'system', name:'system'}].concat(agents),
	}

	return (<Card>
	<Title defaultTitle="Refill Bills" />
	<Alert severity="error">These orders are not exist in our system, please fill them first</Alert>
	<SimpleForm toolbar={<Save {...props} bills={bills} users={users}/>} submitOnEnter={false}>
		<Table className={classnames(classes.table, className)}>
			<TableHead className={classes.thead}>
				<TableRow
						className={classnames(classes.row, classes.headerRow)}
				>
					<TableCell className={classes.headerCell}>orderId</TableCell>
					<TableCell className={classes.headerCell}>money</TableCell>
					<TableCell className={classes.headerCell}>fee</TableCell>
					<TableCell className={classes.headerCell}>payment</TableCell>
					<TableCell className={classes.headerCell}>time</TableCell>
					<TableCell className={classes.headerCell}>owner</TableCell>
					<TableCell className={classes.headerCell}>outstandingOrder</TableCell>
				</TableRow>
			</TableHead>
			<TableBody className={classnames('datagrid-body', className)}>
			{bills.map((bill, index)=>(
				<TableRow className={classnames(classes.row, {
										[classes.rowEven]: index % 2 === 0,
										[classes.rowOdd]: index % 2 !== 0,
								})}
				>
					<TableCell className={classes.cell}>{bill.orderId}</TableCell>
					<TableCell className={classes.cell}>{bill.money}</TableCell>
					<TableCell className={classes.cell}>{bill.fee||0}</TableCell>
					<TableCell className={classes.cell}>{bill.paymentMethod}</TableCell>
					<TableCell className={classes.cell}><DateTimeField record={bill.time} /></TableCell>
					<TableCell className={classes.cell}><SelectInput choices={userList[bill.paymentMethod]||userList.recharge} source={'order'+bill.orderId} label="owner"/></TableCell>
					<TableCell className={classes.cell}>
						<Typography variant="body2" color="textSecondary">
						{JSON.stringify(bill.originData)}
						</Typography>
					</TableCell>
				</TableRow>
			))}
			</TableBody>
		</Table>
	</SimpleForm>
	</Card>)
}

export default RefillBills;