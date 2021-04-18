import * as React from "react";
import {TextField, sanitizeFieldRestProps} from 'react-admin';
import {Typography} from '@material-ui/core'

const timestring =(t)=>{
	t=new Date(t);
	if (t==='Invalid Date') return 'Invalid Date';
	return t.toLocaleDateString()+' '+ t.toTimeString().replace(/.*(\d{2}:\d{2}:\d{2}).*/, "$1");;
}
export const DateTimeField = ({ className, record={}, source, ...rest }) =>
	<Typography
		component="span"
		variant="body2"
		className={className}
		{...sanitizeFieldRestProps(rest)}
	>
		{timestring(typeof record==='object'?record[source]:record)}
	</Typography>

export const EscapedTextField =({className, emptyText, record, source, ...rest})=> {
	var str=decodeURIComponent(typeof record==='object'?record[source]:record);
	// record={source:str};
	// return <TextField record={record} source={source} {...rest} />	
	// return <TextField {...props} />
	return (<Typography
                component="span"
                variant="body2"
                className={className}
				{...sanitizeFieldRestProps(rest)}
            >
                {str}
            </Typography>
		)
}
