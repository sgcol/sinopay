import React from "react";
import { 
	List, Datagrid, TextField, BooleanField, ArrayField, SingleFieldList
} from 'react-admin';
import {ChipField} from '../extends'

export default props => (
	<List {...props} exporter={false} title="供应商" bulkActionButtons={false}>
		<Datagrid rowClick="expand">
			<TextField source="name" />
			<BooleanField source="forecore" label="四方"/>
			<BooleanField source="withdrawal" label="支持提款"/>
			<BooleanField source="reconciliation" label="支持对账"/>
			<ArrayField source="supportedMethods" label="支付方式">
				<SingleFieldList>
					<ChipField />
				</SingleFieldList>
			</ArrayField>
		</Datagrid>
	</List>
);