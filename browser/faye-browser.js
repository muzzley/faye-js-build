(function() {
'use strict';

var Faye = {
  VERSION:          '0.8.9',

  BAYEUX_VERSION:   '1.0',
  ID_LENGTH:        160,
  JSONP_CALLBACK:   'jsonpcallback',
  CONNECTION_TYPES: ['long-polling', 'cross-origin-long-polling', 'callback-polling', 'websocket', 'eventsource', 'in-process'],

  MANDATORY_CONNECTION_TYPES: ['long-polling', 'callback-polling', 'in-process'],

  ENV: (typeof window !== 'undefined') ? window : global,

  extend: function(dest, source, overwrite) {
    if (!source) return dest;
    for (var key in source) {
      if (!source.hasOwnProperty(key)) continue;
      if (dest.hasOwnProperty(key) && overwrite === false) continue;
      if (dest[key] !== source[key])
        dest[key] = source[key];
    }
    return dest;
  },

  random: function(bitlength) {
    bitlength = bitlength || this.ID_LENGTH;
    if (bitlength > 32) {
      var parts  = Math.ceil(bitlength / 32),
          string = '';
      while (parts--) string += this.random(32);
      var chars = string.split(''), result = '';
      while (chars.length > 0) result += chars.pop();
      return result;
    }
    var limit   = Math.pow(2, bitlength) - 1,
        maxSize = limit.toString(36).length,
        string  = Math.floor(Math.random() * limit).toString(36);

    while (string.length < maxSize) string = '0' + string;
    return string;
  },

  clientIdFromMessages: function(messages) {
    var first = [].concat(messages)[0];
    return first && first.clientId;
  },

  copyObject: function(object) {
    var clone, i, key;
    if (object instanceof Array) {
      clone = [];
      i = object.length;
      while (i--) clone[i] = Faye.copyObject(object[i]);
      return clone;
    } else if (typeof object === 'object') {
      clone = (object === null) ? null : {};
      for (key in object) clone[key] = Faye.copyObject(object[key]);
      return clone;
    } else {
      return object;
    }
  },

  commonElement: function(lista, listb) {
    for (var i = 0, n = lista.length; i < n; i++) {
      if (this.indexOf(listb, lista[i]) !== -1)
        return lista[i];
    }
    return null;
  },

  indexOf: function(list, needle) {
    if (list.indexOf) return list.indexOf(needle);

    for (var i = 0, n = list.length; i < n; i++) {
      if (list[i] === needle) return i;
    }
    return -1;
  },

  map: function(object, callback, context) {
    if (object.map) return object.map(callback, context);
    var result = [];

    if (object instanceof Array) {
      for (var i = 0, n = object.length; i < n; i++) {
        result.push(callback.call(context || null, object[i], i));
      }
    } else {
      for (var key in object) {
        if (!object.hasOwnProperty(key)) continue;
        result.push(callback.call(context || null, key, object[key]));
      }
    }
    return result;
  },

  filter: function(array, callback, context) {
    if (array.filter) return array.filter(callback, context);
    var result = [];
    for (var i = 0, n = array.length; i < n; i++) {
      if (callback.call(context || null, array[i], i))
        result.push(array[i]);
    }
    return result;
  },

  asyncEach: function(list, iterator, callback, context) {
    var n       = list.length,
        i       = -1,
        calls   = 0,
        looping = false;

    var iterate = function() {
      calls -= 1;
      i += 1;
      if (i === n) return callback && callback.call(context);
      iterator(list[i], resume);
    };

    var loop = function() {
      if (looping) return;
      looping = true;
      while (calls > 0) iterate();
      looping = false;
    };

    var resume = function() {
      calls += 1;
      loop();
    };
    resume();
  },

  // http://assanka.net/content/tech/2009/09/02/json2-js-vs-prototype/
  toJSON: function(object) {
    return JSON.stringify(object, function(key, value) {
      return (this[key] instanceof Array) ? this[key] : value;
    });
  }
};

if (typeof module !== 'undefined')
  module.exports = Faye;
else if (typeof window !== 'undefined')
  window.Faye = Faye;

Faye.Class = function(parent, methods) {
  if (typeof parent !== 'function') {
    methods = parent;
    parent  = Object;
  }

  var klass = function() {
    if (!this.initialize) return this;
    return this.initialize.apply(this, arguments) || this;
  };

  var bridge = function() {};
  bridge.prototype = parent.prototype;

  klass.prototype = new bridge();
  Faye.extend(klass.prototype, methods);

  return klass;
};

(function() {
var EventEmitter = Faye.EventEmitter = function() {};

/*
Copyright Joyent, Inc. and other Node contributors. All rights reserved.
Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

var isArray = typeof Array.isArray === 'function'
    ? Array.isArray
    : function (xs) {
        return Object.prototype.toString.call(xs) === '[object Array]'
    }
;
function indexOf (xs, x) {
    if (xs.indexOf) return xs.indexOf(x);
    for (var i = 0; i < xs.length; i++) {
        if (x === xs[i]) return i;
    }
    return -1;
}


EventEmitter.prototype.emit = function(type) {
  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events || !this._events.error ||
        (isArray(this._events.error) && !this._events.error.length))
    {
      if (arguments[1] instanceof Error) {
        throw arguments[1]; // Unhandled 'error' event
      } else {
        throw new Error("Uncaught, unspecified 'error' event.");
      }
      return false;
    }
  }

  if (!this._events) return false;
  var handler = this._events[type];
  if (!handler) return false;

  if (typeof handler == 'function') {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        var args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
    return true;

  } else if (isArray(handler)) {
    var args = Array.prototype.slice.call(arguments, 1);

    var listeners = handler.slice();
    for (var i = 0, l = listeners.length; i < l; i++) {
      listeners[i].apply(this, args);
    }
    return true;

  } else {
    return false;
  }
};

// EventEmitter is defined in src/node_events.cc
// EventEmitter.prototype.emit() is also defined there.
EventEmitter.prototype.addListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('addListener only takes instances of Function');
  }

  if (!this._events) this._events = {};

  // To avoid recursion in the case that type == "newListeners"! Before
  // adding it to the listeners, first emit "newListeners".
  this.emit('newListener', type, listener);

  if (!this._events[type]) {
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  } else if (isArray(this._events[type])) {
    // If we've already got an array, just append.
    this._events[type].push(listener);
  } else {
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  var self = this;
  self.on(type, function g() {
    self.removeListener(type, g);
    listener.apply(this, arguments);
  });

  return this;
};

EventEmitter.prototype.removeListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('removeListener only takes instances of Function');
  }

  // does not use listeners(), so no side effect of creating _events[type]
  if (!this._events || !this._events[type]) return this;

  var list = this._events[type];

  if (isArray(list)) {
    var i = indexOf(list, listener);
    if (i < 0) return this;
    list.splice(i, 1);
    if (list.length == 0)
      delete this._events[type];
  } else if (this._events[type] === listener) {
    delete this._events[type];
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  if (arguments.length === 0) {
    this._events = {};
    return this;
  }

  // does not use listeners(), so no side effect of creating _events[type]
  if (type && this._events && this._events[type]) this._events[type] = null;
  return this;
};

EventEmitter.prototype.listeners = function(type) {
  if (!this._events) this._events = {};
  if (!this._events[type]) this._events[type] = [];
  if (!isArray(this._events[type])) {
    this._events[type] = [this._events[type]];
  }
  return this._events[type];
};

})();

Faye.Namespace = Faye.Class({
  initialize: function() {
    this._used = {};
  },

  exists: function(id) {
    return this._used.hasOwnProperty(id);
  },

  generate: function() {
    var name = Faye.random();
    while (this._used.hasOwnProperty(name))
      name = Faye.random();
    return this._used[name] = name;
  },

  release: function(id) {
    delete this._used[id];
  }
});

(function() {
'use strict';

var timeout = setTimeout;

var defer;
if (typeof setImmediate === 'function')
  defer = setImmediate;
else if (typeof process === 'object' && process.nextTick)
  defer = process.nextTick;
else
  defer = function(fn) { timeout(fn, 0) };

var PENDING   = 0,
    FULFILLED = 1,
    REJECTED  = 2;

var FORWARD = function(x) { return x },
    BREAK   = function(x) { throw x  };

var Promise = function(task) {
  this._state     = PENDING;
  this._callbacks = [];
  this._errbacks  = [];

  if (typeof task !== 'function') return;
  var self = this;

  task(function(value)  { fulfill(self, value) },
       function(reason) { reject(self, reason) });
};

Promise.prototype.then = function(callback, errback) {
  var self = this;
  return new Promise(function(fulfill, reject) {
    var next = {fulfill: fulfill, reject: reject};
    registerCallback(self, callback, next);
    registerErrback(self, errback, next);
  });
};

var registerCallback = function(promise, callback, next) {
  if (typeof callback !== 'function') callback = FORWARD;
  var handler = function(value) { invoke(callback, value, next) };
  if (promise._state === PENDING) {
    promise._callbacks.push(handler);
  } else if (promise._state === FULFILLED) {
    handler(promise._value);
  }
};

var registerErrback = function(promise, errback, next) {
  if (typeof errback !== 'function') errback = BREAK;
  var handler = function(reason) { invoke(errback, reason, next) };
  if (promise._state === PENDING) {
    promise._errbacks.push(handler);
  } else if (promise._state === REJECTED) {
    handler(promise._reason);
  }
};

var invoke = function(fn, value, next) {
  defer(function() {
    try {
      var outcome = fn(value);
      if (outcome && typeof outcome.then === 'function') {
        outcome.then(next.fulfill, next.reject);
      } else {
        next.fulfill(outcome);
      }
    } catch (error) {
      next.reject(error);
    }
  });
};

var fulfill = Promise.fulfill = function(promise, value) {
  if (promise._state !== PENDING) return;

  promise._state    = FULFILLED;
  promise._value    = value;
  promise._errbacks = [];

  var callbacks = promise._callbacks, cb;
  while (cb = callbacks.shift()) cb(value);
};

var reject = Promise.reject = function(promise, reason) {
  if (promise._state !== PENDING) return;

  promise._state     = REJECTED;
  promise._reason    = reason;
  promise._callbacks = [];

  var errbacks = promise._errbacks, eb;
  while (eb = errbacks.shift()) eb(reason);
};

Promise.pending = function() {
  var tuple = {};

  tuple.promise = new Promise(function(fulfill, reject) {
    tuple.fulfill = fulfill;
    tuple.reject  = reject;
  });
  return tuple;
};

Promise.fulfilled = function(value) {
  return new Promise(function(fulfill, reject) { fulfill(value) });
};

Promise.rejected = function(reason) {
  return new Promise(function(fulfill, reject) { reject(reason) });
};

if (typeof Faye === 'undefined')
  module.exports = Promise;
else
  Faye.Promise = Promise;

})();

Faye.Set = Faye.Class({
  initialize: function() {
    this._index = {};
  },

  add: function(item) {
    var key = (item.id !== undefined) ? item.id : item;
    if (this._index.hasOwnProperty(key)) return false;
    this._index[key] = item;
    return true;
  },

  forEach: function(block, context) {
    for (var key in this._index) {
      if (this._index.hasOwnProperty(key))
        block.call(context, this._index[key]);
    }
  },

  isEmpty: function() {
    for (var key in this._index) {
      if (this._index.hasOwnProperty(key)) return false;
    }
    return true;
  },

  member: function(item) {
    for (var key in this._index) {
      if (this._index[key] === item) return true;
    }
    return false;
  },

  remove: function(item) {
    var key = (item.id !== undefined) ? item.id : item;
    var removed = this._index.hasOwnProperty(key);
    delete this._index[key];
    return removed;
  },

  toArray: function() {
    var array = [];
    this.forEach(function(item) { array.push(item) });
    return array;
  }
});

Faye.URI = {
  isURI: function(uri) {
    return uri && uri.protocol && uri.host && uri.path;
  },

  isSameOrigin: function(uri) {
    var location = Faye.ENV.location;
    return uri.protocol === location.protocol &&
           uri.hostname === location.hostname &&
           uri.port     === location.port;
  },

  parse: function(url) {
    if (typeof url !== 'string') return url;
    var uri = {}, parts, query, pairs, i, n, data;

    var consume = function(name, pattern) {
      url = url.replace(pattern, function(match) {
        uri[name] = match;
        return '';
      });
      uri[name] = uri[name] || '';
    };

    consume('protocol', /^[a-z]+\:/i);
    consume('host',     /^\/\/[^\/\?#]+/);

    if (!/^\//.test(url) && !uri.host)
      url = Faye.ENV.location.pathname.replace(/[^\/]*$/, '') + url;

    consume('pathname', /^[^\?#]*/);
    consume('search',   /^\?[^#]*/);
    consume('hash',     /^#.*/);

    uri.protocol = uri.protocol || Faye.ENV.location.protocol;

    if (uri.host) {
      uri.host     = uri.host.substr(2);
      parts        = uri.host.split(':');
      uri.hostname = parts[0];
      uri.port     = parts[1] || '';
    } else {
      uri.host     = Faye.ENV.location.host;
      uri.hostname = Faye.ENV.location.hostname;
      uri.port     = Faye.ENV.location.port;
    }

    uri.pathname = uri.pathname || '/';
    uri.path = uri.pathname + uri.search;

    query = uri.search.replace(/^\?/, '');
    pairs = query ? query.split('&') : [];
    data  = {};

    for (i = 0, n = pairs.length; i < n; i++) {
      parts = pairs[i].split('=');
      data[decodeURIComponent(parts[0] || '')] = decodeURIComponent(parts[1] || '');
    }

    uri.query = data;

    uri.href = this.stringify(uri);
    return uri;
  },

  stringify: function(uri) {
    var string = uri.protocol + '//' + uri.hostname;
    if (uri.port) string += ':' + uri.port;
    string += uri.pathname + this.queryString(uri.query) + (uri.hash || '');
    return string;
  },

  queryString: function(query) {
    var pairs = [];
    for (var key in query) {
      if (!query.hasOwnProperty(key)) continue;
      pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(query[key]));
    }
    if (pairs.length === 0) return '';
    return '?' + pairs.join('&');
  }
};

Faye.Error = Faye.Class({
  initialize: function(code, params, message) {
    this.code    = code;
    this.params  = Array.prototype.slice.call(params);
    this.message = message;
  },

  toString: function() {
    return this.code + ':' +
           this.params.join(',') + ':' +
           this.message;
  }
});

Faye.Error.parse = function(message) {
  message = message || '';
  if (!Faye.Grammar.ERROR.test(message)) return new this(null, [], message);

  var parts   = message.split(':'),
      code    = parseInt(parts[0]),
      params  = parts[1].split(','),
      message = parts[2];

  return new this(code, params, message);
};




Faye.Error.versionMismatch = function() {
  return new this(300, arguments, 'Version mismatch').toString();
};

Faye.Error.conntypeMismatch = function() {
  return new this(301, arguments, 'Connection types not supported').toString();
};

Faye.Error.extMismatch = function() {
  return new this(302, arguments, 'Extension mismatch').toString();
};

Faye.Error.badRequest = function() {
  return new this(400, arguments, 'Bad request').toString();
};

Faye.Error.clientUnknown = function() {
  return new this(401, arguments, 'Unknown client').toString();
};

Faye.Error.parameterMissing = function() {
  return new this(402, arguments, 'Missing required parameter').toString();
};

Faye.Error.channelForbidden = function() {
  return new this(403, arguments, 'Forbidden channel').toString();
};

Faye.Error.channelUnknown = function() {
  return new this(404, arguments, 'Unknown channel').toString();
};

Faye.Error.channelInvalid = function() {
  return new this(405, arguments, 'Invalid channel').toString();
};

Faye.Error.extUnknown = function() {
  return new this(406, arguments, 'Unknown extension').toString();
};

Faye.Error.publishFailed = function() {
  return new this(407, arguments, 'Failed to publish').toString();
};

Faye.Error.serverError = function() {
  return new this(500, arguments, 'Internal server error').toString();
};


Faye.Deferrable = {
  then: function(callback, errback) {
    var self = this;
    if (!this._promise)
      this._promise = new Faye.Promise(function(fulfill, reject) {
        self._fulfill = fulfill;
        self._reject  = reject;
      });

    if (arguments.length === 0)
      return this._promise;
    else
      return this._promise.then(callback, errback);
  },

  callback: function(callback, context) {
    return this.then(function(value) { callback.call(context, value) });
  },

  errback: function(callback, context) {
    return this.then(null, function(reason) { callback.call(context, reason) });
  },

  timeout: function(seconds, message) {
    this.then();
    var self = this;
    this._timer = Faye.ENV.setTimeout(function() {
      self._reject(message);
    }, seconds * 1000);
  },

  setDeferredStatus: function(status, value) {
    if (this._timer) Faye.ENV.clearTimeout(this._timer);

    var promise = this.then();

    if (status === 'succeeded')
      this._fulfill(value);
    else if (status === 'failed')
      this._reject(value);
    else
      delete this._promise;
  }
};

Faye.Publisher = {
  countListeners: function(eventType) {
    return this.listeners(eventType).length;
  },

  bind: function(eventType, listener, context) {
    var slice   = Array.prototype.slice,
        handler = function() { listener.apply(context, slice.call(arguments)) };

    this._listeners = this._listeners || [];
    this._listeners.push([eventType, listener, context, handler]);
    return this.on(eventType, handler);
  },

  unbind: function(eventType, listener, context) {
    this._listeners = this._listeners || [];
    var n = this._listeners.length, tuple;

    while (n--) {
      tuple = this._listeners[n];
      if (tuple[0] !== eventType) continue;
      if (listener && (tuple[1] !== listener || tuple[2] !== context)) continue;
      this._listeners.splice(n, 1);
      this.removeListener(eventType, tuple[3]);
    }
  }
};

Faye.extend(Faye.Publisher, Faye.EventEmitter.prototype);
Faye.Publisher.trigger = Faye.Publisher.emit;

Faye.Timeouts = {
  addTimeout: function(name, delay, callback, context) {
    this._timeouts = this._timeouts || {};
    if (this._timeouts.hasOwnProperty(name)) return;
    var self = this;
    this._timeouts[name] = Faye.ENV.setTimeout(function() {
      delete self._timeouts[name];
      callback.call(context);
    }, 1000 * delay);
  },

  removeTimeout: function(name) {
    this._timeouts = this._timeouts || {};
    var timeout = this._timeouts[name];
    if (!timeout) return;
    clearTimeout(timeout);
    delete this._timeouts[name];
  }
};

Faye.Logging = {
  LOG_LEVELS: {
    fatal:  4,
    error:  3,
    warn:   2,
    info:   1,
    debug:  0
  },

  writeLog: function(messageArgs, level) {
    if (!Faye.logger) return;

    var messageArgs = Array.prototype.slice.apply(messageArgs),
        banner      = '[Faye',
        klass       = this.className,

        message = messageArgs.shift().replace(/\?/g, function() {
          try {
            return Faye.toJSON(messageArgs.shift());
          } catch (e) {
            return '[Object]';
          }
        });

    for (var key in Faye) {
      if (klass) continue;
      if (typeof Faye[key] !== 'function') continue;
      if (this instanceof Faye[key]) klass = key;
    }
    if (klass) banner += '.' + klass;
    banner += '] ';

    if (typeof Faye.logger[level] === 'function')
      Faye.logger[level](banner + message);
    else if (typeof Faye.logger === 'function')
      Faye.logger(banner + message);
  }
};

(function() {
  for (var key in Faye.Logging.LOG_LEVELS)
    (function(level, value) {
      Faye.Logging[level] = function() {
        this.writeLog(arguments, level);
      };
    })(key, Faye.Logging.LOG_LEVELS[key]);
})();

Faye.Grammar = {
  CHANNEL_NAME:     /^\/(((([a-z]|[A-Z])|[0-9])|(\-|\_|\!|\~|\(|\)|\$|\@)))+(\/(((([a-z]|[A-Z])|[0-9])|(\-|\_|\!|\~|\(|\)|\$|\@)))+)*$/,
  CHANNEL_PATTERN:  /^(\/(((([a-z]|[A-Z])|[0-9])|(\-|\_|\!|\~|\(|\)|\$|\@)))+)*\/\*{1,2}$/,
  ERROR:            /^([0-9][0-9][0-9]:(((([a-z]|[A-Z])|[0-9])|(\-|\_|\!|\~|\(|\)|\$|\@)| |\/|\*|\.))*(,(((([a-z]|[A-Z])|[0-9])|(\-|\_|\!|\~|\(|\)|\$|\@)| |\/|\*|\.))*)*:(((([a-z]|[A-Z])|[0-9])|(\-|\_|\!|\~|\(|\)|\$|\@)| |\/|\*|\.))*|[0-9][0-9][0-9]::(((([a-z]|[A-Z])|[0-9])|(\-|\_|\!|\~|\(|\)|\$|\@)| |\/|\*|\.))*)$/,
  VERSION:          /^([0-9])+(\.(([a-z]|[A-Z])|[0-9])(((([a-z]|[A-Z])|[0-9])|\-|\_))*)*$/
};

Faye.Extensible = {
  addExtension: function(extension) {
    this._extensions = this._extensions || [];
    this._extensions.push(extension);
    if (extension.added) extension.added(this);
  },

  removeExtension: function(extension) {
    if (!this._extensions) return;
    var i = this._extensions.length;
    while (i--) {
      if (this._extensions[i] !== extension) continue;
      this._extensions.splice(i,1);
      if (extension.removed) extension.removed(this);
    }
  },

  pipeThroughExtensions: function(stage, message, request, callback, context) {
    this.debug('Passing through ? extensions: ?', stage, message);

    if (!this._extensions) return callback.call(context, message);
    var extensions = this._extensions.slice();

    var pipe = function(message) {
      if (!message) return callback.call(context, message);

      var extension = extensions.shift();
      if (!extension) return callback.call(context, message);

      var fn = extension[stage];
      if (!fn) return pipe(message);

      if (fn.length >= 3) extension[stage](message, request, pipe);
      else                extension[stage](message, pipe);
    };
    pipe(message);
  }
};

Faye.extend(Faye.Extensible, Faye.Logging);

Faye.Channel = Faye.Class({
  initialize: function(name) {
    this.id = this.name = name;
  },

  push: function(message) {
    this.trigger('message', message);
  },

  isUnused: function() {
    return this.countListeners('message') === 0;
  }
});

Faye.extend(Faye.Channel.prototype, Faye.Publisher);

Faye.extend(Faye.Channel, {
  HANDSHAKE:    '/meta/handshake',
  CONNECT:      '/meta/connect',
  SUBSCRIBE:    '/meta/subscribe',
  UNSUBSCRIBE:  '/meta/unsubscribe',
  DISCONNECT:   '/meta/disconnect',

  META:         'meta',
  SERVICE:      'service',

  expand: function(name) {
    var segments = this.parse(name),
        channels = ['/**', name];

    var copy = segments.slice();
    copy[copy.length - 1] = '*';
    channels.push(this.unparse(copy));

    for (var i = 1, n = segments.length; i < n; i++) {
      copy = segments.slice(0, i);
      copy.push('**');
      channels.push(this.unparse(copy));
    }

    return channels;
  },

  isValid: function(name) {
    return Faye.Grammar.CHANNEL_NAME.test(name) ||
           Faye.Grammar.CHANNEL_PATTERN.test(name);
  },

  parse: function(name) {
    if (!this.isValid(name)) return null;
    return name.split('/').slice(1);
  },

  unparse: function(segments) {
    return '/' + segments.join('/');
  },

  isMeta: function(name) {
    var segments = this.parse(name);
    return segments ? (segments[0] === this.META) : null;
  },

  isService: function(name) {
    var segments = this.parse(name);
    return segments ? (segments[0] === this.SERVICE) : null;
  },

  isSubscribable: function(name) {
    if (!this.isValid(name)) return null;
    return !this.isMeta(name) && !this.isService(name);
  },

  Set: Faye.Class({
    initialize: function() {
      this._channels = {};
    },

    getKeys: function() {
      var keys = [];
      for (var key in this._channels) keys.push(key);
      return keys;
    },

    remove: function(name) {
      delete this._channels[name];
    },

    hasSubscription: function(name) {
      return this._channels.hasOwnProperty(name);
    },

    subscribe: function(names, callback, context) {
      if (!callback) return;
      var name;
      for (var i = 0, n = names.length; i < n; i++) {
        name = names[i];
        var channel = this._channels[name] = this._channels[name] || new Faye.Channel(name);
        channel.bind('message', callback, context);
      }
    },

    unsubscribe: function(name, callback, context) {
      var channel = this._channels[name];
      if (!channel) return false;
      channel.unbind('message', callback, context);

      if (channel.isUnused()) {
        this.remove(name);
        return true;
      } else {
        return false;
      }
    },

    distributeMessage: function(message) {
      var channels = Faye.Channel.expand(message.channel);

      for (var i = 0, n = channels.length; i < n; i++) {
        var channel = this._channels[channels[i]];
        if (channel) channel.trigger('message', message.data);
      }
    }
  })
});

Faye.Publication = Faye.Class(Faye.Deferrable);

Faye.Subscription = Faye.Class({
  initialize: function(client, channels, callback, context) {
    this._client    = client;
    this._channels  = channels;
    this._callback  = callback;
    this._context     = context;
    this._cancelled = false;
  },

  cancel: function() {
    if (this._cancelled) return;
    this._client.unsubscribe(this._channels, this._callback, this._context);
    this._cancelled = true;
  },

  unsubscribe: function() {
    this.cancel();
  }
});

Faye.extend(Faye.Subscription.prototype, Faye.Deferrable);

Faye.Client = Faye.Class({
  UNCONNECTED:          1,
  CONNECTING:           2,
  CONNECTED:            3,
  DISCONNECTED:         4,

  HANDSHAKE:            'handshake',
  RETRY:                'retry',
  NONE:                 'none',

  CONNECTION_TIMEOUT:   60,
  DEFAULT_RETRY:        5,
  MAX_REQUEST_SIZE:     2048,

  DEFAULT_ENDPOINT:     '/bayeux',
  INTERVAL:             0,

  initialize: function(endpoint, options) {
    this.info('New client created for ?', endpoint);

    this._options   = options || {};
    this.endpoint   = Faye.URI.parse(endpoint || this.DEFAULT_ENDPOINT);
    this.endpoints  = this._options.endpoints || {};
    this.transports = {};
    this.cookies    = Faye.CookieJar && new Faye.CookieJar();
    this.headers    = {};
    this.ca         = this._options.ca;
    this._disabled  = [];
    this._retry     = this._options.retry || this.DEFAULT_RETRY;

    for (var key in this.endpoints)
      this.endpoints[key] = Faye.URI.parse(this.endpoints[key]);

    this.maxRequestSize = this.MAX_REQUEST_SIZE;

    this._state     = this.UNCONNECTED;
    this._channels  = new Faye.Channel.Set();
    this._messageId = 0;

    this._messageTimeouts   = {};
    this._responseCallbacks = {};

    this._advice = {
      reconnect: this.RETRY,
      interval:  1000 * (this._options.interval || this.INTERVAL),
      timeout:   1000 * (this._options.timeout  || this.CONNECTION_TIMEOUT)
    };

    if (Faye.Event && Faye.ENV.onbeforeunload !== undefined)
      Faye.Event.on(Faye.ENV, 'beforeunload', function() {
        if (Faye.indexOf(this._disabled, 'autodisconnect') < 0)
          this.disconnect();
      }, this);
  },

  disable: function(feature) {
    this._disabled.push(feature);
  },

  setHeader: function(name, value) {
    this.headers[name] = value;
  },

  // Request
  // MUST include:  * channel
  //                * version
  //                * supportedConnectionTypes
  // MAY include:   * minimumVersion
  //                * ext
  //                * id
  //
  // Success Response                             Failed Response
  // MUST include:  * channel                     MUST include:  * channel
  //                * version                                    * successful
  //                * supportedConnectionTypes                   * error
  //                * clientId                    MAY include:   * supportedConnectionTypes
  //                * successful                                 * advice
  // MAY include:   * minimumVersion                             * version
  //                * advice                                     * minimumVersion
  //                * ext                                        * ext
  //                * id                                         * id
  //                * authSuccessful
  handshake: function(callback, context) {
    if (this._advice.reconnect === this.NONE) return;
    if (this._state !== this.UNCONNECTED) return;

    this._state = this.CONNECTING;
    var self = this;

    this.info('Initiating handshake with ?', Faye.URI.stringify(this.endpoint));
    this._selectTransport(Faye.MANDATORY_CONNECTION_TYPES);

    this._send({
      channel:                  Faye.Channel.HANDSHAKE,
      version:                  Faye.BAYEUX_VERSION,
      supportedConnectionTypes: [this._transport.connectionType]

    }, function(response) {

      if (response.successful) {
        this._state     = this.CONNECTED;
        this._clientId  = response.clientId;

        this._selectTransport(response.supportedConnectionTypes);

        this.info('Handshake successful: ?', this._clientId);

        this.subscribe(this._channels.getKeys(), true);
        if (callback) callback.call(context);

      } else {
        this.info('Handshake unsuccessful');
        Faye.ENV.setTimeout(function() { self.handshake(callback, context) }, this._advice.interval);
        this._state = this.UNCONNECTED;
      }
    }, this);
  },

  // Request                              Response
  // MUST include:  * channel             MUST include:  * channel
  //                * clientId                           * successful
  //                * connectionType                     * clientId
  // MAY include:   * ext                 MAY include:   * error
  //                * id                                 * advice
  //                                                     * ext
  //                                                     * id
  //                                                     * timestamp
  connect: function(callback, context) {
    if (this._advice.reconnect === this.NONE) return;
    if (this._state === this.DISCONNECTED) return;

    if (this._state === this.UNCONNECTED)
      return this.handshake(function() { this.connect(callback, context) }, this);

    this.callback(callback, context);
    if (this._state !== this.CONNECTED) return;

    this.info('Calling deferred actions for ?', this._clientId);
    this.setDeferredStatus('succeeded');
    this.setDeferredStatus('unknown');

    if (this._connectRequest) return;
    this._connectRequest = true;

    this.info('Initiating connection for ?', this._clientId);

    this._send({
      channel:        Faye.Channel.CONNECT,
      clientId:       this._clientId,
      connectionType: this._transport.connectionType

    }, this._cycleConnection, this);
  },

  // Request                              Response
  // MUST include:  * channel             MUST include:  * channel
  //                * clientId                           * successful
  // MAY include:   * ext                                * clientId
  //                * id                  MAY include:   * error
  //                                                     * ext
  //                                                     * id
  disconnect: function() {
    if (this._state !== this.CONNECTED) return;
    this._state = this.DISCONNECTED;

    this.info('Disconnecting ?', this._clientId);

    this._send({
      channel:  Faye.Channel.DISCONNECT,
      clientId: this._clientId

    }, function(response) {
      if (!response.successful) return;
      this._transport.close();
      delete this._transport;
    }, this);

    this.info('Clearing channel listeners for ?', this._clientId);
    this._channels = new Faye.Channel.Set();
  },

  // Request                              Response
  // MUST include:  * channel             MUST include:  * channel
  //                * clientId                           * successful
  //                * subscription                       * clientId
  // MAY include:   * ext                                * subscription
  //                * id                  MAY include:   * error
  //                                                     * advice
  //                                                     * ext
  //                                                     * id
  //                                                     * timestamp
  subscribe: function(channel, callback, context) {
    if (channel instanceof Array)
      return Faye.map(channel, function(c) {
        return this.subscribe(c, callback, context);
      }, this);

    var subscription = new Faye.Subscription(this, channel, callback, context),
        force        = (callback === true),
        hasSubscribe = this._channels.hasSubscription(channel);

    if (hasSubscribe && !force) {
      this._channels.subscribe([channel], callback, context);
      subscription.setDeferredStatus('succeeded');
      return subscription;
    }

    this.connect(function() {
      this.info('Client ? attempting to subscribe to ?', this._clientId, channel);
      if (!force) this._channels.subscribe([channel], callback, context);

      this._send({
        channel:      Faye.Channel.SUBSCRIBE,
        clientId:     this._clientId,
        subscription: channel

      }, function(response) {
        if (!response.successful) {
          subscription.setDeferredStatus('failed', Faye.Error.parse(response.error));
          return this._channels.unsubscribe(channel, callback, context);
        }

        var channels = [].concat(response.subscription);
        this.info('Subscription acknowledged for ? to ?', this._clientId, channels);
        subscription.setDeferredStatus('succeeded');
      }, this);
    }, this);

    return subscription;
  },

  // Request                              Response
  // MUST include:  * channel             MUST include:  * channel
  //                * clientId                           * successful
  //                * subscription                       * clientId
  // MAY include:   * ext                                * subscription
  //                * id                  MAY include:   * error
  //                                                     * advice
  //                                                     * ext
  //                                                     * id
  //                                                     * timestamp
  unsubscribe: function(channel, callback, context) {
    if (channel instanceof Array)
      return Faye.map(channel, function(c) {
        return this.unsubscribe(c, callback, context);
      }, this);

    var dead = this._channels.unsubscribe(channel, callback, context);
    if (!dead) return;

    this.connect(function() {
      this.info('Client ? attempting to unsubscribe from ?', this._clientId, channel);

      this._send({
        channel:      Faye.Channel.UNSUBSCRIBE,
        clientId:     this._clientId,
        subscription: channel

      }, function(response) {
        if (!response.successful) return;

        var channels = [].concat(response.subscription);
        this.info('Unsubscription acknowledged for ? from ?', this._clientId, channels);
      }, this);
    }, this);
  },

  // Request                              Response
  // MUST include:  * channel             MUST include:  * channel
  //                * data                               * successful
  // MAY include:   * clientId            MAY include:   * id
  //                * id                                 * error
  //                * ext                                * ext
  publish: function(channel, data) {
    var publication = new Faye.Publication();

    this.connect(function() {
      this.info('Client ? queueing published message to ?: ?', this._clientId, channel, data);

      this._send({
        channel:  channel,
        data:     data,
        clientId: this._clientId

      }, function(response) {
        if (response.successful)
          publication.setDeferredStatus('succeeded');
        else
          publication.setDeferredStatus('failed', Faye.Error.parse(response.error));
      }, this);
    }, this);

    return publication;
  },

  receiveMessage: function(message) {
    var id = message.id, timeout, callback;

    if (message.successful !== undefined) {
      timeout = this._messageTimeouts[id];
      if (timeout) Faye.ENV.clearTimeout(timeout);
      delete this._messageTimeouts[id];

      callback = this._responseCallbacks[id];
      delete this._responseCallbacks[id];
    }

    this.pipeThroughExtensions('incoming', message, null, function(message) {
      if (!message) return;

      if (message.advice) this._handleAdvice(message.advice);
      this._deliverMessage(message);

      if (callback) callback[0].call(callback[1], message);
    }, this);

    if (this._transportUp === true) return;
    this._transportUp = true;
    this.trigger('transport:up');
  },

  messageError: function(messages, immediate) {
    var retry = this._retry,
        self  = this,
        id, message, timeout;

    for (var i = 0, n = messages.length; i < n; i++) {
      message = messages[i];
      id      = message.id;

      timeout = this._messageTimeouts[id];
      if (timeout) Faye.ENV.clearTimeout(timeout);
      delete this._messageTimeouts[id];

      if (immediate)
        this._transportSend(message);
      else
        Faye.ENV.setTimeout(function() { self._transportSend(message) }, retry * 1000);
    }

    if (immediate || this._transportUp === false) return;
    this._transportUp = false;
    this.trigger('transport:down');
  },

  _selectTransport: function(transportTypes) {
    Faye.Transport.get(this, transportTypes, this._disabled, function(transport) {
      this.debug('Selected ? transport for ?', transport.connectionType, Faye.URI.stringify(transport.endpoint));

      if (transport === this._transport) return;
      if (this._transport) this._transport.close();

      this._transport = transport;
    }, this);
  },

  _send: function(message, callback, context) {
    if (!this._transport) return;
    message.id = message.id || this._generateMessageId();

    this.pipeThroughExtensions('outgoing', message, null, function(message) {
      if (!message) return;
      if (callback) this._responseCallbacks[message.id] = [callback, context];
      this._transportSend(message);
    }, this);
  },

  _transportSend: function(message) {
    if (!this._transport) return;

    var timeout = 1.2 * (this._advice.timeout || this._retry * 1000),
        self    = this;

    this._messageTimeouts[message.id] = Faye.ENV.setTimeout(function() {
      self.messageError([message], false);
    }, timeout);

    this._transport.send(message);
  },

  _generateMessageId: function() {
    this._messageId += 1;
    if (this._messageId >= Math.pow(2,32)) this._messageId = 0;
    return this._messageId.toString(36);
  },

  _handleAdvice: function(advice) {
    Faye.extend(this._advice, advice);

    if (this._advice.reconnect === this.HANDSHAKE && this._state !== this.DISCONNECTED) {
      this._state    = this.UNCONNECTED;
      this._clientId = null;
      this._cycleConnection();
    }
  },

  _deliverMessage: function(message) {
    if (!message.channel || message.data === undefined) return;
    this.info('Client ? calling listeners for ? with ?', this._clientId, message.channel, message.data);
    this._channels.distributeMessage(message);
  },

  _cycleConnection: function() {
    if (this._connectRequest) {
      this._connectRequest = null;
      this.info('Closed connection for ?', this._clientId);
    }
    var self = this;
    Faye.ENV.setTimeout(function() { self.connect() }, this._advice.interval);
  }
});

Faye.extend(Faye.Client.prototype, Faye.Deferrable);
Faye.extend(Faye.Client.prototype, Faye.Publisher);
Faye.extend(Faye.Client.prototype, Faye.Logging);
Faye.extend(Faye.Client.prototype, Faye.Extensible);

Faye.Transport = Faye.extend(Faye.Class({
  MAX_DELAY: 0,
  batching:  true,

  initialize: function(client, endpoint) {
    this._client  = client;
    this.endpoint = endpoint;
    this._outbox  = [];
  },

  close: function() {},

  encode: function(messages) {
    return '';
  },

  send: function(message) {
    this.debug('Client ? sending message to ?: ?',
               this._client._clientId, Faye.URI.stringify(this.endpoint), message);

    if (!this.batching) return this.request([message]);

    this._outbox.push(message);

    if (message.channel === Faye.Channel.HANDSHAKE)
      return this.addTimeout('publish', 0.01, this.flush, this);

    if (message.channel === Faye.Channel.CONNECT)
      this._connectMessage = message;

    this.flushLargeBatch();
    this.addTimeout('publish', this.MAX_DELAY, this.flush, this);
  },

  flush: function() {
    this.removeTimeout('publish');

    if (this._outbox.length > 1 && this._connectMessage)
      this._connectMessage.advice = {timeout: 0};

    this.request(this._outbox);

    this._connectMessage = null;
    this._outbox = [];
  },

  flushLargeBatch: function() {
    var string = this.encode(this._outbox);
    if (string.length < this._client.maxRequestSize) return;
    var last = this._outbox.pop();
    this.flush();
    if (last) this._outbox.push(last);
  },

  receive: function(responses) {
    responses = [].concat(responses);

    this.debug('Client ? received from ?: ?',
               this._client._clientId, Faye.URI.stringify(this.endpoint), responses);

    for (var i = 0, n = responses.length; i < n; i++)
      this._client.receiveMessage(responses[i]);
  },

  _getCookies: function() {
    var cookies = this._client.cookies;
    if (!cookies) return '';

    return cookies.getCookies({
      domain: this.endpoint.hostname,
      path:   this.endpoint.path,
      secure: this.endpoint.protocol === 'https:'
    }).toValueString();
  },

  _storeCookies: function(setCookie) {
    if (!setCookie || !this._client.cookies) return;
    setCookie = [].concat(setCookie);
    var cookie;

    for (var i = 0, n = setCookie.length; i < n; i++) {
      cookie = this._client.cookies.setCookie(setCookie[i]);
      cookie = cookie[0] || cookie;
      cookie.domain = cookie.domain || this.endpoint.hostname;
    }
  }

}), {
  get: function(client, allowed, disabled, callback, context) {
    var endpoint = client.endpoint;

    Faye.asyncEach(this._transports, function(pair, resume) {
      var connType     = pair[0], klass = pair[1],
          connEndpoint = client.endpoints[connType] || endpoint;

      if (Faye.indexOf(disabled, connType) >= 0)
        return resume();

      if (Faye.indexOf(allowed, connType) < 0) {
        klass.isUsable(client, connEndpoint, function() {});
        return resume();
      }

      klass.isUsable(client, connEndpoint, function(isUsable) {
        if (!isUsable) return resume();
        var transport = klass.hasOwnProperty('create') ? klass.create(client, connEndpoint) : new klass(client, connEndpoint);
        callback.call(context, transport);
      });
    }, function() {
      throw new Error('Could not find a usable connection type for ' + Faye.URI.stringify(endpoint));
    });
  },

  register: function(type, klass) {
    this._transports.push([type, klass]);
    klass.prototype.connectionType = type;
  },

  _transports: []
});

Faye.extend(Faye.Transport.prototype, Faye.Logging);
Faye.extend(Faye.Transport.prototype, Faye.Timeouts);

Faye.Event = {
  _registry: [],

  on: function(element, eventName, callback, context) {
    var wrapped = function() { callback.call(context) };

    if (element.addEventListener)
      element.addEventListener(eventName, wrapped, false);
    else
      element.attachEvent('on' + eventName, wrapped);

    this._registry.push({
      _element:   element,
      _type:      eventName,
      _callback:  callback,
      _context:     context,
      _handler:   wrapped
    });
  },

  detach: function(element, eventName, callback, context) {
    var i = this._registry.length, register;
    while (i--) {
      register = this._registry[i];

      if ((element    && element    !== register._element)   ||
          (eventName  && eventName  !== register._type)      ||
          (callback   && callback   !== register._callback)  ||
          (context      && context      !== register._context))
        continue;

      if (register._element.removeEventListener)
        register._element.removeEventListener(register._type, register._handler, false);
      else
        register._element.detachEvent('on' + register._type, register._handler);

      this._registry.splice(i,1);
      register = null;
    }
  }
};

if (Faye.ENV.onunload !== undefined) Faye.Event.on(Faye.ENV, 'unload', Faye.Event.detach, Faye.Event);

Faye.Transport.WebSocket = Faye.extend(Faye.Class(Faye.Transport, {
  UNCONNECTED:  1,
  CONNECTING:   2,
  CONNECTED:    3,

  batching:     false,

  isUsable: function(callback, context) {
    this.callback(function() { callback.call(context, true) });
    this.errback(function() { callback.call(context, false) });
    this.connect();
  },

  request: function(messages) {
    this.callback(function(socket) {
      if (!socket) return;
      for (var i = 0, n = messages.length; i < n; i++) this._pending.add(messages[i]);
      socket.send(Faye.toJSON(messages));
    }, this);
    this.connect();
  },

  connect: function() {
    if (Faye.Transport.WebSocket._unloaded) return;

    this._state = this._state || this.UNCONNECTED;
    if (this._state !== this.UNCONNECTED) return;
    this._state = this.CONNECTING;

    var socket = this._createSocket();
    if (!socket) return this.setDeferredStatus('failed');

    var self = this;

    socket.onopen = function() {
      if (socket.headers) self._storeCookies(socket.headers['set-cookie']);
      self._socket = socket;
      self._pending = new Faye.Set();
      self._state = self.CONNECTED;
      self._everConnected = true;
      self._ping();
      self.setDeferredStatus('succeeded', socket);
    };

    var closed = false;
    socket.onclose = socket.onerror = function() {
      if (closed) return;
      closed = true;

      var wasConnected = (self._state === self.CONNECTED);
      socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null;

      delete self._socket;
      self._state = self.UNCONNECTED;
      self.removeTimeout('ping');
      self.setDeferredStatus('unknown');

      if (wasConnected) {
        if (self._pending) self._client.messageError(self._pending.toArray(), true);
      } else if (self._everConnected) {
        if (self._pending) self._client.messageError(self._pending.toArray());
      } else {
        self.setDeferredStatus('failed');
      }
      delete self._pending;
    };

    socket.onmessage = function(event) {
      var messages = JSON.parse(event.data);
      if (!messages) return;
      messages = [].concat(messages);
      for (var i = 0, n = messages.length; i < n; i++) {
        if (messages[i].successful !== undefined) self._pending.remove(messages[i]);
      }
      self.receive(messages);
    };
  },

  close: function() {
    if (!this._socket) return;
    this._socket.close();
  },

  _createSocket: function() {
    var url     = Faye.Transport.WebSocket.getSocketUrl(this.endpoint),
        options = {headers: Faye.copyObject(this._client.headers), ca: this._client.ca};

    options.headers['Cookie'] = this._getCookies();

    if (Faye.WebSocket)        return new Faye.WebSocket.Client(url, [], options);
    if (Faye.ENV.MozWebSocket) return new MozWebSocket(url);
    if (Faye.ENV.WebSocket)    return new WebSocket(url);
  },

  _ping: function() {
    if (!this._socket) return;
    this._socket.send('[]');
    this.addTimeout('ping', this._client._advice.timeout/2000, this._ping, this);
  }

}), {
  PROTOCOLS: {
    'http:':  'ws:',
    'https:': 'wss:'
  },

  create: function(client, endpoint) {
    var sockets = client.transports.websocket = client.transports.websocket || {};
    sockets[endpoint.href] = sockets[endpoint.href] || new this(client, endpoint);
    return sockets[endpoint.href];
  },

  getSocketUrl: function(endpoint) {
    endpoint = Faye.copyObject(endpoint);
    endpoint.protocol = this.PROTOCOLS[endpoint.protocol];
    return Faye.URI.stringify(endpoint);
  },

  isUsable: function(client, endpoint, callback, context) {
    this.create(client, endpoint).isUsable(callback, context);
  }
});

Faye.extend(Faye.Transport.WebSocket.prototype, Faye.Deferrable);
Faye.Transport.register('websocket', Faye.Transport.WebSocket);

if (Faye.Event)
  Faye.Event.on(Faye.ENV, 'beforeunload', function() {
    Faye.Transport.WebSocket._unloaded = true;
  });

Faye.Transport.EventSource = Faye.extend(Faye.Class(Faye.Transport, {
  initialize: function(client, endpoint) {
    Faye.Transport.prototype.initialize.call(this, client, endpoint);
    if (!Faye.ENV.EventSource) return this.setDeferredStatus('failed');

    this._xhr = new Faye.Transport.XHR(client, endpoint);

    endpoint = Faye.copyObject(endpoint);
    endpoint.pathname += '/' + client._clientId;

    var socket = new EventSource(Faye.URI.stringify(endpoint)),
        self   = this;

    socket.onopen = function() {
      self._everConnected = true;
      self.setDeferredStatus('succeeded');
    };

    socket.onerror = function() {
      if (self._everConnected) {
        self._client.messageError([]);
      } else {
        self.setDeferredStatus('failed');
        socket.close();
      }
    };

    socket.onmessage = function(event) {
      self.receive(JSON.parse(event.data));
    };

    this._socket = socket;
  },

  close: function() {
    if (!this._socket) return;
    this._socket.onopen = this._socket.onerror = this._socket.onmessage = null;
    this._socket.close();
    delete this._socket;
  },

  isUsable: function(callback, context) {
    this.callback(function() { callback.call(context, true) });
    this.errback(function() { callback.call(context, false) });
  },

  encode: function(messages) {
    return this._xhr.encode(messages);
  },

  request: function(messages) {
    this._xhr.request(messages);
  }

}), {
  isUsable: function(client, endpoint, callback, context) {
    var id = client._clientId;
    if (!id) return callback.call(context, false);

    Faye.Transport.XHR.isUsable(client, endpoint, function(usable) {
      if (!usable) return callback.call(context, false);
      this.create(client, endpoint).isUsable(callback, context);
    }, this);
  },

  create: function(client, endpoint) {
    var sockets = client.transports.eventsource = client.transports.eventsource || {},
        id      = client._clientId;

    endpoint = Faye.copyObject(endpoint);
    endpoint.pathname += '/' + (id || '');
    var url = Faye.URI.stringify(endpoint);

    sockets[url] = sockets[url] || new this(client, endpoint);
    return sockets[url];
  }
});

Faye.extend(Faye.Transport.EventSource.prototype, Faye.Deferrable);
Faye.Transport.register('eventsource', Faye.Transport.EventSource);

Faye.Transport.XHR = Faye.extend(Faye.Class(Faye.Transport, {
  encode: function(messages) {
    return Faye.toJSON(messages);
  },

  request: function(messages) {
    var path = this.endpoint.path,
        xhr  = Faye.ENV.ActiveXObject ? new ActiveXObject('Microsoft.XMLHTTP') : new XMLHttpRequest(),
        self = this;

    xhr.open('POST', path, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Pragma', 'no-cache');
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

    var headers = this._client.headers;
    for (var key in headers) {
      if (!headers.hasOwnProperty(key)) continue;
      xhr.setRequestHeader(key, headers[key]);
    }

    var abort = function() { xhr.abort() };
    Faye.Event.on(Faye.ENV, 'beforeunload', abort);

    xhr.onreadystatechange = function() {
      if (!xhr || xhr.readyState !== 4) return;

      var parsedMessage = null,
          status        = xhr.status,
          text          = xhr.responseText,
          successful    = (status >= 200 && status < 300) || status === 304 || status === 1223;

      Faye.Event.detach(Faye.ENV, 'beforeunload', abort);
      xhr.onreadystatechange = function() {};
      xhr = null;

      if (!successful) return self._client.messageError(messages);

      try {
        parsedMessage = JSON.parse(text);
      } catch (e) {}

      if (parsedMessage)
        self.receive(parsedMessage);
      else
        self._client.messageError(messages);
    };

    xhr.send(this.encode(messages));
  }
}), {
  isUsable: function(client, endpoint, callback, context) {
    callback.call(context, Faye.URI.isSameOrigin(endpoint));
  }
});

Faye.Transport.register('long-polling', Faye.Transport.XHR);

Faye.Transport.CORS = Faye.extend(Faye.Class(Faye.Transport, {
  encode: function(messages) {
    return 'message=' + encodeURIComponent(Faye.toJSON(messages));
  },

  request: function(messages) {
    var xhrClass = Faye.ENV.XDomainRequest ? XDomainRequest : XMLHttpRequest,
        xhr      = new xhrClass(),
        headers  = this._client.headers,
        self     = this,
        key;

    xhr.open('POST', Faye.URI.stringify(this.endpoint), true);

    if (xhr.setRequestHeader) {
      xhr.setRequestHeader('Pragma', 'no-cache');
      for (key in headers) {
        if (!headers.hasOwnProperty(key)) continue;
        xhr.setRequestHeader(key, headers[key]);
      }
    }

    var cleanUp = function() {
      if (!xhr) return false;
      xhr.onload = xhr.onerror = xhr.ontimeout = xhr.onprogress = null;
      xhr = null;
    };

    xhr.onload = function() {
      var parsedMessage = null;
      try {
        parsedMessage = JSON.parse(xhr.responseText);
      } catch (e) {}

      cleanUp();

      if (parsedMessage)
        self.receive(parsedMessage);
      else
        self._client.messageError(messages);
    };

    xhr.onerror = xhr.ontimeout = function() {
      cleanUp();
      self._client.messageError(messages);
    };

    xhr.onprogress = function() {};
    xhr.send(this.encode(messages));
  }
}), {
  isUsable: function(client, endpoint, callback, context) {
    if (Faye.URI.isSameOrigin(endpoint))
      return callback.call(context, false);

    if (Faye.ENV.XDomainRequest)
      return callback.call(context, endpoint.protocol === Faye.ENV.location.protocol);

    if (Faye.ENV.XMLHttpRequest) {
      var xhr = new Faye.ENV.XMLHttpRequest();
      return callback.call(context, xhr.withCredentials !== undefined);
    }
    return callback.call(context, false);
  }
});

Faye.Transport.register('cross-origin-long-polling', Faye.Transport.CORS);

Faye.Transport.JSONP = Faye.extend(Faye.Class(Faye.Transport, {
 encode: function(messages) {
    var url = Faye.copyObject(this.endpoint);
    url.query.message = Faye.toJSON(messages);
    url.query.jsonp   = '__jsonp' + Faye.Transport.JSONP._cbCount + '__';
    return Faye.URI.stringify(url);
  },

  request: function(messages) {
    var head         = document.getElementsByTagName('head')[0],
        script       = document.createElement('script'),
        callbackName = Faye.Transport.JSONP.getCallbackName(),
        endpoint     = Faye.copyObject(this.endpoint),
        self         = this;

    endpoint.query.message = Faye.toJSON(messages);
    endpoint.query.jsonp   = callbackName;

    Faye.ENV[callbackName] = function(data) {
      if (!Faye.ENV[callbackName]) return false;
      Faye.ENV[callbackName] = undefined;
      try { delete Faye.ENV[callbackName] } catch (e) {}
      script.parentNode.removeChild(script);
      self.receive(data);
    };

    script.type = 'text/javascript';
    script.src  = Faye.URI.stringify(endpoint);
    head.appendChild(script);
  }
}), {
  _cbCount: 0,

  getCallbackName: function() {
    this._cbCount += 1;
    return '__jsonp' + this._cbCount + '__';
  },

  isUsable: function(client, endpoint, callback, context) {
    callback.call(context, true);
  }
});

Faye.Transport.register('callback-polling', Faye.Transport.JSONP);

})();