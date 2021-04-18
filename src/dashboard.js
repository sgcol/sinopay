import React, {useEffect, useState} from 'react'
import { 
	Title, useDataProvider, useGetIdentity, useRefresh
} from 'react-admin';
import {Button, Card, CardHeader, CardContent, Grid, Typography, Divider, makeStyles} from '@material-ui/core';
import Alert from '@material-ui/lab/Alert';

const useStyles = makeStyles((theme) => ({
  mb2:{
	  marginBottom:'2em',
  },
  header:{
	borderBottom: '1px solid #e9ecef',
	display: 'flex',
    fontSize: '1.25em',
    margin: '0px',
    minHeight: '64px',
    overflow: 'hidden',
    padding: '0 16px',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    width: '100%'
  },
  item: {
    color: '#333',
    padding: '15px 40px 0px 30px',
    'margin-bottom': '15px',
  },
  subtitle :{
	display: 'block',
    overflow: 'visible',
    color: '#333',
    'margin-bottom': '10px',
    'margin-top': 0,
    'font-size': '32px' 
  },
  paper: {
    padding: theme.spacing(2),
    margin: 'auto',
    maxWidth: 500,
  },
  image: {
    width: 128,
    height: 128,
  },
  img: {
    margin: 'auto',
    display: 'block',
    maxWidth: '100%',
    maxHeight: '100%',
  },
}));

const DisableDebugMode=({user, ...rest})=>{
	const dp=useDataProvider(), refresh=useRefresh();
	const action=<Button color="inherit" size="small" onClick={()=>{
		dp.update('users', {data:{debugMode:false}})
		.then(refresh)
	}}>DISABLE DEBUG</Button>
	return (user && user.debugMode)? (
		<Alert severity="warning" variant="filled" {...rest} action={action}>您正在使用调试接口，在正式上线之前请务必关闭调试模式</Alert>
	):null
}
const DashboardShow =({options, permissions, ...rest})=> {
	var classes=useStyles();
	const { identity } = useGetIdentity();
	const dp=useDataProvider();
	var [user, setUser]=useState();
	useEffect(()=>{
		if (identity && identity.acl=='merchant') {
			dp.getOne('users', {id:identity.id})
			.then(({data})=>setUser(data))
			.catch(()=>{})
		}
	}, [identity]);

    return (
	// <Show {...props} id="dummy" title="对接文档">
	// 	{/* <SimpleShowLayout>
    //         <ReactMarkdown>
    //             Test
    //         </ReactMarkdown>
	// 	</SimpleShowLayout> */}
	// 	<MarkDownView />
	// </Show>
	<div className="show-page">
		<DisableDebugMode user={user} className={classes.mb2}/>
		<Title
			defaultTitle={options.label}
	    />
		{user?(<Card>
			<CardHeader title="Summary" className={classes.header}/>
			<Grid container direction="row">
				<Grid item xs={3} className={classes.item}>
					<Typography variant="subtitle1" className={classes.subtitle}>{user.balance||0}</Typography>
					<Typography variant="body2" gutterBottom>Balance</Typography>
				</Grid>
				<Divider orientation="vertical" flexItem />
				<Grid item xs={3} className={classes.item}>
					<Typography variant="subtitle1" className={classes.subtitle}>{user.count||0}</Typography>
					<Typography variant="body2" gutterBottom>Total Transaction</Typography>
				</Grid>
				<Divider orientation="vertical" flexItem />
				<Grid item xs={3} className={classes.item}>
					<Typography variant="subtitle1" className={classes.subtitle}>{user.receivable||0}</Typography>
					<Typography variant="body2" gutterBottom>Receivable</Typography>
				</Grid>
			</Grid>
		</Card>)
		:null
		}
	</div>
)}

export default {
	list:DashboardShow,
}