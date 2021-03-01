import React, { useState, useEffect,useCallback } from "react";
import { Drawer, useMediaQuery } from '@material-ui/core';
import { 
	List, Datagrid, TextField, BooleanField, NumberField, EditButton, ShowButton,
	Edit, Create, TabbedForm, FormTab, TextInput, BooleanInput, SelectInput,
	Show, SimpleShowLayout,
	Loading, Error,
	useDataProvider,
	TopToolbar, CreateButton, SaveButton, Toolbar,
	FormDataConsumer
} from 'react-admin';
import { useForm } from 'react-final-form';
import {DateTimeField} from './extends/fields';
import { Route } from 'react-router';
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

			if (formdata.providers) {
				for (const name in formdata.providers) {
					var prd=formdata.providers[name];
					if (prd.enabled!=null) {
						form.change('providers.'+name+'.disabled', !prd.enabled);
						form.change('providers.'+name+'.enabled', undefined);
					}
				}
			}

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

const Providers=({contents, ...props}) => {
	const form = useForm();
	var formdata = form.getState().values;
	var eles=[];
	contents.providers && contents.providers.forEach((prd)=>{
		var enable=!objPath.get(formdata, ['providers', prd.id, 'disabled'], false);
		eles.push((
			<div key={prd.id}>
			<BooleanInput source={`providers.${prd.id}.enabled`} defaultValue={enable} label={`${prd.name}`}/>
			<FormDataConsumer>
				{
					({formData, ...rest})=>{
						if (formData.providers[prd.id].enabled) {
							var eles=[];
							if (prd.options) {
								prd.options.forEach((opt)=>{
									eles.push((
										<SelectInput source={`providers.${prd.id}.${opt.name}`} choices={opt.values.map(v=>({id:v,name:v}))} label={opt.name}/>
									))
								})
							}
							if (prd.params) {
								prd.params.forEach((p)=>{
									eles.push((
										<TextInput source={`providers.${prd.id}.${p}`} label={p}/>
									))
								})
							}
							return eles;
						}
					}
				}
			</FormDataConsumer>
			</div>
		))
	});
	return eles
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

		dp.getList('providers')
		.then(({data})=>{
			setProviders(data);
		}).catch(e=>{
			setError(e);
		})
	}, [])
	if (loading) return <Loading />
	if (error) return <Error />
	
	if (loading) return <Loading />

	const LoginName=(props)=>{
		if (method==='Create') return <TextInput {...props}/>
		else return null;
	}

	return (<TabbedForm toolbar={<PostToolbar />}>
			<FormTab label="General">
				<TextInput source="name" label="显示名"/>
				<LoginName source="id" label="登录名"/>
				<TextInput source="pwd" label="密码" type="password"/>
				<BooleanInput source="debugMode" />
				<TextInput source="share" defaultValue={3}/>
				<SelectInput source="parent" choices={agents}/>
			</FormTab>
			<FormTab label="Providers">
				<Providers contents={{providers}} />
			</FormTab>
		</TabbedForm>)
}

const UserListActions = ({ basePath }) => (
  <TopToolbar>
      <CreateButton basePath={basePath} />
   </TopToolbar>
);

export const UserCreator =props => (<Create {...props} >{CreateAndEditView('Create', {...props, redirect:'list', acl:'merchant', initialValues:{debugMode:true}})}</Create>)

export const UserEdit = props => (<Edit {...props}>{CreateAndEditView('Edit', {...props, redirect:'list'})}</Edit>)

export const UserShow =props=> (
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

class UserList extends React.Component {
	render() {
		const props  = this.props;

		return (
			<React.Fragment>
				<List {...props} filter={{ acl:'merchant' }} exporter={false} title="商户" actions={<UserListActions />}>
					<Datagrid rowClick="show">
						<TextField source="name" label="显示名"/>
						<TextField source="id" label="登录名"/>
						<DateTimeField source="createTime" label="创建时间"/>
						{/* <TextField source="key" />
						<TextField source="merchantid" /> */}
						<BooleanField source="debugMode" label="调试"/>
						<NumberField source="share" label="分成" options={{style:"percent"}}/>
						<NumberField source="daily" label="当日收入" options={{ minimumFractionDigits: 2, maximumFractionDigits: 2}}/>
						<NumberField source="profit" label="账户余额" options={{ minimumFractionDigits: 2, maximumFractionDigits: 2}}/>
						<EditButton />
						<ShowButton />
					</Datagrid>
				</List>
				<Route path="/users/create">
					{({ match }) => (
                        <Drawer
                            open={!!match}
                            anchor="right"
                            onClose={this.handleClose}
                        >
                            <UserCreator
                                // className={classes.drawerContent}
                                onCancel={this.handleClose}
                                {...props}
                            />
                        </Drawer>
                    )}
				</Route>
				<Route path="/users/:id/show">
					{({match}) => {
						const id=match && match.params && match.params.id, isMatch=id&&id!=='create';
						if (!isMatch) return null;
						return (
							<Drawer open={isMatch} anchor="right" onClose={this.handleClose}>
								{isMatch? <UserShow id={id} {...props}/>:null}
							</Drawer>
						)
					}}
				</Route>

				<Route path="/users/:id">
					{({ match }) => {
						const isMatch =	match && match.isExact && match.params && match.params.id !== 'create';
						if (!isMatch) return null;
						return (
							<Drawer
								open={isMatch}
								anchor="right"
								onClose={this.handleClose}
							>
								{isMatch ? (
									<UserEdit
										// className={classes.drawerContent}
										id={isMatch ? match.params.id : null}
                                        onCancel={this.handleClose}
										{...props}
									/>
								) : 
								null
								}
							</Drawer>
						);
					}}
				</Route>
			</React.Fragment>
		);
	}

    handleClose = () => {
        this.props.history.push('/users');
    }
}

export default {
	list:UserList,
	// edit:UserEdit,
	// show:UserShow,
	// create:UserCreator
}