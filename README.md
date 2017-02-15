## Express rate-limiter
Rate limiting middleware for Express applications built on redis.

Changed from original:

* Added option to manually increment/decrease rate limit hits. 
* General clean ups and other bits I personally felt was needed.
* Removed ability to use a function for lookup.

```
var express = require('express'),
    app     = express(),
    client  = require('redis').createClient(),
    limiter = require('express-limiter');


var rateLimiter = new limiter(app, client, {
    path: '/api/v1/snapshot',
    method: 'all',
    lookup: ['connection.remoteAddress', 'headers.clientid'], // Limit based on IP and clientid
    total: 20, // 120 requests per minute
    expire: 1000 * 60,
    autoUpdate: false,
    onRateLimited: function(req, res) {
        res.status(429).send({
            status: 429,
            error: 'Rate limit exceeded'
        });
    }
});

```

### API options

``` js
new limiter(.., .., options)
```

 - `path`: `String` *optional* route path to the request
 - `paths`: `Array` *optional* route paths to the request
 - `method`: `String` *optional* http method. accepts `get`, `post`, `put`, `delete`, and of course Express' `all`
 - `lookup`: `String|Array.<String>` value lookup on the request object. Can be a single value, array or function. See [examples](#examples) for common usages
 - `total`: `Number` allowed number of requests before getting rate limited
 - `expire`: `Number` amount of time in `ms` before the rate-limited is reset
 - `whitelist`: `function(req)` optional param allowing the ability to whitelist. return `boolean`, `true` to whitelist, `false` to passthru to limiter.
 - `skipHeaders`: `Boolean` whether to skip sending HTTP headers for rate limits ()
 - `ignoreErrors`: `Boolean` whether errors generated from redis should allow the middleware to call next().  Defaults to false.
 - `onRateLimited`: `Function` called when a request exceeds the configured rate limit.
 - `autoUpdate`: `Boolean` Whether it should automatically update the rate limit remaining hits or not. Useful if you want to manage that yourself


### API Method "updateLimit"

``` js
const rateLimiter = new limiter(.., .., options);

app.get('/api/action', function (req, res) {
    rateLimiter.updateLimit(req, res, value);
    ...
})
```

 - `req`: *required* the express request object.
 - `res`: *required* the express response object.
 - `value`: `Number` *required* value you want to add or remove from the remaining hits.

## License MIT
