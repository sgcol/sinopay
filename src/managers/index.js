import React, {Fragment } from "react";
import { Route } from 'react-router';
import { Drawer } from '@material-ui/core';
import { 
	List, Datagrid, TextField, EditButton,
    TopToolbar, CreateButton,
} from 'react-admin';
import {DateTimeField} from '../extends/fields';
import {ManagerCreator, ManagerEdit} from "./create"

const ListActions = ({ basePath }) => (
    <TopToolbar>
        <CreateButton basePath={basePath} />
    </TopToolbar>
);

class ManagerList extends React.Component {
    render() {
        const { push, classes, ...props } = this.props;
        return (
            <Fragment>
				<List {...props} filter={{ acl:['admin', 'manager'] }} exporter={false} title="管理员" actions={<ListActions />}>
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
                            <ManagerCreator
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