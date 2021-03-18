import React from 'react'
import { 
	TitleForRecord, SimpleShowLayout, TextField
} from 'react-admin';
import Card from '@material-ui/core/Card';
import ReactMarkdown  from 'react-markdown'
import gfm from 'remark-gfm'
import {Prism as SyntaxHighlighter} from 'react-syntax-highlighter'
import { dark } from 'react-syntax-highlighter/dist/esm/styles/prism'
/* eslint import/no-webpack-loader-syntax: off */
const mdsrc =require('!raw-loader!./四方接口.md').default;
// const objPath =require('object-path')

const renderers = {
  code: ({language, value}) => {
    return (<SyntaxHighlighter style={dark} language="javascript">
		{value}
		</SyntaxHighlighter>
	)
  }
}

const DocShow =({options, ...rest})=> {

    return (
	// <Show {...props} id="dummy" title="对接文档">
	// 	{/* <SimpleShowLayout>
    //         <ReactMarkdown>
    //             Test
    //         </ReactMarkdown>
	// 	</SimpleShowLayout> */}
	// 	<MarkDownView />
	// </Show>
	<div className="show-page" style={{'marginTop':'64px'}}>
		<TitleForRecord
			title={options.label}
			defaultTitle={options.label}
	    />
		<Card>
		{
			()=>{
				return (
					<SimpleShowLayout>
						<TextField source="merchantId" label="partnerId"/>
						<TextField source="key" label="MD5 Key"/>
					</SimpleShowLayout>
				)
			}
		}
			<ReactMarkdown plugins={[gfm]} renders={renderers} >
    			{mdsrc}
    		</ReactMarkdown>
		</Card>
	</div>
)}

export default {
	list:DocShow,
}