import React from 'react';
import {
    Create,
    TextInput,
    SimpleForm,
    required,
    SaveButton,
    Toolbar,
    translate
} from 'react-admin';
import Button from '@material-ui/core/Button';

const TagCreateToolbar = translate(({ onCancel, translate, ...props }) => (
    <Toolbar {...props}>
        <SaveButton />
        <Button onClick={onCancel}>{translate('ra.action.cancel')}</Button>
    </Toolbar>
));

const TagCreate = ({ onCancel, ...props }) => (
    <Create title=" " {...props}>
        <SimpleForm toolbar={<TagCreateToolbar onCancel={onCancel} />}>
            <TextInput source="name" validate={required()} />
        </SimpleForm>
    </Create>
);

export default TagCreate;
