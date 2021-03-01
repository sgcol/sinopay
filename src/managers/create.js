import React, { useCallback } from "react";
import { 
	Edit, Create, SimpleForm, TextInput, 
	SaveButton, Toolbar,
} from 'react-admin';
import { useForm } from 'react-final-form';
import md5 from 'md5';

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
	return (<SimpleForm toolbar={<PostToolbar />}>
			<TextInput source="name" label="显示名"/>
			{method=='Create'?<TextInput source="id" label="登录名"/>:null}
			<TextInput source="pwd" label="密码" type="password"/>
		</SimpleForm>)
}

export const ManagerCreator =props => (<Create {...props}>{CreateAndEditView('Create', {...props, redirect:'list', acl:'manager', initialValues:{debugMode:true}})}</Create>)

export const ManagerEdit = props => (<Edit {...props}>{CreateAndEditView('Edit', {...props, redirect:'list'})}</Edit>)

