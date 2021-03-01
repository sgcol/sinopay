import React, { useState, useEffect,useCallback } from "react";
import { useMediaQuery } from '@material-ui/core';
import { 
	List, Datagrid, TextField, BooleanField, NumberField, EditButton, ShowButton,
	Edit, Create, TabbedForm, FormTab, TextInput, BooleanInput, SelectInput,
	Show, SimpleShowLayout,
	Loading, Error,
	useDataProvider,
	TopToolbar, CreateButton, SaveButton, Toolbar,
	FormDataConsumer
} from 'react-admin';

export default props => (
	<List {...props} exporter={false} title="供应商" bulkActionButtons={false}>
		<Datagrid rowClick="expand">
			<TextField source="name" />
			<BooleanField source="forecore" />
		</Datagrid>
	</List>
);