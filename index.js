module.exports = function(app, db) {
    return function(opts) {
        const updateLimit = function (req, res, change, next) {
            next = next || function() {};

            const lookups = opts.lookup.map(function(item) {
                return item + ':' + item.split('.').reduce(function(prev, cur) {
                    return prev[cur]
                }, req);
            }).join(':');

            const method = (opts.method || req.method).toLowerCase(),
                  key = 'ratelimit:' + (req.path || opts.paths[0]) + ':' + method + ':' + lookups;

            db.get(key, function(err, limit) {
                if (err && opts.ignoreErrors) {
                    return next();
                }

                const timeNow = Date.now();

                limit = limit ? JSON.parse(limit) : {
                    total: opts.total,
                    remaining: opts.total,
                    reset: timeNow + opts.expire
                }

                if (timeNow > limit.reset) {
                    limit.reset = timeNow + opts.expire;
                    limit.remaining = opts.total;
                }

                // do not allow negative remaining
                limit.remaining = Math.max(Number(limit.remaining) + change, -1);

                db.set(key, JSON.stringify(limit), 'PX', opts.expire, function(e) {
                    if (!opts.skipHeaders) {
                        res.set('X-RateLimit-Limit', limit.total);
                        res.set('X-RateLimit-Reset', Math.ceil(limit.reset / 1000)); // UTC epoch seconds
                        res.set('X-RateLimit-Remaining', Math.max(limit.remaining, 0));
                    }

                    if (limit.remaining >= 0) {
                        return next();
                    }

                    if (!opts.skipHeaders) {
                        res.set('Retry-After', (limit.reset - Date.now()) / 1000);
                    }

                    opts.onRateLimited(req, res, next);
                });
            });
        }

        var middleware = function(req, res, next) {
            if (opts.whitelist && opts.whitelist(req)) {
                return next();
            }

            opts.lookup = Array.isArray(opts.lookup) ? opts.lookup : [opts.lookup];

            opts.onRateLimited = typeof opts.onRateLimited === 'function' ? opts.onRateLimited : function(req, res, next) {
                res.status(429).send('Rate limit exceeded')
            }

            if (!opts.autoIncrement) {
                return next();
            }

            updateLimit(req, res, -1, next);
        }

        if (typeof(opts.lookup) === 'function') {
            var callableLookup = opts.lookup;

            middleware = function(middleware, req, res, next) {
                return callableLookup(req, res, opts, function() {
                    return middleware(req, res, next);
                });
            }.bind(this, middleware)
        }

        if (opts.method) {
            if (opts.path) {
                app[opts.method](opts.path, middleware);
            }

            if (opts.paths && typeof opts.paths === "array") {
                opts.paths.map(function(path) {
                    app[opts.method](path, middleware);
                });
            }
        }

        middleware.prototype.updateLimit = updateLimit;

        return middleware
    }
}