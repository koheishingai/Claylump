'use strict';

import helper     from "./helper";
import tmplHelper from "./template-helper";
import * as htmlParser from "htmlParser";

var REX_INTERPOLATE_SYMBOL = /{{[^{}]+}}/g,
    REX_REPEAT_SYMBOL      = /{{(\w+)\sin\s([\w\.]+)}}/,
    STR_REPEAT_ATTRIBUTE   = 'cl-repeat';

export default {
  /**
   * @static
   * @param {String} html
   * @returns {ClayTemplateCompiler}
   */
  create: function(html) {
    return new ClayTemplateCompiler(html);
  }
};

/**
 * @class ClayTemplateCompiler
 */
class ClayTemplateCompiler {
  /**
   * @param {String} html
   * @constructor
   */
  constructor(html) {
    var handler = new htmlParser.DefaultHandler(function (err, dom) {
          if (err) {
            console.error(err);
          }
        }, {
          enforceEmptyTags : true,
          ignoreWhitespace : true,
          verbose          : false
        }),
        parser = new htmlParser.Parser(handler);

    // parse html
    parser.parseComplete(html);
    if (handler.dom.length > 1) {
      throw Error('Template must have exactly one root element. was: ' + html);
    }

    // compile
    this.structure = compileDomStructure(handler.dom[0]);
  }

  /**
   * @typedef {Object} DomStructure
   * @property {?String} data
   * @property {Object.<string, string>} attribs
   * @property {String} style
   * @property {Object.<string, function>} hooks
   * @property {TplEvaluators} evaluators
   * @property {Array.<DomStructure>} children
   */

  /**
   * @typedef {Object} TplEvaluators
   * @property {Object.<string, function>} attrs
   * @property {?Function} style
   * @property {?Function} data
   * @property {?Function} repeat
   */

  /**
   * parsed DOM structure
   * @property {DomStructure} structure
   */

  /**
   *
   * @returns {DomStructure}
   */
  getCompiled() {
    return this.structure;
  }
}

/**
 * @destructive
 * @param {Object} domStructure
 */
function compileDomStructure(domStructure = {}) {
  var data     = domStructure.data,
      attrs    = domStructure.attribs    || {},
      children = domStructure.children   || [],
      hooks    = domStructure.hooks      = {},
      evals    = domStructure.evaluators = {
        attrs  : {},
        style  : null,
        data   : null,
        repeat : null
      },
      keys, key, i = 0;

  // styles evaluator
  if (attrs.style) {
    domStructure.style = attrs.style;
    evals.style = compileValue(domStructure.style);
    delete attrs.style;  // delete from orig attrib object
  }

  // attributes evaluator & hook
  keys = Object.keys(attrs);
  while ((key = keys[i++])) {
    // hook
    if (tmplHelper[key]) {
      hooks[key] = hook(tmplHelper[key]);
    }
    // repeat
    else if (key === STR_REPEAT_ATTRIBUTE) {
      evals.repeat = compileRepeatExpression(attrs[STR_REPEAT_ATTRIBUTE]);
      delete attrs[STR_REPEAT_ATTRIBUTE]; // delete from orig attrib object
    }
    // interpolate
    else {
      evals.attrs[key] = compileValue(attrs[key]);
    }
  }

  // data (text) evaluator
  evals.data = compileValue(data);

  // recursive
  children.forEach(function(child) {
    compileDomStructure(child);
  });

  return domStructure
}

/**
 * @param {String} str
 * @returns {?Function}
 */
function compileValue(str) {
  str = (str || '');
  var matches = str.match(REX_INTERPOLATE_SYMBOL);

  if (matches === null) {
    return null;
  }

  return new Function('data',[
    "var s=[];",
    "s.push('",
    str.replace(/[\r\n\t]/g, ' ')
       .split("'").join("\\'")
       .replace(/{{([^{}]+)}}/g, "',(data.$1 != null ? data.$1 : ''),'")
       .split(/\s{2,}/).join(' '),
    "');",
    "return s.join('');"
  ].join(''));
}

/**
 * @param {String} repeatExpr
 * @returns {Function}
 */
function compileRepeatExpression(repeatExpr) {
  var matches = (repeatExpr || '').match(REX_REPEAT_SYMBOL),
      parentTargetPath,
      childScopeName;

  if (matches === null) {
    throw new Error('Unexpected syntax for repeat: ' + repeatExpr)
  }

  parentTargetPath = matches[2];
  childScopeName   = matches[1];

  return new Function('data', [
    "return data." + parentTargetPath + ".map(function(item) {",
    "  var ks, k, i = 0, r = {};",
    "  ks = Object.keys(data);",
    "  while ((k = ks[i++])) {",
    "    r[k] = data[k];",
    "  }",
    "  r." + childScopeName + " = item;",
    "  return r;",
    "});"
  ].join(''));
}

/**
 * hook class
 * @class HookWrapper
 * @param {Function} fn
 * @constructor
 */
class HookWrapper {

  constructor(fn) {
    this.fn = fn
  }

  hook() {
    this.fn.apply(this, arguments)
  }
}

/**
 * @param {Function} fn
 * @returns {HookWrapper}
 * @constructor
 */
function hook(fn) {
  return new HookWrapper(fn)
}
