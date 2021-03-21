import React from "react";
import { Card as MuiCard, CardContent, withStyles } from '@material-ui/core';
import AccessTimeIcon from '@material-ui/icons/AccessTime';
import {
	List, TextField, NumberField, DateField, ReferenceField,
    FilterList, FilterListItem,
} from 'react-admin';
import {ExtendedDatagrid} from './extends'

// const BillFilter =props=>(
// 	<Filter {...props}>
// 		<TextInput label="订单id" source="id"/>
// 		<TextInput label="商户订单" source="merchantOrderId" alwaysOn/>
// 		<TextInput label="供应商订单" source="providerOrderId"/>
// 		<TextInput label="商户" source="merchantName" alwaysOn/>
// 		<DateTimeInput label="开始日期" source="startTime"/>
// 		<DateTimeInput label="结束日期" source="endTime"/>
// 		<SelectInput label="订单状态" source="used" choices={[
// 			{id:true, name:'已完成'},
// 			{id:{$ne:true}, name:'未完成'},
// 			{id:undefined, name:'全部'},
// 		]} />
// 		<TextInput label="供应商" source="provider"/>
// 	</Filter>
// )

const StatementPeriod =()=>(
    <FilterList label="Statistics" icon={<AccessTimeIcon />}>
        <FilterListItem label="by day" value={{period:'day'}} />
        <FilterListItem label="by week" value={{period:'week'}} />
        <FilterListItem label="by month" value={{period:'month'}} />
    </FilterList>
)
const Card = withStyles(theme => ({
    root: {
        [theme.breakpoints.up('sm')]: {
            order: -1, // display on the left rather than on the right of the list
            width: '15em',
            marginRight: '1em',
        },
        [theme.breakpoints.down('sm')]: {
            display: 'none',
        },
    },
}))(MuiCard);

const FilterSidebar = () => (
    <Card>
        <CardContent>
            <StatementPeriod />
        </CardContent>
    </Card>
);
export const StatementsList = ({permissions, ...props}) => {
	return (
		<List {...props} title="报表" bulkActionButtons={false} sort={{ field: 'time', order: 'DESC' }}>
			<ExtendedDatagrid footerResource="statementsSummary">
				<DateField source="time" footerText="Total" />
                <ReferenceField label="商户" source="account" reference="users" link={false}>
				    <TextField source="name" />
                </ReferenceField>
				<NumberField source="balance" label="收入" options={{ maximumFractionDigits: 2 }} footerSource="balance"/>
				<NumberField source="commission" label="手续费" footerSource="money" options={{ maximumFractionDigits: 2 }} footerSource="commission"/>
                <NumberField source="count" label="交易笔数" footerSource="money" options={{ maximumFractionDigits: 0 }}/>
			</ExtendedDatagrid>
		</List>
	);
}

export default {
	list:StatementsList,
}