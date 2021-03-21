import React, {useEffect, useState} from 'react'
import { 
	Title, SimpleShowLayout, TextField, useDataProvider, useGetIdentity
} from 'react-admin';
import {Card, CardHeader, CardContent, Grid, Typography, Divider, makeStyles} from '@material-ui/core';
import ReactMarkdown  from 'react-markdown'
import gfm from 'remark-gfm'
import {Prism as SyntaxHighlighter} from 'react-syntax-highlighter'
import { dark } from 'react-syntax-highlighter/dist/esm/styles/prism'
/* eslint import/no-webpack-loader-syntax: off */
const mdsrc =require('!raw-loader!./四方接口.md').default;
// const objPath =require('object-path')

const useStyles = makeStyles((theme) => ({
  header:{
	borderBottom: '1px solid #e9ecef',
	display: 'flex',
    fontSize: '1.25em',
    margin: 0,
    minHeight: '64px',
    overflow: 'hidden',
    padding: '0 16px',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    width: '100%'
  },
  item: {
    color: '#333',
    padding: '15px 40px 0px 30px',
    'margin-bottom': '15px',
  },
  subtitle :{
	display: 'block',
    overflow: 'visible',
    color: '#333',
    'margin-bottom': '10px',
    'margin-top': 0,
    'font-size': '32px' 
  },
  paper: {
    padding: theme.spacing(2),
    margin: 'auto',
    maxWidth: 500,
  },
  image: {
    width: 128,
    height: 128,
  },
  img: {
    margin: 'auto',
    display: 'block',
    maxWidth: '100%',
    maxHeight: '100%',
  },
}));

const renderers = {
  code: ({language, value}) => {
    return (<SyntaxHighlighter style={dark} language="javascript">
		{value}
		</SyntaxHighlighter>
	)
  }
}

const DocShow =({options, permissions, ...rest})=> {
	var classes=useStyles();
	const { identity } = useGetIdentity();
	const dp=useDataProvider();
	var [userKey, setKey]=useState();
	useEffect(()=>{
		if (identity && identity.acl=='merchant') {
			dp.getOne('users', {id:identity.id})
			.then(({data})=>setKey(data))
			.catch(()=>{})
		}
	}, [identity]);

    return (
	// <Show {...props} id="dummy" title="对接文档">
	// 	{/* <SimpleShowLayout>
    //         <ReactMarkdown>
    //             Test
    //         </ReactMarkdown>
	// 	</SimpleShowLayout> */}
	// 	<MarkDownView />
	// </Show>
	<div className="show-page">
		<Title
			defaultTitle={options.label}
	    />
		{userKey?(<Card>
			<CardHeader title="对接参数" className={classes.header}/>
			<Grid container direction="row">
				<Grid item xs={4} className={classes.item}>
					<Typography variant="subtitle1">MD5 Key</Typography>
					<Typography variant="body2" gutterBottom>{userKey.key}</Typography>
				</Grid>
				<Divider orientation="vertical" flexItem />
				<Grid item xs={4} className={classes.item}>
					<Typography variant="subtitle1">PartnerId</Typography>
					<Typography variant="body2" gutterBottom>{userKey.merchantid}</Typography>
				</Grid>
			</Grid>
		</Card>)
		:null
		}
		<Card>
			<CardContent>
				<ReactMarkdown plugins={[gfm]} renders={renderers} >
					{mdsrc}
				</ReactMarkdown>
			</CardContent>
		</Card>
	</div>
)}

export default {
	list:DocShow,
}