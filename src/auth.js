
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
            localStorage.setItem('accToken', a);
            localStorage.setItem('acl', o.acl);
            return Promise.resolve();
        })
    },
    // called when the user clicks on the logout button
    logout: () => {
        localStorage.removeItem('accToken');
        localStorage.removeItem('acl');
        return Promise.resolve();
    },
    // called when the API returns an error
    checkError: ({ status }) => {
        if (status === 401 || status === 403) {
            localStorage.removeItem('accToken');
            localStorage.removeItem('acl');
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
        var acl=localStorage.getItem('acl');
        return acl?Promise.resolve(acl):Promise.reject();
    }
});