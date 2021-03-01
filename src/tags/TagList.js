import React, { Fragment } from 'react';
import { connect } from 'react-redux';
// import compose from 'recompose/compose';
import { withStyles } from '@material-ui/core';

import {
    Datagrid,
    List,
    TextField,
    CardActions,
    CreateButton,
    EditButton
} from 'react-admin';
import { Route, Switch } from 'react-router';
import { Drawer } from '@material-ui/core';
import TagCreate from './TagCreate';
import TagEdit from './TagEdit';

const styles = {
    drawerContent: {
        width: 300
    }
};

const TagListActions = ({ basePath }) => (
    <CardActions>
        <CreateButton basePath={basePath} />
    </CardActions>
);

class TagList extends React.Component {
    render() {
        const { push, classes, ...props } = this.props;
        return (
            <Fragment>
                <List
                    {...props}
                    sort={{ field: 'name', order: 'ASC' }}
                    actions={<TagListActions />}
                >
                    <Datagrid>
                        <TextField source="name" />
                        <EditButton />
                    </Datagrid>
                </List>
                <Route path="/tags/create">
                    {({ match }) => (
                        <Drawer
                            open={!!match}
                            anchor="right"
                            onClose={this.handleClose}
                        >
                            <TagCreate
                                // className={classes.drawerContent}
                                onCancel={this.handleClose}
                                {...props}
                            />
                        </Drawer>
                    )}
                </Route>
                <Route path="/tags/:id">
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
                                    <TagEdit
                                        // className={classes.drawerContent}
                                        id={isMatch ? match.params.id : null}
                                        onCancel={this.handleClose}
                                        {...props}
                                    />
                                ) : 
                                // (
                                    // <div className={classes.drawerContent} />
                                // )
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

// export default compose(
//     connect(
//         undefined,
//         { /*push*/ }
//     ),
//     withStyles(styles)
// )(TagList);
export default TagList;