import * as React from "react";
import {TextField} from 'react-admin';

const timestring =(t)=>{
	t=new Date(t);
	if (t==='Invalid Date') return 'Invalid Date';
	return t.toLocaleDateString()+' '+ t.toTimeString().replace(/.*(\d{2}:\d{2}:\d{2}).*/, "$1");;
}
export const DateTimeField = ({ record = {}, source }) =>
	<span>{timestring(record[source])}</span>

export const EscapedTextField =({record, source, ...rest})=> {
	var str=decodeURIComponent(typeof record==='object'?record[source]:record);
	// record={source:str};
	// return <TextField record={record} source={source} {...rest} />	
	// return <TextField {...props} />
	return (<span>{str}</span>)
}
