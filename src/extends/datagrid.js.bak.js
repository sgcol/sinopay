import React, {Fragment}  from 'react'
import {TableRow, TableCell, TableFooter } from '@material-ui/core';
import { 
	useQueryWithStore, Loading,
    Datagrid, DatagridBody
} from 'react-admin';


const ExtendedDatagridBody =( {footerData, ...props} ) => {
	if (!footerData) return <DatagridBody {...props} />
	const {children, id, record, basePath, resource} =props;
	return (
		<Fragment>
			<DatagridBody {...props} />
			<TableFooter>
				<TableRow key="__footer">
					{React.Children.map(children, field => (
						<TableCell key={`footer-${id}-${field.props.source}`}>
							{(()=>{
								if (!footerData) return null;
								if (field.props.footerText) return field.props.footerText;
								if (field.props.footerSource) return footerData[field.props.footerSource];
								return null
							})()}
						</TableCell>
					))}
				</TableRow>
			</TableFooter>
		</Fragment>
	)
}
const ExtendedDatagridImpl = ({footerResource, body, ...props}) =>{
    const {data, loaded} =useQueryWithStore({type:"getOne", resource:footerResource, payload:props.filterValues});
    if (!loaded) return <Loading />
    body=body||<ExtendedDatagridBody/>
    return <Datagrid {...props} body={<body.type {...body.props} footerData={data}/>} />
}

export const ExtendedDatagrid =({footerResource, ...props}) =>(
    footerResource?<ExtendedDatagridImpl {...props} footerResource={footerResource} />:<Datagrid {...props} />
)
