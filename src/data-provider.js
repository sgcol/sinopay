import { stringify } from 'query-string';
import { fetchUtils } from 'ra-core';
import { HttpError } from 'react-admin';

/**
 * Maps react-admin queries to a my api
 *
 * This REST dialect is similar to the one of FakeRest
 *
 * @see https://github.com/marmelab/FakeRest
 *
 * @example
 *
 * getList     => GET http://my.api.url/posts?sort=title&order=asc&limit=24&offset=0
 * getOne      => GET http://my.api.url/posts/123
 * getMany     => GET http://my.api.url/posts?filter={id:[123,456,789]}
 * update      => PUT http://my.api.url/posts/123
 * create      => POST http://my.api.url/posts
 * delete      => DELETE http://my.api.url/posts/123
 *
 * @example
 *
 * import * as React from "react";
 * import { Admin, Resource } from 'react-admin';
 * import dataProvider from './data-provider';
 *
 * import { PostList } from './posts';
 *
 * const App = () => (
 *     <Admin dataProvider={dataProvider('http://path.to.my.api/')}>
 *         <Resource name="posts" list={PostList} />
 *     </Admin>
 * );
 *
 * export default App;
 */

function _id2id(arr) {
    arr.forEach((item)=>{
        if (item._id!=null) {
            item.id=item._id;
            item._id=undefined;
        }
    })
    return arr;
}
function id2_id(obj) {
    if (obj.id!=null) {
        obj._id=obj.id;
        obj.id=undefined;
    }
    return obj;
}

function myFetchJson(url, options) {
    options=options||{};
    if (options.headers) {
        if (!(options.headers instanceof Headers)) options.headers=new Headers(options.headers)
        options.headers.set('accToken', localStorage.getItem('accToken'));
    } else {
        options.headers=new Headers({
            accToken:localStorage.getItem('accToken')
        })
    }
    return fetchUtils.fetchJson(url, options).then((result)=>{
        if (result.json && result.json.err) return Promise.reject(new HttpError(result.json.err, 500, result.json));
        return Promise.resolve(result)
    })
}
function mapResource(name) {
    switch(name) {
        case 'managers':
        case 'agents':
            return 'users';
        default:
            return name;
    }
}

var baseUrl;
export const fetchApi=(url, options) =>{
    if (url[0]==='/') var uri=`${baseUrl}${url}`;
    else uri=`${baseUrl}/${url}`;
    return myFetchJson(uri, options);
};
/**
 * @param  {} apiUrl
 * @param  {} httpClient=fetchUtils.fetchJson
 * @returns DataProvider
 */
export default (apiUrl, httpClient = myFetchJson) => {
    baseUrl=apiUrl;
    return {
        /**
        * @typedef GetListParams
        * @type {object}
        * @property { page: {int} , perPage: {int} } pagination
        * @property { field: {string}, order: {string} } sort
        * @property {object} filter
        * @param  {string} resource
        * @param  {GetListParams} params
        */
        getList: (resource, params) => {
            var offset,limit, sort, order, filter;
            if (params) {
                if (params.pagination) {
                    const { page, perPage } = params.pagination;
                    offset=(page - 1) * perPage;
                    limit=perPage;
                }
                if (params.sort) {
                    sort = params.sort.field;
                    order = params.sort.order;
                }
                if (params.filter) {
                    filter=JSON.stringify(id2_id(params.filter));
                }
            }
            const query = {
                offset,
                limit,
                sort,
                order,
                filter
            };
            const url = `${apiUrl}/${mapResource(resource)}?${stringify(query)}`;

            return httpClient(url, {
                // Chrome doesn't return `Content-Range` header if no `Range` is provided in the request.
                // headers: new Headers({
                //     Range: `${mapResource(resource)}=${rangeStart}-${rangeEnd}`,
                // }),
            }).then(({ headers, json }) => {
                // if (!headers.has('content-range')) {
                //     throw new Error(
                //         'The Content-Range header is missing in the HTTP Response. The simple REST data provider expects responses for lists of resources to contain this header with the total number of results to build the pagination. If you are using CORS, did you declare Content-Range in the Access-Control-Expose-Headers header?'
                //     );
                // }
                _id2id(json.rows);
                return {
                    data: json.rows,
                    total: json.total,
                };
            });
        },
        /**
        * @typedef GetOneParams
        * @type {object}
        * @property { string } id
        * @param  {string} resource
        * @param  {GetOneParams} params
        */
        getOne: (resource, params) => {
            return httpClient(`${apiUrl}/${mapResource(resource)}?${stringify({filter:JSON.stringify(id2_id(params))})}`).then(({ json }) => {
                if (json.err) throw new HttpError(json.err, 500, json);
                var data=json.rows[0];
                if (!data) return {data:null};
                data.id=data._id;
                data._id=undefined;
                return {data};
            })
        },

        getMany: (resource, params) => {
            var {ids:_id, ...rest}=params
            const query = {
                filter: JSON.stringify({_id, ...rest}),
            };
            const url = `${apiUrl}/${mapResource(resource)}?${stringify(query)}`;
            return httpClient(url).then(({ json }) => {
                // _id2id(json.rows);
                var ids={};
                json.rows.forEach(v=>ids[v._id]=v);
                var data=params.ids.map(id=>({id, ...ids[id]}))
                return {
                    data,
                    total: params.ids.length
                }
            }) 
        },

        /**
        * @typedef GetManyReferenceParams
        * @property {string} target 
        * @property {mixed} id
        * @property { {int} page , {int} perPage } pagination
        * @property { {string} field , {string} order } sort
        * @property {Object} filter
        * @param {string} resource
        * @param {GetManyReferenceParams} params
        */
        getManyReference: (resource, params) => {
            const { page, perPage } = params.pagination;
            const { field:sort, order } = params.sort;
            const query = {
                sort,
                order,
                offset: (page - 1) * perPage,
                limit: perPage,
                filter: JSON.stringify({
                    ...id2_id(params.filter),
                    [params.target]: params.id,
                }),
            };
            const url = `${apiUrl}/${mapResource(resource)}?${stringify(query)}`;

            return httpClient(url).then(({ json }) => {
                _id2id(json.rows);
                return {
                    data: json.rows,
                    total: json.total,
                };
            });
        },

        update: (resource, params) => {
            params.data.id=undefined;
            params.data._id=undefined;
            return httpClient(`${apiUrl}/${mapResource(resource)}/${params.id}`, {
                method: 'PUT',
                body: JSON.stringify(params.data),
            }).then(({ json }) => { 
                return {data: json} 
            })
        },

        // simple-rest doesn't handle provide an updateMany route, so we fallback to calling update n times instead
        updateMany: (resource, params) => {
            params.data.id=undefined;
            params.data._id=undefined;
            return httpClient(`${apiUrl}/${mapResource(resource)}/${JSON.stringify(params.ids)}`, {
                method: 'PUT',
                body: JSON.stringify(params.data),
            }).then(({json}) => { 
                return {data: json}
            })
        },

        create: (resource, params) =>
            httpClient(`${apiUrl}/${mapResource(resource)}`, {
                method: 'POST',
                body: JSON.stringify(params.data),
            }).then(({ json }) => {
                return {data: { ...params.data, id: json._id }}
            }),

        delete: (resource, params) => {
            return httpClient(`${apiUrl}/${mapResource(resource)}/${params.id}`, {
                method: 'DELETE',
            }).then(({ json }) => { 
                return {data: json }
            })
        },

        // simple-rest doesn't handle filters on DELETE route, so we fallback to calling DELETE n times instead
        deleteMany: (resource, params) => {
            return httpClient(`${apiUrl}/${mapResource(resource)}/${JSON.stringify(params.ids)}`, {
                method: 'DELETE',
            }).then(({ json }) => {
                return {data: json} 
            })
        },
        actions: (resource, params) =>{
            var _id=undefined;
            if (params.id) {
                _id=decodeURIComponent(params.id);
                params.id=undefined;
            }
            return httpClient(`${apiUrl}/${mapResource(resource)}/${params.method}`, {
                method:'POST',
                body:JSON.stringify({_id, ...params})
            }).then(({json})=>{
                return {data:json};
            })
        },
    }
}