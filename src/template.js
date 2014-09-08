'use strict';

var h          = require('virtual-dom/h');
var diff       = require('virtual-dom/diff');
var patch      = require('virtual-dom/patch');
var htmlParser = require("htmlParser");
var helper     = require("./helper");
var tmplHelper = require("./template-helper");
var create     = require('virtual-dom/create-element');

var REX_INTERPOLATE  = /{{[^{}]+}}/g;
var REX_REPEAT_FORM  = /{{(\w+)\sin\s([\w\.]+)}}/;
var REX_ESCAPE_START = /{{/g;
var REX_ESCAPE_END   = /}}/g;

var ATTR_REPEAT      = 'cl-repeat';

var STR_ESCAPE_REPLACEMENT_START = '\\{\\{';
var STR_ESCAPE_REPLACEMENT_END   = '\\}\\}';

/**
 * TODO refactor & improve performance
 * @class ClayTemplate
 */
module.exports = {
  /**
   * @static
   * @param {String} html
   * @param {Object} scope
   * @returns {ClayTemplate}
   */
  create: function(html, scope) {
    return new ClayTemplate(html, scope);
  }
};

/**
 *
 * @param {String} html
 * @param {Object} scope
 * @constructor
 */
function ClayTemplate(html, scope) {
  this.tmpl  = html;
  this.scope = scope;

  this.handler = new htmlParser.DefaultHandler(function (err, dom) {
    if (err) {
      console.error(err);
    }
  }, {
    enforceEmptyTags : true,
    ignoreWhitespace : true,
    verbose          : false
  });
  this.parser = new htmlParser.Parser(this.handler);

  this.init();
}

helper.mix(ClayTemplate.prototype, {
  /**
   * @property {Object} scope
   */
  scope: {},
  /**
   * @property {String} tmpl
   */
  tmpl: '',
  /**
   * @property {Object} struct
   */
  struct: {},
  /**
   * @property {Function} parser
   */
  perser: null,
  /**
   * @property {Function} handler
   */
  handler : null,
  /**
   * @property {VTree} currentVTree
   */
  currentVTree: null,
  /**
   * @property {Array} diffQueue
   */
  diffQueue: [],
  /**
   *
   */
  init: function() {
    this.parseHtml();
    this.observeScope()
  },
  /**
   *
   */
  parseHtml: function() {
    console.time('parse html');
    this.parser.parseComplete(this.tmpl);
    console.timeEnd('parse html');

    if (this.handler.dom.length > 1) {
      throw Error('Template must have exactly one root element. was: ' + this.tmpl);
    }

    return this.struct = this.handler.dom[0];
  },
  /**
   * @property {Object} rootObserveTarget
   */
  rootObserveTarget: {},
  /**
   *
   */
  observeScope: function() {
    var matches = this.tmpl.match(REX_INTERPOLATE),
        uniq = {}, i = 0, symbol;

    if (matches === null) {
      return;
    }

    // unique list
    while ((symbol = matches[i++])) {
      symbol = symbol.slice(2, -2); // '{{foo.bar}}' -> 'foo.bar'
      if (!uniq[symbol]) {
        uniq[symbol] = true;
      }
    }

    // interpolate path
    Object.keys(uniq).map(function(symbolPath) {
      var host     = this.scope,
          tokens   = symbolPath.split('.'),
          observer = this.invalidate.bind(this);

      if (tokens.length > 1) {
        // observe host object

        // remove target property name;
        tokens.splice(-1);

        // fill object
        var i = 0, token;
        while ((token = tokens[i++])) {
          host[token] || (host[token] = {});
          host = host[token];
        }

        // avoid duplicate observe
        if (!host.__observed) {
          host.__observed = true;
          Object.observe(host, observer);
        }
      } else {
        // register root target prop
        this.rootObserveTarget[tokens[0]] = true;
      }
    }.bind(this));

    // observe root scope
    Object.observe(this.scope, function(changes) {
      var i = 0, prop;
      while ((prop = changes[i++])) {
        if (this.rootObserveTarget[prop.name]) {
          this.invalidate();
          break;
        }

      }
    }.bind(this));
  },

  /**
   * @returns {VTree}
   */
  createVTree: function() {
    console.time('compute vtree');
    var ret = this.currentVTree = convertParsedDomToVTree(this.struct, this.scope);
    console.timeEnd('compute vtree');
    return ret;
  },
  /**
   */
  createElement: function(doc) {
    return create(this.createVTree(), {
      document: doc
    });
  },
  /**
   * @property {Boolean} _invalidated
   */
  _invalidated: false,
  /**
   *
   */
  invalidate: function() {
    if (this._invalidated) {
      return;
    }
    this._invalidated = true;
    setTimeout(this._update.bind(this), 4);
  },
  /**
   *
   */
  _update: function() {
    console.time('compute vtree');
    var current = this.currentVTree,
        updated = convertParsedDomToVTree(this.struct, this.scope);
    console.timeEnd('compute vtree');

    console.time('compute diff');
    this.diffQueue = diff(current, updated);
    console.timeEnd('compute diff');
    this.currentVTree = updated;

    this._invalidated = false;
  },
  /**
   *
   * @param {Element} targetRoot
   */
  drawLoop: function(targetRoot) {
    var patchDOM = function() {
      if (this.diffQueue) {
        console.time('apply patch');
        patch(targetRoot, this.diffQueue);
        console.timeEnd('apply patch');
        this.diffQueue = null;
      }
      window.requestAnimationFrame(patchDOM);
    }.bind(this);

    patchDOM();
  },
  /**
   *
   */
  destroy: function() {
    this.scope = this.tmpl = this.struct = this.parser = this.handler = null;
  }
});

/**
 *
 * @param {Object} dom
 * @param {Object} scope
 * @param {Boolean} [ignoreRepeat]
 * @returns {Object|Array}
 */
function convertParsedDomToVTree(dom, scope, ignoreRepeat) {
  var scope    = scope,
      tag      = dom.name,
      type     = dom.type,
      data     = dom.data,
      orgAttrs = dom.attribs || {},
      children = dom.children || [],
      attrs    = {},
      style    = {},
      hooks    = {},
      keys, key, i = 0;

  switch(type) {
    case 'tag':
      // styles
      if (orgAttrs.style) {
        style = applyInterpolateValues(orgAttrs.style, scope);
        style = convertCssStringToObject(style);
      }

      // attributes
      keys = Object.keys(orgAttrs);
      while ((key = keys[i++])) {

        // register hook from template helper
        if (tmplHelper[key]) {
          hooks[key] = hook(tmplHelper[key].bind(this));

        // repeat syntax
        } else if (key === ATTR_REPEAT && !ignoreRepeat) {

          var repeatScopes = createRepeatScopes(orgAttrs[key], scope)
          return repeatScopes.map(function(scope) {
            return convertParsedDomToVTree(dom, scope, true)
          });
        }

        attrs[key] = applyInterpolateValues(orgAttrs[key], scope);
      }

      // flatten children
      children = children.map(function(child) {
                            return convertParsedDomToVTree(child, scope);
                          })
                         .filter(function(v) { return !!v; });
      children = helper.flatten(children);

      // create vtree
      return h(tag, helper.mix(hooks, {
          attributes : attrs,
          style      : style
        }),
        children
      );
      break;

    case 'text':
      data = applyInterpolateValues(data, scope);
      return String(data);
      break;

    case 'comment':
      // ignore
      return null;
      break;
  }
}

/**
 * @param {String} repeatExpr
 * @param {Object} parentScope
 * @returns {Array}
 */
function createRepeatScopes(repeatExpr, parentScope) {
  var matches = (repeatExpr || '').match(REX_REPEAT_FORM);
  if (matches === null) {
    throw new Error('Unexpected syntax for repeat: ' + repeatExpr)
  }
  var parentTargetPath = matches[2],
      childScopeName   = matches[1],
      repeatTarget     = getValueFromObjectPath(parentTargetPath, parentScope) || [];

  return repeatTarget.map(function(item) {
    var newScope = helper.clone(parentScope);
    newScope[childScopeName] = item;
    return newScope;
  });
}

/**
 *
 * @param {String} str
 * @param {Object} scope
 * @returns {*}
 */
function applyInterpolateValues(str, scope) {
  var matches = str.match(REX_INTERPOLATE),
      i = 0, needle, path, value;

  if (matches) {
    while ((needle = matches[i++])) {

      path = needle.slice(2, -2); // '{{foo.bar}}' -> 'foo.bar'
      value = getValueFromObjectPath(path, scope);

      if (helper.isString(value)) {
        str = str.replace(needle, escapeInterpolateSymbol(value));
      } else if (helper.isNumber(value)) {
        str = str.replace(needle, value);
      } else if (helper.isArray(value)) {
        str = value.toString();
      } else {
        // noop
      }
    }
  }
  return str;
}

/**
 * @param {String} text
 * @returns {String}
 */
function escapeInterpolateSymbol(text) {
  return text.replace(REX_ESCAPE_START, STR_ESCAPE_REPLACEMENT_START)
             .replace(REX_ESCAPE_END,   STR_ESCAPE_REPLACEMENT_END);
}

/**
 *
 * @param {String} path
 * @param {Object} startScope
 * @returns {*}
 */
function getValueFromObjectPath(path, startScope) {
  var stack = path.split('.'),
      ret   = startScope,
      i = 0, key;

  while ((key = stack[i++])) {
    ret = ret[key];
    if (ret == null) { // undefined || null
      ret = '';
      break;
    }
  }
  return ret;
}

/**
 * @param {String} cssStr
 * @returns {Object}
 */
function convertCssStringToObject(cssStr) {
  var cssStrings = cssStr.replace(/\s/g, '').split(';'),
      retStyle   = {},
      i = 0, prop_value;

  while ((prop_value = cssStrings[i++])) {
    prop_value = prop_value.split(':');
    retStyle[prop_value[0]] = prop_value[1];
  }
  return retStyle;
}

/**
 * hook class
 * @class HookWrapper
 * @param {Function} fn
 * @constructor
 */
function HookWrapper(fn) {
  this.fn = fn
}

HookWrapper.prototype.hook = function () {
  this.fn.apply(this, arguments)
};

/**
 * @param {Function} fn
 * @returns {HookWrapper}
 * @constructor
 */
function hook(fn) {
  return new HookWrapper(fn)
}
