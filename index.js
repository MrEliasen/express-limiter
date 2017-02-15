function RateLimiter(app, db, opts) {
    this.opts = opts;
    this.db = db;

    if (this.opts.method) {
        if (this.opts.path) {
            app[this.opts.method](this.opts.path, (req, res, next) => {
                this.middleware(req, res, next, this);
            });
        }

        if (this.opts.path && typeof this.opts.path === "array") {
            this.opts.path.map(function(path) {
                app[this.opts.method](path, (req, res, next) => {
                    this.middleware(req, res, next, this);
                });
            });
        }
    }
}

RateLimiter.prototype.middleware = function(req, res, next, scope) {
    if (scope.opts.whitelist && scope.opts.whitelist(req)) {
        return next();
    }

    scope.opts.lookup = Array.isArray(scope.opts.lookup) ? scope.opts.lookup : [scope.opts.lookup];
    scope.opts.onRateLimited = typeof scope.opts.onRateLimited === 'function' ? scope.opts.onRateLimited : function(req, res, next) {
        res.status(429).send('Rate limit exceeded')
    }

    if (!scope.opts.autoUpdate) {
        return next();
    }

    scope.updateLimit(req, res, -1, next, scope);
}

RateLimiter.prototype.updateLimit = function(req, res, change, next) {
    next = next || function() {};

    const lookups = this.opts.lookup.map(function(item) {
        return item + ':' + item.split('.').reduce(function(prev, cur) {
            return prev[cur]
        }, req);
    }).join(':');

    const method = (this.opts.method || req.method).toLowerCase(),
          key = 'ratelimit:' + (this.opts.path || req.path) + ':' + method + ':' + lookups;

    this.db.get(key, (err, limit) => {
        if (err && this.opts.ignoreErrors) {
            return next();
        }

        const timeNow = Date.now();

        limit = limit ? JSON.parse(limit) : {
            total: this.opts.total,
            remaining: this.opts.total,
            reset: timeNow + this.opts.expire
        }

        if (timeNow > limit.reset) {
            limit.reset = timeNow + this.opts.expire;
            limit.remaining = this.opts.total;
        }

        // do not allow negative remaining
        limit.remaining = Math.max(Number(limit.remaining) + change, -1);

        this.db.set(key, JSON.stringify(limit), 'PX', this.opts.expire, (e) => {
            if (!this.opts.skipHeaders) {
                res.set('X-RateLimit-Limit', limit.total);
                res.set('X-RateLimit-Reset', Math.ceil(limit.reset / 1000)); // UTC epoch seconds
                res.set('X-RateLimit-Remaining', Math.max(limit.remaining, 0));
            }

            if (limit.remaining >= 0) {
                return next();
            }

            if (!this.opts.skipHeaders) {
                res.set('Retry-After', (limit.reset - Date.now()) / 1000);
            }

            this.opts.onRateLimited(req, res, next);
        });
    });
}

/*if (typeof(opts.lookup) === 'function') {
    var callableLookup = opts.lookup;

    RateLimiter = function(RateLimiter, req, res, next) {
        return callableLookup(req, res, opts, function() {
            return RateLimiter(req, res, next);
        });
    }.bind(this, RateLimiter)
}*/

module.exports = RateLimiter;