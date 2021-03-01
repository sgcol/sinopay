import React, { useState, useEffect,useCallback } from "react";
import { useMediaQuery } from '@material-ui/core';
import { 
	List, Datagrid, TextField, BooleanField, NumberField, EditButton, ShowButton,
	Edit, Create, SimpleForm, TabbedForm, FormTab, TextInput, BooleanInput, SelectInput,
	Show, SimpleShowLayout,
	Loading, Error,
	useDataProvider,
	SaveButton, Toolbar,
	FormDataConsumer
} from 'react-admin';
import { useForm } from 'react-final-form';
import {DateTimeField} from './extends/fields';
import md5 from 'md5';
const objPath =require('object-path')

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

			form.change('share', Number((1-Number(formdata.share)/100).toFixed(4)))

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

function CreateAndEditView(method, props) {
	const dp=useDataProvider();
	const [agents, setAgents] = useState();
	const [providers, setProviders] =useState();
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState();

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

	return (<SimpleForm toolbar={<PostToolbar />}>
			<TextInput source="name" label="显示名"/>
			<LoginName source="id" label="登录名"/>
			<TextInput source="pwd" label="密码" type="password"/>
			<TextInput source="share" defaultValue={3}/>
			<SelectInput source="parent" choices={agents}/>
		</SimpleForm>)
}

export const AgentCreator =props => (<Create {...props}>{CreateAndEditView('Create', {...props, redirect:'list', acl:'agent', initialValues:{debugMode:true}})}</Create>)

export const AgentEdit = props => (<Edit {...props}>{CreateAndEditView('Edit', {...props, redirect:'list'})}</Edit>)

export const AgentList = props => {
	const isSmall = useMediaQuery(theme => theme.breakpoints.down('sm'));
	return (
		<List {...props} filter={{ acl:'agent' }} exporter={false} title="代理">
			{/* {isSmall ? (
				<SimpleList
						primaryText={record => record.name}
						secondaryText={record => record.acl}
						tertiaryText={record => timestring(record.createTime)}
				/>
		) : ( */}
			<Datagrid>
				<TextField source="name" label="显示名"/>
				<TextField source="id" label="登录名"/>
				<DateTimeField source="createTime" label="创建时间"/>
				{/* <TextField source="key" />
				<TextField source="merchantid" /> */}
				<NumberField source="share" label="分成" options={{style:"percent"}}/>
				<NumberField source="daily" label="当日收入" options={{ minimumFractionDigits: 2, maximumFractionDigits: 2}}/>
				<NumberField source="profit" label="账户余额" options={{ minimumFractionDigits: 2, maximumFractionDigits: 2}}/>
				<EditButton />
			</Datagrid>
		{/* )} */}
	</List>);
}

export default {
	list:AgentList,
	create:AgentCreator,
	edit:AgentEdit,
}