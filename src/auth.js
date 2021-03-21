
export default (apiUrl) => ({
    // called when the user attempts to log in
    login: ({ username, password}) => {
        return fetch(apiUrl+'/admin/login', {
            body:JSON.stringify({u:username, p:password}),
            method:'PUT',
            headers: new Headers({
                'Content-Type': 'application/json'
            })
        }).then(res=>res.json())
        .then(({err, a, o})=>{
            if (err) return  Promise.reject(err);
            localStorage.setItem('userInfo', JSON.stringify(o));
            localStorage.setItem('accToken', a);
            return Promise.resolve();
        })
    },
    // called when the user clicks on the logout button
    logout: () => {
        localStorage.removeItem('accToken');
        localStorage.removeItem('userInfo');
        return Promise.resolve();
    },
    // called when the API returns an error
    checkError: ({ status }) => {
        if (status === 401 || status === 403) {
            localStorage.removeItem('accToken');
            localStorage.removeItem('userInfo');
            return Promise.reject();
        }
        return Promise.resolve();
    },
    // called when the user navigates to a new location, to check for authentication
    checkAuth: () => {
        return localStorage.getItem('accToken')
            ? Promise.resolve()
            : Promise.reject();
    },
    // called when the user navigates to a new location, to check for permissions / roles
    getPermissions: () => {
        var u=localStorage.getItem('userInfo');
        try {
            u=JSON.parse(u);
            return Promise.resolve(u.acl);
        } catch(e) {
            Promise.reject();
        }
    },
    getIdentity: () =>{
        var u=localStorage.getItem('userInfo');
        try {
            u=JSON.parse(u);
            return Promise.resolve({fullName:u.name, id:u._id, acl:u.acl})
        } catch(e) {
            return Promise.reject()
        }
    }
});