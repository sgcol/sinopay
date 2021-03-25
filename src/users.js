import React, { useState, useEffect,useCallback, useResourceContext, useTranslate } from "react";
import { Drawer, Typography, makeStyles } from '@material-ui/core';
import InboxIcon from '@material-ui/icons/Inbox';
import { 
	List, Datagrid, TextField, BooleanField, NumberField, EditButton, ShowButton,
	Edit, Create, TabbedForm, FormTab, TextInput, BooleanInput, SelectInput, ReferenceField, NumberInput,
	Show, SimpleShowLayout,
	Loading, Error,
	useDataProvider, useGetMany,useListContext, 
	TopToolbar, CreateButton, SaveButton, Toolbar,
	FormDataConsumer
} from 'react-admin';
import { useForm } from 'react-final-form';
import {DateTimeField, EscapedTextField} from './extends/fields';
import { Route } from 'react-router';
import md5 from 'md5';

const path=require('path');
const objPath =require('object-path');

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
			<BooleanInput source={`providers.${prd.id}.disabled`} parse={v=>!v} format={v=>!v} label={`${prd.name}`}/>
			<FormDataConsumer>
				{
					({formData, ...rest})=>{
						if (enable) {
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
				<NumberInput source="share" defaultValue={3} options={{ minimumFractionDigits: 2, maximumFractionDigits: 2}}/>
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
			<TextField label="partnerId" source="merchantid" />
			<NumberField label="账户余额" source="balance" options={{ minimumFractionDigits: 2, maximumFractionDigits: 2}} />
			<NumberField label="手续费" source="commission" options={{ minimumFractionDigits: 2, maximumFractionDigits: 2}}/>
		</SimpleShowLayout>
	</Show>
)

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
    }),
    { name: 'RaEmpty' }
);

const Empty = props => {
    const { basePath } = useListContext(props);
    const resource = useResourceContext(props);
    const classes = useStyles(props);
    const translate = useTranslate();

    return (
        <>
            <div className={classes.message}>
                <InboxIcon className={classes.icon} />
                <Typography variant="h4" paragraph>
                    {translate(`No partners yet`)}
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

class UserList extends React.Component {
	render() {
		const props  = this.props;
		
		return (
			<React.Fragment>
				<List {...props} filter={{ acl:'merchant' }} exporter={false} title="商户" actions={<UserListActions />} empty={Empty}>
					<Datagrid rowClick="show">
						<TextField source="name" label="显示名"/>
						<EscapedTextField source="id" label="登录名"/>
						<DateTimeField source="createTime" label="创建时间"/>
						{/* <TextField source="key" />
						<TextField source="merchantid" /> */}
						<BooleanField source="debugMode" label="调试"/>
						<NumberField source="share" label="分成" options={{style:"percent"}}/>
						<NumberField label="账户余额" source="balance" options={{ minimumFractionDigits: 2, maximumFractionDigits: 2}}/>
						<NumberField label="手续费" source="commission" options={{ minimumFractionDigits: 2, maximumFractionDigits: 2}}/>
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
								{isMatch? <UserShow id={decodeURIComponent(id)} {...props}/>:null}
							</Drawer>
						)
					}}
				</Route>

				<Route path="/users/:id">
					{({ match , location}) => {
						const isMatch =	match  && match.params && match.params.id !== 'create';
						if (!isMatch) return null;
						if (!match.isExact && path.basename(location.pathname)!=='1') return null;
						return (
							<Drawer
								open={isMatch}
								anchor="right"
								onClose={this.handleClose}
							>
								{isMatch ? (
									<UserEdit
										// className={classes.drawerContent}
										id={isMatch ? decodeURIComponent(match.params.id) : null}
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