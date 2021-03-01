import * as React from "react";

const timestring =(t)=>{
	t=new Date(t);
	if (t=='Invalid Date') return 'Invalid Date';
	return t.toLocaleDateString()+' '+ t.toTimeString().replace(/.*(\d{2}:\d{2}:\d{2}).*/, "$1");;
}
export const DateTimeField = ({ record = {}, source }) =>
	<span>{timestring(record[source])}</span>