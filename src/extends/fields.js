import * as React from "react";
import {TextField, sanitizeFieldRestProps} from 'react-admin';
import {Typography, Tooltip, makeStyles} from '@material-ui/core'
import yellow from '@material-ui/core/colors/yellow'
import red from '@material-ui/core/colors/red'
import WarningIcon from '@material-ui/icons/Warning'
import ErrorIcon from '@material-ui/icons/Error'
import {get} from 'lodash'
import classnames from 'classnames';

const useStyles = makeStyles((theme) => ({
	wrapIcon: {
		verticalAlign: 'middle',
		display: 'inline-flex'
	},
	rightIcon: {
		marginLeft: theme.spacing(1),
	},
}));

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

export const StatusFiled =({className, record={}, source, ...rest}) =>{
	var classes=useStyles();
	var err=get(record, 'lasterr'), mch_ret=get(record, 'merchant_return'), warning, Tip;
	if (err) Tip=<Tooltip title={err} ><ErrorIcon className={classes.rightIcon} style={{ color: red.A700 }} /></Tooltip>;
	else if (mch_ret) {
		try {
			var mch_json=JSON.parse(mch_ret);
			if (mch_json.err) Tip=<Tooltip title={mch_json.err}><WarningIcon className={classes.rightIcon} style={{ color: yellow.A700 }} /></Tooltip>
		} catch(e) {
			Tip=<Tooltip title="merchant_return is not a valid json"><WarningIcon className={classes.rightIcon} style={{ color: yellow.A700 }} /></Tooltip>;
		}
	}
	return (<Typography
                component="span"
                variant="body2"
                className={classnames(classes.wrapIcon, className)}
				{...sanitizeFieldRestProps(rest)}
            >
                {get(record, source, '')}
				{Tip}
            </Typography>
		)
}
