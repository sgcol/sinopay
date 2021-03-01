import React, { useState, useEffect,useCallback } from "react";
import { Drawer, useMediaQuery } from '@material-ui/core';
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
import {ManagerCreator, ManagerEdit} from "./create"

export const ManagerList = props => {
	const isSmall = useMediaQuery(theme => theme.breakpoints.down('sm'));
	return (
		<List {...props} filter={{ acl:['admin', 'manager'] }} exporter={false} title="管理员">
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
				<EditButton />
			</Datagrid>
		{/* )} */}
	</List>);
}

class ManagerList extends React.Component {
    render() {
        const { push, classes, ...props } = this.props;
        return (
            <Fragment>
				<List {...props} filter={{ acl:['admin', 'manager'] }} exporter={false} title="管理员">
					<Datagrid>
						<TextField source="name" label="显示名"/>
						<TextField source="id" label="登录名"/>
						<DateTimeField source="createTime" label="创建时间"/>
						<EditButton />
					</Datagrid>
				</List>
                <Route path="/managers/create">
                    {({ match }) => (
                        <Drawer
                            open={!!match}
                            anchor="right"
                            onClose={this.handleClose}
                        >
                            <ManagerCreate
                                // className={classes.drawerContent}
                                onCancel={this.handleClose}
                                {...props}
                            />
                        </Drawer>
                    )}
                </Route>
                <Route path="/managers/:id">
                    {({ match }) => {
                        const isMatch =
                            match &&
                            match.params &&
                            match.params.id !== 'create';

                        return (
                            <Drawer
                                open={isMatch}
                                anchor="right"
                                onClose={this.handleClose}
                            >
                                {isMatch ? (
                                    <ManagerEdit
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
            </Fragment>
        );
    }

    handleClose = () => {
        this.props.history.goBack();
    };
}


export default {
	list:ManagerList,
}