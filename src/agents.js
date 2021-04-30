import React, { useState, useEffect,useCallback } from "react";
import { 
	List, Datagrid, TextField, NumberField, EditButton,
	Edit, Create, SimpleForm, TextInput, SelectInput, BooleanInput, 
	FormDataConsumer, 
	Loading, Error,
	useDataProvider, useListContext, useTranslate, 
	SaveButton, Toolbar, CreateButton, 
} from 'react-admin';
import { Drawer, Typography, makeStyles, FormControl, InputLabel, } from '@material-ui/core';
import InboxIcon from '@material-ui/icons/Inbox';
import { useForm } from 'react-final-form';
import {DateTimeField, ShareSection, ObjectFormIterator} from './extends';
import { Route } from 'react-router';
import classnames from 'classnames';
import md5 from 'md5';
const path=require('path');

const drawerWidth=380;

const useStyles = makeStyles(
    theme => ({
        message: {
            textAlign: 'center',
            opacity: theme.palette.type === 'light' ? 0.5 : 0.8,
            margin: '0 1em',
            color:
                theme.palette.type === 'light'
                    ? 'inherit'
                    : theme.palette.text.primary,
        },
        icon: {
            width: '9em',
            height: '9em',
        },
        toolbar: {
            textAlign: 'center',
            marginTop: '2em',
        },
		drawer: {
			width: drawerWidth,
			flexShrink: 0,
		},
		drawerPaper: {
			width: drawerWidth,
		},
		fixFee :{
			'-webkit-appearance': 'none !important',
			margin: 0
		}
    }),
    { name: 'RaEmpty' }
);

const defaultShare={
	creditCard:{
		mdr:0.03, fix_fee:5000
	},
	eWallet:{
		mdr:0.028, fix_fee:0
	},
	va:{
		mdr:0, fix_fee:7500
	},
	retailOutlets:{
		mdr:0, fix_fee:8500
	},
	disbursement:{
		mdr:0, fix_fee:7500
	}
}

const SaveWithNoteButton = ({ handleSubmitWithRedirect, acl, ...props }) => {
		const { redirect } = props;
		const form = useForm();
		const handleClick = useCallback(() => {
			var formdata = form.getState().values;
			if (formdata.pwd) {
				const salt= Math.random().toString(36).substring(7);
				form.change('salt', salt);
				form.change('password', md5(salt+formdata.pwd));
				form.change('pwd', undefined);
			}

			var share=parseFloat(formdata.share);
			if (share>=1) share=Number((Number(share)/100).toFixed(4))
			form.change('share', share);

			if (formdata.paymentMethod) {
				for (var key in formdata.paymentMethod) {
					var payment=formdata.paymentMethod[key];
					var mdr=parseFloat(payment.mdr);
					if (mdr>=1) mdr=Number((mdr/100).toFixed(4));
					form.change(`paymentMethod.${key}.mdr`, mdr)
				}
			}

			form.change('baseShare', undefined);

			if (acl) form.change('acl', acl)

			handleSubmitWithRedirect(redirect);
		}, [form]);

		return <SaveButton {...props} handleSubmitWithRedirect={handleClick} />;
};
const PostToolbar = props => {
	var {redirect} =props;
	return (<Toolbar {...props}>
			<SaveWithNoteButton
					label="Save"
					redirect={redirect}
					submitOnEnter={false}
					{...props}
			/>
		</Toolbar>
	);
}

const Empty = props => {
    const { basePath } = useListContext(props);
    const classes = useStyles(props);
    const translate = useTranslate();

    return (
        <>
            <div className={classes.message}>
                <InboxIcon className={classes.icon} />
                <Typography variant="h4" paragraph>
                    {translate(`No agents yet`)}
                </Typography>
				<Typography variant="body1">
					{translate(``)}
				</Typography>
            </div>
			<div className={classes.toolbar}>
				<CreateButton variant="contained" basePath={basePath} />
			</div>
        </>
    );
};

function CreateAndEditView(method, props) {
	const dp=useDataProvider();
	const [agents, setAgents] = useState();
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState();
	const classes=useStyles(props);
	const {className}=props;

	useEffect(()=>{
		dp.getList('users', {filter:{acl:'agent'}})
		.then(({data})=>{
			setAgents(data);
			setLoading(false);
		})
		.catch(e=>{
			setError(e);
			setLoading(false);
		});
	}, [])
	if (loading) return <Loading />
	if (error) return <Error />
	
	if (loading) return <Loading />

	const LoginName=(props)=>{
		if (method==='Create') return <TextInput {...props}/>
		else return null;
	}

	var toolbar;
	if (method==='Create') toolbar=<PostToolbar acl="agent"/>
	else toolbar=<PostToolbar />
	return (<SimpleForm toolbar={toolbar}>
			<TextInput source="name" label="显示名"/>
			<LoginName source="id" label="登录名"/>
			<TextInput source="pwd" label="密码" type="password"/>
			<TextInput source="share" defaultValue={'20%'}/>
			<FormDataConsumer>
			{({formData, ...rest})=> {
				var ret=[];
				if (formData.paymentMethod) {
					ret.push(<BooleanInput source="baseShare" label="设置代理价" defaultValue={true}/>)
				}
				else ret.push(<BooleanInput source="baseShare" label="设置代理价" defaultValue={false}/>)
				if (formData.baseShare) {
					ret.push(<ShareSection source="paymentMethod" label="" defaultValue={defaultShare} >
					<ObjectFormIterator>
						<TextInput source="mdr" variant="standard" label="mdr"/>
						<TextInput className={classnames(classes.fixFee, className)} source="fix_fee" variant="standard" label="fixed fee"/>
					</ObjectFormIterator>
				</ShareSection>)
				}
				return ret;
			}}
			</FormDataConsumer>
			{/* <SelectInput source="parent" choices={agents}/> */}
		</SimpleForm>)
}

export const AgentCreator =props => (<Create {...props}>{CreateAndEditView('Create', {...props, redirect:'list', acl:'agent', initialValues:{debugMode:true}})}</Create>)

export const AgentEdit = props => (<Edit {...props}>{CreateAndEditView('Edit', {...props, redirect:'list'})}</Edit>)

export const AgentList = props => {
	const classes = useStyles(props);
	const handleClose = () => {
        props.history.goBack();
    }

	return (
	<>
		<List {...props} filter={{ acl:'agent' }} exporter={false} title="Agents" empty={<Empty />}>
			<Datagrid>
				<TextField source="name" label="显示名"/>
				<TextField source="id" label="登录名"/>
				<DateTimeField source="createTime" label="创建时间"/>
				<NumberField source="share" label="分成" options={{style:"percent"}}/>
				<NumberField source="balance" label="账户余额" options={{ minimumFractionDigits: 2, maximumFractionDigits: 2}}/>
				<EditButton />
			</Datagrid>
		</List>
		<Route path="/agents/create">
			{({ match }) => (
				<Drawer
					className={classes.drawer}
					open={!!match}
					anchor="right"
					onClose={handleClose}
					classes={{
						paper: classes.drawerPaper,
					}}
				>
					<AgentCreator
						// className={classes.drawerContent}
						onCancel={handleClose}
						{...props}
					/>
				</Drawer>
			)}
		</Route>
		<Route path="/agents/:id">
			{({ match , location}) => {
				const isMatch =	match  && match.params && match.params.id !== 'create';
				if (!isMatch) return null;
				if (!match.isExact && path.basename(location.pathname)!=='1') return null;
				return (
					<Drawer
						open={isMatch}
						anchor="right"
						onClose={handleClose}
						className={classes.drawer}
						classes={{
							paper: classes.drawerPaper,
						}}
					>
						{isMatch ? (
							<AgentEdit
								// className={classes.drawerContent}
								id={isMatch ? decodeURIComponent(match.params.id) : null}
								onCancel={handleClose}
								{...props}
							/>
						) : 
						null
						}
					</Drawer>
				);
			}}
		</Route>
	</>);
}

export default {
	list:AgentList,
}