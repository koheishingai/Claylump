'use strict';

import helper     from "./helper";
import * as htmlParser from "htmlParser";

var REX_INTERPOLATE_SYMBOL = /{{[^{}]+}}/g;
var REX_REPEAT_SYMBOL      = /{{(\w+)\sin\s([\w\.]+)}}/;
var STR_REPEAT_ATTRIBUTE   = 'cl-repeat';
var STR_EVAL_FUNCTION_SYMBOL = '__EVAL_FUNCTION__';

export default {
  /**
   * @static
   * @returns {ClayTemplateCompiler}
   */
  create: function() {
    return new ClayTemplateCompiler();
  }
};

/**
 * @class ClayTemplateCompiler
 */
class ClayTemplateCompiler {
  /**
   * @constructor
   */
  constructor() {
    // noop
  }

  /**
   * @typedef {Object} DomStructure
   * @property {?String} data
   * @property {Object.<string, string>} attribs
   * @property {String} style
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
   * @param {String} html
   * @returns {DomStructure}
   */
  compileFromHtml(html) {
    var parsed = this.parseHtml(html);
    this.preCompile = false;
    return this.compileDomStructure(parsed);
  }

  /**
   * @param {String} html
   * @returns {String}
   */
  serializeFromHtml(html) {
    var parsed = this.parseHtml(html);
    this.preCompile = true;
    return JSON.stringify(this.compileDomStructure(parsed));
  }

  parseHtml(html) {
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

    return handler.dom[0];
  }


  /**
   * @destructive
   * @param {Object} domStructure
   */
  compileDomStructure(domStructure = {}) {
    var data     = domStructure.data,
        attrs    = domStructure.attribs    || {},
        children = domStructure.children   || [],
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
      evals.style = this.compileValue(domStructure.style);
      delete attrs.style;  // delete from orig attrib object
    }

    // attributes evaluator
    keys = Object.keys(attrs);
    while ((key = keys[i++])) {
      // repeat
      if (key === STR_REPEAT_ATTRIBUTE) {
        evals.repeat = this.compileRepeatExpression(attrs[STR_REPEAT_ATTRIBUTE]);
        delete attrs[STR_REPEAT_ATTRIBUTE]; // delete from orig attrib object
      }
      // interpolate
      else {
        evals.attrs[key] = this.compileValue(attrs[key]);
      }
    }

    // data (text) evaluator
    evals.data = this.compileValue(data);

    // recursive
    children.forEach(child => this.compileDomStructure(child));

    return domStructure
  }

  /**
   * @param {String} str
   * @returns {?Function}
   */
  compileValue(str) {
    str = (str || '');
    var matches = str.match(REX_INTERPOLATE_SYMBOL);

    if (matches === null) {
      return null;
    }

    var funcObj = {
      [STR_EVAL_FUNCTION_SYMBOL]: true,
      args : ['data', ["var s=[];",
        "s.push('",
        str.replace(/[\r\n\t]/g, ' ')
          .split("'").join("\\'")
          .replace(/{{([^{}]+)}}/g, "',(data.$1 != null ? data.$1 : ''),'")
          .split(/\s{2,}/).join(' '),
        "');",
        "return s.join('');"
      ].join('')]
    };
    return this.preCompile ? funcObj : helper.invoke(Function, funcObj.args);
  }

  /**
   * @param {String} repeatExpr
   * @returns {Function}
   */
  compileRepeatExpression(repeatExpr) {
    var matches = (repeatExpr || '').match(REX_REPEAT_SYMBOL),
      parentTargetPath,
      childScopeName;

    if (matches === null) {
      throw new Error('Unexpected syntax for repeat: ' + repeatExpr)
    }

    parentTargetPath = matches[2];
    childScopeName   = matches[1];

    var funcObj = {
      [STR_EVAL_FUNCTION_SYMBOL]: true,
      args : ['data', [
          "return data." + parentTargetPath + ".map(function(item) {",
        "  var ks, k, i = 0, r = {};",
        "  ks = Object.keys(data);",
        "  while ((k = ks[i++])) {",
        "    r[k] = data[k];",
        "  }",
          "  r." + childScopeName + " = item;",
        "  return r;",
        "});"
      ].join('')]
    };
    return this.preCompile ? funcObj : helper.invoke(Function, funcObj.args);
  }

}
