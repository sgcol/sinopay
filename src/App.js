import * as React from "react";
import { Admin, Resource } from 'react-admin';
// import TreeMenu from '@bb-tech/ra-treemenu';
import DataProvider from './data-provider';
import customRoutes from './customRoutes';

import Users from './users';
import Managers from './managers';
import Agents from './agents';
import Bills from './bills';
import Providers from './providers';
import Docs from './docs';
import Statements from './statements';
import createAuth from './auth';
import financial from './financial';
import DashbaordPage from './dashboard';
import Demo from './demo';

//icons
import {AccountTree, CloudDone, PlaylistAddCheck, SupervisorAccount, Apple, Apartment, Storefront, Receipt, Dashboard,Assessment,SportsMotorsports, LibraryBooks, DeveloperBoard} from '@material-ui/icons';
var location=window.location, start_params=new URLSearchParams(location.search), spec_server=start_params.get('server');
var apiUrl;
if (spec_server) {
	if (spec_server.indexOf('//')!==0) spec_server='//'+spec_server;
	apiUrl=location.protocol+spec_server;
	if (apiUrl[apiUrl.length-1]==='/') apiUrl=apiUrl.slice(0, -1);
} else apiUrl=location.protocol+'//'+location.hostname+(location.port?(':'+location.port):'');

const dataProvider = DataProvider(apiUrl);
const App = () => (
	<Admin customRoutes={customRoutes} dataProvider={dataProvider} authProvider={createAuth(apiUrl)} /*layout={(props) => <Layout {...props} menu={TreeMenu}/>}*/>
		{permissions => {
			var ret=[];
			if (permissions==='admin'||permissions==='manager') {
				ret= ret.concat([
				// <Resource key="userManager" name="userManager" icon={AccountTree} options={{label:"用户管理", isMenuParent:true}} />,
					<Resource key="managers" name="managers" icon={SupervisorAccount} {...Managers} options={{label:'Administrators', menuParent:'userManager'}}/>,
					<Resource key="users" name="users" icon={Apple} {...Users}  options={{label:'Partners', menuParent:'userManager'}}/>,
					// <Resource key="agents" name="agents" icon={Apartment} {...Agents} options={{label:'代理', menuParent:'userManager'}}/>,
				<Resource key="providers" name="providers" icon={SportsMotorsports} {...Providers} options={{label:'Providers'}}/>,
				<Resource key="financial_recon" name="recon" icon={CloudDone} {...financial.Recon} options={{label:'Auto Reconcilition'}}/>,
				<Resource key="financial_recon_manual" name="recon_manual" icon={PlaylistAddCheck} {...financial.ReconManual} options={{label:'Manual Reconcilition'}}/>,
				])
			} else {
				ret.push((
					<Resource key="dashboard" name="dashboard" {...DashbaordPage} icon={Dashboard} options={{label:"Dashboard"}} />
				))
			}
			ret.push(<Resource key="bills" name="bills" icon={Receipt} {...Bills} options={{label:'Transactions'}}/>);
			ret.push(<Resource key="statements" name="statements" icon={Assessment} {...Statements} options={{label:'Billings'}}/>);
			ret.push(<Resource key="docs" name="docs" icon={LibraryBooks} {...Docs} options={{label:'Integrations'}} />);
			ret.push(<Resource key="demo" name="demo" icon={DeveloperBoard} {...Demo} options={{label:'Demo'}} />);
			return ret;
		}}
	</Admin>
);

export default App;