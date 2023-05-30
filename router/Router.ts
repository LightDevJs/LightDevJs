function onPushState(callback: any) {
    (function (pushState) {
        window.history.pushState = function (data: any, unused: string, url?: string | URL | null) {
            pushState.call(this, data, unused, url);
            callback.apply(window, arguments);
        };
    })(window.history.pushState);
}

type RouteSetState = string | [string, any?][];

class UrlPathRoute {
    _baseUrl?: string
    prefix: string
    paths: string[] = []

    constructor(prefix?: string) {
        this.prefix = prefix || '';
    }

    addUrlPath(path: string) {
        this.paths.push(path);
        if (this._baseUrl) {
            console.warn('Configure Route baseUrl before add url paths!');
        }

        return this;
    }
}

export class UrlRoute {
    _defaultPathRoute
    private _observer = new Observer()
    private _routes: {
        [name: string]: {
            path: string,
            defaultFn?: () => any,
            encoder?: (val: any) => string,
            decoder?: (part: string) => any
        }
    } = {}
    private _data: { [name: string]: any } = {}
    private _prefix?: string
    _pathRoutes: UrlPathRoute[] = []
    _baseUrl = ''

    constructor() {
        var me = this;

        this._defaultPathRoute = new UrlPathRoute('');

        document.addEventListener('click', function (e) {
            var el = e.target as any;
            while (el && !el.hasAttribute('data-route')) {
                el = el.parentElement;
            }

            if (el) {
                var route = el.getAttribute('data-route') as string;
                if (route && route.indexOf('=') >= 0) {
                    me.setState((route.indexOf('&') >= 0 ? route.split('&') : [route]).map(x => x.split('=') as [string, any]));
                } else if (el.href || route && route[0] === '/') {
                    me.pushState(el.href || route as string);
                } else {
                    return;
                }

                e.preventDefault();
            }
        });

        onPushState(window.onhashchange = this.hashChanged.bind(this));
        window.onpopstate = this.hashChanged.bind(this);
        this.hashChanged();
    }

    setBaseUrl(baseUrl: string) {
        if (baseUrl && baseUrl[baseUrl.length - 1] === '/') {
            baseUrl = baseUrl.substring(0, baseUrl.length - 1);
        }

        this._baseUrl = baseUrl;
    }

    addRoute(prefix: string) {
        var route = new UrlPathRoute(prefix);
        this._pathRoutes.push(route);
        return route;
    }

    get(part: string) {
        var value = this._data[part];
        if (value === null || value == undefined) {
            var reg = this._routes[part];
            if (reg && reg.defaultFn) {
                value = reg.defaultFn();
            }
        }

        if (value === null || value == undefined) {
            value = this.getParameterByName(part, true);
        }

        return value;
    }

    setState(part: RouteSetState, value?: any, silent?: boolean) {
        if (!Array.isArray(part)) {
            part = [[part, value]];
        }

        const partArray = part as [string, any][];

        var i = 0;
        for (; i < partArray.length; i++) {
            if (JSON.stringify(this._data[partArray[i][0]]) !== JSON.stringify(partArray[i][1])) {
                break;
            }
        }

        if (i === partArray.length) {
            return;
        }

        const [path, params] = this.build(partArray);

        return this.setPath(path, params).then(x => {
            if (x !== false && silent !== true) {
                for (; i < partArray.length; i++) {
                    this._data[partArray[i][0]] = partArray[i][1];
                }

                this.fireChange();
            }

            return x;
        })
    }

    _getPathRoute(prefix?: string) {
        if (!prefix) {
            prefix = this._prefix || '';
        }

        return this._pathRoutes.find(x => x.prefix === prefix) || this._defaultPathRoute;
    }

    build(overridePart?: RouteSetState, overrideValue?: any) {
        var params = [],
            pathRoute = this._getPathRoute(),
            paths = new Array(pathRoute.paths.length),
            // hasEmptyPath,
            routePart,
            value,
            data = { ...this._data };

        if (overridePart) {
            if (Array.isArray(overridePart)) {
                (overridePart as [[string, any]]).forEach(x => data[x[0]] = x[1]);
            } else {
                data[overridePart as string] = overrideValue;
            }
        }

        for (var part in this._routes) {
            routePart = this._routes[part];
            value = data[part];

            if (!value && routePart.defaultFn) {
                value = routePart.defaultFn();
            }

            if (routePart.encoder) {
                value = routePart.encoder(value);
            }

            if (value) {
                var pathIndex = pathRoute.paths.indexOf(part);
                if (pathIndex >= 0) {
                    paths[pathIndex] = value;
                } else {
                    params.push(part + '=' + value);
                }
            }
        }

        for (var i = 0; i < paths.length; i++) {
            if (!paths[i] && paths[i] !== false) {
                for (let j = i; j < paths.length; j++) {
                    if (paths[j] || paths[j] === false) {
                        params.push(pathRoute.paths[j] + '=' + paths[j]);
                    }
                }

                paths.splice(i);
                break;
            }
        }

        /**
        for (var i = paths.length - 1; i >= 0; i--) {
            if (hasEmptyPath === false) {
                if (!paths[i] && paths[i] !== false) {
                    hasEmptyPath = true;
                    break;
                }
            } else {
                if (paths[i] || paths[i] === false) {
                    hasEmptyPath = false;
                } else {
                    paths.length--;
                }
            }
        }

        if (hasEmptyPath) {
            for (i = 0; i < paths.length; i++) {
                if (paths[i] || paths[i] === false) {
                    params.push(pathRoute.paths[i] + '=' + paths[i]);
                }
            }

            paths = [];
        }
        /**/

        return [paths.join('/'), params.join('&')];
    }

    buildUrl(path: string, params?: string) {
        if (params?.length && params[0] !== '?') {
            params = '?' + params;
        }

        if (!path) {
            path = '/';
        } else if (path[0] !== '/') {
            path = '/' + path;
        }

        return this._baseUrl + /**(this._prefix ? '/' + this._prefix : '') +/**/ path + (params || '');
    }

    setPath(path: string, params?: string) {
        const url = this.buildUrl(path, params);

        if (window.location.href === url) {
            return Promise.resolve(false);
        }

        return this.pushState(url);
    }

    private pushState(url: string) {
        return Promise.all<boolean>(this._observer.fire('before', [this, new URL(url, this._baseUrl || window.location.origin)]))
            .then(x => {
                if (x.findIndex(x => !x) < 0) {
                    window.history.pushState({}, document.title, url);
                    return Promise.resolve(true);
                } else {
                    return Promise.resolve(false);
                }
            })
    }

    getPath() {
        return window.location.pathname.substring(1) + window.location.search;
    }

    private getPrefix(url?: URL) {
        return this._pathRoutes
            .filter(x => x.prefix && (url || window.location).pathname.substring(1).indexOf(x.prefix) === 0)
            .map(x => x.prefix)[0] || '';
    }

    hashChanged() {
        this._prefix = this.getPrefix();

        for (var part in this._routes) {
            this._data[part] = this.getParameterByName(part, true);
        }

        this.fireChange();
    }

    getParameterByName<T = any>(name: string, silent?: boolean, url?: URL) {
        name = name.replace(new RegExp('[\\[\\]]', 'g'), "\\$&");

        var pathRoute = this._getPathRoute(this.getPrefix(url)),
            pathIndex = pathRoute.paths.indexOf(name),
            result: string | undefined;
        if (pathIndex >= 0) {
            result = (url || window.location).pathname.substring((/**pathRoute.prefix.length ||/**/ -1) + 2).split('/')[pathIndex];
        }

        if (result) {
            result = decodeURIComponent(result);
        }

        if (!result && result !== 'false') {
            var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
                results = regex.exec((url || window.location).href);
            if (!results) return null;
            if (!results[2]) return '';

            result = decodeURIComponent(results[2].replace(/\+/g, " "));
        }

        let route = this._routes[name];
        if (route?.decoder) {
            result = route?.decoder(result);
        }

        if (silent !== true) {
            this.setState(name, result);
        }

        return result as T;
    }

    before(listener: (route: UrlRoute, url: URL) => Promise<boolean>) {
        return this._observer.listen('before', listener);
    }

    listen(listener: (route: UrlRoute) => void) {
        return this._observer.listen('change', listener);
    }

    fireChange() {
        return this._observer.fire('change', [this]);
    }

    register(path: string, defaultFn?: () => any, encoder?: (value: any) => string, decoder?: (part: string) => any) {
        this._routes[path] = {
            path: path,
            defaultFn: defaultFn,
            encoder: encoder,
            decoder: decoder
        };

        var value = this.getParameterByName(path, true);
        if (!value && value !== 'false' && defaultFn) {
            value = defaultFn();
        }

        this._data[path] = value;
    }
};

var route = new UrlRoute();
export default route;