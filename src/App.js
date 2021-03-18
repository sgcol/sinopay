import * as React from "react";
import { Admin, Resource } from 'react-admin';
// import TreeMenu from '@bb-tech/ra-treemenu';
import DataProvider from './data-provider';
import Users from './users';
import Managers from './managers';
import Agents from './agents';
import Bills from './bills';
import Providers from './providers';
import Docs from './docs';
import Statements from './statements';
import createAuth from './auth';
import financial from './financial';
//icons
import {AccountTree, BusinessCenter, SupervisorAccount, Apartment, Storefront, Receipt} from '@material-ui/icons';
var location=window.location, start_params=new URLSearchParams(location.search), spec_server=start_params.get('server');
var apiUrl;
if (spec_server) {
	if (spec_server.indexOf('//')!==0) spec_server='//'+spec_server;
	apiUrl=location.protocol+spec_server;
	if (apiUrl[apiUrl.length-1]==='/') apiUrl=apiUrl.slice(0, -1);
} else apiUrl=location.protocol+'//'+location.hostname+(location.port?(':'+location.port):'');

const dataProvider = DataProvider(apiUrl);
const App = () => (
	<Admin dataProvider={dataProvider} authProvider={createAuth(apiUrl)} /*layout={(props) => <Layout {...props} menu={TreeMenu}/>}*/>
		{permissions => {
			var ret=[];
			if (permissions==='admin') {
				ret= ret.concat([
				<Resource key="userManager" name="userManager" icon={AccountTree} options={{label:"用户管理", isMenuParent:true}} />,
					<Resource key="managers" name="managers" icon={SupervisorAccount} {...Managers} options={{label:'管理员', menuParent:'userManager'}}/>,
					<Resource key="users" name="users" icon={Storefront} {...Users}  options={{label:'商户', menuParent:'userManager'}}/>,
					// <Resource key="agents" name="agents" icon={Apartment} {...Agents} options={{label:'代理', menuParent:'userManager'}}/>,
				<Resource key="providers" name="providers" icon={BusinessCenter} {...Providers} options={{label:'供应商'}}/>,
				<Resource key="financial_recon" name="recon" icon={BusinessCenter} {...financial.Recon} options={{label:'对账历史'}}/>,
				])
			};
			ret.push(<Resource key="bills" name="bills" icon={Receipt} {...Bills} options={{label:'订单'}}/>);
			ret.push(<Resource key="statements" name="statements" icon={Receipt} {...Statements} options={{label:'报表'}}/>);
			ret.push(<Resource key="docs" name="docs" {...Docs} options={{label:'文档'}} />);
			return ret;
		}}
	</Admin>
);

export default App;