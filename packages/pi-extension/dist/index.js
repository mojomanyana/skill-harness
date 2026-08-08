// packages/pi-extension/src/index.ts
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { dirname as dirname8, join as join25 } from "node:path";

// packages/pi-extension/src/commands.ts
import { existsSync as existsSync21 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { dirname as dirname7, join as join24, resolve as resolve11, relative as relative3 } from "node:path";

// packages/core/dist/spec.js
import { readFileSync } from "node:fs";

// node_modules/js-yaml/dist/js-yaml.mjs
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
    key = keys[i];
    if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
      get: ((k) => from[k]).bind(null, key),
      enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
    });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
  value: mod,
  enumerable: true
}) : target, mod));
var require_common = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  function isNothing(subject) {
    return typeof subject === "undefined" || subject === null;
  }
  function isObject(subject) {
    return typeof subject === "object" && subject !== null;
  }
  function toArray(sequence) {
    if (Array.isArray(sequence)) return sequence;
    else if (isNothing(sequence)) return [];
    return [sequence];
  }
  function extend(target, source) {
    if (source) {
      const sourceKeys = Object.keys(source);
      for (let index = 0, length = sourceKeys.length; index < length; index += 1) {
        const key = sourceKeys[index];
        target[key] = source[key];
      }
    }
    return target;
  }
  function repeat(string, count) {
    let result = "";
    for (let cycle = 0; cycle < count; cycle += 1) result += string;
    return result;
  }
  function isNegativeZero(number) {
    return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
  }
  module.exports.isNothing = isNothing;
  module.exports.isObject = isObject;
  module.exports.toArray = toArray;
  module.exports.repeat = repeat;
  module.exports.isNegativeZero = isNegativeZero;
  module.exports.extend = extend;
}));
var require_exception = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  function formatError(exception, compact) {
    let where = "";
    const message = exception.reason || "(unknown reason)";
    if (!exception.mark) return message;
    if (exception.mark.name) where += 'in "' + exception.mark.name + '" ';
    where += "(" + (exception.mark.line + 1) + ":" + (exception.mark.column + 1) + ")";
    if (!compact && exception.mark.snippet) where += "\n\n" + exception.mark.snippet;
    return message + " " + where;
  }
  function YAMLException2(reason, mark) {
    Error.call(this);
    this.name = "YAMLException";
    this.reason = reason;
    this.mark = mark;
    this.message = formatError(this, false);
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
    else this.stack = (/* @__PURE__ */ new Error()).stack || "";
  }
  YAMLException2.prototype = Object.create(Error.prototype);
  YAMLException2.prototype.constructor = YAMLException2;
  YAMLException2.prototype.toString = function toString(compact) {
    return this.name + ": " + formatError(this, compact);
  };
  module.exports = YAMLException2;
}));
var require_snippet = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var common = require_common();
  function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
    let head = "";
    let tail = "";
    const maxHalfLength = Math.floor(maxLineLength / 2) - 1;
    if (position - lineStart > maxHalfLength) {
      head = " ... ";
      lineStart = position - maxHalfLength + head.length;
    }
    if (lineEnd - position > maxHalfLength) {
      tail = " ...";
      lineEnd = position + maxHalfLength - tail.length;
    }
    return {
      str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
      pos: position - lineStart + head.length
    };
  }
  function padStart(string, max) {
    return common.repeat(" ", max - string.length) + string;
  }
  function makeSnippet(mark, options) {
    options = Object.create(options || null);
    if (!mark.buffer) return null;
    if (!options.maxLength) options.maxLength = 79;
    if (typeof options.indent !== "number") options.indent = 1;
    if (typeof options.linesBefore !== "number") options.linesBefore = 3;
    if (typeof options.linesAfter !== "number") options.linesAfter = 2;
    const re = /\r?\n|\r|\0/g;
    const lineStarts = [0];
    const lineEnds = [];
    let match;
    let foundLineNo = -1;
    while (match = re.exec(mark.buffer)) {
      lineEnds.push(match.index);
      lineStarts.push(match.index + match[0].length);
      if (mark.position <= match.index && foundLineNo < 0) foundLineNo = lineStarts.length - 2;
    }
    if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
    let result = "";
    const lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
    const maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
    for (let i = 1; i <= options.linesBefore; i++) {
      if (foundLineNo - i < 0) break;
      const line2 = getLine(mark.buffer, lineStarts[foundLineNo - i], lineEnds[foundLineNo - i], mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]), maxLineLength);
      result = common.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line2.str + "\n" + result;
    }
    const line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
    result += common.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
    result += common.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
    for (let i = 1; i <= options.linesAfter; i++) {
      if (foundLineNo + i >= lineEnds.length) break;
      const line2 = getLine(mark.buffer, lineStarts[foundLineNo + i], lineEnds[foundLineNo + i], mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]), maxLineLength);
      result += common.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line2.str + "\n";
    }
    return result.replace(/\n$/, "");
  }
  module.exports = makeSnippet;
}));
var require_type = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var YAMLException2 = require_exception();
  var TYPE_CONSTRUCTOR_OPTIONS = [
    "kind",
    "multi",
    "resolve",
    "construct",
    "instanceOf",
    "predicate",
    "represent",
    "representName",
    "defaultStyle",
    "styleAliases"
  ];
  var YAML_NODE_KINDS = [
    "scalar",
    "sequence",
    "mapping"
  ];
  function compileStyleAliases(map) {
    const result = {};
    if (map !== null) Object.keys(map).forEach(function(style) {
      map[style].forEach(function(alias) {
        result[String(alias)] = style;
      });
    });
    return result;
  }
  function Type3(tag, options) {
    options = options || {};
    Object.keys(options).forEach(function(name) {
      if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) throw new YAMLException2('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
    });
    this.options = options;
    this.tag = tag;
    this.kind = options["kind"] || null;
    this.resolve = options["resolve"] || function() {
      return true;
    };
    this.construct = options["construct"] || function(data) {
      return data;
    };
    this.instanceOf = options["instanceOf"] || null;
    this.predicate = options["predicate"] || null;
    this.represent = options["represent"] || null;
    this.representName = options["representName"] || null;
    this.defaultStyle = options["defaultStyle"] || null;
    this.multi = options["multi"] || false;
    this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
    if (YAML_NODE_KINDS.indexOf(this.kind) === -1) throw new YAMLException2('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
  }
  module.exports = Type3;
}));
var require_schema = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var YAMLException2 = require_exception();
  var Type3 = require_type();
  function compileList(schema, name) {
    const result = [];
    schema[name].forEach(function(currentType) {
      let newIndex = result.length;
      result.forEach(function(previousType, previousIndex) {
        if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) newIndex = previousIndex;
      });
      result[newIndex] = currentType;
    });
    return result;
  }
  function compileMap() {
    const result = {
      scalar: {},
      sequence: {},
      mapping: {},
      fallback: {},
      multi: {
        scalar: [],
        sequence: [],
        mapping: [],
        fallback: []
      }
    };
    function collectType(type) {
      if (type.multi) {
        result.multi[type.kind].push(type);
        result.multi["fallback"].push(type);
      } else result[type.kind][type.tag] = result["fallback"][type.tag] = type;
    }
    for (let index = 0, length = arguments.length; index < length; index += 1) arguments[index].forEach(collectType);
    return result;
  }
  function Schema2(definition) {
    return this.extend(definition);
  }
  Schema2.prototype.extend = function extend(definition) {
    let implicit = [];
    let explicit = [];
    if (definition instanceof Type3) explicit.push(definition);
    else if (Array.isArray(definition)) explicit = explicit.concat(definition);
    else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
      if (definition.implicit) implicit = implicit.concat(definition.implicit);
      if (definition.explicit) explicit = explicit.concat(definition.explicit);
    } else throw new YAMLException2("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
    implicit.forEach(function(type) {
      if (!(type instanceof Type3)) throw new YAMLException2("Specified list of YAML types (or a single Type object) contains a non-Type object.");
      if (type.loadKind && type.loadKind !== "scalar") throw new YAMLException2("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
      if (type.multi) throw new YAMLException2("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
    });
    explicit.forEach(function(type) {
      if (!(type instanceof Type3)) throw new YAMLException2("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    });
    const result = Object.create(Schema2.prototype);
    result.implicit = (this.implicit || []).concat(implicit);
    result.explicit = (this.explicit || []).concat(explicit);
    result.compiledImplicit = compileList(result, "implicit");
    result.compiledExplicit = compileList(result, "explicit");
    result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
    return result;
  };
  module.exports = Schema2;
}));
var require_str = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  module.exports = new (require_type())("tag:yaml.org,2002:str", {
    kind: "scalar",
    construct: function(data) {
      return data !== null ? data : "";
    }
  });
}));
var require_seq = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  module.exports = new (require_type())("tag:yaml.org,2002:seq", {
    kind: "sequence",
    construct: function(data) {
      return data !== null ? data : [];
    }
  });
}));
var require_map = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  module.exports = new (require_type())("tag:yaml.org,2002:map", {
    kind: "mapping",
    construct: function(data) {
      return data !== null ? data : {};
    }
  });
}));
var require_failsafe = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  module.exports = new (require_schema())({ explicit: [
    require_str(),
    require_seq(),
    require_map()
  ] });
}));
var require_null = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var Type3 = require_type();
  function resolveYamlNull(data) {
    if (data === null) return true;
    const max = data.length;
    return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
  }
  function constructYamlNull() {
    return null;
  }
  function isNull(object) {
    return object === null;
  }
  module.exports = new Type3("tag:yaml.org,2002:null", {
    kind: "scalar",
    resolve: resolveYamlNull,
    construct: constructYamlNull,
    predicate: isNull,
    represent: {
      canonical: function() {
        return "~";
      },
      lowercase: function() {
        return "null";
      },
      uppercase: function() {
        return "NULL";
      },
      camelcase: function() {
        return "Null";
      },
      empty: function() {
        return "";
      }
    },
    defaultStyle: "lowercase"
  });
}));
var require_bool = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var Type3 = require_type();
  function resolveYamlBoolean(data) {
    if (data === null) return false;
    const max = data.length;
    return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
  }
  function constructYamlBoolean(data) {
    return data === "true" || data === "True" || data === "TRUE";
  }
  function isBoolean(object) {
    return Object.prototype.toString.call(object) === "[object Boolean]";
  }
  module.exports = new Type3("tag:yaml.org,2002:bool", {
    kind: "scalar",
    resolve: resolveYamlBoolean,
    construct: constructYamlBoolean,
    predicate: isBoolean,
    represent: {
      lowercase: function(object) {
        return object ? "true" : "false";
      },
      uppercase: function(object) {
        return object ? "TRUE" : "FALSE";
      },
      camelcase: function(object) {
        return object ? "True" : "False";
      }
    },
    defaultStyle: "lowercase"
  });
}));
var require_int = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var common = require_common();
  var Type3 = require_type();
  function isHexCode(c) {
    return c >= 48 && c <= 57 || c >= 65 && c <= 70 || c >= 97 && c <= 102;
  }
  function isOctCode(c) {
    return c >= 48 && c <= 55;
  }
  function isDecCode(c) {
    return c >= 48 && c <= 57;
  }
  function resolveYamlInteger(data) {
    if (data === null) return false;
    const max = data.length;
    let index = 0;
    let hasDigits = false;
    if (!max) return false;
    let ch = data[index];
    if (ch === "-" || ch === "+") ch = data[++index];
    if (ch === "0") {
      if (index + 1 === max) return true;
      ch = data[++index];
      if (ch === "b") {
        index++;
        for (; index < max; index++) {
          ch = data[index];
          if (ch !== "0" && ch !== "1") return false;
          hasDigits = true;
        }
        return hasDigits && Number.isFinite(parseYamlInteger(data));
      }
      if (ch === "x") {
        index++;
        for (; index < max; index++) {
          if (!isHexCode(data.charCodeAt(index))) return false;
          hasDigits = true;
        }
        return hasDigits && Number.isFinite(parseYamlInteger(data));
      }
      if (ch === "o") {
        index++;
        for (; index < max; index++) {
          if (!isOctCode(data.charCodeAt(index))) return false;
          hasDigits = true;
        }
        return hasDigits && Number.isFinite(parseYamlInteger(data));
      }
    }
    for (; index < max; index++) {
      if (!isDecCode(data.charCodeAt(index))) return false;
      hasDigits = true;
    }
    if (!hasDigits) return false;
    return Number.isFinite(parseYamlInteger(data));
  }
  function parseYamlInteger(data) {
    let value = data;
    let sign = 1;
    let ch = value[0];
    if (ch === "-" || ch === "+") {
      if (ch === "-") sign = -1;
      value = value.slice(1);
      ch = value[0];
    }
    if (value === "0") return 0;
    if (ch === "0") {
      if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
      if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
      if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
    }
    return sign * parseInt(value, 10);
  }
  function constructYamlInteger(data) {
    return parseYamlInteger(data);
  }
  function isInteger(object) {
    return Object.prototype.toString.call(object) === "[object Number]" && object % 1 === 0 && !common.isNegativeZero(object);
  }
  module.exports = new Type3("tag:yaml.org,2002:int", {
    kind: "scalar",
    resolve: resolveYamlInteger,
    construct: constructYamlInteger,
    predicate: isInteger,
    represent: {
      binary: function(obj) {
        return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
      },
      octal: function(obj) {
        return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
      },
      decimal: function(obj) {
        return obj.toString(10);
      },
      hexadecimal: function(obj) {
        return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
      }
    },
    defaultStyle: "decimal",
    styleAliases: {
      binary: [2, "bin"],
      octal: [8, "oct"],
      decimal: [10, "dec"],
      hexadecimal: [16, "hex"]
    }
  });
}));
var require_float = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var common = require_common();
  var Type3 = require_type();
  var YAML_FLOAT_PATTERN = /* @__PURE__ */ new RegExp("^(?:[-+]?(?:[0-9]+)(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
  var YAML_FLOAT_SPECIAL_PATTERN = /* @__PURE__ */ new RegExp("^(?:[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
  function resolveYamlFloat(data) {
    if (data === null) return false;
    if (!YAML_FLOAT_PATTERN.test(data)) return false;
    if (Number.isFinite(parseFloat(data, 10))) return true;
    return YAML_FLOAT_SPECIAL_PATTERN.test(data);
  }
  function constructYamlFloat(data) {
    let value = data.toLowerCase();
    const sign = value[0] === "-" ? -1 : 1;
    if ("+-".indexOf(value[0]) >= 0) value = value.slice(1);
    if (value === ".inf") return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    else if (value === ".nan") return NaN;
    return sign * parseFloat(value, 10);
  }
  var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
  function representYamlFloat(object, style) {
    if (isNaN(object)) switch (style) {
      case "lowercase":
        return ".nan";
      case "uppercase":
        return ".NAN";
      case "camelcase":
        return ".NaN";
    }
    else if (Number.POSITIVE_INFINITY === object) switch (style) {
      case "lowercase":
        return ".inf";
      case "uppercase":
        return ".INF";
      case "camelcase":
        return ".Inf";
    }
    else if (Number.NEGATIVE_INFINITY === object) switch (style) {
      case "lowercase":
        return "-.inf";
      case "uppercase":
        return "-.INF";
      case "camelcase":
        return "-.Inf";
    }
    else if (common.isNegativeZero(object)) return "-0.0";
    const res = object.toString(10);
    return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
  }
  function isFloat(object) {
    return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
  }
  module.exports = new Type3("tag:yaml.org,2002:float", {
    kind: "scalar",
    resolve: resolveYamlFloat,
    construct: constructYamlFloat,
    predicate: isFloat,
    represent: representYamlFloat,
    defaultStyle: "lowercase"
  });
}));
var require_json = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  module.exports = require_failsafe().extend({ implicit: [
    require_null(),
    require_bool(),
    require_int(),
    require_float()
  ] });
}));
var require_core = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  module.exports = require_json();
}));
var require_timestamp = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var Type3 = require_type();
  var YAML_DATE_REGEXP = /* @__PURE__ */ new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$");
  var YAML_TIMESTAMP_REGEXP = /* @__PURE__ */ new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$");
  function resolveYamlTimestamp(data) {
    if (data === null) return false;
    if (YAML_DATE_REGEXP.exec(data) !== null) return true;
    if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
    return false;
  }
  function constructYamlTimestamp(data) {
    let fraction = 0;
    let delta = null;
    let match = YAML_DATE_REGEXP.exec(data);
    if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
    if (match === null) throw new Error("Date resolve error");
    const year = +match[1];
    const month = +match[2] - 1;
    const day = +match[3];
    if (!match[4]) return new Date(Date.UTC(year, month, day));
    const hour = +match[4];
    const minute = +match[5];
    const second = +match[6];
    if (match[7]) {
      fraction = match[7].slice(0, 3);
      while (fraction.length < 3) fraction += "0";
      fraction = +fraction;
    }
    if (match[9]) {
      const tzHour = +match[10];
      const tzMinute = +(match[11] || 0);
      delta = (tzHour * 60 + tzMinute) * 6e4;
      if (match[9] === "-") delta = -delta;
    }
    const date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
    if (delta) date.setTime(date.getTime() - delta);
    return date;
  }
  function representYamlTimestamp(object) {
    return object.toISOString();
  }
  module.exports = new Type3("tag:yaml.org,2002:timestamp", {
    kind: "scalar",
    resolve: resolveYamlTimestamp,
    construct: constructYamlTimestamp,
    instanceOf: Date,
    represent: representYamlTimestamp
  });
}));
var require_merge = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var Type3 = require_type();
  function resolveYamlMerge(data) {
    return data === "<<" || data === null;
  }
  module.exports = new Type3("tag:yaml.org,2002:merge", {
    kind: "scalar",
    resolve: resolveYamlMerge
  });
}));
var require_binary = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var Type3 = require_type();
  var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
  function resolveYamlBinary(data) {
    if (data === null) return false;
    let bitlen = 0;
    const max = data.length;
    const map = BASE64_MAP;
    for (let idx = 0; idx < max; idx++) {
      const code = map.indexOf(data.charAt(idx));
      if (code > 64) continue;
      if (code < 0) return false;
      bitlen += 6;
    }
    return bitlen % 8 === 0;
  }
  function constructYamlBinary(data) {
    const input = data.replace(/[\r\n=]/g, "");
    const max = input.length;
    const map = BASE64_MAP;
    let bits = 0;
    const result = [];
    for (let idx = 0; idx < max; idx++) {
      if (idx % 4 === 0 && idx) {
        result.push(bits >> 16 & 255);
        result.push(bits >> 8 & 255);
        result.push(bits & 255);
      }
      bits = bits << 6 | map.indexOf(input.charAt(idx));
    }
    const tailbits = max % 4 * 6;
    if (tailbits === 0) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    } else if (tailbits === 18) {
      result.push(bits >> 10 & 255);
      result.push(bits >> 2 & 255);
    } else if (tailbits === 12) result.push(bits >> 4 & 255);
    return new Uint8Array(result);
  }
  function representYamlBinary(object) {
    let result = "";
    let bits = 0;
    const max = object.length;
    const map = BASE64_MAP;
    for (let idx = 0; idx < max; idx++) {
      if (idx % 3 === 0 && idx) {
        result += map[bits >> 18 & 63];
        result += map[bits >> 12 & 63];
        result += map[bits >> 6 & 63];
        result += map[bits & 63];
      }
      bits = (bits << 8) + object[idx];
    }
    const tail = max % 3;
    if (tail === 0) {
      result += map[bits >> 18 & 63];
      result += map[bits >> 12 & 63];
      result += map[bits >> 6 & 63];
      result += map[bits & 63];
    } else if (tail === 2) {
      result += map[bits >> 10 & 63];
      result += map[bits >> 4 & 63];
      result += map[bits << 2 & 63];
      result += map[64];
    } else if (tail === 1) {
      result += map[bits >> 2 & 63];
      result += map[bits << 4 & 63];
      result += map[64];
      result += map[64];
    }
    return result;
  }
  function isBinary(obj) {
    return Object.prototype.toString.call(obj) === "[object Uint8Array]";
  }
  module.exports = new Type3("tag:yaml.org,2002:binary", {
    kind: "scalar",
    resolve: resolveYamlBinary,
    construct: constructYamlBinary,
    predicate: isBinary,
    represent: representYamlBinary
  });
}));
var require_omap = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var Type3 = require_type();
  var _hasOwnProperty = Object.prototype.hasOwnProperty;
  var _toString = Object.prototype.toString;
  function resolveYamlOmap(data) {
    if (data === null) return true;
    const objectKeys = [];
    const object = data;
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      let pairHasKey = false;
      if (_toString.call(pair) !== "[object Object]") return false;
      let pairKey;
      for (pairKey in pair) if (_hasOwnProperty.call(pair, pairKey)) if (!pairHasKey) pairHasKey = true;
      else return false;
      if (!pairHasKey) return false;
      if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
      else return false;
    }
    return true;
  }
  function constructYamlOmap(data) {
    return data !== null ? data : [];
  }
  module.exports = new Type3("tag:yaml.org,2002:omap", {
    kind: "sequence",
    resolve: resolveYamlOmap,
    construct: constructYamlOmap
  });
}));
var require_pairs = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var Type3 = require_type();
  var _toString = Object.prototype.toString;
  function resolveYamlPairs(data) {
    if (data === null) return true;
    const object = data;
    const result = new Array(object.length);
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      if (_toString.call(pair) !== "[object Object]") return false;
      const keys = Object.keys(pair);
      if (keys.length !== 1) return false;
      result[index] = [keys[0], pair[keys[0]]];
    }
    return true;
  }
  function constructYamlPairs(data) {
    if (data === null) return [];
    const object = data;
    const result = new Array(object.length);
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      const keys = Object.keys(pair);
      result[index] = [keys[0], pair[keys[0]]];
    }
    return result;
  }
  module.exports = new Type3("tag:yaml.org,2002:pairs", {
    kind: "sequence",
    resolve: resolveYamlPairs,
    construct: constructYamlPairs
  });
}));
var require_set = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var Type3 = require_type();
  var _hasOwnProperty = Object.prototype.hasOwnProperty;
  function resolveYamlSet(data) {
    if (data === null) return true;
    const object = data;
    for (const key in object) if (_hasOwnProperty.call(object, key)) {
      if (object[key] !== null) return false;
    }
    return true;
  }
  function constructYamlSet(data) {
    return data !== null ? data : {};
  }
  module.exports = new Type3("tag:yaml.org,2002:set", {
    kind: "mapping",
    resolve: resolveYamlSet,
    construct: constructYamlSet
  });
}));
var require_default = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  module.exports = require_core().extend({
    implicit: [require_timestamp(), require_merge()],
    explicit: [
      require_binary(),
      require_omap(),
      require_pairs(),
      require_set()
    ]
  });
}));
var require_loader = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var common = require_common();
  var YAMLException2 = require_exception();
  var makeSnippet = require_snippet();
  var DEFAULT_SCHEMA2 = require_default();
  var _hasOwnProperty = Object.prototype.hasOwnProperty;
  var CONTEXT_FLOW_IN = 1;
  var CONTEXT_FLOW_OUT = 2;
  var CONTEXT_BLOCK_IN = 3;
  var CONTEXT_BLOCK_OUT = 4;
  var CHOMPING_CLIP = 1;
  var CHOMPING_STRIP = 2;
  var CHOMPING_KEEP = 3;
  var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
  var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
  var PATTERN_FLOW_INDICATORS = /[,\[\]{}]/;
  var PATTERN_TAG_HANDLE = /^(?:!|!!|![0-9A-Za-z-]+!)$/;
  var PATTERN_TAG_URI = /^(?:!|[^,\[\]{}])(?:%[0-9a-f]{2}|[0-9a-z\-#;/?:@&=+$,_.!~*'()\[\]])*$/i;
  function _class(obj) {
    return Object.prototype.toString.call(obj);
  }
  function isEol(c) {
    return c === 10 || c === 13;
  }
  function isWhiteSpace(c) {
    return c === 9 || c === 32;
  }
  function isWsOrEol(c) {
    return c === 9 || c === 32 || c === 10 || c === 13;
  }
  function isFlowIndicator(c) {
    return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
  }
  function fromHexCode(c) {
    if (c >= 48 && c <= 57) return c - 48;
    const lc = c | 32;
    if (lc >= 97 && lc <= 102) return lc - 97 + 10;
    return -1;
  }
  function escapedHexLen(c) {
    if (c === 120) return 2;
    if (c === 117) return 4;
    if (c === 85) return 8;
    return 0;
  }
  function fromDecimalCode(c) {
    if (c >= 48 && c <= 57) return c - 48;
    return -1;
  }
  function simpleEscapeSequence(c) {
    switch (c) {
      case 48:
        return "\0";
      case 97:
        return "\x07";
      case 98:
        return "\b";
      case 116:
        return "	";
      case 9:
        return "	";
      case 110:
        return "\n";
      case 118:
        return "\v";
      case 102:
        return "\f";
      case 114:
        return "\r";
      case 101:
        return "\x1B";
      case 32:
        return " ";
      case 34:
        return '"';
      case 47:
        return "/";
      case 92:
        return "\\";
      case 78:
        return "\x85";
      case 95:
        return "\xA0";
      case 76:
        return "\u2028";
      case 80:
        return "\u2029";
      default:
        return "";
    }
  }
  function charFromCodepoint(c) {
    if (c <= 65535) return String.fromCharCode(c);
    return String.fromCharCode((c - 65536 >> 10) + 55296, (c - 65536 & 1023) + 56320);
  }
  function setProperty(object, key, value) {
    if (key === "__proto__") Object.defineProperty(object, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value
    });
    else object[key] = value;
  }
  var simpleEscapeCheck = new Array(256);
  var simpleEscapeMap = new Array(256);
  for (let i = 0; i < 256; i++) {
    simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
    simpleEscapeMap[i] = simpleEscapeSequence(i);
  }
  function State(input, options) {
    this.input = input;
    this.filename = options["filename"] || null;
    this.schema = options["schema"] || DEFAULT_SCHEMA2;
    this.onWarning = options["onWarning"] || null;
    this.legacy = options["legacy"] || false;
    this.json = options["json"] || false;
    this.listener = options["listener"] || null;
    this.maxDepth = typeof options["maxDepth"] === "number" ? options["maxDepth"] : 100;
    this.maxMergeSeqLength = typeof options["maxMergeSeqLength"] === "number" ? options["maxMergeSeqLength"] : 20;
    this.implicitTypes = this.schema.compiledImplicit;
    this.typeMap = this.schema.compiledTypeMap;
    this.length = input.length;
    this.position = 0;
    this.line = 0;
    this.lineStart = 0;
    this.lineIndent = 0;
    this.depth = 0;
    this.firstTabInLine = -1;
    this.documents = [];
    this.anchorMapTransactions = [];
  }
  function generateError(state, message) {
    const mark = {
      name: state.filename,
      buffer: state.input.slice(0, -1),
      position: state.position,
      line: state.line,
      column: state.position - state.lineStart
    };
    mark.snippet = makeSnippet(mark);
    return new YAMLException2(message, mark);
  }
  function throwError(state, message) {
    throw generateError(state, message);
  }
  function throwWarning(state, message) {
    if (state.onWarning) state.onWarning.call(null, generateError(state, message));
  }
  function storeAnchor(state, name, value) {
    const transactions = state.anchorMapTransactions;
    if (transactions.length !== 0) {
      const transaction = transactions[transactions.length - 1];
      if (!_hasOwnProperty.call(transaction, name)) transaction[name] = {
        existed: _hasOwnProperty.call(state.anchorMap, name),
        value: state.anchorMap[name]
      };
    }
    state.anchorMap[name] = value;
  }
  function beginAnchorTransaction(state) {
    state.anchorMapTransactions.push(/* @__PURE__ */ Object.create(null));
  }
  function commitAnchorTransaction(state) {
    const transaction = state.anchorMapTransactions.pop();
    const transactions = state.anchorMapTransactions;
    if (transactions.length === 0) return;
    const parent = transactions[transactions.length - 1];
    const names = Object.keys(transaction);
    for (let index = 0, length = names.length; index < length; index += 1) {
      const name = names[index];
      if (!_hasOwnProperty.call(parent, name)) parent[name] = transaction[name];
    }
  }
  function rollbackAnchorTransaction(state) {
    const transaction = state.anchorMapTransactions.pop();
    const names = Object.keys(transaction);
    for (let index = names.length - 1; index >= 0; index -= 1) {
      const entry = transaction[names[index]];
      if (entry.existed) state.anchorMap[names[index]] = entry.value;
      else delete state.anchorMap[names[index]];
    }
  }
  function snapshotState(state) {
    return {
      position: state.position,
      line: state.line,
      lineStart: state.lineStart,
      lineIndent: state.lineIndent,
      firstTabInLine: state.firstTabInLine,
      tag: state.tag,
      anchor: state.anchor,
      kind: state.kind,
      result: state.result
    };
  }
  function restoreState(state, snapshot) {
    state.position = snapshot.position;
    state.line = snapshot.line;
    state.lineStart = snapshot.lineStart;
    state.lineIndent = snapshot.lineIndent;
    state.firstTabInLine = snapshot.firstTabInLine;
    state.tag = snapshot.tag;
    state.anchor = snapshot.anchor;
    state.kind = snapshot.kind;
    state.result = snapshot.result;
  }
  var directiveHandlers = {
    YAML: function handleYamlDirective(state, name, args) {
      if (state.version !== null) throwError(state, "duplication of %YAML directive");
      if (args.length !== 1) throwError(state, "YAML directive accepts exactly one argument");
      const match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
      if (match === null) throwError(state, "ill-formed argument of the YAML directive");
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      if (major !== 1) throwError(state, "unacceptable YAML version of the document");
      state.version = args[0];
      state.checkLineBreaks = minor < 2;
      if (minor !== 1 && minor !== 2) throwWarning(state, "unsupported YAML version of the document");
    },
    TAG: function handleTagDirective(state, name, args) {
      let prefix;
      if (args.length !== 2) throwError(state, "TAG directive accepts exactly two arguments");
      const handle = args[0];
      prefix = args[1];
      if (!PATTERN_TAG_HANDLE.test(handle)) throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
      if (_hasOwnProperty.call(state.tagMap, handle)) throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
      if (!PATTERN_TAG_URI.test(prefix)) throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
      try {
        prefix = decodeURIComponent(prefix);
      } catch (err) {
        throwError(state, "tag prefix is malformed: " + prefix);
      }
      state.tagMap[handle] = prefix;
    }
  };
  function captureSegment(state, start, end, checkJson) {
    if (start < end) {
      const _result = state.input.slice(start, end);
      if (checkJson) for (let _position = 0, _length = _result.length; _position < _length; _position += 1) {
        const _character = _result.charCodeAt(_position);
        if (!(_character === 9 || _character >= 32 && _character <= 1114111)) throwError(state, "expected valid JSON character");
      }
      else if (PATTERN_NON_PRINTABLE.test(_result)) throwError(state, "the stream contains non-printable characters");
      state.result += _result;
    }
  }
  function mergeMappings(state, destination, source, overridableKeys) {
    if (!common.isObject(source)) throwError(state, "cannot merge mappings; the provided source object is unacceptable");
    const sourceKeys = Object.keys(source);
    for (let index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
      const key = sourceKeys[index];
      if (!_hasOwnProperty.call(destination, key)) {
        setProperty(destination, key, source[key]);
        overridableKeys[key] = true;
      }
    }
  }
  function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
    if (Array.isArray(keyNode)) {
      keyNode = Array.prototype.slice.call(keyNode);
      for (let index = 0, quantity = keyNode.length; index < quantity; index += 1) {
        if (Array.isArray(keyNode[index])) throwError(state, "nested arrays are not supported inside keys");
        if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") keyNode[index] = "[object Object]";
      }
    }
    if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") keyNode = "[object Object]";
    keyNode = String(keyNode);
    if (_result === null) _result = {};
    if (keyTag === "tag:yaml.org,2002:merge") if (Array.isArray(valueNode)) {
      if (valueNode.length > state.maxMergeSeqLength) throwError(state, "merge sequence length exceeded maxMergeSeqLength (" + state.maxMergeSeqLength + ")");
      const seen = /* @__PURE__ */ new Set();
      for (let index = 0, quantity = valueNode.length; index < quantity; index += 1) {
        const src = valueNode[index];
        if (seen.has(src)) continue;
        seen.add(src);
        mergeMappings(state, _result, src, overridableKeys);
      }
    } else mergeMappings(state, _result, valueNode, overridableKeys);
    else {
      if (!state.json && !_hasOwnProperty.call(overridableKeys, keyNode) && _hasOwnProperty.call(_result, keyNode)) {
        state.line = startLine || state.line;
        state.lineStart = startLineStart || state.lineStart;
        state.position = startPos || state.position;
        throwError(state, "duplicated mapping key");
      }
      setProperty(_result, keyNode, valueNode);
      delete overridableKeys[keyNode];
    }
    return _result;
  }
  function readLineBreak(state) {
    const ch = state.input.charCodeAt(state.position);
    if (ch === 10) state.position++;
    else if (ch === 13) {
      state.position++;
      if (state.input.charCodeAt(state.position) === 10) state.position++;
    } else throwError(state, "a line break is expected");
    state.line += 1;
    state.lineStart = state.position;
    state.firstTabInLine = -1;
  }
  function skipSeparationSpace(state, allowComments, checkIndent) {
    let lineBreaks = 0;
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      while (isWhiteSpace(ch)) {
        if (ch === 9 && state.firstTabInLine === -1) state.firstTabInLine = state.position;
        ch = state.input.charCodeAt(++state.position);
      }
      if (allowComments && ch === 35) do
        ch = state.input.charCodeAt(++state.position);
      while (ch !== 10 && ch !== 13 && ch !== 0);
      if (isEol(ch)) {
        readLineBreak(state);
        ch = state.input.charCodeAt(state.position);
        lineBreaks++;
        state.lineIndent = 0;
        while (ch === 32) {
          state.lineIndent++;
          ch = state.input.charCodeAt(++state.position);
        }
      } else break;
    }
    if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) throwWarning(state, "deficient indentation");
    return lineBreaks;
  }
  function testDocumentSeparator(state) {
    let _position = state.position;
    let ch = state.input.charCodeAt(_position);
    if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
      _position += 3;
      ch = state.input.charCodeAt(_position);
      if (ch === 0 || isWsOrEol(ch)) return true;
    }
    return false;
  }
  function writeFoldedLines(state, count) {
    if (count === 1) state.result += " ";
    else if (count > 1) state.result += common.repeat("\n", count - 1);
  }
  function readPlainScalar(state, nodeIndent, withinFlowCollection) {
    let captureStart;
    let captureEnd;
    let hasPendingContent;
    let _line;
    let _lineStart;
    let _lineIndent;
    const _kind = state.kind;
    const _result = state.result;
    let ch = state.input.charCodeAt(state.position);
    if (isWsOrEol(ch) || isFlowIndicator(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) return false;
    if (ch === 63 || ch === 45) {
      const following = state.input.charCodeAt(state.position + 1);
      if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) return false;
    }
    state.kind = "scalar";
    state.result = "";
    captureStart = captureEnd = state.position;
    hasPendingContent = false;
    while (ch !== 0) {
      if (ch === 58) {
        const following = state.input.charCodeAt(state.position + 1);
        if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) break;
      } else if (ch === 35) {
        if (isWsOrEol(state.input.charCodeAt(state.position - 1))) break;
      } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && isFlowIndicator(ch)) break;
      else if (isEol(ch)) {
        _line = state.line;
        _lineStart = state.lineStart;
        _lineIndent = state.lineIndent;
        skipSeparationSpace(state, false, -1);
        if (state.lineIndent >= nodeIndent) {
          hasPendingContent = true;
          ch = state.input.charCodeAt(state.position);
          continue;
        } else {
          state.position = captureEnd;
          state.line = _line;
          state.lineStart = _lineStart;
          state.lineIndent = _lineIndent;
          break;
        }
      }
      if (hasPendingContent) {
        captureSegment(state, captureStart, captureEnd, false);
        writeFoldedLines(state, state.line - _line);
        captureStart = captureEnd = state.position;
        hasPendingContent = false;
      }
      if (!isWhiteSpace(ch)) captureEnd = state.position + 1;
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, captureEnd, false);
    if (state.result) return true;
    state.kind = _kind;
    state.result = _result;
    return false;
  }
  function readSingleQuotedScalar(state, nodeIndent) {
    let captureStart;
    let captureEnd;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 39) return false;
    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;
    while ((ch = state.input.charCodeAt(state.position)) !== 0) if (ch === 39) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (ch === 39) {
        captureStart = state.position;
        state.position++;
        captureEnd = state.position;
      } else return true;
    } else if (isEol(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) throwError(state, "unexpected end of the document within a single quoted scalar");
    else {
      state.position++;
      if (!isWhiteSpace(ch)) captureEnd = state.position;
    }
    throwError(state, "unexpected end of the stream within a single quoted scalar");
  }
  function readDoubleQuotedScalar(state, nodeIndent) {
    let captureStart;
    let captureEnd;
    let tmp;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 34) return false;
    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;
    while ((ch = state.input.charCodeAt(state.position)) !== 0) if (ch === 34) {
      captureSegment(state, captureStart, state.position, true);
      state.position++;
      return true;
    } else if (ch === 92) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (isEol(ch)) skipSeparationSpace(state, false, nodeIndent);
      else if (ch < 256 && simpleEscapeCheck[ch]) {
        state.result += simpleEscapeMap[ch];
        state.position++;
      } else if ((tmp = escapedHexLen(ch)) > 0) {
        let hexLength = tmp;
        let hexResult = 0;
        for (; hexLength > 0; hexLength--) {
          ch = state.input.charCodeAt(++state.position);
          if ((tmp = fromHexCode(ch)) >= 0) hexResult = (hexResult << 4) + tmp;
          else throwError(state, "expected hexadecimal character");
        }
        state.result += charFromCodepoint(hexResult);
        state.position++;
      } else throwError(state, "unknown escape sequence");
      captureStart = captureEnd = state.position;
    } else if (isEol(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) throwError(state, "unexpected end of the document within a double quoted scalar");
    else {
      state.position++;
      if (!isWhiteSpace(ch)) captureEnd = state.position;
    }
    throwError(state, "unexpected end of the stream within a double quoted scalar");
  }
  function readFlowCollection(state, nodeIndent) {
    let readNext = true;
    let _line;
    let _lineStart;
    let _pos;
    const _tag = state.tag;
    let _result;
    const _anchor = state.anchor;
    let terminator;
    let isPair;
    let isExplicitPair;
    let isMapping;
    const overridableKeys = /* @__PURE__ */ Object.create(null);
    let keyNode;
    let keyTag;
    let valueNode;
    let ch = state.input.charCodeAt(state.position);
    if (ch === 91) {
      terminator = 93;
      isMapping = false;
      _result = [];
    } else if (ch === 123) {
      terminator = 125;
      isMapping = true;
      _result = {};
    } else return false;
    if (state.anchor !== null) storeAnchor(state, state.anchor, _result);
    ch = state.input.charCodeAt(++state.position);
    while (ch !== 0) {
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if (ch === terminator) {
        state.position++;
        state.tag = _tag;
        state.anchor = _anchor;
        state.kind = isMapping ? "mapping" : "sequence";
        state.result = _result;
        return true;
      } else if (!readNext) throwError(state, "missed comma between flow collection entries");
      else if (ch === 44) throwError(state, "expected the node content, but found ','");
      keyTag = keyNode = valueNode = null;
      isPair = isExplicitPair = false;
      if (ch === 63) {
        if (isWsOrEol(state.input.charCodeAt(state.position + 1))) {
          isPair = isExplicitPair = true;
          state.position++;
          skipSeparationSpace(state, true, nodeIndent);
        }
      }
      _line = state.line;
      _lineStart = state.lineStart;
      _pos = state.position;
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      keyTag = state.tag;
      keyNode = state.result;
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if ((isExplicitPair || state.line === _line) && ch === 58) {
        isPair = true;
        ch = state.input.charCodeAt(++state.position);
        skipSeparationSpace(state, true, nodeIndent);
        composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
        valueNode = state.result;
      }
      if (isMapping) storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
      else if (isPair) _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
      else _result.push(keyNode);
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if (ch === 44) {
        readNext = true;
        ch = state.input.charCodeAt(++state.position);
      } else readNext = false;
    }
    throwError(state, "unexpected end of the stream within a flow collection");
  }
  function readBlockScalar(state, nodeIndent) {
    let folding;
    let chomping = CHOMPING_CLIP;
    let didReadContent = false;
    let detectedIndent = false;
    let textIndent = nodeIndent;
    let emptyLines = 0;
    let atMoreIndented = false;
    let tmp;
    let ch = state.input.charCodeAt(state.position);
    if (ch === 124) folding = false;
    else if (ch === 62) folding = true;
    else return false;
    state.kind = "scalar";
    state.result = "";
    while (ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
      if (ch === 43 || ch === 45) if (CHOMPING_CLIP === chomping) chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
      else throwError(state, "repeat of a chomping mode identifier");
      else if ((tmp = fromDecimalCode(ch)) >= 0) if (tmp === 0) throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
      else if (!detectedIndent) {
        textIndent = nodeIndent + tmp - 1;
        detectedIndent = true;
      } else throwError(state, "repeat of an indentation width identifier");
      else break;
    }
    if (isWhiteSpace(ch)) {
      do
        ch = state.input.charCodeAt(++state.position);
      while (isWhiteSpace(ch));
      if (ch === 35) do
        ch = state.input.charCodeAt(++state.position);
      while (!isEol(ch) && ch !== 0);
    }
    while (ch !== 0) {
      readLineBreak(state);
      state.lineIndent = 0;
      ch = state.input.charCodeAt(state.position);
      while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
      if (!detectedIndent && state.lineIndent > textIndent) textIndent = state.lineIndent;
      if (isEol(ch)) {
        emptyLines++;
        continue;
      }
      if (!detectedIndent && textIndent === 0) throwError(state, "missing indentation for block scalar");
      if (state.lineIndent < textIndent) {
        if (chomping === CHOMPING_KEEP) state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
        else if (chomping === CHOMPING_CLIP) {
          if (didReadContent) state.result += "\n";
        }
        break;
      }
      if (folding) if (isWhiteSpace(ch)) {
        atMoreIndented = true;
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (atMoreIndented) {
        atMoreIndented = false;
        state.result += common.repeat("\n", emptyLines + 1);
      } else if (emptyLines === 0) {
        if (didReadContent) state.result += " ";
      } else state.result += common.repeat("\n", emptyLines);
      else state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      didReadContent = true;
      detectedIndent = true;
      emptyLines = 0;
      const captureStart = state.position;
      while (!isEol(ch) && ch !== 0) ch = state.input.charCodeAt(++state.position);
      captureSegment(state, captureStart, state.position, false);
    }
    return true;
  }
  function readBlockSequence(state, nodeIndent) {
    const _tag = state.tag;
    const _anchor = state.anchor;
    const _result = [];
    let detected = false;
    if (state.firstTabInLine !== -1) return false;
    if (state.anchor !== null) storeAnchor(state, state.anchor, _result);
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      if (state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        throwError(state, "tab characters must not be used in indentation");
      }
      if (ch !== 45) break;
      if (!isWsOrEol(state.input.charCodeAt(state.position + 1))) break;
      detected = true;
      state.position++;
      if (skipSeparationSpace(state, true, -1)) {
        if (state.lineIndent <= nodeIndent) {
          _result.push(null);
          ch = state.input.charCodeAt(state.position);
          continue;
        }
      }
      const _line = state.line;
      composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
      _result.push(state.result);
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
      if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) throwError(state, "bad indentation of a sequence entry");
      else if (state.lineIndent < nodeIndent) break;
    }
    if (detected) {
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = "sequence";
      state.result = _result;
      return true;
    }
    return false;
  }
  function readBlockMapping(state, nodeIndent, flowIndent) {
    let allowCompact;
    let _keyLine;
    let _keyLineStart;
    let _keyPos;
    const _tag = state.tag;
    const _anchor = state.anchor;
    const _result = {};
    const overridableKeys = /* @__PURE__ */ Object.create(null);
    let keyTag = null;
    let keyNode = null;
    let valueNode = null;
    let atExplicitKey = false;
    let detected = false;
    if (state.firstTabInLine !== -1) return false;
    if (state.anchor !== null) storeAnchor(state, state.anchor, _result);
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      if (!atExplicitKey && state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        throwError(state, "tab characters must not be used in indentation");
      }
      const following = state.input.charCodeAt(state.position + 1);
      const _line = state.line;
      if ((ch === 63 || ch === 58) && isWsOrEol(following)) {
        if (ch === 63) {
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = true;
          allowCompact = true;
        } else if (atExplicitKey) {
          atExplicitKey = false;
          allowCompact = true;
        } else throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
        state.position += 1;
        ch = following;
      } else {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
        if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) break;
        if (state.line === _line) {
          ch = state.input.charCodeAt(state.position);
          while (isWhiteSpace(ch)) ch = state.input.charCodeAt(++state.position);
          if (ch === 58) {
            ch = state.input.charCodeAt(++state.position);
            if (!isWsOrEol(ch)) throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
            if (atExplicitKey) {
              storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
              keyTag = keyNode = valueNode = null;
            }
            detected = true;
            atExplicitKey = false;
            allowCompact = false;
            keyTag = state.tag;
            keyNode = state.result;
          } else if (detected) throwError(state, "can not read an implicit mapping pair; a colon is missed");
          else {
            state.tag = _tag;
            state.anchor = _anchor;
            return true;
          }
        } else if (detected) throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
        else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true;
        }
      }
      if (state.line === _line || state.lineIndent > nodeIndent) {
        if (atExplicitKey) {
          _keyLine = state.line;
          _keyLineStart = state.lineStart;
          _keyPos = state.position;
        }
        if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) if (atExplicitKey) keyNode = state.result;
        else valueNode = state.result;
        if (!atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        skipSeparationSpace(state, true, -1);
        ch = state.input.charCodeAt(state.position);
      }
      if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) throwError(state, "bad indentation of a mapping entry");
      else if (state.lineIndent < nodeIndent) break;
    }
    if (atExplicitKey) storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
    if (detected) {
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = "mapping";
      state.result = _result;
    }
    return detected;
  }
  function readTagProperty(state) {
    let isVerbatim = false;
    let isNamed = false;
    let tagHandle;
    let tagName;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 33) return false;
    if (state.tag !== null) throwError(state, "duplication of a tag property");
    ch = state.input.charCodeAt(++state.position);
    if (ch === 60) {
      isVerbatim = true;
      ch = state.input.charCodeAt(++state.position);
    } else if (ch === 33) {
      isNamed = true;
      tagHandle = "!!";
      ch = state.input.charCodeAt(++state.position);
    } else tagHandle = "!";
    let _position = state.position;
    if (isVerbatim) {
      do
        ch = state.input.charCodeAt(++state.position);
      while (ch !== 0 && ch !== 62);
      if (state.position < state.length) {
        tagName = state.input.slice(_position, state.position);
        ch = state.input.charCodeAt(++state.position);
      } else throwError(state, "unexpected end of the stream within a verbatim tag");
    } else {
      while (ch !== 0 && !isWsOrEol(ch)) {
        if (ch === 33) if (!isNamed) {
          tagHandle = state.input.slice(_position - 1, state.position + 1);
          if (!PATTERN_TAG_HANDLE.test(tagHandle)) throwError(state, "named tag handle cannot contain such characters");
          isNamed = true;
          _position = state.position + 1;
        } else throwError(state, "tag suffix cannot contain exclamation marks");
        ch = state.input.charCodeAt(++state.position);
      }
      tagName = state.input.slice(_position, state.position);
      if (PATTERN_FLOW_INDICATORS.test(tagName)) throwError(state, "tag suffix cannot contain flow indicator characters");
    }
    if (tagName && !PATTERN_TAG_URI.test(tagName)) throwError(state, "tag name cannot contain such characters: " + tagName);
    try {
      tagName = decodeURIComponent(tagName);
    } catch (err) {
      throwError(state, "tag name is malformed: " + tagName);
    }
    if (isVerbatim) state.tag = tagName;
    else if (_hasOwnProperty.call(state.tagMap, tagHandle)) state.tag = state.tagMap[tagHandle] + tagName;
    else if (tagHandle === "!") state.tag = "!" + tagName;
    else if (tagHandle === "!!") state.tag = "tag:yaml.org,2002:" + tagName;
    else throwError(state, 'undeclared tag handle "' + tagHandle + '"');
    return true;
  }
  function readAnchorProperty(state) {
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 38) return false;
    if (state.anchor !== null) throwError(state, "duplication of an anchor property");
    ch = state.input.charCodeAt(++state.position);
    const _position = state.position;
    while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) ch = state.input.charCodeAt(++state.position);
    if (state.position === _position) throwError(state, "name of an anchor node must contain at least one character");
    state.anchor = state.input.slice(_position, state.position);
    return true;
  }
  function readAlias(state) {
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 42) return false;
    ch = state.input.charCodeAt(++state.position);
    const _position = state.position;
    while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) ch = state.input.charCodeAt(++state.position);
    if (state.position === _position) throwError(state, "name of an alias node must contain at least one character");
    const alias = state.input.slice(_position, state.position);
    if (!_hasOwnProperty.call(state.anchorMap, alias)) throwError(state, 'unidentified alias "' + alias + '"');
    state.result = state.anchorMap[alias];
    skipSeparationSpace(state, true, -1);
    return true;
  }
  function tryReadBlockMappingFromProperty(state, propertyStart, nodeIndent, flowIndent) {
    const fallbackState = snapshotState(state);
    beginAnchorTransaction(state);
    restoreState(state, propertyStart);
    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;
    if (readBlockMapping(state, nodeIndent, flowIndent) && state.kind === "mapping") {
      commitAnchorTransaction(state);
      return true;
    }
    rollbackAnchorTransaction(state);
    restoreState(state, fallbackState);
    return false;
  }
  function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
    let allowBlockScalars;
    let allowBlockCollections;
    let indentStatus = 1;
    let atNewLine = false;
    let hasContent = false;
    let propertyStart = null;
    let type;
    let flowIndent;
    let blockIndent;
    if (state.depth >= state.maxDepth) throwError(state, "nesting exceeded maxDepth (" + state.maxDepth + ")");
    state.depth += 1;
    if (state.listener !== null) state.listener("open", state);
    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;
    const allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
    if (allowToSeek) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        if (state.lineIndent > parentIndent) indentStatus = 1;
        else if (state.lineIndent === parentIndent) indentStatus = 0;
        else if (state.lineIndent < parentIndent) indentStatus = -1;
      }
    }
    if (indentStatus === 1) while (true) {
      const ch = state.input.charCodeAt(state.position);
      const propertyState = snapshotState(state);
      if (atNewLine && (ch === 33 && state.tag !== null || ch === 38 && state.anchor !== null)) break;
      if (!readTagProperty(state) && !readAnchorProperty(state)) break;
      if (propertyStart === null) propertyStart = propertyState;
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        allowBlockCollections = allowBlockStyles;
        if (state.lineIndent > parentIndent) indentStatus = 1;
        else if (state.lineIndent === parentIndent) indentStatus = 0;
        else if (state.lineIndent < parentIndent) indentStatus = -1;
      } else allowBlockCollections = false;
    }
    if (allowBlockCollections) allowBlockCollections = atNewLine || allowCompact;
    if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
      if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) flowIndent = parentIndent;
      else flowIndent = parentIndent + 1;
      blockIndent = state.position - state.lineStart;
      if (indentStatus === 1) if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) hasContent = true;
      else {
        const ch = state.input.charCodeAt(state.position);
        if (propertyStart !== null && allowBlockStyles && !allowBlockCollections && ch !== 124 && ch !== 62 && tryReadBlockMappingFromProperty(state, propertyStart, propertyStart.position - propertyStart.lineStart, flowIndent)) hasContent = true;
        else if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) hasContent = true;
        else if (readAlias(state)) {
          hasContent = true;
          if (state.tag !== null || state.anchor !== null) throwError(state, "alias node should not have any properties");
        } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
          hasContent = true;
          if (state.tag === null) state.tag = "?";
        }
        if (state.anchor !== null) storeAnchor(state, state.anchor, state.result);
      }
      else if (indentStatus === 0) hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
    }
    if (state.tag === null) {
      if (state.anchor !== null) storeAnchor(state, state.anchor, state.result);
    } else if (state.tag === "?") {
      if (state.result !== null && state.kind !== "scalar") throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
      for (let typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
        type = state.implicitTypes[typeIndex];
        if (type.resolve(state.result)) {
          state.result = type.construct(state.result);
          state.tag = type.tag;
          if (state.anchor !== null) storeAnchor(state, state.anchor, state.result);
          break;
        }
      }
    } else if (state.tag !== "!") {
      if (_hasOwnProperty.call(state.typeMap[state.kind || "fallback"], state.tag)) type = state.typeMap[state.kind || "fallback"][state.tag];
      else {
        type = null;
        const typeList = state.typeMap.multi[state.kind || "fallback"];
        for (let typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
          type = typeList[typeIndex];
          break;
        }
      }
      if (!type) throwError(state, "unknown tag !<" + state.tag + ">");
      if (state.result !== null && type.kind !== state.kind) throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type.kind + '", not "' + state.kind + '"');
      if (!type.resolve(state.result, state.tag)) throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
      else {
        state.result = type.construct(state.result, state.tag);
        if (state.anchor !== null) storeAnchor(state, state.anchor, state.result);
      }
    }
    if (state.listener !== null) state.listener("close", state);
    state.depth -= 1;
    return state.tag !== null || state.anchor !== null || hasContent;
  }
  function readDocument(state) {
    const documentStart = state.position;
    let hasDirectives = false;
    let ch;
    state.version = null;
    state.checkLineBreaks = state.legacy;
    state.tagMap = /* @__PURE__ */ Object.create(null);
    state.anchorMap = /* @__PURE__ */ Object.create(null);
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
      if (state.lineIndent > 0 || ch !== 37) break;
      hasDirectives = true;
      ch = state.input.charCodeAt(++state.position);
      let _position = state.position;
      while (ch !== 0 && !isWsOrEol(ch)) ch = state.input.charCodeAt(++state.position);
      const directiveName = state.input.slice(_position, state.position);
      const directiveArgs = [];
      if (directiveName.length < 1) throwError(state, "directive name must not be less than one character in length");
      while (ch !== 0) {
        while (isWhiteSpace(ch)) ch = state.input.charCodeAt(++state.position);
        if (ch === 35) {
          do
            ch = state.input.charCodeAt(++state.position);
          while (ch !== 0 && !isEol(ch));
          break;
        }
        if (isEol(ch)) break;
        _position = state.position;
        while (ch !== 0 && !isWsOrEol(ch)) ch = state.input.charCodeAt(++state.position);
        directiveArgs.push(state.input.slice(_position, state.position));
      }
      if (ch !== 0) readLineBreak(state);
      if (_hasOwnProperty.call(directiveHandlers, directiveName)) directiveHandlers[directiveName](state, directiveName, directiveArgs);
      else throwWarning(state, 'unknown document directive "' + directiveName + '"');
    }
    skipSeparationSpace(state, true, -1);
    if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    } else if (hasDirectives) throwError(state, "directives end mark is expected");
    composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
    skipSeparationSpace(state, true, -1);
    if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) throwWarning(state, "non-ASCII line breaks are interpreted as content");
    state.documents.push(state.result);
    if (state.position === state.lineStart && testDocumentSeparator(state)) {
      if (state.input.charCodeAt(state.position) === 46) {
        state.position += 3;
        skipSeparationSpace(state, true, -1);
      }
      return;
    }
    if (state.position < state.length - 1) throwError(state, "end of the stream or a document separator is expected");
  }
  function loadDocuments(input, options) {
    input = String(input);
    options = options || {};
    if (input.length !== 0) {
      if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) input += "\n";
      if (input.charCodeAt(0) === 65279) input = input.slice(1);
    }
    const state = new State(input, options);
    const nullpos = input.indexOf("\0");
    if (nullpos !== -1) {
      state.position = nullpos;
      throwError(state, "null byte is not allowed in input");
    }
    state.input += "\0";
    while (state.input.charCodeAt(state.position) === 32) {
      state.lineIndent += 1;
      state.position += 1;
    }
    while (state.position < state.length - 1) readDocument(state);
    return state.documents;
  }
  function loadAll2(input, iterator, options) {
    if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
      options = iterator;
      iterator = null;
    }
    const documents = loadDocuments(input, options);
    if (typeof iterator !== "function") return documents;
    for (let index = 0, length = documents.length; index < length; index += 1) iterator(documents[index]);
  }
  function load2(input, options) {
    const documents = loadDocuments(input, options);
    if (documents.length === 0) return;
    else if (documents.length === 1) return documents[0];
    throw new YAMLException2("expected a single document in the stream, but found more");
  }
  module.exports.loadAll = loadAll2;
  module.exports.load = load2;
}));
var require_dumper = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var common = require_common();
  var YAMLException2 = require_exception();
  var DEFAULT_SCHEMA2 = require_default();
  var _toString = Object.prototype.toString;
  var _hasOwnProperty = Object.prototype.hasOwnProperty;
  var CHAR_BOM = 65279;
  var CHAR_TAB = 9;
  var CHAR_LINE_FEED = 10;
  var CHAR_CARRIAGE_RETURN = 13;
  var CHAR_SPACE = 32;
  var CHAR_EXCLAMATION = 33;
  var CHAR_DOUBLE_QUOTE = 34;
  var CHAR_SHARP = 35;
  var CHAR_PERCENT = 37;
  var CHAR_AMPERSAND = 38;
  var CHAR_SINGLE_QUOTE = 39;
  var CHAR_ASTERISK = 42;
  var CHAR_COMMA = 44;
  var CHAR_MINUS = 45;
  var CHAR_COLON = 58;
  var CHAR_EQUALS = 61;
  var CHAR_GREATER_THAN = 62;
  var CHAR_QUESTION = 63;
  var CHAR_COMMERCIAL_AT = 64;
  var CHAR_LEFT_SQUARE_BRACKET = 91;
  var CHAR_RIGHT_SQUARE_BRACKET = 93;
  var CHAR_GRAVE_ACCENT = 96;
  var CHAR_LEFT_CURLY_BRACKET = 123;
  var CHAR_VERTICAL_LINE = 124;
  var CHAR_RIGHT_CURLY_BRACKET = 125;
  var ESCAPE_SEQUENCES = {};
  ESCAPE_SEQUENCES[0] = "\\0";
  ESCAPE_SEQUENCES[7] = "\\a";
  ESCAPE_SEQUENCES[8] = "\\b";
  ESCAPE_SEQUENCES[9] = "\\t";
  ESCAPE_SEQUENCES[10] = "\\n";
  ESCAPE_SEQUENCES[11] = "\\v";
  ESCAPE_SEQUENCES[12] = "\\f";
  ESCAPE_SEQUENCES[13] = "\\r";
  ESCAPE_SEQUENCES[27] = "\\e";
  ESCAPE_SEQUENCES[34] = '\\"';
  ESCAPE_SEQUENCES[92] = "\\\\";
  ESCAPE_SEQUENCES[133] = "\\N";
  ESCAPE_SEQUENCES[160] = "\\_";
  ESCAPE_SEQUENCES[8232] = "\\L";
  ESCAPE_SEQUENCES[8233] = "\\P";
  var DEPRECATED_BOOLEANS_SYNTAX = [
    "y",
    "Y",
    "yes",
    "Yes",
    "YES",
    "on",
    "On",
    "ON",
    "n",
    "N",
    "no",
    "No",
    "NO",
    "off",
    "Off",
    "OFF"
  ];
  var DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
  function compileStyleMap(schema, map) {
    if (map === null) return {};
    const result = {};
    const keys = Object.keys(map);
    for (let index = 0, length = keys.length; index < length; index += 1) {
      let tag = keys[index];
      let style = String(map[tag]);
      if (tag.slice(0, 2) === "!!") tag = "tag:yaml.org,2002:" + tag.slice(2);
      const type = schema.compiledTypeMap["fallback"][tag];
      if (type && _hasOwnProperty.call(type.styleAliases, style)) style = type.styleAliases[style];
      result[tag] = style;
    }
    return result;
  }
  function encodeHex(character) {
    let handle;
    let length;
    const string = character.toString(16).toUpperCase();
    if (character <= 255) {
      handle = "x";
      length = 2;
    } else if (character <= 65535) {
      handle = "u";
      length = 4;
    } else if (character <= 4294967295) {
      handle = "U";
      length = 8;
    } else throw new YAMLException2("code point within a string may not be greater than 0xFFFFFFFF");
    return "\\" + handle + common.repeat("0", length - string.length) + string;
  }
  var QUOTING_TYPE_SINGLE = 1;
  var QUOTING_TYPE_DOUBLE = 2;
  function State(options) {
    this.schema = options["schema"] || DEFAULT_SCHEMA2;
    this.indent = Math.max(1, options["indent"] || 2);
    this.noArrayIndent = options["noArrayIndent"] || false;
    this.skipInvalid = options["skipInvalid"] || false;
    this.flowLevel = common.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
    this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
    this.sortKeys = options["sortKeys"] || false;
    this.lineWidth = options["lineWidth"] || 80;
    this.noRefs = options["noRefs"] || false;
    this.noCompatMode = options["noCompatMode"] || false;
    this.condenseFlow = options["condenseFlow"] || false;
    this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
    this.forceQuotes = options["forceQuotes"] || false;
    this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
    this.implicitTypes = this.schema.compiledImplicit;
    this.explicitTypes = this.schema.compiledExplicit;
    this.tag = null;
    this.result = "";
    this.duplicates = [];
    this.usedDuplicates = null;
  }
  function indentString(string, spaces) {
    const ind = common.repeat(" ", spaces);
    let position = 0;
    let result = "";
    const length = string.length;
    while (position < length) {
      let line;
      const next = string.indexOf("\n", position);
      if (next === -1) {
        line = string.slice(position);
        position = length;
      } else {
        line = string.slice(position, next + 1);
        position = next + 1;
      }
      if (line.length && line !== "\n") result += ind;
      result += line;
    }
    return result;
  }
  function generateNextLine(state, level) {
    return "\n" + common.repeat(" ", state.indent * level);
  }
  function testImplicitResolving(state, str2) {
    for (let index = 0, length = state.implicitTypes.length; index < length; index += 1) if (state.implicitTypes[index].resolve(str2)) return true;
    return false;
  }
  function isWhitespace(c) {
    return c === CHAR_SPACE || c === CHAR_TAB;
  }
  function isPrintable(c) {
    return c >= 32 && c <= 126 || c >= 161 && c <= 55295 && c !== 8232 && c !== 8233 || c >= 57344 && c <= 65533 && c !== CHAR_BOM || c >= 65536 && c <= 1114111;
  }
  function isNsCharOrWhitespace(c) {
    return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
  }
  function isPlainSafe(c, prev, inblock) {
    const cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
    const cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
    return (inblock ? cIsNsCharOrWhitespace : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar;
  }
  function isPlainSafeFirst(c) {
    return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
  }
  function isPlainSafeLast(c) {
    return !isWhitespace(c) && c !== CHAR_COLON;
  }
  function codePointAt(string, pos) {
    const first = string.charCodeAt(pos);
    let second;
    if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
      second = string.charCodeAt(pos + 1);
      if (second >= 56320 && second <= 57343) return (first - 55296) * 1024 + second - 56320 + 65536;
    }
    return first;
  }
  function needIndentIndicator(string) {
    return /^\n* /.test(string);
  }
  var STYLE_PLAIN = 1;
  var STYLE_SINGLE = 2;
  var STYLE_LITERAL = 3;
  var STYLE_FOLDED = 4;
  var STYLE_DOUBLE = 5;
  function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
    let i;
    let char = 0;
    let prevChar = null;
    let hasLineBreak = false;
    let hasFoldableLine = false;
    const shouldTrackWidth = lineWidth !== -1;
    let previousLineBreak = -1;
    let plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
    if (singleLineOnly || forceQuotes) for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (!isPrintable(char)) return STYLE_DOUBLE;
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
    else {
      for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
        char = codePointAt(string, i);
        if (char === CHAR_LINE_FEED) {
          hasLineBreak = true;
          if (shouldTrackWidth) {
            hasFoldableLine = hasFoldableLine || i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
            previousLineBreak = i;
          }
        } else if (!isPrintable(char)) return STYLE_DOUBLE;
        plain = plain && isPlainSafe(char, prevChar, inblock);
        prevChar = char;
      }
      hasFoldableLine = hasFoldableLine || shouldTrackWidth && i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
    }
    if (!hasLineBreak && !hasFoldableLine) {
      if (plain && !forceQuotes && !testAmbiguousType(string)) return STYLE_PLAIN;
      return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
    }
    if (indentPerLevel > 9 && needIndentIndicator(string)) return STYLE_DOUBLE;
    if (!forceQuotes) return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  function writeScalar(state, string, level, iskey, inblock) {
    state.dump = (function() {
      if (string.length === 0) return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
      if (!state.noCompatMode) {
        if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
      }
      const indent2 = state.indent * Math.max(1, level);
      const lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent2);
      const singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
      function testAmbiguity(string2) {
        return testImplicitResolving(state, string2);
      }
      switch (chooseScalarStyle(string, singleLineOnly, state.indent, lineWidth, testAmbiguity, state.quotingType, state.forceQuotes && !iskey, inblock)) {
        case STYLE_PLAIN:
          return string;
        case STYLE_SINGLE:
          return "'" + string.replace(/'/g, "''") + "'";
        case STYLE_LITERAL:
          return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent2));
        case STYLE_FOLDED:
          return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent2));
        case STYLE_DOUBLE:
          return '"' + escapeString(string, lineWidth) + '"';
        default:
          throw new YAMLException2("impossible error: invalid scalar style");
      }
    })();
  }
  function blockHeader(string, indentPerLevel) {
    const indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
    const clip = string[string.length - 1] === "\n";
    return indentIndicator + (clip && (string[string.length - 2] === "\n" || string === "\n") ? "+" : clip ? "" : "-") + "\n";
  }
  function dropEndingNewline(string) {
    return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
  }
  function foldString(string, width) {
    const lineRe = /(\n+)([^\n]*)/g;
    let result = (function() {
      let nextLF = string.indexOf("\n");
      nextLF = nextLF !== -1 ? nextLF : string.length;
      lineRe.lastIndex = nextLF;
      return foldLine(string.slice(0, nextLF), width);
    })();
    let prevMoreIndented = string[0] === "\n" || string[0] === " ";
    let moreIndented;
    let match;
    while (match = lineRe.exec(string)) {
      const prefix = match[1];
      const line = match[2];
      moreIndented = line[0] === " ";
      result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
      prevMoreIndented = moreIndented;
    }
    return result;
  }
  function foldLine(line, width) {
    if (line === "" || line[0] === " ") return line;
    const breakRe = / [^ ]/g;
    let match;
    let start = 0;
    let end;
    let curr = 0;
    let next = 0;
    let result = "";
    while (match = breakRe.exec(line)) {
      next = match.index;
      if (next - start > width) {
        end = curr > start ? curr : next;
        result += "\n" + line.slice(start, end);
        start = end + 1;
      }
      curr = next;
    }
    result += "\n";
    if (line.length - start > width && curr > start) result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
    else result += line.slice(start);
    return result.slice(1);
  }
  function escapeString(string) {
    let result = "";
    let char = 0;
    for (let i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      const escapeSeq = ESCAPE_SEQUENCES[char];
      if (!escapeSeq && isPrintable(char)) {
        result += string[i];
        if (char >= 65536) result += string[i + 1];
      } else result += escapeSeq || encodeHex(char);
    }
    return result;
  }
  function writeFlowSequence(state, level, object) {
    let _result = "";
    const _tag = state.tag;
    for (let index = 0, length = object.length; index < length; index += 1) {
      let value = object[index];
      if (state.replacer) value = state.replacer.call(object, String(index), value);
      if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
        if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
        _result += state.dump;
      }
    }
    state.tag = _tag;
    state.dump = "[" + _result + "]";
  }
  function writeBlockSequence(state, level, object, compact) {
    let _result = "";
    const _tag = state.tag;
    for (let index = 0, length = object.length; index < length; index += 1) {
      let value = object[index];
      if (state.replacer) value = state.replacer.call(object, String(index), value);
      if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
        if (!compact || _result !== "") _result += generateNextLine(state, level);
        if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) _result += "-";
        else _result += "- ";
        _result += state.dump;
      }
    }
    state.tag = _tag;
    state.dump = _result || "[]";
  }
  function writeFlowMapping(state, level, object) {
    let _result = "";
    const _tag = state.tag;
    const objectKeyList = Object.keys(object);
    for (let index = 0, length = objectKeyList.length; index < length; index += 1) {
      let pairBuffer = "";
      if (_result !== "") pairBuffer += ", ";
      if (state.condenseFlow) pairBuffer += '"';
      const objectKey = objectKeyList[index];
      let objectValue = object[objectKey];
      if (state.replacer) objectValue = state.replacer.call(object, objectKey, objectValue);
      if (!writeNode(state, level, objectKey, false, false)) continue;
      if (state.dump.length > 1024) pairBuffer += "? ";
      pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
      if (!writeNode(state, level, objectValue, false, false)) continue;
      pairBuffer += state.dump;
      _result += pairBuffer;
    }
    state.tag = _tag;
    state.dump = "{" + _result + "}";
  }
  function writeBlockMapping(state, level, object, compact) {
    let _result = "";
    const _tag = state.tag;
    const objectKeyList = Object.keys(object);
    if (state.sortKeys === true) objectKeyList.sort();
    else if (typeof state.sortKeys === "function") objectKeyList.sort(state.sortKeys);
    else if (state.sortKeys) throw new YAMLException2("sortKeys must be a boolean or a function");
    for (let index = 0, length = objectKeyList.length; index < length; index += 1) {
      let pairBuffer = "";
      if (!compact || _result !== "") pairBuffer += generateNextLine(state, level);
      const objectKey = objectKeyList[index];
      let objectValue = object[objectKey];
      if (state.replacer) objectValue = state.replacer.call(object, objectKey, objectValue);
      if (!writeNode(state, level + 1, objectKey, true, true, true)) continue;
      const explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
      if (explicitPair) if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) pairBuffer += "?";
      else pairBuffer += "? ";
      pairBuffer += state.dump;
      if (explicitPair) pairBuffer += generateNextLine(state, level);
      if (!writeNode(state, level + 1, objectValue, true, explicitPair)) continue;
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) pairBuffer += ":";
      else pairBuffer += ": ";
      pairBuffer += state.dump;
      _result += pairBuffer;
    }
    state.tag = _tag;
    state.dump = _result || "{}";
  }
  function detectType(state, object, explicit) {
    const typeList = explicit ? state.explicitTypes : state.implicitTypes;
    for (let index = 0, length = typeList.length; index < length; index += 1) {
      const type = typeList[index];
      if ((type.instanceOf || type.predicate) && (!type.instanceOf || typeof object === "object" && object instanceof type.instanceOf) && (!type.predicate || type.predicate(object))) {
        if (explicit) if (type.multi && type.representName) state.tag = type.representName(object);
        else state.tag = type.tag;
        else state.tag = "?";
        if (type.represent) {
          const style = state.styleMap[type.tag] || type.defaultStyle;
          let _result;
          if (_toString.call(type.represent) === "[object Function]") _result = type.represent(object, style);
          else if (_hasOwnProperty.call(type.represent, style)) _result = type.represent[style](object, style);
          else throw new YAMLException2("!<" + type.tag + '> tag resolver accepts not "' + style + '" style');
          state.dump = _result;
        }
        return true;
      }
    }
    return false;
  }
  function writeNode(state, level, object, block, compact, iskey, isblockseq) {
    state.tag = null;
    state.dump = object;
    if (!detectType(state, object, false)) detectType(state, object, true);
    const type = _toString.call(state.dump);
    const inblock = block;
    if (block) block = state.flowLevel < 0 || state.flowLevel > level;
    const objectOrArray = type === "[object Object]" || type === "[object Array]";
    let duplicateIndex;
    let duplicate;
    if (objectOrArray) {
      duplicateIndex = state.duplicates.indexOf(object);
      duplicate = duplicateIndex !== -1;
    }
    if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) compact = false;
    if (duplicate && state.usedDuplicates[duplicateIndex]) state.dump = "*ref_" + duplicateIndex;
    else {
      if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) state.usedDuplicates[duplicateIndex] = true;
      if (type === "[object Object]") if (block && Object.keys(state.dump).length !== 0) {
        writeBlockMapping(state, level, state.dump, compact);
        if (duplicate) state.dump = "&ref_" + duplicateIndex + state.dump;
      } else {
        writeFlowMapping(state, level, state.dump);
        if (duplicate) state.dump = "&ref_" + duplicateIndex + " " + state.dump;
      }
      else if (type === "[object Array]") if (block && state.dump.length !== 0) {
        if (state.noArrayIndent && !isblockseq && level > 0) writeBlockSequence(state, level - 1, state.dump, compact);
        else writeBlockSequence(state, level, state.dump, compact);
        if (duplicate) state.dump = "&ref_" + duplicateIndex + state.dump;
      } else {
        writeFlowSequence(state, level, state.dump);
        if (duplicate) state.dump = "&ref_" + duplicateIndex + " " + state.dump;
      }
      else if (type === "[object String]") {
        if (state.tag !== "?") writeScalar(state, state.dump, level, iskey, inblock);
      } else if (type === "[object Undefined]") return false;
      else {
        if (state.skipInvalid) return false;
        throw new YAMLException2("unacceptable kind of an object to dump " + type);
      }
      if (state.tag !== null && state.tag !== "?") {
        let tagStr = encodeURI(state.tag[0] === "!" ? state.tag.slice(1) : state.tag).replace(/!/g, "%21");
        if (state.tag[0] === "!") tagStr = "!" + tagStr;
        else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") tagStr = "!!" + tagStr.slice(18);
        else tagStr = "!<" + tagStr + ">";
        state.dump = tagStr + " " + state.dump;
      }
    }
    return true;
  }
  function getDuplicateReferences(object, state) {
    const objects = [];
    const duplicatesIndexes = [];
    inspectNode(object, objects, duplicatesIndexes);
    const length = duplicatesIndexes.length;
    for (let index = 0; index < length; index += 1) state.duplicates.push(objects[duplicatesIndexes[index]]);
    state.usedDuplicates = new Array(length);
  }
  function inspectNode(object, objects, duplicatesIndexes) {
    if (object !== null && typeof object === "object") {
      const index = objects.indexOf(object);
      if (index !== -1) {
        if (duplicatesIndexes.indexOf(index) === -1) duplicatesIndexes.push(index);
      } else {
        objects.push(object);
        if (Array.isArray(object)) for (let i = 0, length = object.length; i < length; i += 1) inspectNode(object[i], objects, duplicatesIndexes);
        else {
          const objectKeyList = Object.keys(object);
          for (let i = 0, length = objectKeyList.length; i < length; i += 1) inspectNode(object[objectKeyList[i]], objects, duplicatesIndexes);
        }
      }
    }
  }
  function dump2(input, options) {
    options = options || {};
    const state = new State(options);
    if (!state.noRefs) getDuplicateReferences(input, state);
    let value = input;
    if (state.replacer) value = state.replacer.call({ "": value }, "", value);
    if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
    return "";
  }
  module.exports.dump = dump2;
}));
var import_js_yaml = /* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports, module) => {
  var loader = require_loader();
  var dumper = require_dumper();
  function renamed(from, to) {
    return function() {
      throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
    };
  }
  module.exports.Type = require_type();
  module.exports.Schema = require_schema();
  module.exports.FAILSAFE_SCHEMA = require_failsafe();
  module.exports.JSON_SCHEMA = require_json();
  module.exports.CORE_SCHEMA = require_core();
  module.exports.DEFAULT_SCHEMA = require_default();
  module.exports.load = loader.load;
  module.exports.loadAll = loader.loadAll;
  module.exports.dump = dumper.dump;
  module.exports.YAMLException = require_exception();
  module.exports.types = {
    binary: require_binary(),
    float: require_float(),
    map: require_map(),
    null: require_null(),
    pairs: require_pairs(),
    set: require_set(),
    timestamp: require_timestamp(),
    bool: require_bool(),
    int: require_int(),
    merge: require_merge(),
    omap: require_omap(),
    seq: require_seq(),
    str: require_str()
  };
  module.exports.safeLoad = renamed("safeLoad", "load");
  module.exports.safeLoadAll = renamed("safeLoadAll", "loadAll");
  module.exports.safeDump = renamed("safeDump", "dump");
})))(), 1);
var { Type, Schema, FAILSAFE_SCHEMA, JSON_SCHEMA, CORE_SCHEMA, DEFAULT_SCHEMA, load, loadAll, dump, YAMLException, types, safeLoad, safeLoadAll, safeDump } = import_js_yaml.default;
var index_vite_proxy_tmp_default = import_js_yaml.default;

// packages/core/dist/trace-gates.js
var PREDICATE_KEYS = ["equals", "contains", "starts_with", "ends_with", "matches", "exists", "any"];
function normalizeSubagentCall(args) {
  const one = (v) => {
    if (v === null || typeof v !== "object" || Array.isArray(v))
      return null;
    const o = v;
    const agent = typeof o.agent === "string" ? o.agent : typeof o.name === "string" ? o.name : void 0;
    if (agent === void 0)
      return null;
    const task = typeof o.task === "string" ? o.task : typeof o.prompt === "string" ? o.prompt : "";
    return { agent, task };
  };
  if (Array.isArray(args.tasks))
    return args.tasks.map(one).filter((x) => x !== null);
  if (Array.isArray(args.chain))
    return args.chain.map(one).filter((x) => x !== null);
  const single = one(args);
  return single ? [single] : [];
}
function evaluateTraceGates(assert, trace) {
  const assertions = [];
  for (const req of assert.require_calls ?? []) {
    const matched = trace.tool_calls.filter((c) => c.name === req.tool && argsMatch(c, req.args));
    const min = req.count?.min ?? 1;
    const max = req.count?.max;
    const described = describeArgs(req.args);
    if (matched.length < min) {
      assertions.push({
        kind: "require_call",
        status: "FAIL",
        detail: `expected at least ${min} call(s) to \`${req.tool}\`${described}, saw ${matched.length}${nearMiss(trace, req)}`
      });
    } else if (max !== void 0 && matched.length > max) {
      assertions.push({
        kind: "require_call",
        status: "FAIL",
        detail: `expected at most ${max} call(s) to \`${req.tool}\`${described}, saw ${matched.length}`
      });
    } else {
      assertions.push({
        kind: "require_call",
        status: "PASS",
        detail: `\`${req.tool}\`${described} called ${matched.length} time(s)`
      });
    }
  }
  for (const req of assert.require_subagents ?? []) {
    const invocations = trace.tool_calls.filter((c) => c.name === req.tool).flatMap((c) => normalizeSubagentCall(c.args));
    const matched = invocations.filter((i) => i.agent === req.agent);
    const min = req.count?.min ?? 1;
    const max = req.count?.max;
    if (matched.length < min || max !== void 0 && matched.length > max) {
      const bound = matched.length < min ? `at least ${min}` : `at most ${max}`;
      const seen = invocations.length === 0 ? `no \`${req.tool}\` invocation was recorded` : `saw agents: ${[...new Set(invocations.map((i) => i.agent))].join(", ")}`;
      assertions.push({
        kind: "require_subagent",
        status: "FAIL",
        detail: `expected ${bound} delegation(s) to \`${req.agent}\` via \`${req.tool}\`, saw ${matched.length} (${seen})`
      });
      continue;
    }
    assertions.push({
      kind: "require_subagent",
      status: "PASS",
      detail: `delegated to \`${req.agent}\` ${matched.length} time(s) via \`${req.tool}\``
    });
    for (const needle of req.task_contains ?? []) {
      const ok = matched.some((i) => i.task.includes(needle));
      assertions.push({
        kind: "require_subagent",
        status: ok ? "PASS" : "FAIL",
        detail: ok ? `handoff to \`${req.agent}\` carried ${JSON.stringify(needle)}` : `handoff to \`${req.agent}\` omitted required context ${JSON.stringify(needle)}`
      });
    }
    for (const needle of req.task_excludes ?? []) {
      const leaked = matched.filter((i) => i.task.includes(needle));
      assertions.push({
        kind: "require_subagent",
        status: leaked.length === 0 ? "PASS" : "FAIL",
        detail: leaked.length === 0 ? `handoff to \`${req.agent}\` did not carry ${JSON.stringify(needle)}` : `handoff to \`${req.agent}\` leaked forbidden content ${JSON.stringify(needle)}`
      });
    }
  }
  for (const forbid of assert.forbid_calls ?? []) {
    const hits = trace.tool_calls.filter((c) => c.name === forbid.tool && argsMatch(c, forbid.args));
    assertions.push(hits.length === 0 ? { kind: "forbid_call", status: "PASS", detail: `\`${forbid.tool}\`${describeArgs(forbid.args)} not called` } : {
      kind: "forbid_call",
      status: "FAIL",
      detail: `\`${forbid.tool}\`${describeArgs(forbid.args)} called ${hits.length} time(s) \u2014 forbidden`
    });
  }
  for (const pattern of assert.unchanged_paths ?? []) {
    const changed = trace.changed_paths.filter((p) => matchesGlob(pattern, p));
    assertions.push(changed.length === 0 ? { kind: "unchanged_path", status: "PASS", detail: `\`${pattern}\` unchanged` } : { kind: "unchanged_path", status: "FAIL", detail: `\`${pattern}\` changed: ${changed.join(", ")}` });
  }
  return {
    status: assertions.some((a) => a.status === "FAIL") ? "FAIL" : "PASS",
    assertions
  };
}
function nearMiss(trace, req) {
  if (!req.args)
    return "";
  const byName = trace.tool_calls.filter((c) => c.name === req.tool);
  if (byName.length === 0)
    return ` (\`${req.tool}\` was never called)`;
  return ` (\`${req.tool}\` called ${byName.length}x, but with different arguments)`;
}
function describeArgs(args) {
  if (!args || Object.keys(args).length === 0)
    return "";
  const parts = Object.entries(args).map(([k, p]) => {
    const [op] = PREDICATE_KEYS.filter((key) => p[key] !== void 0);
    return op ? `${k} ${op} ${JSON.stringify(p[op])}` : k;
  });
  return ` (${parts.join(", ")})`;
}
function argsMatch(call, args) {
  if (!args)
    return true;
  return Object.entries(args).every(([key, predicate]) => testPredicate(call.args[key], predicate));
}
function testPredicate(value, p) {
  if (p.exists !== void 0) {
    if (p.exists !== (value !== void 0 && value !== null))
      return false;
    if (p.exists === false)
      return true;
  }
  if (p.equals !== void 0 && !deepEqual(value, p.equals))
    return false;
  if (p.contains !== void 0 && !asString(value).includes(p.contains))
    return false;
  if (p.starts_with !== void 0 && !asString(value).startsWith(p.starts_with))
    return false;
  if (p.ends_with !== void 0 && !asString(value).endsWith(p.ends_with))
    return false;
  if (p.matches !== void 0) {
    let re;
    try {
      re = new RegExp(p.matches);
    } catch {
      return false;
    }
    if (!re.test(asString(value)))
      return false;
  }
  if (p.any !== void 0) {
    if (!Array.isArray(value))
      return false;
    if (!value.some((v) => testPredicate(v, p.any)))
      return false;
  }
  return true;
}
function asString(v) {
  if (typeof v === "string")
    return v;
  if (v === void 0 || v === null)
    return "";
  return JSON.stringify(v) ?? "";
}
function deepEqual(a, b) {
  if (a === b)
    return true;
  if (typeof a !== typeof b || a === null || b === null)
    return false;
  if (typeof a !== "object")
    return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
function matchesGlob(pattern, path) {
  const p = normalizePath(path);
  const pat = normalizePath(pattern);
  if (pat === p)
    return true;
  const escaped = pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\//g, "\0SLASHSTAR\0").replace(/\*\*/g, "\0GLOBSTAR\0").replace(/\*/g, "[^/]*").replace(/ SLASHSTAR /g, "(?:.*/)?").replace(/ GLOBSTAR /g, ".*");
  return new RegExp(`^${escaped}$`).test(p);
}
function normalizePath(p) {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}
function parseTraceAssert(raw, ctx) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${ctx}: \`assert.trace\` must be a mapping`);
  }
  const obj = raw;
  const allowed = /* @__PURE__ */ new Set(["require_calls", "require_subagents", "forbid_calls", "unchanged_paths"]);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      throw new Error(`${ctx}: unknown \`assert.trace\` key \`${key}\` (allowed: ${[...allowed].join(", ")})`);
    }
  }
  const out = {};
  if (obj.require_calls !== void 0) {
    out.require_calls = asArray(obj.require_calls, `${ctx}: \`require_calls\``).map((item, i) => {
      const entry = asObject(item, `${ctx}: \`require_calls[${i}]\``);
      const tool = requireToolName(entry.tool, `${ctx}: \`require_calls[${i}]\``);
      const req = { tool };
      if (entry.count !== void 0)
        req.count = parseCount(entry.count, `${ctx}: \`require_calls[${i}].count\``);
      if (entry.args !== void 0)
        req.args = parseArgs(entry.args, `${ctx}: \`require_calls[${i}].args\``);
      for (const key of Object.keys(entry)) {
        if (!["tool", "count", "args"].includes(key)) {
          throw new Error(`${ctx}: unknown key \`${key}\` in \`require_calls[${i}]\``);
        }
      }
      return req;
    });
  }
  if (obj.require_subagents !== void 0) {
    out.require_subagents = asArray(obj.require_subagents, `${ctx}: \`require_subagents\``).map((item, i) => {
      const where = `${ctx}: \`require_subagents[${i}]\``;
      const entry = asObject(item, where);
      for (const key of Object.keys(entry)) {
        if (!["tool", "agent", "count", "task_contains", "task_excludes"].includes(key)) {
          throw new Error(`${ctx}: unknown key \`${key}\` in \`require_subagents[${i}]\``);
        }
      }
      const sub = {
        tool: requireToolName(entry.tool, where),
        agent: requireNonEmpty(entry.agent, `${where}: \`agent\``)
      };
      if (entry.count !== void 0)
        sub.count = parseCount(entry.count, `${where}.count`);
      if (entry.task_contains !== void 0)
        sub.task_contains = parseNeedles(entry.task_contains, `${where}.task_contains`);
      if (entry.task_excludes !== void 0)
        sub.task_excludes = parseNeedles(entry.task_excludes, `${where}.task_excludes`);
      return sub;
    });
  }
  if (obj.forbid_calls !== void 0) {
    out.forbid_calls = asArray(obj.forbid_calls, `${ctx}: \`forbid_calls\``).map((item, i) => {
      if (typeof item === "string")
        return { tool: item };
      const entry = asObject(item, `${ctx}: \`forbid_calls[${i}]\``);
      const forbid = { tool: requireToolName(entry.tool, `${ctx}: \`forbid_calls[${i}]\``) };
      if (entry.args !== void 0)
        forbid.args = parseArgs(entry.args, `${ctx}: \`forbid_calls[${i}].args\``);
      for (const key of Object.keys(entry)) {
        if (!["tool", "args"].includes(key)) {
          throw new Error(`${ctx}: unknown key \`${key}\` in \`forbid_calls[${i}]\``);
        }
      }
      return forbid;
    });
  }
  if (obj.unchanged_paths !== void 0) {
    const paths = asArray(obj.unchanged_paths, `${ctx}: \`unchanged_paths\``);
    out.unchanged_paths = paths.map((p, i) => {
      if (typeof p !== "string" || p.trim() === "") {
        throw new Error(`${ctx}: \`unchanged_paths[${i}]\` must be a non-empty string`);
      }
      return p;
    });
  }
  if (!out.require_calls && !out.require_subagents && !out.forbid_calls && !out.unchanged_paths) {
    throw new Error(`${ctx}: \`assert.trace\` declares no assertions \u2014 remove it or add one`);
  }
  return out;
}
function requireNonEmpty(v, ctx) {
  if (typeof v !== "string" || v.trim() === "")
    throw new Error(`${ctx} must be a non-empty string`);
  return v;
}
function parseNeedles(raw, ctx) {
  return asArray(raw, ctx).map((n, i) => {
    if (typeof n !== "string" || n === "")
      throw new Error(`${ctx}[${i}] must be a non-empty string`);
    return n;
  });
}
function requireToolName(v, ctx) {
  if (typeof v !== "string" || v.trim() === "")
    throw new Error(`${ctx}: needs a non-empty \`tool\` name`);
  return v;
}
function asArray(v, ctx) {
  if (!Array.isArray(v) || v.length === 0)
    throw new Error(`${ctx} must be a non-empty list`);
  return v;
}
function asObject(v, ctx) {
  if (v === null || typeof v !== "object" || Array.isArray(v))
    throw new Error(`${ctx} must be a mapping`);
  return v;
}
function parseCount(raw, ctx) {
  const obj = asObject(raw, ctx);
  const out = {};
  for (const key of Object.keys(obj)) {
    if (key !== "min" && key !== "max")
      throw new Error(`${ctx}: unknown key \`${key}\` (allowed: min, max)`);
  }
  for (const key of ["min", "max"]) {
    if (obj[key] === void 0)
      continue;
    const n = obj[key];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
      throw new Error(`${ctx}: \`${key}\` must be a non-negative integer`);
    }
    out[key] = n;
  }
  if (out.min !== void 0 && out.max !== void 0 && out.min > out.max) {
    throw new Error(`${ctx}: min (${out.min}) exceeds max (${out.max}) \u2014 nothing can satisfy it`);
  }
  return out;
}
function parseArgs(raw, ctx) {
  const obj = asObject(raw, ctx);
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = parsePredicate(value, `${ctx}.${key}`);
  }
  return out;
}
function parsePredicate(raw, ctx) {
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
    return { equals: raw };
  }
  const obj = asObject(raw, ctx);
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!PREDICATE_KEYS.includes(key)) {
      throw new Error(`${ctx}: unknown operator \`${key}\` (allowed: ${PREDICATE_KEYS.join(", ")})`);
    }
    if (key === "matches") {
      if (typeof value !== "string")
        throw new Error(`${ctx}: \`matches\` must be a string pattern`);
      try {
        new RegExp(value);
      } catch (e) {
        throw new Error(`${ctx}: \`matches\` is not a valid regular expression: ${e instanceof Error ? e.message : e}`);
      }
      out.matches = value;
      continue;
    }
    if (key === "exists") {
      if (typeof value !== "boolean")
        throw new Error(`${ctx}: \`exists\` must be true or false`);
      out.exists = value;
      continue;
    }
    if (key === "any") {
      out.any = parsePredicate(value, `${ctx}.any`);
      continue;
    }
    if (key === "equals") {
      out.equals = value;
      continue;
    }
    if (typeof value !== "string")
      throw new Error(`${ctx}: \`${key}\` must be a string`);
    out[key] = value;
  }
  if (Object.keys(out).length === 0)
    throw new Error(`${ctx}: predicate declares no operator`);
  return out;
}

// packages/core/dist/spec.js
var SpecError = class extends Error {
  constructor(message, file) {
    super(`${file}: ${message}`);
    this.name = "SpecError";
  }
};
function isStringArray(v) {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}
function assertStringList(v, id, field, file) {
  if (!Array.isArray(v) || v.length === 0) {
    throw new SpecError(`scenario \`${id}\` needs at least one \`${field}\` entry`, file);
  }
  const i = v.findIndex((x) => typeof x !== "string");
  if (i >= 0) {
    const bad = v[i];
    const hint = bad !== null && typeof bad === "object" ? ` \u2014 item #${i + 1} parsed as a YAML mapping; an unquoted ": " does that, so quote the item` : ` \u2014 item #${i + 1} is not a string`;
    throw new SpecError(`scenario \`${id}\` \`${field}\` items must all be strings${hint}`, file);
  }
}
function resolveWorkspace(env, mode, fixture, id, file) {
  const raw = env && typeof env === "object" ? env.workspace : void 0;
  if (raw === void 0) {
    if (mode === "seeded" && fixture)
      return { fixture };
    return "none";
  }
  if (raw === "none") {
    if (mode === "seeded") {
      throw new SpecError(`seeded scenario \`${id}\` cannot use env.workspace: none \u2014 seeded gates need a git repo (omit env to use its fixture, or use empty-git/fixture:<path>)`, file);
    }
    return raw;
  }
  if (raw === "empty-git")
    return raw;
  if (typeof raw === "string" && raw.startsWith("fixture:")) {
    const p = raw.slice("fixture:".length).trim();
    if (!p)
      throw new SpecError(`scenario \`${id}\` env.workspace fixture path is empty`, file);
    return { fixture: p };
  }
  throw new SpecError(`scenario \`${id}\` env.workspace must be none | empty-git | fixture:<path>`, file);
}
function resolveExtensions(env, hasSystemPrompt, id, file) {
  const raw = env && typeof env === "object" ? env.extensions : void 0;
  if (raw === void 0)
    return void 0;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new SpecError(`scenario \`${id}\` env.extensions must be a non-empty list of paths`, file);
  }
  const paths = raw.map((p, i) => {
    if (typeof p !== "string" || p.trim() === "") {
      throw new SpecError(`scenario \`${id}\` env.extensions[${i}] must be a non-empty path`, file);
    }
    return p.trim();
  });
  if (hasSystemPrompt) {
    throw new SpecError(`scenario \`${id}\` sets both env.extensions and system_prompt_file \u2014 system_prompt_file replaces the system prompt to test a subagent in isolation, while env.extensions tests the parent that delegates to one. Pick one.`, file);
  }
  return paths;
}
function resolveRemote(env, workspace, id, file) {
  const raw = env && typeof env === "object" ? env.remote : void 0;
  if (raw === void 0)
    return false;
  if (typeof raw !== "boolean") {
    throw new SpecError(`scenario \`${id}\` env.remote must be true or false`, file);
  }
  if (raw && workspace === "none") {
    throw new SpecError(`scenario \`${id}\` sets env.remote but has no repo to attach it to \u2014 use env.workspace: empty-git or fixture:<path>`, file);
  }
  return raw;
}
function parseSpec(text, file) {
  let doc;
  try {
    doc = index_vite_proxy_tmp_default.load(text);
  } catch (e) {
    throw new SpecError(`not valid YAML \u2014 ${e.message}`, file);
  }
  if (doc === null || typeof doc !== "object") {
    throw new SpecError("spec must be a YAML mapping", file);
  }
  const o = doc;
  if (typeof o.skill !== "string" || o.skill.length === 0) {
    throw new SpecError("missing or invalid `skill` (string)", file);
  }
  if (typeof o.judge_persona !== "string" || o.judge_persona.length === 0) {
    throw new SpecError("missing or invalid `judge_persona` (string)", file);
  }
  const sb = o.ship_bar;
  if (!sb || typeof sb !== "object") {
    throw new SpecError("missing `ship_bar` mapping", file);
  }
  if (typeof sb.total !== "number" || typeof sb.min_pass !== "number") {
    throw new SpecError("`ship_bar` requires numeric `total` and `min_pass`", file);
  }
  const ship_bar = {
    total: sb.total,
    min_pass: sb.min_pass,
    no_critical_fail: sb.no_critical_fail !== false
    // default true
  };
  const critical = o.critical === void 0 ? [] : o.critical;
  if (!isStringArray(critical)) {
    throw new SpecError("`critical` must be a list of scenario ids (strings)", file);
  }
  if (!Array.isArray(o.scenarios)) {
    throw new SpecError("missing `scenarios` (list)", file);
  }
  const seen = /* @__PURE__ */ new Set();
  const scenarios = o.scenarios.map((raw, i) => {
    if (raw === null || typeof raw !== "object") {
      throw new SpecError(`scenario #${i + 1} is not a mapping`, file);
    }
    const s = raw;
    const id = s.id;
    if (typeof id !== "string" || id.length === 0) {
      throw new SpecError(`scenario #${i + 1} missing \`id\` (string)`, file);
    }
    if (seen.has(id)) {
      throw new SpecError(`duplicate scenario id \`${id}\``, file);
    }
    seen.add(id);
    if (typeof s.title !== "string" || s.title.length === 0) {
      throw new SpecError(`scenario \`${id}\` missing \`title\``, file);
    }
    const mode = s.mode === void 0 ? "inline" : s.mode;
    if (mode !== "inline" && mode !== "seeded") {
      throw new SpecError(`scenario \`${id}\` has invalid \`mode\` (inline|seeded)`, file);
    }
    assertStringList(s.turns, id, "turns", file);
    assertStringList(s.checklist, id, "checklist", file);
    const critFlag = s.critical === true || critical.includes(id);
    const scenario = {
      id,
      title: s.title,
      critical: critFlag,
      mode,
      turns: s.turns,
      checklist: s.checklist,
      workspace: "none",
      remote: false
    };
    const rawAssert = s.assert;
    if (rawAssert?.trace !== void 0) {
      scenario.traceAssert = parseTraceAssert(rawAssert.trace, `${file}: scenario \`${id}\``);
    }
    if (mode === "seeded") {
      if (typeof s.fixture !== "string" || s.fixture.length === 0) {
        throw new SpecError(`seeded scenario \`${id}\` requires a \`fixture\` path`, file);
      }
      scenario.fixture = s.fixture;
      const a = s.assert;
      if (a) {
        const assertObj = {};
        if (a.vitest !== void 0)
          assertObj.vitest = a.vitest === true;
        if (a.diff_contains !== void 0) {
          if (!isStringArray(a.diff_contains)) {
            throw new SpecError(`seeded scenario \`${id}\` \`assert.diff_contains\` must be strings`, file);
          }
          if (a.diff_contains.some((n) => n === "")) {
            throw new SpecError(`seeded scenario \`${id}\` \`assert.diff_contains\` contains an empty string \u2014 it would match every diff, so the gate could never fail`, file);
          }
          assertObj.diff_contains = a.diff_contains;
        }
        if (a.diff_excludes !== void 0) {
          if (!isStringArray(a.diff_excludes)) {
            throw new SpecError(`seeded scenario \`${id}\` \`assert.diff_excludes\` must be strings`, file);
          }
          if (a.diff_excludes.some((n) => n === "")) {
            throw new SpecError(`seeded scenario \`${id}\` \`assert.diff_excludes\` contains an empty string \u2014 it would match every diff`, file);
          }
          assertObj.diff_excludes = a.diff_excludes;
        }
        const both = (assertObj.diff_contains ?? []).filter((n) => (assertObj.diff_excludes ?? []).includes(n));
        if (both.length > 0) {
          throw new SpecError(`seeded scenario \`${id}\` lists ${both.map((n) => JSON.stringify(n)).join(", ")} in both \`assert.diff_contains\` and \`assert.diff_excludes\` \u2014 the gate could never pass`, file);
        }
        if (a.post_test !== void 0) {
          if (typeof a.post_test !== "string" || !a.post_test.trim()) {
            throw new SpecError(`seeded scenario \`${id}\` \`assert.post_test\` must be a non-empty path`, file);
          }
          assertObj.post_test = a.post_test.trim();
        }
        scenario.assert = assertObj;
      }
    }
    scenario.workspace = resolveWorkspace(s.env, mode, scenario.fixture, id, file);
    scenario.remote = resolveRemote(s.env, scenario.workspace, id, file);
    if (s.system_prompt_file !== void 0) {
      if (typeof s.system_prompt_file !== "string" || !s.system_prompt_file.trim()) {
        throw new SpecError(`scenario \`${id}\` \`system_prompt_file\` must be a non-empty string`, file);
      }
      if (scenario.turns.length !== 1) {
        throw new SpecError(`scenario \`${id}\` uses system_prompt_file, so it must have exactly one turn (got ${scenario.turns.length}) \u2014 an agent definition is single-shot by contract`, file);
      }
      scenario.systemPromptFile = s.system_prompt_file.trim();
    }
    if (s.covers !== void 0) {
      if (!isStringArray(s.covers) || s.covers.length === 0) {
        throw new SpecError(`scenario \`${id}\` \`covers\` must be a non-empty list of strings`, file);
      }
      const bad = s.covers.find((c) => c.trim() === "");
      if (bad !== void 0)
        throw new SpecError(`scenario \`${id}\` \`covers\` has an empty entry`, file);
      scenario.covers = s.covers.map((c) => c.trim());
    }
    scenario.extensions = resolveExtensions(s.env, scenario.systemPromptFile !== void 0, id, file);
    if (s.reps !== void 0) {
      if (typeof s.reps !== "number" || !Number.isInteger(s.reps) || s.reps < 1) {
        throw new SpecError(`scenario \`${id}\` \`reps\` must be a positive integer`, file);
      }
      scenario.reps = s.reps;
    }
    if (s.pass_threshold !== void 0) {
      if (typeof s.pass_threshold !== "number" || s.pass_threshold < 0 || s.pass_threshold > 1) {
        throw new SpecError(`scenario \`${id}\` \`pass_threshold\` must be a number in [0, 1]`, file);
      }
      scenario.passThreshold = s.pass_threshold;
    }
    return scenario;
  });
  return { skill: o.skill, judge_persona: o.judge_persona, ship_bar, critical, scenarios };
}
function loadSpec(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    throw new SpecError(`cannot read spec file \u2014 ${e.message}`, file);
  }
  return parseSpec(text, file);
}

// packages/core/dist/discover.js
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// packages/core/dist/run.js
import { mkdirSync as mkdirSync3, writeFileSync as writeFileSync3 } from "node:fs";
import { dirname, resolve as resolve5 } from "node:path";

// packages/core/dist/sources.js
import { createHash } from "node:crypto";
import { readFileSync as readFileSync2, readdirSync as readdirSync2 } from "node:fs";
import { isAbsolute, join as join2, resolve as resolve2 } from "node:path";
var SCENARIO_PREFIX = "scenario:";
var FIXTURE_PREFIX = "fixture:";
var STIMULUS_PREFIX = "stimulus:";
var RUBRIC_PREFIX = "rubric:";
var POLICY_PREFIX = "policy:";
var GATES_PREFIX = "gates:";
var PERSONA_KEY = `${RUBRIC_PREFIX}__persona`;
var UNREADABLE = "unreadable";
function fileSha256(path) {
  try {
    return createHash("sha256").update(readFileSync2(path)).digest("hex");
  } catch {
    return null;
  }
}
function dirSha256(dir) {
  let files;
  try {
    files = walk(dir).sort();
  } catch {
    return null;
  }
  const h = createHash("sha256");
  for (const rel of files) {
    h.update(rel);
    h.update("\0");
    try {
      h.update(readFileSync2(join2(dir, rel)));
    } catch {
      return null;
    }
    h.update("\0");
  }
  return h.digest("hex");
}
function walk(dir, prefix = "") {
  const out = [];
  for (const e of readdirSync2(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) {
      out.push(...walk(join2(dir, e.name), rel));
    } else if (e.isFile()) {
      out.push(rel);
    }
  }
  return out;
}
function facets(s) {
  const { id, title, critical, mode, turns, checklist, fixture, assert, traceAssert, workspace, remote, systemPromptFile, extensions, reps: reps2, passThreshold, covers: _coversIsMetadata, ...restScenario } = s;
  const _scenarioExhaustive = restScenario;
  void _scenarioExhaustive;
  void _coversIsMetadata;
  const { vitest, diff_contains, diff_excludes, post_test, ...restAssert } = assert ?? {};
  const _assertExhaustive = restAssert;
  void _assertExhaustive;
  const hasGates = diff_contains !== void 0 || diff_excludes !== void 0 || traceAssert !== void 0;
  return {
    // `vitest` and the `post_test` PATH are stimulus, not gates: both change what the
    // run executes in the workspace, and neither can be re-evaluated from a saved
    // diff. (`post_test`'s CONTENTS get their own file-path key, hashed separately.)
    // `extensions` is STIMULUS, not a gate — note the asymmetry with `traceAssert`
    // below. Changing which extensions load changes what the model can DO, so the
    // old transcripts describe a different agent and only a re-run can answer.
    // Changing an assertion only changes what we conclude from evidence already on
    // disk, which `regate` can redo for free.
    stimulus: JSON.stringify([
      id,
      mode,
      turns,
      workspace,
      remote,
      systemPromptFile ?? null,
      fixture ?? null,
      vitest ?? null,
      post_test ?? null,
      extensions ?? null
    ]),
    rubric: JSON.stringify([id, title, checklist]),
    policy: JSON.stringify([id, critical, reps2 ?? null, passThreshold ?? null]),
    gates: hasGates ? JSON.stringify([id, diff_contains ?? null, diff_excludes ?? null, traceAssert ?? null]) : null
  };
}
function sha(canonical) {
  return createHash("sha256").update(canonical).digest("hex");
}
function stimulusDigest(s) {
  return sha(facets(s).stimulus);
}
function rubricDigest(s) {
  return sha(facets(s).rubric);
}
function policyDigest(s) {
  return sha(facets(s).policy);
}
function gatesDigest(s) {
  const g = facets(s).gates;
  return g === null ? null : sha(g);
}
function personaDigest(persona) {
  return sha(JSON.stringify(["__persona", persona]));
}
function fixtureAbs(specDir, fixture) {
  return isAbsolute(fixture) ? fixture : resolve2(specDir, fixture);
}
function effectiveFixture(s) {
  return typeof s.workspace === "object" && s.workspace !== null ? s.workspace.fixture : void 0;
}
function sourceHashes(ctx) {
  const hashes = {};
  hashes["SKILL.md"] = fileSha256(resolve2(ctx.skillDir, "SKILL.md")) ?? UNREADABLE;
  hashes[PERSONA_KEY] = personaDigest(ctx.judgePersona);
  for (const s of ctx.scenarios) {
    hashes[STIMULUS_PREFIX + s.id] = stimulusDigest(s);
    hashes[RUBRIC_PREFIX + s.id] = rubricDigest(s);
    hashes[POLICY_PREFIX + s.id] = policyDigest(s);
    const gates = gatesDigest(s);
    if (gates !== null)
      hashes[GATES_PREFIX + s.id] = gates;
    if (s.systemPromptFile && !(s.systemPromptFile in hashes)) {
      hashes[s.systemPromptFile] = fileSha256(resolve2(ctx.specDir, s.systemPromptFile)) ?? UNREADABLE;
    }
    for (const ext of s.extensions ?? []) {
      if (ext in hashes)
        continue;
      hashes[ext] = fileSha256(resolve2(ctx.specDir, ext)) ?? UNREADABLE;
    }
    const pt = s.assert?.post_test;
    if (pt && !(pt in hashes)) {
      hashes[pt] = fileSha256(isAbsolute(pt) ? pt : resolve2(ctx.specDir, pt)) ?? UNREADABLE;
    }
    const fx = effectiveFixture(s);
    if (fx && !(FIXTURE_PREFIX + fx in hashes)) {
      hashes[FIXTURE_PREFIX + fx] = dirSha256(fixtureAbs(ctx.specDir, fx)) ?? UNREADABLE;
    }
  }
  return hashes;
}
function describeSourceKey(key) {
  if (key === PERSONA_KEY)
    return "the judge persona";
  if (key.startsWith(STIMULUS_PREFIX))
    return `the stimulus for \`${key.slice(STIMULUS_PREFIX.length)}\``;
  if (key.startsWith(RUBRIC_PREFIX))
    return `the rubric for \`${key.slice(RUBRIC_PREFIX.length)}\``;
  if (key.startsWith(POLICY_PREFIX))
    return `the scoring policy for \`${key.slice(POLICY_PREFIX.length)}\``;
  if (key.startsWith(GATES_PREFIX))
    return `the gates for \`${key.slice(GATES_PREFIX.length)}\``;
  if (key.startsWith(SCENARIO_PREFIX))
    return `scenario \`${key.slice(SCENARIO_PREFIX.length)}\``;
  if (key.startsWith(FIXTURE_PREFIX))
    return `fixture \`${key.slice(FIXTURE_PREFIX.length)}\``;
  return key;
}
var SKILL_KEY = "SKILL.md";
function scenarioSourceKeys(s) {
  const keys = [
    STIMULUS_PREFIX + s.id,
    RUBRIC_PREFIX + s.id,
    SCENARIO_PREFIX + s.id
    // legacy combined (pre-0.4.0 runs)
  ];
  if (gatesDigest(s) !== null)
    keys.push(GATES_PREFIX + s.id);
  if (s.systemPromptFile)
    keys.push(s.systemPromptFile);
  for (const ext of s.extensions ?? [])
    keys.push(ext);
  if (s.assert?.post_test)
    keys.push(s.assert.post_test);
  const fx = effectiveFixture(s);
  if (fx)
    keys.push(FIXTURE_PREFIX + fx);
  return keys;
}

// packages/core/dist/workspace.js
import { appendFileSync, cpSync, existsSync as existsSync2, mkdtempSync, readFileSync as readFileSync3, readdirSync as readdirSync3, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { isAbsolute as isAbsolute2, join as join3, resolve as resolve3 } from "node:path";
var GIT_TIMEOUT_MS = 3e4;
var UNCOMMITTED_DIR = "_uncommitted";
var STAGED_DIR = "_staged";
var MARKERS = [STAGED_DIR, UNCOMMITTED_DIR];
function unknownMarkerDirs(src) {
  return readdirSync3(src, { withFileTypes: true }).filter((e) => e.isDirectory() && /^_[A-Za-z]/.test(e.name) && !MARKERS.includes(e.name)).map((e) => e.name).sort();
}
function assertKnownMarkers(src) {
  const suspects = unknownMarkerDirs(src);
  if (suspects.length > 0) {
    throw new Error(`fixture ${src}: unknown marker director${suspects.length > 1 ? "ies" : "y"} ${suspects.map((s) => `\`${s}/\``).join(", ")} \u2014 known markers are ${MARKERS.map((m) => `\`${m}/\``).join(" and ")}. Rename it, or move it deeper if it is ordinary content.`);
  }
}
var TOOL_ARTIFACTS = ["node_modules/", "coverage/", ".vitest/"];
function excludeToolArtifacts(cwd) {
  const excludeFile = join3(cwd, ".git", "info", "exclude");
  const existing = existsSync2(excludeFile) ? readFileSync3(excludeFile, "utf8") : "";
  const nl = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  appendFileSync(excludeFile, `${nl}# skill-harness: tool output, never the model's work
${TOOL_ARTIFACTS.join("\n")}
`, "utf8");
}
function gitBaseline(cwd) {
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd, timeout: GIT_TIMEOUT_MS });
  excludeToolArtifacts(cwd);
  execFileSync("git", ["add", "-A"], { cwd, timeout: GIT_TIMEOUT_MS });
  execFileSync("git", ["-c", "user.email=sh@local", "-c", "user.name=skill-harness", "commit", "-q", "--allow-empty", "-m", "baseline"], { cwd, timeout: GIT_TIMEOUT_MS });
}
function addLocalRemote(cwd) {
  const bare = mkdtempSync(join3(tmpdir(), "sc-remote-")) + ".git";
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", bare], { timeout: GIT_TIMEOUT_MS });
  execFileSync("git", ["remote", "add", "origin", bare], { cwd, timeout: GIT_TIMEOUT_MS });
  execFileSync("git", ["push", "-q", "-u", "origin", "main"], { cwd, timeout: GIT_TIMEOUT_MS });
  return bare;
}
function createWorkspace(kind, opts) {
  const cwd = mkdtempSync(join3(tmpdir(), "sc-ws-"));
  let bare = null;
  const cleanup = () => {
    rmSync(cwd, { recursive: true, force: true });
    if (bare)
      rmSync(bare, { recursive: true, force: true });
  };
  try {
    if (kind === "none") {
    } else if (kind === "empty-git") {
      gitBaseline(cwd);
      if (opts.remote)
        bare = addLocalRemote(cwd);
    } else {
      const src = isAbsolute2(kind.fixture) ? kind.fixture : resolve3(opts.specDir, kind.fixture);
      if (!existsSync2(src))
        throw new Error(`fixture not found: ${src}`);
      assertKnownMarkers(src);
      const pending = [STAGED_DIR, UNCOMMITTED_DIR].map((d) => join3(src, d));
      cpSync(src, cwd, {
        recursive: true,
        filter: (from) => !pending.includes(from)
        // committed baseline only
      });
      gitBaseline(cwd);
      if (opts.remote)
        bare = addLocalRemote(cwd);
      const [staged, uncommitted] = pending;
      if (existsSync2(staged)) {
        cpSync(staged, cwd, { recursive: true });
        execFileSync("git", ["add", "-A"], { cwd, timeout: GIT_TIMEOUT_MS });
      }
      if (existsSync2(uncommitted))
        cpSync(uncommitted, cwd, { recursive: true });
    }
  } catch (e) {
    cleanup();
    throw e;
  }
  return { cwd, cleanup };
}

// packages/core/dist/grade.js
var STAGED_DIFF_HEADING = "=== STAGED DIFF ===";
var SEEDED_DIFF_GUIDANCE = `
This transcript ends with a "=== STAGED DIFF ===" section: the actual code the assistant wrote, as \`git diff --cached\`. It is the primary evidence. Grade what the diff shows the code DOES, not what the assistant's prose claims it does \u2014 a confident description of behavior the diff does not implement is a FAIL, and behavior the diff plainly implements passes even if the assistant described it poorly or not at all. The "=== SEEDED GATES ===" lines above it are keyword and test-run checks only; they do not establish that the required behavior exists. If the diff is marked truncated, judge only what you can see and never infer that cut-off code is missing.
`;
function buildJudgePrompt(input) {
  const { skill, persona, scenario, transcript } = input;
  const numbered = scenario.checklist.map((c, i) => `${i + 1}. ${c}`).join("\n");
  const diffGuidance = scenario.mode === "seeded" && transcript.includes(STAGED_DIFF_HEADING) ? SEEDED_DIFF_GUIDANCE : "";
  return `You are grading ONE response from an AI assistant using a "${skill}" skill \u2014 ${persona} Judge it ONLY against the checklist below \u2014 do not add requirements beyond it.

CHECKLIST (every numbered item must hold for a PASS):
${numbered}

TRANSCRIPT (the assistant is the model under test):
${transcript}
${diffGuidance}
Grade each checklist item PASS or FAIL with a <=12-word justification quoting the transcript. Be skeptical: if an item is not clearly satisfied, mark it FAIL. Then output exactly these two lines:
VERDICT: PASS      (only if EVERY item passed)   \u2014 or \u2014   VERDICT: FAIL
REASON: <15 words or fewer>`;
}
var VERDICT_RE = /^\s*\**\s*VERDICT\**\s*:\s*\**\s*(PASS|FAIL)/gim;
var REASON_RE = /^\s*\**\s*REASON\**\s*:\s*\**\s*(.*)$/gim;
function parseVerdict(out) {
  const verdicts = [...out.matchAll(VERDICT_RE)].map((m) => m[1].toUpperCase());
  if (verdicts.length === 0) {
    return { verdict: "ERROR", reason: "judge produced no parseable verdict" };
  }
  const reasons = [...out.matchAll(REASON_RE)].map((m) => m[1].trim());
  const reason = reasons.length > 0 ? reasons[reasons.length - 1] : "";
  const unique = [...new Set(verdicts)];
  if (unique.length > 1) {
    return {
      verdict: "JUDGE-AMBIGUOUS",
      reason: `judge emitted conflicting verdicts (${verdicts.join(", ")}) \u2014 needs rejudge; last reason: ${reason}`
    };
  }
  return { verdict: unique[0], reason };
}
function judgeResemblesSubject(judge, subject) {
  if (judge.provider !== subject.provider)
    return false;
  const a = judge.model;
  const b = subject.model;
  return a === b || a.includes(b) || b.includes(a);
}
var ITEM_RE = /^\s*\d+[.)]\s*\**\s*(PASS|FAIL)\b/gim;
function detectMisfire(raw, verdict) {
  if (verdict === "ERROR")
    return false;
  if (verdict === "JUDGE-AMBIGUOUS")
    return true;
  const items = [...raw.matchAll(ITEM_RE)].map((m) => m[1].toUpperCase() === "PASS");
  if (items.length === 0) {
    if (verdict === "FAIL") {
      const reason = (raw.match(REASON_LINE_RE)?.[1] ?? "").trim();
      const totalPass = /\b(all|every)\b[^.]*\b(pass(es|ed)?|satisf(y|ies|ied)|hold(s)?|met)\b/i.test(reason);
      const negated = /\b(not|no|n't|fails?|failed|missing|except|but|however)\b/i.test(reason);
      return totalPass && !negated;
    }
    return false;
  }
  const andItems = items.every((ok) => ok);
  const verdictBool = verdict === "PASS";
  return verdictBool !== andItems;
}
var REASON_LINE_RE = /^\s*\**\s*REASON\**\s*:\s*\**\s*(.*)$/im;
async function gradeTranscript(adapter, judge, prompt, cwd) {
  const raw = await adapter.judge({ model: judge, prompt, cwd });
  const parsed = parseVerdict(raw);
  if (parsed.verdict === "ERROR") {
    const snippet = raw.trim().replace(/\s+/g, " ").slice(0, 160);
    if (snippet)
      parsed.reason = `judge unparseable: ${snippet}`;
  }
  const suspect = detectMisfire(raw, parsed.verdict);
  return { ...parsed, raw, suspect };
}
async function judgeInWorkspace(adapter, judge, prompt, specDir) {
  const ws = createWorkspace("none", { specDir });
  try {
    return await gradeTranscript(adapter, judge, prompt, ws.cwd);
  } finally {
    ws.cleanup();
  }
}

// packages/core/dist/results.js
import { mkdirSync, readFileSync as readFileSync4, writeFileSync, existsSync as existsSync3, readdirSync as readdirSync4, appendFileSync as appendFileSync2 } from "node:fs";
import { join as join4, relative, sep } from "node:path";

// packages/core/dist/adapters/types.js
function parseModelRef(token) {
  const i = token.indexOf(":");
  if (i < 0) {
    throw new Error(`model must be \`provider:model\` (got \`${token}\`)`);
  }
  const provider = token.slice(0, i).trim();
  const model = token.slice(i + 1).trim();
  if (!provider || !model) {
    throw new Error(`model must be \`provider:model\` (got \`${token}\`)`);
  }
  return { provider, model };
}
function modelSlug(ref) {
  return `${ref.provider}-${ref.model}`.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

// packages/core/dist/score.js
function letterFor(pct) {
  if (pct >= 90)
    return "A";
  if (pct >= 80)
    return "B";
  if (pct >= 70)
    return "C";
  if (pct >= 60)
    return "D";
  return "F";
}
function score(verdicts, input) {
  const { shipBar, critical } = input;
  let passed = 0;
  let total = 0;
  let criticalFails = 0;
  let bSeriesFails = 0;
  let suspectCount = 0;
  for (const v of verdicts) {
    if (v.suspect) {
      suspectCount++;
      continue;
    }
    total++;
    if (v.verdict === "PASS") {
      passed++;
      continue;
    }
    if (critical.includes(v.id))
      criticalFails++;
    if (/^B/i.test(v.id))
      bSeriesFails++;
  }
  const pct = total > 0 ? Math.round(passed * 100 / total) : 0;
  const letter = letterFor(pct);
  const ship = total >= shipBar.total && passed >= shipBar.min_pass && (!shipBar.no_critical_fail || criticalFails === 0) && bSeriesFails === 0 && suspectCount === 0;
  let note = "";
  if (suspectCount > 0) {
    note = `${suspectCount} suspect: re-judge/resolve`;
  } else if (criticalFails > 0) {
    note = `gated: ${criticalFails} critical fail${criticalFails === 1 ? "" : "s"}`;
  } else if (bSeriesFails > 0) {
    note = `gated: ${bSeriesFails} B-series fail${bSeriesFails === 1 ? "" : "s"}`;
  }
  return { passed, total, pct, letter, ship, criticalFails, bSeriesFails, suspectCount, note };
}

// packages/core/dist/version.js
import { createRequire } from "node:module";
var require2 = createRequire(import.meta.url);
var HARNESS_VERSION = require2("../package.json").version;

// packages/core/dist/results.js
var SCORED_MODES = ["green", "force"];
function isScoredMode(mode) {
  return SCORED_MODES.includes(mode);
}
function scoreContextFor(run, spec) {
  if (!isScoredMode(run.mode) || run.partial)
    return null;
  return { shipBar: spec.ship_bar, critical: spec.critical };
}
function effectiveThreshold(prevScenario, scenario) {
  return prevScenario?.pass_threshold ?? scenario.passThreshold ?? 0.5;
}
function timestampSlug(iso) {
  return iso.replace(/[:.]/g, "-");
}
function runDirFor(skillDir, harness, model, timestamp) {
  return join4(skillDir, "tests", "results", `${harness}-${modelSlug(model)}`, timestampSlug(timestamp));
}
function transcriptPath(runDir, scenarioId, mode, rep) {
  const base = rep === void 0 ? `${scenarioId}.${mode}` : `${scenarioId}.${mode}.rep${rep}`;
  return join4(runDir, `${base}.txt`);
}
function resultsPath(runDir) {
  return join4(runDir, "results.yaml");
}
function effectiveVerdicts(scenarios) {
  return scenarios.map((s) => ({
    id: s.id,
    verdict: s.override ?? s.judge_verdict,
    suspect: s.suspect && s.override == null
    // an override resolves the misfire
  }));
}
function finalizeResults(draft, ctx) {
  let effective_grade;
  if (ctx) {
    const s = score(effectiveVerdicts(draft.scenarios), { shipBar: ctx.shipBar, critical: ctx.critical });
    effective_grade = { passed: s.passed, total: s.total, pct: s.pct, letter: s.letter, ship: s.ship, note: s.note };
  } else {
    const why = draft.partial ? "partial run (--only) \u2014 not scored" : `mode=${draft.mode} (not scored)`;
    effective_grade = { passed: 0, total: 0, pct: 0, letter: "-", ship: false, note: why };
  }
  return {
    schema: 2,
    // Stamped here, the single place every writer passes through, so `run`,
    // `grade`, `rescore` and the review UI's override save all record which tool
    // produced the record they leave behind.
    harness_version: HARNESS_VERSION,
    // Omitted rather than written as null when absent: a run whose adapter could
    // not report a version must not look like one that reported "nothing".
    ...draft.harness_cli_version ? { harness_cli_version: draft.harness_cli_version } : {},
    ...draft.delivery_canary ? { delivery_canary: draft.delivery_canary } : {},
    skill: draft.skill,
    harness: draft.harness,
    model: draft.model,
    judge: draft.judge,
    timestamp: draft.timestamp,
    label: draft.label,
    mode: draft.mode,
    ...draft.partial ? { partial: true } : {},
    ...draft.source_hashes ? { source_hashes: draft.source_hashes } : {},
    effective_grade,
    scenarios: draft.scenarios
  };
}
function writeResults(runDir, draft, ctx) {
  const results = finalizeResults(draft, ctx);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(resultsPath(runDir), index_vite_proxy_tmp_default.dump(results, { lineWidth: 100 }), "utf8");
  return results;
}
var SUSPECT_PREFIX_RE = /^\[suspect misfire[^\]]*\]\s*/;
function migrateResults(raw) {
  if (raw == null || typeof raw !== "object") {
    throw new Error("empty or invalid results.yaml");
  }
  const o = raw;
  if (o.schema === 2)
    return raw;
  const v1 = raw;
  const modeMatch = /^mode=(\w+)/.exec(v1.grade?.note ?? "");
  return {
    schema: 2,
    skill: v1.skill,
    harness: v1.harness,
    model: v1.model,
    judge: v1.judge,
    timestamp: v1.timestamp,
    label: null,
    mode: modeMatch ? modeMatch[1] : "green",
    // v1 grades may predate override-aware recompute; carried verbatim (read-only).
    // Every v2 WRITE recomputes, so staleness cannot propagate.
    effective_grade: v1.grade,
    scenarios: (v1.scenarios ?? []).map((s) => {
      const reason = s.judge_reason ?? "";
      return {
        ...s,
        override: s.override ?? null,
        note: s.note ?? "",
        suspect: SUSPECT_PREFIX_RE.test(reason),
        judge_reason: reason.replace(SUSPECT_PREFIX_RE, "")
      };
    })
  };
}
function readResults(runDir) {
  const text = readFileSync4(resultsPath(runDir), "utf8");
  return migrateResults(index_vite_proxy_tmp_default.load(text));
}
function applyOverride(results, scenarioId, override, note) {
  if (override !== null && note.trim() === "") {
    throw new Error(`override for \`${scenarioId}\` requires a note \u2014 say why the judge was wrong`);
  }
  let found = false;
  const scenarios = results.scenarios.map((s) => {
    if (s.id !== scenarioId)
      return s;
    found = true;
    return { ...s, override, note };
  });
  if (!found) {
    throw new Error(`no scenario \`${scenarioId}\` in results`);
  }
  return { ...results, scenarios };
}
var GITIGNORE_BODY = `# skill-harness: commit verdicts (results.yaml), ignore generated artifacts.
*.txt
*.jsonl
report.html
!results.yaml
`;
function ensureResultsGitignore(resultsRoot) {
  mkdirSync(resultsRoot, { recursive: true });
  const giPath = join4(resultsRoot, ".gitignore");
  const existing = existsSync3(giPath) ? readFileSync4(giPath, "utf8") : "";
  if (existing.startsWith(GITIGNORE_BODY))
    return;
  const preserved = existing.split("\n").filter((l) => l.startsWith("!") && l.trim() !== "!results.yaml");
  writeFileSync(giPath, GITIGNORE_BODY + preserved.map((l) => l + "\n").join(""), "utf8");
}
var REP_SUFFIX_RE = /\.rep(\d+)\.(?:judge\.|diff\.)?txt$/;
function repIndexOf(filename) {
  const m = REP_SUFFIX_RE.exec(filename);
  return m ? Number(m[1]) : null;
}
function sortByRep(files) {
  return files.sort((a, b) => {
    const ra = repIndexOf(a);
    const rb = repIndexOf(b);
    if (ra === null && rb === null)
      return a.localeCompare(b);
    if (ra === null)
      return -1;
    if (rb === null)
      return 1;
    return ra - rb;
  });
}
function findTranscriptFiles(runDir, scenarioId, mode) {
  if (!existsSync3(runDir))
    return [];
  const escapedId = scenarioId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = mode !== void 0 ? new RegExp(`^${escapedId}\\.${mode}(\\.rep\\d+)?\\.txt$`) : null;
  const files = readdirSync4(runDir).filter((f) => matcher ? matcher.test(f) : f.startsWith(`${scenarioId}.`) && f.endsWith(".txt") && !f.endsWith(".judge.txt") && !f.endsWith(".diff.txt"));
  return sortByRep(files);
}
function judgeRawPath(runDir, scenarioId, mode, rep) {
  const base = rep === void 0 ? `${scenarioId}.${mode}` : `${scenarioId}.${mode}.rep${rep}`;
  return join4(runDir, `${base}.judge.txt`);
}
function findJudgeRawFiles(runDir, scenarioId, mode) {
  if (!existsSync3(runDir))
    return [];
  const esc = scenarioId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = mode === void 0 ? new RegExp(`^${esc}\\..*\\.judge\\.txt$`) : new RegExp(`^${esc}\\.${mode}(\\.rep\\d+)?\\.judge\\.txt$`);
  return sortByRep(readdirSync4(runDir).filter((f) => re.test(f)));
}
function diffPath(runDir, scenarioId, mode, rep) {
  const base = rep === void 0 ? `${scenarioId}.${mode}` : `${scenarioId}.${mode}.rep${rep}`;
  return join4(runDir, `${base}.diff.txt`);
}
function tracePath(runDir, scenarioId, mode, rep) {
  const base = rep === void 0 ? `${scenarioId}.${mode}` : `${scenarioId}.${mode}.rep${rep}`;
  return join4(runDir, `${base}.trace.jsonl`);
}
function findDiffFiles(runDir, scenarioId, mode) {
  if (!existsSync3(runDir))
    return [];
  const esc = scenarioId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = mode === void 0 ? new RegExp(`^${esc}\\..*\\.diff\\.txt$`) : new RegExp(`^${esc}\\.${mode}(\\.rep\\d+)?\\.diff\\.txt$`);
  return sortByRep(readdirSync4(runDir).filter((f) => re.test(f)));
}
function preserveTranscript(resultsRoot, runDir, scenarioId) {
  const files = [
    ...findTranscriptFiles(runDir, scenarioId),
    ...findJudgeRawFiles(runDir, scenarioId),
    ...findDiffFiles(runDir, scenarioId)
  ];
  if (files.length === 0)
    return;
  ensureResultsGitignore(resultsRoot);
  const giPath = join4(resultsRoot, ".gitignore");
  const existingLines = readFileSync4(giPath, "utf8").split("\n");
  const newLines = [];
  for (const file of files) {
    const rel = relative(resultsRoot, join4(runDir, file)).split(sep).join("/");
    const line = `!${rel}`;
    if (!existingLines.includes(line) && !newLines.includes(line)) {
      newLines.push(line);
    }
  }
  if (newLines.length > 0) {
    appendFileSync2(giPath, newLines.map((l) => l + "\n").join(""), "utf8");
  }
}

// packages/core/dist/journal.js
import { appendFileSync as appendFileSync3, existsSync as existsSync4, mkdirSync as mkdirSync2, readFileSync as readFileSync5 } from "node:fs";
import { join as join5 } from "node:path";
function journalPath(runDir) {
  return join5(runDir, "journal.jsonl");
}
function appendJournal(runDir, e) {
  mkdirSync2(runDir, { recursive: true });
  appendFileSync3(journalPath(runDir), JSON.stringify(e) + "\n", "utf8");
}

// packages/core/dist/lift.js
import { existsSync as existsSync5, readdirSync as readdirSync5, statSync as statSync2 } from "node:fs";
import { join as join6 } from "node:path";
function aggregationShape(s) {
  const reps2 = s.reps ?? 1;
  return { reps: reps2, threshold: reps2 > 1 ? s.pass_threshold ?? null : null };
}
function comparableAggregation(red, green) {
  return red.reps === green.reps && red.threshold === green.threshold;
}
function conclusive(verdict, suspect) {
  return !suspect && verdict !== "ERROR" && verdict !== "JUDGE-AMBIGUOUS";
}
function classify(red, green) {
  if (!conclusive(red.verdict, red.suspect) || !conclusive(green.verdict, green.suspect))
    return "inconclusive";
  const redPass = red.verdict === "PASS";
  const greenPass = green.verdict === "PASS";
  if (redPass && greenPass)
    return "kept";
  if (!redPass && greenPass)
    return "gained";
  if (redPass && !greenPass)
    return "regressed";
  return "both-fail";
}
function computeLift(red, green, opts = {}) {
  const insensitive = new Set(opts.modeInsensitive ?? []);
  const redV = new Map(effectiveVerdicts(red.scenarios).map((v) => [v.id, { verdict: v.verdict, suspect: v.suspect ?? false }]));
  const greenV = new Map(effectiveVerdicts(green.scenarios).map((v) => [v.id, { verdict: v.verdict, suspect: v.suspect ?? false }]));
  const redShape = new Map(red.scenarios.map((s) => [s.id, aggregationShape(s)]));
  const greenShape = new Map(green.scenarios.map((s) => [s.id, aggregationShape(s)]));
  const cells = {};
  const counts = { gained: 0, regressed: 0, kept: 0, "both-fail": 0, inconclusive: 0 };
  let redPassed = 0;
  let greenPassed = 0;
  const modeInsensitive = [];
  const aggregationMismatch = [];
  for (const [id, g] of greenV) {
    const r = redV.get(id);
    if (!r)
      continue;
    if (insensitive.has(id)) {
      modeInsensitive.push(id);
      continue;
    }
    const rShape = redShape.get(id) ?? { reps: 1, threshold: null };
    const gShape = greenShape.get(id) ?? { reps: 1, threshold: null };
    if (!comparableAggregation(rShape, gShape)) {
      aggregationMismatch.push({ id, red: rShape, green: gShape });
      continue;
    }
    const cls = classify(r, g);
    cells[id] = { red: r.verdict, redSuspect: r.suspect, green: g.verdict, class: cls };
    counts[cls]++;
    if (cls !== "inconclusive") {
      if (r.verdict === "PASS")
        redPassed++;
      if (g.verdict === "PASS")
        greenPassed++;
    }
  }
  return {
    tag: "",
    model: green.model,
    mode: green.mode,
    redTimestamp: red.timestamp,
    greenTimestamp: green.timestamp,
    compared: Object.keys(cells).length,
    gained: counts.gained,
    regressed: counts.regressed,
    kept: counts.kept,
    bothFail: counts["both-fail"],
    inconclusive: counts.inconclusive,
    redPassed,
    greenPassed,
    delta: greenPassed - redPassed,
    greenOnly: [...greenV.keys()].filter((id) => !redV.has(id)),
    redOnly: [...redV.keys()].filter((id) => !greenV.has(id)),
    modeInsensitive,
    aggregationMismatch,
    partial: Boolean(red.partial || green.partial),
    cells
  };
}
function reps(n) {
  return n === 1 ? "1 rep" : `${n} reps`;
}
function describeMismatch(ms) {
  const distinct = new Set(ms.map((m) => m.red.reps !== m.green.reps ? `red ${reps(m.red.reps)} vs ${reps(m.green.reps)}` : `red pass threshold ${m.red.threshold} vs ${m.green.threshold}`));
  return distinct.size === 1 ? [...distinct][0] : "red and green aggregated differently";
}
function mismatchRemedy(ms) {
  const greenReps = new Set(ms.map((m) => m.green.reps));
  if (greenReps.size === 1 && ms.every((m) => m.red.reps !== m.green.reps)) {
    return `re-run the baseline with --reps ${[...greenReps][0]}`;
  }
  return "re-measure both sides the same way";
}
function liftHeadline(lift) {
  if (lift.compared === 0) {
    const mismatched = lift.aggregationMismatch.length;
    const insensitive = lift.modeInsensitive.length;
    if (mismatched > 0 && insensitive > 0) {
      return `nothing comparable (${insensitive} run identically in both modes, ${mismatched} ${describeMismatch(lift.aggregationMismatch)})`;
    }
    if (mismatched > 0) {
      return `nothing comparable (${mismatched} shared, ${describeMismatch(lift.aggregationMismatch)} \u2014 ${mismatchRemedy(lift.aggregationMismatch)})`;
    }
    if (insensitive > 0) {
      return `nothing comparable (${insensitive} shared, all run identically in both modes)`;
    }
    return "no shared scenarios to compare";
  }
  const conclusive3 = lift.compared - lift.inconclusive;
  if (conclusive3 === 0) {
    return `nothing conclusive to compare (${lift.inconclusive} inconclusive \u2014 fix the harness/judge, then re-run)`;
  }
  const segments = [];
  if (lift.gained === 0 && lift.regressed === 0) {
    segments.push(lift.kept > 0 ? `no measured effect (${lift.kept} passed without the skill too)` : "no measured effect");
  } else {
    const sign = lift.delta > 0 ? `+${lift.delta}` : String(lift.delta);
    segments.push(`${sign} net (${lift.gained} gained, ${lift.regressed} regressed)`);
  }
  if (lift.inconclusive > 0)
    segments.push(`${lift.inconclusive} inconclusive`);
  if (lift.modeInsensitive.length > 0) {
    segments.push(`${lift.modeInsensitive.length} not comparable (same run in both modes)`);
  }
  if (lift.aggregationMismatch.length > 0) {
    segments.push(`${lift.aggregationMismatch.length} not comparable (${describeMismatch(lift.aggregationMismatch)})`);
  }
  if (lift.partial)
    segments.push("partial run");
  return segments.join(" \xB7 ");
}
function isDir(p) {
  try {
    return statSync2(p).isDirectory();
  } catch {
    return false;
  }
}
function modeInsensitiveIds(skillDir) {
  const specPath = join6(skillDir, "tests", "specification.yaml");
  if (!existsSync5(specPath))
    return [];
  try {
    return loadSpec(specPath).scenarios.filter((s) => s.systemPromptFile).map((s) => s.id);
  } catch {
    return [];
  }
}
function collectLift(skillDir) {
  const resultsRoot = join6(skillDir, "tests", "results");
  if (!existsSync5(resultsRoot))
    return [];
  const modeInsensitive = modeInsensitiveIds(skillDir);
  const lifts = [];
  for (const tag of readdirSync5(resultsRoot).filter((n) => isDir(join6(resultsRoot, n))).sort()) {
    const tagDir = join6(resultsRoot, tag);
    const runDirs = readdirSync5(tagDir).map((n) => join6(tagDir, n)).filter((p) => isDir(p) && existsSync5(join6(p, "results.yaml"))).sort();
    let red;
    let skillOn;
    for (const rd of runDirs) {
      let r;
      try {
        r = readResults(rd);
      } catch (e) {
        console.warn(`skill-harness lift: skipping unreadable run ${rd}: ${e instanceof Error ? e.message : e}`);
        continue;
      }
      if (r.mode === "red")
        red = r;
      else if (isScoredMode(r.mode))
        skillOn = r;
    }
    if (!red || !skillOn)
      continue;
    lifts.push({ ...computeLift(red, skillOn, { modeInsensitive }), tag });
  }
  return lifts;
}

// packages/core/dist/seeded.js
import { copyFileSync, statSync as statSync3 } from "node:fs";
import { extname, isAbsolute as isAbsolute3, join as join8, resolve as resolve4 } from "node:path";

// packages/core/dist/util/exec.js
import { spawn } from "node:child_process";
import { existsSync as existsSync6 } from "node:fs";
import { join as join7, delimiter } from "node:path";
function exec(cmd, args, opts = {}) {
  return new Promise((resolve12, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let timer;
    if (opts.timeoutMs) {
      timer = setTimeout(() => {
        child.kill("SIGKILL");
        stderr += `
[skill-harness] killed after ${opts.timeoutMs}ms timeout`;
      }, opts.timeoutMs);
    }
    child.stdout.on("data", (d) => stdout += d.toString());
    child.stderr.on("data", (d) => stderr += d.toString());
    child.on("error", (e) => {
      if (timer)
        clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      if (timer)
        clearTimeout(timer);
      resolve12({ stdout, stderr, code });
    });
  });
}
function onPath(bin) {
  const dirs = (process.env.PATH ?? "").split(delimiter);
  const exts = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  return dirs.some((d) => d && exts.some((ext) => existsSync6(join7(d, bin + ext))));
}

// packages/core/dist/util/env.js
var NEW_PREFIX = "SKILL_HARNESS_";
var LEGACY_PREFIX = "SKILL_CHECK_";
var warned = /* @__PURE__ */ new Set();
function warnOnce(key, message) {
  if (warned.has(key))
    return;
  warned.add(key);
  process.stderr.write(`skill-harness: ${message}
`);
}
function readEnv(suffix) {
  const fresh = process.env[NEW_PREFIX + suffix];
  if (fresh)
    return fresh;
  const legacy = process.env[LEGACY_PREFIX + suffix];
  if (legacy) {
    warnOnce(`legacy:${suffix}`, `${LEGACY_PREFIX}${suffix} is the pre-rename name and still honored; rename it to ${NEW_PREFIX}${suffix}.`);
    return legacy;
  }
  return void 0;
}
function envNum(suffix, fallback) {
  const raw = readEnv(suffix);
  if (raw === void 0)
    return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    warnOnce(`malformed:${suffix}`, `${NEW_PREFIX}${suffix}=${JSON.stringify(raw)} is not a positive number; using ${fallback}.`);
    return fallback;
  }
  return n;
}
function envFlag(suffix) {
  return readEnv(suffix) !== void 0;
}

// packages/core/dist/seeded.js
var POST_TEST_BASE = "skill-harness.post";
var VITEST_TIMEOUT_MS = envNum("VITEST_TIMEOUT_MS", 12e4);
function changedLines(diff) {
  const out = [];
  let inHunk = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (line.startsWith("diff --git ")) {
      inHunk = false;
      continue;
    }
    if (!inHunk)
      continue;
    if (line.startsWith("+") || line.startsWith("-"))
      out.push(line);
  }
  return out.join("\n");
}
function evaluateNeedleGates(scenario, diff) {
  const changed = changedLines(diff);
  const lines = [];
  let failure = null;
  for (const needle of scenario.assert?.diff_contains ?? []) {
    const ok = changed.includes(needle);
    lines.push(`  diff_contains ${JSON.stringify(needle)}: ${ok ? "OK" : "MISSING"}`);
    if (!ok && !failure)
      failure = `staged diff missing ${JSON.stringify(needle)}`;
  }
  for (const needle of scenario.assert?.diff_excludes ?? []) {
    const ok = !changed.includes(needle);
    lines.push(`  diff_excludes ${JSON.stringify(needle)}: ${ok ? "OK" : "PRESENT"}`);
    if (!ok && !failure)
      failure = `staged diff touches forbidden ${JSON.stringify(needle)}`;
  }
  return { lines, failure };
}
var DIFF_MAX_BYTES = envNum("DIFF_MAX_BYTES", 64e3);
function capDiff(diff, maxBytes = DIFF_MAX_BYTES) {
  const total = Buffer.byteLength(diff, "utf8");
  if (total <= maxBytes)
    return diff;
  const kept = [];
  let used = 0;
  for (const line of diff.split("\n")) {
    const cost = Buffer.byteLength(line, "utf8") + (kept.length > 0 ? 1 : 0);
    if (used + cost > maxBytes)
      break;
    kept.push(line);
    used += cost;
  }
  if (kept.length === 0) {
    const head = Buffer.from(diff, "utf8").subarray(0, maxBytes).toString("utf8");
    const clean = head.endsWith("\uFFFD") ? head.slice(0, -1) : head;
    kept.push(clean);
    used = Buffer.byteLength(clean, "utf8");
  }
  const omitted = total - used;
  return kept.join("\n") + `
[\u2026 diff truncated: ${omitted} of ${total} bytes omitted (cap ${maxBytes}). The complete diff is saved beside this transcript as this scenario's .diff.txt artifact. Do not treat anything below the cut as absent \u2014 it was not shown to you. \u2026]`;
}
async function runSeeded(scenario, opts) {
  const repo = opts.cwd;
  const req = {
    skillDir: opts.skillDir,
    model: opts.model,
    mode: opts.mode,
    turns: scenario.turns,
    cwd: repo,
    // Resolved against the spec dir, exactly like fixtures and post-tests.
    extensions: scenario.extensions?.map((e) => resolve4(opts.specDir, e))
  };
  let traces = [];
  let harnessOut;
  if (opts.trace) {
    if (!opts.adapter.runStructured) {
      throw new Error(`scenario \`${opts.trace.scenarioId}\` declares \`assert.trace\`, but the \`${opts.adapter.name}\` adapter cannot produce execution traces \u2014 the gate would have no evidence to read.`);
    }
    const structured = await opts.adapter.runStructured({
      ...req,
      scenarioId: opts.trace.scenarioId,
      rep: opts.trace.rep
    });
    harnessOut = structured.transcript;
    traces = structured.traces;
  } else {
    harnessOut = await opts.adapter.run(req);
  }
  const parts = [harnessOut, "", "=== SEEDED GATES ==="];
  let gateFailure = null;
  const runVitest = opts.runVitest ?? ((args, cwd) => exec("npx", ["vitest", "run", ...args], { cwd, timeoutMs: VITEST_TIMEOUT_MS }));
  const add = await git(repo, ["add", "-A"]);
  const show = await git(repo, ["diff", "--cached"]);
  const diff = show.stdout;
  const gitFailure = [add, show].find((r) => r.code !== 0);
  if (gitFailure) {
    const why = gitFailure.code === null ? "timed out and was killed" : `exited ${gitFailure.code}`;
    const msg = `staged diff could not be captured \u2014 git ${why} \u2014 infrastructure, not model behavior` + (gitFailure.stderr.trim() ? `: ${gitFailure.stderr.trim().split("\n")[0]}` : "");
    parts.push(`  staged diff: ERROR (${msg})`);
    gateFailure = msg;
    return finish(parts, gateFailure, diff, traces);
  }
  const needles = evaluateNeedleGates(scenario, diff);
  parts.push(...needles.lines);
  if (needles.failure && !gateFailure)
    gateFailure = needles.failure;
  if (scenario.assert?.vitest) {
    const v = await runVitest([], repo);
    const killed = v.code === null;
    const passed = v.code === 0;
    parts.push(killed ? `  vitest run: ERROR (timed out after ${VITEST_TIMEOUT_MS}ms \u2014 infrastructure, not model behavior)` : `  vitest run: ${passed ? "PASS" : `FAIL (exit ${v.code})`}`);
    parts.push(indent(bothStreams(v)));
    if (!passed && !gateFailure) {
      gateFailure = killed ? `vitest timed out after ${VITEST_TIMEOUT_MS}ms \u2014 infrastructure, not model behavior` : `vitest failed (exit ${v.code})`;
    }
  }
  const postTest = scenario.assert?.post_test;
  if (postTest) {
    const src = isAbsolute3(postTest) ? postTest : resolve4(opts.specDir, postTest);
    if (!isReadableFile(src)) {
      const msg = `post_test is not a readable file: ${postTest} \u2014 spec error, not model behavior`;
      parts.push(`  post_test: ERROR (${msg})`);
      if (!gateFailure)
        gateFailure = msg;
    } else {
      const dest = join8(repo, `${POST_TEST_BASE}.test${extname(src) || ".ts"}`);
      try {
        copyFileSync(src, dest);
      } catch (e) {
        const msg = `post_test could not be copied into the workspace (${e instanceof Error ? e.message : String(e)}) \u2014 infrastructure, not model behavior`;
        parts.push(`  post_test: ERROR (${msg})`);
        if (!gateFailure)
          gateFailure = msg;
        return finish(parts, gateFailure, diff, traces);
      }
      const v = await runVitest([POST_TEST_BASE], repo);
      const out = `${v.stdout}
${v.stderr}`;
      const tally = vitestTally(out);
      const notCollected = /^\s*No test files found/im.test(out);
      const killed = v.code === null;
      let problem = null;
      if (killed) {
        problem = `post_test ${JSON.stringify(postTest)} timed out after ${VITEST_TIMEOUT_MS}ms \u2014 infrastructure, not model behavior`;
      } else if (notCollected) {
        problem = `post_test ${JSON.stringify(postTest)} was never collected by vitest \u2014 spec/fixture error, not model behavior`;
      } else if (tally === null) {
        problem = `post_test ${JSON.stringify(postTest)} produced no parseable vitest summary (exit ${v.code}) \u2014 cannot confirm it ran`;
      } else if (v.code !== 0 || tally.failed > 0) {
        problem = `post_test ${JSON.stringify(postTest)} failed (exit ${v.code})`;
      } else if (tally.skipped > 0 || tally.todo > 0) {
        problem = `post_test ${JSON.stringify(postTest)} has ${tally.skipped + tally.todo} skipped/todo test(s) \u2014 a hidden gate must actually run; spec error, not model behavior`;
      } else if (tally.passed === 0) {
        problem = `post_test ${JSON.stringify(postTest)} ran no assertions \u2014 spec error, not model behavior`;
      }
      parts.push(problem === null ? `  post_test ${JSON.stringify(postTest)}: PASS (${tally.passed} assertion-bearing test(s))` : `  post_test ${JSON.stringify(postTest)}: ${v.code === 0 && !killed ? "ERROR" : "FAIL"} (${problem})`);
      parts.push(indent(bothStreams(v)));
      if (problem && !gateFailure)
        gateFailure = problem;
    }
  }
  return finish(parts, gateFailure, diff, traces);
}
function git(cwd, args) {
  return exec("git", args, { cwd, timeoutMs: 3e4 });
}
function indent(s) {
  return s.split("\n").map((l) => `    ${l}`).join("\n");
}
function isReadableFile(p) {
  try {
    return statSync3(p).isFile();
  } catch {
    return false;
  }
}
function bothStreams(v) {
  const o = v.stdout.trim();
  const e = v.stderr.trim();
  if (o && e)
    return `${o}
[stderr]
${e}`;
  return o || e;
}
function finish(parts, gateFailure, diff, traces = []) {
  parts.push("", "=== STAGED DIFF ===");
  parts.push(diff.trim() === "" ? "  (empty \u2014 the model left no staged changes)" : capDiff(diff));
  return { transcript: parts.join("\n"), gateFailure, diff, traces };
}
function vitestTally(out) {
  const line = /^\s*Tests\s+(.+)$/m.exec(out);
  if (!line)
    return null;
  const read = (word) => {
    const m = new RegExp(`(\\d+)\\s+${word}`).exec(line[1]);
    return m ? Number(m[1]) : 0;
  };
  return { passed: read("passed"), failed: read("failed"), skipped: read("skipped"), todo: read("todo") };
}

// packages/core/dist/execution-trace.js
import { createHash as createHash3 } from "node:crypto";

// packages/core/dist/capture-trace-types.js
var EXECUTION_TRACE_VERSION = 1;
var CAPTURE_SCHEMA_VERSION = 1;

// packages/core/dist/capture.js
import { createHash as createHash2 } from "node:crypto";
function activeBranch(entries, leafId) {
  const byId = /* @__PURE__ */ new Map();
  for (const e of entries)
    if (typeof e.id === "string")
      byId.set(e.id, e);
  let cursor = leafId;
  if (cursor === void 0) {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (typeof entries[i].id === "string") {
        cursor = entries[i].id;
        break;
      }
    }
  }
  const chain = [];
  const seen = /* @__PURE__ */ new Set();
  while (cursor !== void 0 && cursor !== null && byId.has(cursor) && chain.length <= entries.length) {
    if (seen.has(cursor))
      break;
    seen.add(cursor);
    const entry = byId.get(cursor);
    chain.push(entry);
    cursor = entry.parentId ?? void 0;
  }
  return chain.reverse();
}
function visibleText(blocks) {
  if (!blocks)
    return "";
  const parts = [];
  for (const b of blocks) {
    if (b.type === "thinking")
      continue;
    if (b.type === "text" && typeof b.text === "string")
      parts.push(b.text);
    else if (b.type === "image")
      parts.push("[image omitted]");
  }
  return parts.join("\n").trim();
}
function projectTurns(entries) {
  const turns = [];
  let current = null;
  for (const entry of entries) {
    if (entry.type !== "message" || !entry.message)
      continue;
    const msg = entry.message;
    const id = typeof entry.id === "string" ? entry.id : "";
    if (msg.role === "user") {
      current = {
        index: turns.length,
        user: visibleText(msg.content),
        assistantText: "",
        toolCalls: [],
        entryIds: id ? [id] : []
      };
      turns.push(current);
      continue;
    }
    if (!current)
      continue;
    if (id)
      current.entryIds.push(id);
    if (msg.role === "assistant") {
      const text = visibleText(msg.content);
      if (text)
        current.assistantText = current.assistantText ? `${current.assistantText}
${text}` : text;
      for (const b of msg.content ?? []) {
        if (b.type !== "toolCall")
          continue;
        current.toolCalls.push({
          name: typeof b.name === "string" ? b.name : "(unknown)",
          args: redactArgs(b.arguments),
          isError: false,
          ...typeof b.id === "string" ? { id: b.id } : {}
        });
      }
      continue;
    }
    if (msg.role === "toolResult") {
      const body = JSON.stringify(msg.content ?? []);
      const callId = typeof msg.toolCallId === "string" ? msg.toolCallId : void 0;
      const target = callId ? current.toolCalls.find((c) => c.id === callId) : current.toolCalls.find((c) => c.name === msg.toolName && c.resultBytes === void 0);
      if (target) {
        target.isError = msg.isError === true;
        target.resultBytes = Buffer.byteLength(body, "utf8");
        target.resultSha256 = sha256(body);
      }
    }
  }
  return turns;
}
var MAX_VALUE_CHARS = 2e3;
var REDACTED = "[redacted]";
var SECRET_KEY = /^(.*[-_])?(password|passwd|secret|token|api[-_]?key|apikey|auth|authorization|credential|private[-_]?key|access[-_]?key|session[-_]?key)([-_].*)?$/i;
var SECRET_VALUE = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/g,
  /\bsk-[A-Za-z0-9]{16,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g
  // JWT
];
function redactText(input, homeDir) {
  let out = input;
  for (const re of SECRET_VALUE)
    out = out.replace(re, REDACTED);
  if (homeDir && homeDir.length > 1) {
    out = out.split(homeDir).join("~");
  }
  return out;
}
function truncate(input, max = MAX_VALUE_CHARS) {
  if (input.length <= max)
    return input;
  return `${input.slice(0, max)}\u2026 [truncated ${input.length - max} chars]`;
}
function redactArgs(args, homeDir, depth = 0) {
  if (args === null || typeof args !== "object" || Array.isArray(args))
    return {};
  const out = {};
  for (const [key, value] of Object.entries(args)) {
    if (SECRET_KEY.test(key)) {
      out[key] = REDACTED;
      continue;
    }
    out[key] = redactValue(value, homeDir, depth);
  }
  return out;
}
function redactValue(value, homeDir, depth) {
  if (typeof value === "string")
    return truncate(redactText(value, homeDir));
  if (typeof value === "number" || typeof value === "boolean" || value === null)
    return value;
  if (depth >= 3)
    return "[nested]";
  if (Array.isArray(value))
    return value.slice(0, 20).map((v) => redactValue(v, homeDir, depth + 1));
  if (typeof value === "object")
    return redactArgs(value, homeDir, depth + 1);
  return String(value);
}
function sha256(text) {
  return createHash2("sha256").update(text, "utf8").digest("hex");
}
function captureId(seed, existing = []) {
  const taken = new Set(existing);
  const base = `CAP-${sha256(seed).slice(0, 6).toUpperCase()}`;
  if (!taken.has(base))
    return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate))
      return candidate;
  }
}
function buildCaptureCase(opts) {
  const { start, end } = opts.range;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= opts.turns.length) {
    throw new Error(`invalid capture range ${start}..${end} over ${opts.turns.length} turn(s)`);
  }
  if (opts.expectedBehavior.trim() === "") {
    throw new Error("a capture needs a written expected behavior \u2014 it is what makes the case reviewable");
  }
  const checklist = opts.checklist.map((c) => c.trim()).filter(Boolean);
  if (checklist.length === 0) {
    throw new Error("a capture needs at least one checklist item");
  }
  const selected = opts.turns.slice(start, end + 1);
  const turns = selected.map((t) => truncate(redactText(t.user, opts.homeDir)));
  const id = captureId(`${opts.sessionPath}:${start}:${end}:${opts.created}`, opts.existingIds ?? []);
  return {
    capture_schema: CAPTURE_SCHEMA_VERSION,
    id,
    created: opts.created,
    classification: opts.classification,
    turns,
    expected_behavior: truncate(redactText(opts.expectedBehavior, opts.homeDir)),
    checklist: checklist.map((c) => truncate(redactText(c, opts.homeDir), 300)),
    target: opts.target,
    provenance: {
      session_sha256: sha256(opts.sessionPath),
      turn_range: { start, end },
      ...opts.subject ? { subject: opts.subject } : {},
      ...opts.gitCommit ? { git_commit: opts.gitCommit } : {},
      ...opts.gitDirty === void 0 ? {} : { git_dirty: opts.gitDirty }
    },
    status: "pending"
  };
}
function captureToScenario(capture, scenarioId, title) {
  return {
    id: scenarioId,
    title,
    turns: capture.turns,
    checklist: capture.checklist
  };
}
function draftChecklist(expectedBehavior) {
  return expectedBehavior.split(/\n\s*[-*]\s+|\n{2,}|(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.replace(/^[-*]\s+/, "").replace(/\s+/g, " ").trim().replace(/[.]$/, "")).filter((s) => s.length > 3);
}

// packages/core/dist/execution-trace.js
var SKIPPED = /* @__PURE__ */ new Set(["message_update", "tool_execution_update"]);
var MAX_DETAILS_CHARS = 2e3;
function parseTrace(lines, meta) {
  const calls = /* @__PURE__ */ new Map();
  let issueCounter = 0;
  let completionCounter = 0;
  let malformedLines = 0;
  let sawTerminal = false;
  let finalText = "";
  let lastAssistantText = "";
  let cost = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed)
      continue;
    let ev;
    try {
      ev = JSON.parse(trimmed);
    } catch {
      malformedLines++;
      continue;
    }
    const type = ev.type;
    if (typeof type !== "string" || SKIPPED.has(type))
      continue;
    if (type === "tool_execution_start") {
      const id = str(ev.toolCallId);
      if (!id)
        continue;
      calls.set(id, {
        id,
        name: str(ev.toolName) ?? "(unknown)",
        args: redactArgs(ev.args, meta.homeDir),
        issueIndex: issueCounter++,
        completionIndex: -1,
        // filled in on `end`; -1 means it never completed
        isError: false,
        result: { bytes: 0, sha256: sha2562("") }
      });
      continue;
    }
    if (type === "tool_execution_end") {
      const id = str(ev.toolCallId);
      if (!id)
        continue;
      const call = calls.get(id);
      if (!call)
        continue;
      call.completionIndex = completionCounter++;
      call.isError = ev.isError === true;
      call.result = resultMeta(ev.result);
      continue;
    }
    if (type === "message_end") {
      sawTerminal = true;
      const msg = ev.message;
      if (msg?.role !== "assistant")
        continue;
      const text = assistantText(msg);
      if (text) {
        lastAssistantText = text;
        if (msg.stopReason === "stop")
          finalText = text;
      }
      const total = msg.usage?.cost?.total;
      if (typeof total === "number")
        cost = (cost ?? 0) + total;
      continue;
    }
    if (type === "turn_end" || type === "agent_end" || type === "agent_settled") {
      sawTerminal = true;
      continue;
    }
  }
  const trace = {
    trace_version: EXECUTION_TRACE_VERSION,
    pi_version: meta.piVersion,
    subject: meta.subject,
    scenario_id: meta.scenarioId,
    mode: meta.mode,
    rep: meta.rep,
    turn: meta.turn,
    // Fall back to the last assistant text when no message carried `stop` — a
    // truncated or length-capped run still produced an answer, and losing it
    // would silently turn a real reply into an empty transcript.
    final_text: finalText || lastAssistantText,
    tool_calls: [...calls.values()].sort((a, b) => a.issueIndex - b.issueIndex),
    changed_paths: [...meta.changedPaths ?? []].sort(),
    cost_usd: cost
  };
  trace.trace_sha256 = traceSha256(trace);
  return { trace, isComplete: sawTerminal, malformedLines };
}
function assistantText(msg) {
  return (msg.content ?? []).filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n").trim();
}
function resultMeta(result) {
  const body = JSON.stringify(result?.content ?? result ?? null);
  const meta = { bytes: Buffer.byteLength(body, "utf8"), sha256: sha2562(body) };
  const details = result?.details;
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const encoded = JSON.stringify(details);
    if (encoded.length <= MAX_DETAILS_CHARS)
      meta.details = details;
  }
  return meta;
}
function str(v) {
  return typeof v === "string" && v.length > 0 ? v : void 0;
}
function sha2562(text) {
  return createHash3("sha256").update(text, "utf8").digest("hex");
}
function traceSha256(trace) {
  const { trace_sha256: _omit, ...rest } = trace;
  return sha2562(stableStringify(rest));
}
function stableStringify(value) {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "null";
  if (Array.isArray(value))
    return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value).filter(([, v]) => v !== void 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}
function serializeTrace(trace) {
  return `${JSON.stringify(trace)}
`;
}
function mergeTraces(traces) {
  if (traces.length === 0)
    return null;
  if (traces.length === 1) {
    const only = traces[0];
    return only.trace_sha256 ? only : { ...only, trace_sha256: traceSha256(only) };
  }
  const calls = [];
  const changed = /* @__PURE__ */ new Set();
  let cost = null;
  for (const t of traces) {
    for (const c of [...t.tool_calls].sort((a, b) => a.issueIndex - b.issueIndex)) {
      calls.push({ ...c, issueIndex: calls.length, completionIndex: c.completionIndex < 0 ? -1 : calls.length });
    }
    for (const p of t.changed_paths)
      changed.add(p);
    if (t.cost_usd !== null)
      cost = (cost ?? 0) + t.cost_usd;
  }
  const last = traces[traces.length - 1];
  const merged = {
    ...last,
    // The scenario's answer is its LAST turn's answer, matching how the
    // transcript reads and how the judge is asked to grade it.
    final_text: last.final_text,
    tool_calls: calls,
    changed_paths: [...changed].sort(),
    cost_usd: cost
  };
  merged.trace_sha256 = traceSha256(merged);
  return merged;
}

// packages/core/dist/scheduler.js
async function runPool(tasks, concurrency) {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= tasks.length)
        return;
      results[i] = await tasks[i]();
    }
  }
  const workerCount = Math.min(limit, tasks.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

// packages/core/dist/reps.js
function aggregateObjective(outcomes) {
  const present = outcomes.map((o) => o.objective).filter((o) => o !== void 0);
  if (present.length === 0)
    return void 0;
  const errored = present.find((o) => o.status === "ERROR");
  if (errored)
    return errored;
  const failed = present.find((o) => o.status === "FAIL");
  if (failed)
    return failed;
  return present[0];
}
function aggregateReps(outcomes, threshold) {
  const reps2 = outcomes.length;
  const clean = outcomes.filter((o) => !o.suspect);
  const passes = clean.filter((o) => o.verdict === "PASS").length;
  if (clean.length * 2 < reps2) {
    return { verdict: "FAIL", reason: `${reps2 - clean.length}/${reps2} reps misfired \u2014 re-judge`, passes, reps: reps2, clean: clean.length, flakiness: 0, suspect: true };
  }
  const errored = clean.filter((o) => o.verdict === "ERROR").length;
  if (clean.length > 0 && errored === clean.length) {
    return { verdict: "ERROR", reason: `${errored}/${reps2} reps errored`, passes: 0, reps: reps2, clean: clean.length, flakiness: 0, suspect: false };
  }
  const passRate = passes / clean.length;
  const verdict = passRate >= threshold ? "PASS" : "FAIL";
  const flakiness = 1 - Math.abs(2 * passRate - 1);
  const reason = reps2 === 1 ? outcomes[0].reason : `${passes}/${clean.length} reps passed (flaky ${flakiness.toFixed(2)})`;
  return { verdict, reason, passes, reps: reps2, clean: clean.length, flakiness, suspect: false };
}
function outcomesToResult(id, outcomes, repCount, threshold) {
  const objective = aggregateObjective(outcomes);
  const objectiveField = objective ? { objective } : {};
  if (repCount === 1) {
    const o = outcomes[0];
    return { id, judge_verdict: o.verdict, judge_reason: o.reason, suspect: o.suspect, override: null, note: "", ...objectiveField };
  }
  const agg = aggregateReps(outcomes, threshold);
  return {
    id,
    judge_verdict: agg.verdict,
    judge_reason: agg.reason,
    suspect: agg.suspect,
    reps: agg.reps,
    passes: agg.passes,
    clean: agg.clean,
    flakiness: agg.flakiness,
    pass_threshold: threshold,
    override: null,
    note: "",
    ...objectiveField
  };
}

// packages/core/dist/regrade.js
import { readFileSync as readFileSync6, writeFileSync as writeFileSync2, existsSync as existsSync7 } from "node:fs";
import { join as join9 } from "node:path";
function refreshRubricHashes(recorded, spec, judgedIds) {
  if (!recorded)
    return void 0;
  const next = { ...recorded };
  const specById = new Map(spec.scenarios.map((s) => [s.id, s]));
  for (const id of judgedIds) {
    const s = specById.get(id);
    if (s && RUBRIC_PREFIX + id in next)
      next[RUBRIC_PREFIX + id] = rubricDigest(s);
  }
  if (PERSONA_KEY in next)
    next[PERSONA_KEY] = personaDigest(spec.judge_persona);
  return next;
}
async function judgeOneRep(opts) {
  const { runDir, spec, scenario, transcript, adapter, judge, specDir, mode, rep, now } = opts;
  const prompt = buildJudgePrompt({ skill: spec.skill, persona: spec.judge_persona, scenario, transcript });
  const g = await judgeInWorkspace(adapter, judge, prompt, specDir);
  writeFileSync2(judgeRawPath(runDir, scenario.id, mode, rep), g.raw, "utf8");
  const repField = rep === void 0 ? {} : { rep };
  appendJournal(runDir, { event: "judge-verdict", ts: now(), id: scenario.id, verdict: g.verdict, reason: g.reason, suspect: g.suspect, ...repField });
  if (g.suspect)
    appendJournal(runDir, { event: "misfire-flag", ts: now(), id: scenario.id, reason: g.reason, ...repField });
  return { verdict: g.verdict, reason: g.reason, suspect: g.suspect };
}
async function regradeScenario(opts) {
  const now = opts.now ?? (() => (/* @__PURE__ */ new Date()).toISOString());
  const mode = opts.mode ?? "green";
  const files = findTranscriptFiles(opts.runDir, opts.scenario.id, mode);
  if (files.length === 0)
    throw new Error(`no ${mode} transcripts for ${opts.scenario.id} in ${opts.runDir}`);
  const repCount = files.length;
  const outcomes = [];
  for (const file of files) {
    const rep = repIndexOf(file) ?? void 0;
    const transcript = readFileSync6(join9(opts.runDir, file), "utf8");
    outcomes.push(await judgeOneRep({
      runDir: opts.runDir,
      spec: opts.spec,
      scenario: opts.scenario,
      transcript,
      adapter: opts.adapter,
      judge: opts.judge,
      specDir: opts.specDir,
      mode,
      rep,
      now
    }));
  }
  return outcomesToResult(opts.scenario.id, outcomes, repCount, opts.threshold);
}
async function regradeRun(opts) {
  const { runDir, spec, adapter, judge, specDir } = opts;
  const now = opts.now ?? (() => (/* @__PURE__ */ new Date()).toISOString());
  const prev = existsSync7(join9(runDir, "results.yaml")) ? readResults(runDir) : null;
  const overrides = new Map((prev?.scenarios ?? []).map((s) => [s.id, { override: s.override, note: s.note, objective: s.objective }]));
  const mode = prev?.mode ?? "green";
  const specById = new Map(spec.scenarios.map((s) => [s.id, s]));
  const recorded = prev?.scenarios ?? spec.scenarios.map((s) => ({ id: s.id }));
  let targets = recorded.map((s) => s.id);
  if (opts.onlySuspect) {
    if (!prev)
      throw new Error(`--suspect-only needs a prior results.yaml in ${runDir}`);
    targets = prev.scenarios.filter((s) => s.suspect || s.judge_verdict === "JUDGE-AMBIGUOUS").map((s) => s.id);
    if (targets.length === 0) {
      return prev;
    }
  }
  const missing = targets.filter((id) => !specById.has(id) || findTranscriptFiles(runDir, id, mode).length === 0);
  if (missing.length === targets.length) {
    throw new Error(`no ${mode} transcripts in ${runDir} \u2014 nothing to re-grade`);
  }
  if (missing.length > 0) {
    throw new Error(`cannot re-grade ${missing.join(", ")} in ${runDir} (transcript missing or scenario no longer in the spec) \u2014 re-run instead of grading`);
  }
  const targetSet = new Set(targets);
  const scenarioResults = [];
  for (const rec of recorded) {
    const id = rec.id;
    if (!targetSet.has(id)) {
      scenarioResults.push(rec);
      continue;
    }
    const scenario = specById.get(id);
    const prevScenario = prev?.scenarios.find((s) => s.id === id);
    const threshold = effectiveThreshold(prevScenario, scenario);
    const rr = await regradeScenario({
      runDir,
      spec,
      scenario,
      adapter,
      judge,
      specDir,
      threshold,
      mode,
      now
    });
    const carry = overrides.get(id);
    scenarioResults.push({
      ...rr,
      override: carry?.override ?? null,
      note: carry?.note ?? "",
      ...carry?.objective ? { objective: carry.objective } : {}
    });
  }
  const ctx = scoreContextFor({ mode, partial: prev?.partial }, spec);
  const results = writeResults(runDir, {
    skill: spec.skill,
    harness: prev?.harness ?? "pi",
    // The harness CLI that produced these transcripts, carried verbatim: a re-grade
    // re-asks the judge, it does not re-deliver the skill, so stamping today's pi
    // here would credit the old transcripts to a version that never ran them.
    harness_cli_version: prev?.harness_cli_version,
    delivery_canary: prev?.delivery_canary,
    model: prev?.model ?? "unknown",
    judge: { provider: judge.provider, model: judge.model },
    timestamp: prev?.timestamp ?? now(),
    label: prev?.label ?? null,
    mode,
    // A re-grade judges the SAVED transcripts, which were produced by the OLD text —
    // the recorded **stimulus** hashes stay, keeping an honestly-stale run honestly
    // stale. The rubric hashes are a different matter: this re-grade applied the
    // CURRENT checklist and persona to those transcripts, so "the verdicts reflect
    // today's rubric" is now a true statement about the record, and the hashes should
    // say so. Doctrine narrowed 0.4.0, from "recorded hashes stay" to "recorded
    // *stimulus* hashes stay" — see refreshRubricHashes.
    partial: prev?.partial,
    source_hashes: refreshRubricHashes(prev?.source_hashes, spec, targets),
    scenarios: scenarioResults
  }, ctx);
  const g = results.effective_grade;
  if (ctx) {
    appendJournal(runDir, {
      event: "score",
      ts: now(),
      passed: g.passed,
      total: g.total,
      pct: g.pct,
      letter: g.letter,
      ship: g.ship,
      note: g.note
    });
  }
  return results;
}

// packages/core/dist/canary.js
import { readFileSync as readFileSync7 } from "node:fs";
import { join as join10 } from "node:path";
function skillBody(text) {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(text);
  return m ? text.slice(m[0].length) : text;
}
function deliveryAnchor(skillMd) {
  const headings = [...skillBody(skillMd).matchAll(/^##[ \t]+(.+?)[ \t]*$/gm)].map((m) => m[1].trim());
  if (headings.length === 0)
    return null;
  return headings.reduce((a, b) => b.length > a.length ? b : a);
}
function normalize(s) {
  return s.toLowerCase().replace(/[`*_]/g, "").replace(/\s+/g, " ").trim();
}
function canaryPrompt(skillName, anchor) {
  return `Answer from the instructions you have loaded \u2014 do not perform any task.

List every level-2 markdown heading (lines starting with "## ") in the instructions of the skill named "${skillName}", verbatim, one per line, with no other text.
If you have no such instructions available, reply exactly: NOT_AVAILABLE

(The heading text is what matters; keep it exact.)`;
}
function assistantReply(transcript) {
  const parts = transcript.split(/^<<< ASSISTANT:\s*$/m);
  return (parts.length > 1 ? parts[parts.length - 1] : transcript).trim();
}
async function runDeliveryCanary(opts) {
  const skillMd = readFileSync7(join10(opts.skillDir, "SKILL.md"), "utf8");
  const anchor = deliveryAnchor(skillMd);
  if (!anchor) {
    return {
      status: "skipped",
      anchor: null,
      detail: `${opts.skillName}/SKILL.md has no \`## \` heading to probe for \u2014 nothing a reply could prove`
    };
  }
  const transcript = await opts.adapter.run({
    skillDir: opts.skillDir,
    model: opts.model,
    mode: "green",
    turns: [canaryPrompt(opts.skillName, anchor)],
    cwd: opts.cwd
  });
  const ok = normalize(transcript).includes(normalize(anchor));
  return {
    status: ok ? "pass" : "fail",
    anchor,
    // The reply, not the transcript: the transcript opens with our own prompt, and a
    // failure report whose first 400 characters are the question is useless.
    detail: ok ? "" : assistantReply(transcript).slice(0, 400)
  };
}
function canaryFailure(skillName, result, cliVersion) {
  return `delivery canary FAILED for ${skillName}: the model could not quote its own skill instructions (looked for the heading \`${result.anchor}\`).
  The skill is not reaching the model, so every scenario in this run would measure a naked model and score like a result. Nothing has been spent beyond this one probe.
  harness CLI: ${cliVersion ?? "unknown"}. On pi \u2265 0.83.0 \`--skill\` is progressive disclosure (description in context, body on demand) and a nonexistent path is accepted silently.
  Fix: re-run with \`--mode force\` (SKILL.md as the system prompt \u2014 delivery no version has made conditional), or check that the skill dir is the one you meant.
  What the model said instead: ${result.detail || "(nothing)"}`;
}

// packages/core/dist/stability.js
import { join as join12 } from "node:path";

// packages/core/dist/trends.js
import { existsSync as existsSync8, readdirSync as readdirSync6, statSync as statSync4 } from "node:fs";
import { join as join11 } from "node:path";
function isDir2(p) {
  try {
    return statSync4(p).isDirectory();
  } catch {
    return false;
  }
}
function collectScoredRuns(skillDir) {
  const resultsRoot = join11(skillDir, "tests", "results");
  if (!existsSync8(resultsRoot))
    return [];
  const groups = [];
  const tags = readdirSync6(resultsRoot).filter((n) => isDir2(join11(resultsRoot, n))).sort();
  for (const tag of tags) {
    const tagDir = join11(resultsRoot, tag);
    const runDirs = readdirSync6(tagDir).map((n) => join11(tagDir, n)).filter((p) => isDir2(p) && existsSync8(join11(p, "results.yaml"))).sort();
    if (runDirs.length === 0)
      continue;
    const byMode = /* @__PURE__ */ new Map();
    let skipped = 0;
    for (const rd of runDirs) {
      let r;
      try {
        r = readResults(rd);
      } catch (e) {
        console.warn(`skill-harness: skipping unreadable run ${rd}: ${e instanceof Error ? e.message : e}`);
        skipped++;
        continue;
      }
      if (!isScoredMode(r.mode))
        continue;
      (byMode.get(r.mode) ?? byMode.set(r.mode, []).get(r.mode)).push(r);
    }
    for (const [mode, runs] of byMode) {
      groups.push({ tag, mode, model: runs[runs.length - 1].model, runs, skipped });
    }
  }
  return groups;
}
function collectTrends(skillDir, limit = 20) {
  const specPath = join11(skillDir, "tests", "specification.yaml");
  const spec = loadSpec(specPath);
  const scenarios = spec.scenarios.map((s) => ({ id: s.id, title: s.title, critical: s.critical }));
  const models = [];
  for (const group of collectScoredRuns(skillDir)) {
    const truncated = group.runs.length > limit;
    const kept = group.runs.slice(-limit);
    const runs = [];
    for (const r of kept) {
      const verdicts = effectiveVerdicts(r.scenarios);
      const cells = {};
      r.scenarios.forEach((s, i) => {
        cells[s.id] = { verdict: verdicts[i].verdict, suspect: verdicts[i].suspect ?? false, flakiness: s.flakiness };
      });
      runs.push({ timestamp: r.timestamp, label: r.label, grade: r.effective_grade, cells });
    }
    models.push({ model: group.model, tag: group.tag, mode: group.mode, runs, truncated, skipped: group.skipped });
  }
  return { skill: spec.skill, scenarios, models };
}

// packages/core/dist/stability.js
var DEFAULT_WINDOW = 5;
function conclusive2(v) {
  return !v.suspect && v.verdict !== "ERROR" && v.verdict !== "JUDGE-AMBIGUOUS";
}
function pointFor(r, s, verdict) {
  const reps2 = s.reps ?? 1;
  return {
    timestamp: r.timestamp,
    label: r.label,
    verdict,
    overridden: s.override != null,
    partial: Boolean(r.partial),
    reps: reps2,
    unanimous: reps2 > 1 && s.flakiness === 0
  };
}
function shapeOf(s) {
  const reps2 = s.reps ?? 1;
  return JSON.stringify([reps2, reps2 > 1 ? s.pass_threshold ?? null : null]);
}
function compareSources(a, b, keys) {
  if (!a || !b)
    return { shared: 0, changed: [] };
  let shared = 0;
  const changed = [];
  for (const key of keys) {
    const va = a[key];
    const vb = b[key];
    if (va === void 0 || vb === void 0)
      continue;
    shared++;
    if (va !== vb)
      changed.push(describeSourceKey(key));
  }
  return { shared, changed };
}
function stabilityForScenario(group, scenario, window) {
  const relevant = group.runs.filter((r) => r.scenarios.some((s) => s.id === scenario.id));
  const kept = relevant.slice(-window);
  const keys = [...scenarioSourceKeys(scenario), PERSONA_KEY];
  const points = [];
  const raw = [];
  for (const r of kept) {
    const i = r.scenarios.findIndex((s2) => s2.id === scenario.id);
    const s = r.scenarios[i];
    const eff = effectiveVerdicts(r.scenarios)[i];
    points.push(pointFor(r, s, eff.verdict));
    raw.push({ r, s, ok: conclusive2(eff) });
  }
  const pairs = [];
  for (let i = 1; i < raw.length; i++) {
    const prev = raw[i - 1];
    const cur = raw[i];
    const from = points[i - 1];
    const to = points[i];
    const skillChanged = prev.r.source_hashes?.[SKILL_KEY] !== void 0 && cur.r.source_hashes?.[SKILL_KEY] !== void 0 && prev.r.source_hashes[SKILL_KEY] !== cur.r.source_hashes[SKILL_KEY];
    const base = { from, to, flipped: false, skillChanged, changedSources: [], unanimousFlip: false };
    if (!prev.ok || !cur.ok) {
      pairs.push({ ...base, status: "inconclusive" });
      continue;
    }
    if (shapeOf(prev.s) !== shapeOf(cur.s)) {
      pairs.push({ ...base, status: "aggregation" });
      continue;
    }
    const src = compareSources(prev.r.source_hashes, cur.r.source_hashes, keys);
    if (src.shared === 0) {
      pairs.push({ ...base, status: "unverified" });
      continue;
    }
    if (src.changed.length > 0) {
      pairs.push({ ...base, status: "sources", changedSources: src.changed });
      continue;
    }
    const flipped2 = from.verdict !== to.verdict;
    pairs.push({
      ...base,
      status: "compared",
      flipped: flipped2,
      unanimousFlip: flipped2 && from.unanimous && to.unanimous
    });
  }
  const compared = pairs.filter((p) => p.status === "compared").length;
  const flipped = pairs.filter((p) => p.status === "compared" && p.flipped);
  return {
    id: scenario.id,
    title: scenario.title,
    critical: scenario.critical,
    tag: group.tag,
    mode: group.mode,
    model: group.model,
    points,
    pairs,
    compared,
    flips: flipped.length,
    flipsAcrossSkillEdit: flipped.filter((p) => p.skillChanged).length,
    unanimousFlips: flipped.filter((p) => p.unanimousFlip).length,
    volatility: compared === 0 ? null : flipped.length / compared,
    // "unmeasured" is a third state on purpose: a scenario with one run, or with no
    // comparable pair, has NOT been shown to be stable. Collapsing it into "stable"
    // would turn absence of evidence into evidence — the same conflation lift.ts
    // refuses when it reports "no red baseline" instead of a zero.
    state: compared === 0 ? "unmeasured" : flipped.length > 0 ? "boundary" : "stable"
  };
}
function stabilityFrom(groups, spec, opts = {}) {
  const window = Math.max(2, opts.window ?? DEFAULT_WINDOW);
  const out = [];
  for (const group of groups) {
    for (const scenario of spec.scenarios) {
      out.push(stabilityForScenario(group, scenario, window));
    }
  }
  return out;
}
function collectStability(skillDir, opts = {}) {
  const spec = loadSpec(join12(skillDir, "tests", "specification.yaml"));
  return stabilityFrom(collectScoredRuns(skillDir), spec, opts);
}
function boundaryCells(all) {
  return all.filter((s) => s.state === "boundary");
}
function verdictPath(s) {
  const label = (p) => `${p.verdict}${p.unanimous ? "!" : ""}${p.overridden ? "(override)" : ""}`;
  let out = s.points.length > 0 ? label(s.points[0]) : "";
  s.pairs.forEach((pair, i) => {
    out += `${pair.status === "compared" ? "\u2192" : "\u22EF"}${label(s.points[i + 1])}`;
  });
  return out;
}
function stabilityNote(s) {
  if (s.state === "boundary") {
    const parts = [
      `${s.id} flipped its verdict in ${s.flips} of ${s.compared} comparable run-to-run step(s) (${verdictPath(s)})`
    ];
    if (s.unanimousFlips > 0) {
      parts.push(`${s.unanimousFlips === s.flips ? "each flip was" : `${s.unanimousFlips} flip(s) were`} between runs that were INTERNALLY UNANIMOUS (flakiness 0.00) \u2014 within-run reps cannot see this`);
    }
    if (s.flipsAcrossSkillEdit === s.flips && s.flips > 0) {
      parts.push(`SKILL.md changed across ${s.flips === 1 ? "that step" : "those steps"}, while this scenario's own stimulus and rubric did not \u2014 so it is either a side effect of that edit or a boundary cell, and the record cannot say which`);
    } else if (s.flipsAcrossSkillEdit > 0) {
      parts.push(`${s.flipsAcrossSkillEdit} of them across a SKILL.md edit`);
    } else {
      parts.push(`on unchanged skill text \u2014 treat a single run of this cell as one draw, not a measurement`);
    }
    return parts.join("; ");
  }
  if (s.state === "stable") {
    return `${s.id} held its verdict across ${s.compared} comparable run-to-run step(s) (${verdictPath(s)})`;
  }
  const why = /* @__PURE__ */ new Map();
  for (const p of s.pairs)
    if (p.status !== "compared")
      why.set(p.status, (why.get(p.status) ?? 0) + 1);
  const reasons = [...why.entries()].map(([status, n]) => `${n} ${REJECTION[status]}`);
  const changed = [...new Set(s.pairs.flatMap((p) => p.changedSources))];
  const detail = changed.length > 0 ? ` (${changed.join(", ")} changed \u2014 an edit, not a flip)` : "";
  return s.points.length < 2 ? `${s.id} has ${s.points.length} run in this mode \u2014 no run-over-run comparison exists yet` : `${s.id} has no comparable run-to-run step: ${reasons.join(", ")}${detail}`;
}
var REJECTION = {
  compared: "compared",
  inconclusive: "step(s) with an ERROR or unresolved misfire",
  aggregation: "step(s) aggregated differently (reps or pass threshold)",
  sources: "step(s) where the scenario's own sources changed",
  unverified: "step(s) whose recorded hashes cannot be compared"
};

// packages/core/dist/run.js
async function runSkillModel(opts) {
  const { spec, skillDir, adapter, model, judge, mode, timestamp } = opts;
  const log = opts.onProgress ?? (() => {
  });
  const now = opts.now ?? (() => (/* @__PURE__ */ new Date()).toISOString());
  let scenarios = spec.scenarios;
  const partial = Boolean(opts.only && opts.only.length > 0);
  if (partial) {
    const known = new Set(spec.scenarios.map((s) => s.id));
    const unknown = opts.only.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new Error(`--only names unknown scenario id(s) ${unknown.join(", ")} \u2014 spec has: ${[...known].join(", ")}`);
    }
    const wanted = new Set(opts.only);
    scenarios = spec.scenarios.filter((s) => wanted.has(s.id));
    log(`  --only ${opts.only.join(",")} \u2014 partial run, will not be ship-graded`);
  }
  if (judgeResemblesSubject(judge, model)) {
    log(`  \u26A0 judge (${judge.provider}:${judge.model}) resembles the model under test (${model.provider}:${model.model}) \u2014 verdicts may be inflated. Use a distinct judge.`);
  }
  const runDir = runDirFor(skillDir, adapter.name, model, timestamp);
  mkdirSync3(runDir, { recursive: true });
  ensureResultsGitignore(dirname(dirname(runDir)));
  const harnessCliVersion = await adapter.version?.() ?? null;
  appendJournal(runDir, {
    event: "run-started",
    ts: now(),
    skill: spec.skill,
    harness: adapter.name,
    model: opts.modelToken,
    harness_cli_version: harnessCliVersion,
    judge: { provider: judge.provider, model: judge.model },
    mode,
    label: opts.label ?? null
  });
  let canaryStatus = null;
  if (opts.canary && mode !== "green") {
    log(`  --canary ignored in mode=${mode} \u2014 ${mode === "force" ? "the system prompt delivers the skill unconditionally" : "a baseline delivers no skill by design"}`);
  }
  if (opts.canary && mode === "green") {
    const probeCwd = createWorkspace("none", { specDir: dirname(opts.specPath) });
    let canary;
    try {
      canary = await runDeliveryCanary({
        adapter,
        model,
        skillDir,
        skillName: spec.skill,
        cwd: probeCwd.cwd
      });
    } finally {
      probeCwd.cleanup();
    }
    appendJournal(runDir, {
      event: "delivery-canary",
      ts: now(),
      status: canary.status,
      anchor: canary.anchor,
      detail: canary.detail
    });
    if (canary.status === "fail")
      throw new Error(canaryFailure(spec.skill, canary, harnessCliVersion));
    if (canary.status === "skipped")
      log(`  \u26A0 delivery canary skipped \u2014 ${canary.detail}`);
    else {
      canaryStatus = "pass";
      log(`  \u2713 delivery canary \u2014 the model quoted its skill instructions back (\`${canary.anchor}\`)`);
    }
  }
  const repCounts = scenarios.map((s) => s.reps ?? opts.reps ?? 1);
  const owners = [];
  const tasks = [];
  scenarios.forEach((scenario, si) => {
    for (let k = 0; k < repCounts[si]; k++) {
      const rep = k;
      const total = repCounts[si];
      owners.push(si);
      tasks.push(() => runRep(scenario, rep, total, { ...opts, runDir, now, log }));
    }
  });
  const flat = await runPool(tasks, opts.concurrency ?? 1);
  const grouped = scenarios.map(() => []);
  flat.forEach((outcome, i) => grouped[owners[i]].push(outcome));
  const scenarioResults = scenarios.map((scenario, si) => {
    const threshold = scenario.passThreshold ?? opts.passThreshold ?? 0.5;
    return outcomesToResult(scenario.id, grouped[si], repCounts[si], threshold);
  });
  const ctx = scoreContextFor({ mode, partial }, spec);
  const results = writeResults(runDir, {
    skill: spec.skill,
    harness: adapter.name,
    harness_cli_version: harnessCliVersion ?? void 0,
    delivery_canary: canaryStatus ?? void 0,
    model: opts.modelToken,
    judge: { provider: judge.provider, model: judge.model },
    timestamp,
    label: opts.label ?? null,
    mode,
    ...partial ? { partial: true } : {},
    // Only the scenarios this run actually measured: a --only run must not claim
    // coverage of scenarios it skipped.
    source_hashes: sourceHashes({ skillDir, specDir: dirname(opts.specPath), scenarios, judgePersona: spec.judge_persona }),
    scenarios: scenarioResults
  }, ctx);
  if (ctx) {
    const g = results.effective_grade;
    appendJournal(runDir, { event: "score", ts: now(), passed: g.passed, total: g.total, pct: g.pct, letter: g.letter, ship: g.ship, note: g.note });
  }
  return { runDir, results };
}
function hasEmptyAssistantTurn(transcript) {
  const sections = transcript.split(/^<<< ASSISTANT:\s*$/m).slice(1);
  if (sections.length === 0)
    return false;
  return sections.some((sec) => {
    const body = sec.split(/^(?:>>> |=== SEEDED GATES ===|\[pi exited )/m)[0];
    return body.trim() === "";
  });
}
async function runRep(scenario, rep, repCount, ctx) {
  const { spec, judge, mode, runDir, now, log } = ctx;
  const repField = repCount > 1 ? { rep } : {};
  if (rep === 0) {
    log(`  ${scenario.id} (${scenario.title})${repCount > 1 ? ` \xD7${repCount}` : ""} \u2026`);
    appendJournal(runDir, { event: "scenario-started", ts: now(), id: scenario.id, title: scenario.title });
  }
  let ws = null;
  let transcript = "";
  let gatePrefix = null;
  let stagedDiff = null;
  try {
    try {
      ws = createWorkspace(scenario.workspace, { specDir: dirname(ctx.specPath), remote: scenario.remote });
    } catch (e) {
      gatePrefix = e instanceof Error ? e.message : String(e);
      transcript = `[workspace setup failed] ${gatePrefix}`;
    }
    let noResponse = false;
    let traces = [];
    if (ws) {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) {
          appendJournal(runDir, { event: "empty-response-retry", ts: now(), id: scenario.id, attempt, ...repField });
          log(`  ${scenario.id}${repCount > 1 ? `#${rep}` : ""} empty response \u2014 retrying once`);
          ws.cleanup();
          ws = createWorkspace(scenario.workspace, { specDir: dirname(ctx.specPath), remote: scenario.remote });
        }
        if (scenario.mode === "seeded") {
          const r = await runSeeded(scenario, {
            skillDir: ctx.skillDir,
            adapter: ctx.adapter,
            model: ctx.model,
            mode,
            cwd: ws.cwd,
            specDir: dirname(ctx.specPath),
            // assert.post_test resolves like a fixture
            trace: scenario.traceAssert ? { scenarioId: scenario.id, rep } : void 0
          });
          transcript = r.transcript;
          gatePrefix = r.gateFailure;
          stagedDiff = r.diff;
          traces = r.traces;
        } else {
          const req = {
            skillDir: ctx.skillDir,
            model: ctx.model,
            mode,
            turns: scenario.turns,
            cwd: ws.cwd,
            // resolved like fixtures: relative to the spec's dir
            systemPromptFile: scenario.systemPromptFile ? resolve5(dirname(ctx.specPath), scenario.systemPromptFile) : void 0,
            // Absolute before it reaches a child process running in a neutral cwd.
            extensions: scenario.extensions?.map((e) => resolve5(dirname(ctx.specPath), e))
          };
          if (scenario.traceAssert) {
            if (!ctx.adapter.runStructured) {
              throw new Error(`scenario \`${scenario.id}\` declares \`assert.trace\`, but the \`${ctx.adapter.name}\` adapter cannot produce execution traces \u2014 the gate would have no evidence to read.`);
            }
            const structured = await ctx.adapter.runStructured({ ...req, scenarioId: scenario.id, rep });
            transcript = structured.transcript;
            traces = structured.traces;
          } else {
            transcript = await ctx.adapter.run(req);
          }
        }
        noResponse = hasEmptyAssistantTurn(transcript);
        if (!noResponse)
          break;
      }
    }
    const repSuffix = repCount > 1 ? rep : void 0;
    writeFileSync3(transcriptPath(runDir, scenario.id, mode, repSuffix), transcript, "utf8");
    if (scenario.mode === "seeded") {
      if (stagedDiff !== null) {
        writeFileSync3(diffPath(runDir, scenario.id, mode, repSuffix), stagedDiff, "utf8");
      }
      appendJournal(runDir, { event: "gate-result", ts: now(), id: scenario.id, ok: !gatePrefix, detail: gatePrefix ?? "", ...repField });
    }
    let objective;
    if (scenario.traceAssert) {
      if (traces.length > 0) {
        writeFileSync3(tracePath(runDir, scenario.id, mode, repSuffix), traces.map(serializeTrace).join(""), "utf8");
      }
      const merged = mergeTraces(traces);
      if (merged === null) {
        gatePrefix = "objective: no execution trace was produced \u2014 cannot evaluate assert.trace";
        objective = { status: "ERROR", assertions: [] };
      } else {
        const gate = evaluateTraceGates(scenario.traceAssert, merged);
        objective = {
          status: gate.status,
          trace_version: merged.trace_version,
          trace_sha256: merged.trace_sha256,
          assertions: gate.assertions
        };
        if (gate.status === "FAIL") {
          gatePrefix = `objective: ${gate.assertions.filter((x) => x.status === "FAIL").map((x) => x.detail).join("; ")}`;
        }
      }
      appendJournal(runDir, {
        event: "objective-result",
        ts: now(),
        id: scenario.id,
        ok: objective.status === "PASS",
        detail: gatePrefix ?? "",
        ...repField
      });
    }
    let verdict;
    let reason;
    let suspect = false;
    if (objective?.status === "ERROR") {
      verdict = "ERROR";
      reason = gatePrefix ?? "objective evidence missing";
      appendJournal(runDir, { event: "judge-verdict", ts: now(), id: scenario.id, verdict, reason, suspect, ...repField });
    } else if (noResponse) {
      verdict = "ERROR";
      reason = "model produced no response after a retry (harness timeout?) \u2014 infra, not skill behavior";
      appendJournal(runDir, { event: "judge-verdict", ts: now(), id: scenario.id, verdict, reason, suspect, ...repField });
    } else if (gatePrefix) {
      verdict = "FAIL";
      reason = gatePrefix;
      appendJournal(runDir, { event: "judge-verdict", ts: now(), id: scenario.id, verdict, reason, suspect, ...repField });
    } else {
      const o = await judgeOneRep({
        runDir,
        spec,
        scenario,
        transcript,
        adapter: ctx.adapter,
        judge,
        specDir: dirname(ctx.specPath),
        mode,
        rep: repCount > 1 ? rep : void 0,
        now
      });
      verdict = o.verdict;
      reason = o.reason;
      suspect = o.suspect;
    }
    log(`  \u2192 ${scenario.id}${repCount > 1 ? `#${rep}` : ""} ${verdict}${reason ? `: ${reason}` : ""}${suspect ? "  \u26A0 suspect" : ""}`);
    return { verdict, reason, suspect, objective };
  } finally {
    ws?.cleanup();
  }
}

// packages/core/dist/rescore.js
import { existsSync as existsSync9 } from "node:fs";
import { join as join13 } from "node:path";

// packages/core/dist/report.js
import { existsSync as existsSync10, readdirSync as readdirSync7, statSync as statSync5 } from "node:fs";
import { join as join14 } from "node:path";
function latestRunDir(tagDir) {
  if (!statSync5(tagDir).isDirectory())
    return null;
  const runs = readdirSync7(tagDir).map((n) => join14(tagDir, n)).filter((p) => statSync5(p).isDirectory() && existsSync10(join14(p, "results.yaml"))).sort();
  return runs.length ? runs[runs.length - 1] : null;
}
function collectReport(skillDir) {
  const specPath = join14(skillDir, "tests", "specification.yaml");
  const spec = loadSpec(specPath);
  const scenarios = spec.scenarios.map((s) => ({ id: s.id, title: s.title, critical: s.critical }));
  const resultsRoot = join14(skillDir, "tests", "results");
  const liftByTag = new Map(collectLift(skillDir).map((l) => [l.tag, l]));
  const boundaryByCell = new Map(boundaryCells(collectStability(skillDir)).map((c) => [`${c.tag}\0${c.mode}\0${c.id}`, c]));
  const columns = [];
  if (existsSync10(resultsRoot)) {
    const tags = readdirSync7(resultsRoot).map((n) => join14(resultsRoot, n)).filter((p) => statSync5(p).isDirectory()).sort();
    for (const tagDir of tags) {
      const runDir = latestRunDir(tagDir);
      if (!runDir)
        continue;
      const r = readResults(runDir);
      const tagName = tagDir.split("/").pop();
      const cells = {};
      for (const s of r.scenarios) {
        const boundary = boundaryByCell.get(`${tagName}\0${r.mode}\0${s.id}`);
        cells[s.id] = {
          ...boundary ? {
            stability: {
              flips: boundary.flips,
              compared: boundary.compared,
              volatility: boundary.volatility,
              note: stabilityNote(boundary)
            }
          } : {},
          // Same optional-spread shape as `stability`: absent means "not declared"
          // / "single judge", and the UI must not render either as a clean result.
          ...s.objective ? {
            objective: {
              status: s.objective.status,
              detail: s.objective.assertions.length ? s.objective.assertions.map((a) => `${a.status} ${a.detail}`).join(" \xB7 ") : "no assertion evidence recorded"
            }
          } : {},
          ...s.adjudication ? {
            adjudication: {
              state: s.adjudication.state,
              trigger: s.adjudication.trigger,
              count: s.adjudication.judgments.length,
              detail: s.adjudication.judgments.map((j) => `#${j.ordinal} ${j.judge.provider}:${j.judge.model} ${j.verdict}${j.suspect ? " (misfired, not counted)" : ""}`).join(" \xB7 ")
            }
          } : {},
          judge_verdict: s.judge_verdict,
          judge_reason: s.judge_reason,
          suspect: s.suspect ?? false,
          // suspect defaults false for older results that predate the field
          reps: s.reps,
          passes: s.passes,
          clean: s.clean,
          flakiness: s.flakiness,
          override: s.override,
          note: s.note
        };
      }
      const tag = tagName;
      const tagLift = liftByTag.get(tag);
      const lift = tagLift && tagLift.greenTimestamp === r.timestamp ? tagLift : void 0;
      columns.push({
        index: columns.length,
        label: r.model,
        tag,
        runDir,
        timestamp: r.timestamp,
        mode: r.mode,
        grade: r.effective_grade,
        judge: r.judge,
        cells,
        ...lift ? { lift, liftHeadline: liftHeadline(lift) } : {}
      });
    }
  }
  return { skill: spec.skill, shipBar: spec.ship_bar, critical: spec.critical, scenarios, columns };
}
function publicView(data) {
  return {
    skill: data.skill,
    shipBar: data.shipBar,
    critical: data.critical,
    scenarios: data.scenarios,
    columns: data.columns.map((c) => ({
      index: c.index,
      label: c.label,
      tag: c.tag,
      timestamp: c.timestamp,
      mode: c.mode,
      grade: c.grade,
      judge: c.judge,
      cells: c.cells,
      ...c.lift ? { lift: c.lift, liftHeadline: c.liftHeadline } : {}
    }))
  };
}
function stripExports(js) {
  return js.replace(/^export\s+/gm, "");
}
function renderReport(template, data, gradeScript) {
  const json = JSON.stringify(publicView(data));
  return template.replace("/*__DATA__*/null", json).replace("/*__GRADE__*/", stripExports(gradeScript)).replace("__SKILL__", data.skill);
}

// packages/core/dist/lint.js
import { existsSync as existsSync13, statSync as statSync7, readdirSync as readdirSync9, readFileSync as readFileSync9 } from "node:fs";
import { basename, dirname as dirname3, isAbsolute as isAbsolute5, join as join16, resolve as resolve7 } from "node:path";

// packages/core/dist/instruction-coverage.js
import { existsSync as existsSync11, readFileSync as readFileSync8 } from "node:fs";
import { resolve as resolve6, dirname as dirname2, relative as relative2, isAbsolute as isAbsolute4 } from "node:path";
var FENCE = /^\s{0,3}(`{3,}|~{3,})/;
var ATX = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
var SETEXT_H1 = /^\s{0,3}=+\s*$/;
var SETEXT_H2 = /^\s{0,3}-+\s*$/;
function slugify(title) {
  return title.toLowerCase().replace(/[`*_~[\]()]/g, "").replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-");
}
function parseSections(markdown) {
  const lines = markdown.split("\n");
  const found = [];
  const seen = /* @__PURE__ */ new Map();
  let fence = null;
  const start = frontmatterEnd(lines);
  const push = (title, depth, startLine) => {
    const base = slugify(title);
    if (base === "")
      return;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    found.push({ slug: n === 0 ? base : `${base}-${n}`, title, depth, startLine });
  };
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null)
        fence = marker;
      else if (fence === marker)
        fence = null;
      continue;
    }
    if (fence !== null)
      continue;
    const atx = ATX.exec(line);
    if (atx) {
      push(atx[2], atx[1].length, i + 1);
      continue;
    }
    const prev = i > start ? lines[i - 1] : "";
    if (prev.trim() !== "" && !ATX.test(prev)) {
      if (SETEXT_H1.test(line))
        push(prev.trim(), 1, i);
      else if (SETEXT_H2.test(line) && /[^-\s]/.test(prev))
        push(prev.trim(), 2, i);
    }
  }
  return found.map((s, i) => ({
    ...s,
    endLine: i + 1 < found.length ? found[i + 1].startLine - 1 : lines.length
  }));
}
function frontmatterEnd(lines) {
  if (lines[0]?.trim() !== "---")
    return 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---")
      return i + 1;
  }
  return 0;
}
function sectionAtLine(sections, line) {
  return sections.find((s) => line >= s.startLine && line <= s.endLine);
}
function parseCoversRef(raw) {
  const hash = raw.indexOf("#");
  if (hash < 0)
    return { raw, file: raw.trim() };
  return { raw, file: raw.slice(0, hash).trim(), slug: raw.slice(hash + 1).trim() || void 0 };
}
function computeCoverage(opts) {
  const fileSections = /* @__PURE__ */ new Map();
  const readSections = (file) => {
    if (fileSections.has(file))
      return fileSections.get(file);
    const abs = isAbsolute4(file) ? file : resolve6(opts.specDir, file);
    if (!existsSync11(abs))
      return null;
    const sections2 = parseSections(readFileSync8(abs, "utf8"));
    fileSections.set(file, sections2);
    return sections2;
  };
  for (const f of opts.baseFiles ?? [])
    readSections(f);
  const bySection = /* @__PURE__ */ new Map();
  const key = (file, slug) => `${file}#${slug}`;
  const ensure = (file, section) => {
    const k = key(file, section.slug);
    let entry = bySection.get(k);
    if (!entry) {
      entry = { file, section, scenarios: [], pendingCaptures: [] };
      bySection.set(k, entry);
    }
    return entry;
  };
  for (const [file, sections2] of fileSections)
    for (const s of sections2)
      ensure(file, s);
  const broken = [];
  const unmapped = [];
  const attach = (id, refs, into) => {
    for (const raw of refs) {
      const ref = parseCoversRef(raw);
      const sections2 = readSections(ref.file);
      if (sections2 === null) {
        broken.push({ scenarioId: id, raw, reason: "file-missing", didYouMean: [] });
        continue;
      }
      for (const s of sections2)
        ensure(ref.file, s);
      if (ref.slug === void 0) {
        for (const s of sections2)
          ensure(ref.file, s)[into].push(id);
        continue;
      }
      const match = sections2.find((s) => s.slug === ref.slug);
      if (!match) {
        broken.push({
          scenarioId: id,
          raw,
          reason: "section-missing",
          didYouMean: nearest(ref.slug, sections2.map((s) => s.slug))
        });
        continue;
      }
      ensure(ref.file, match)[into].push(id);
    }
  };
  for (const s of opts.scenarios) {
    if (!s.covers || s.covers.length === 0) {
      unmapped.push(s.id);
      continue;
    }
    attach(s.id, s.covers, "scenarios");
  }
  for (const c of opts.pendingCaptures ?? [])
    attach(c.id, c.covers, "pendingCaptures");
  const sections = [...bySection.values()].sort((a, b) => a.file.localeCompare(b.file) || a.section.startLine - b.section.startLine);
  const covered = sections.filter((s) => s.scenarios.length > 0);
  const uncovered = sections.filter((s) => s.scenarios.length === 0);
  return {
    sections,
    covered,
    uncovered,
    broken,
    unmapped,
    pct: sections.length === 0 ? 0 : Math.round(covered.length / sections.length * 100)
  };
}
function nearest(target, candidates, limit = 3) {
  return candidates.map((c) => ({ c, d: distance(target, c) })).filter(({ c, d }) => d <= Math.max(3, Math.floor(c.length / 2))).sort((a, b) => a.d - b.d).slice(0, limit).map(({ c }) => c);
}
function distance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length];
}
function formatCoverage(report, skill) {
  const out = [];
  out.push(`${skill}: ${report.covered.length}/${report.sections.length} sections have a declared test (${report.pct}%)`);
  out.push("");
  if (report.uncovered.length) {
    out.push("  no test declares coverage of:");
    for (const s of report.uncovered)
      out.push(`    ${s.file}#${s.section.slug}  (${s.section.title})`);
    out.push("");
  }
  if (report.broken.length) {
    out.push("  broken references:");
    for (const b of report.broken) {
      const hint = b.didYouMean.length ? ` \u2014 did you mean ${b.didYouMean.map((s) => `#${s}`).join(", ")}?` : "";
      out.push(`    ${b.scenarioId}: ${b.raw} (${b.reason})${hint}`);
    }
    out.push("");
  }
  if (report.unmapped.length) {
    out.push(`  scenarios with no \`covers\`: ${report.unmapped.join(", ")}`);
    out.push("");
  }
  out.push("  `covers` records a declared link, not proof the behaviour is tested.");
  return out.join("\n");
}

// packages/core/dist/downgrade.js
import { existsSync as existsSync12, readdirSync as readdirSync8, statSync as statSync6 } from "node:fs";
import { join as join15 } from "node:path";

// packages/core/dist/defaults.js
var BAKED_DEFAULT_JUDGE = "claude-code:claude-opus-4-8";
function defaultJudge() {
  return readEnv("JUDGE") ?? BAKED_DEFAULT_JUDGE;
}

// packages/core/dist/judge-policy.js
var FREE_JUDGE_PROVIDERS = /* @__PURE__ */ new Set(["claude-code", "ollama", "lmstudio", "llamacpp", "local"]);
function isMeteredJudge(judge) {
  return !FREE_JUDGE_PROVIDERS.has(judge.provider);
}
function allowMeteredJudge() {
  return envFlag("ALLOW_METERED_JUDGE");
}
function assertJudgeAllowed(judge, opts) {
  if (!isMeteredJudge(judge))
    return;
  if (opts.allowMetered || allowMeteredJudge())
    return;
  const token = `${judge.provider}:${judge.model}`;
  throw new Error(`refusing to judge with ${token}: \`${judge.provider}\` bills a per-token API key, and it came from ${opts.source}.
  Judging is meant to cost nothing you did not ask for.
  \u2022 judge on your Claude subscription instead:  --judge ${BAKED_DEFAULT_JUDGE}
  \u2022 allow the metered API for this command:     --allow-metered-judge
  \u2022 allow it for this repo or shell:            export SKILL_HARNESS_ALLOW_METERED_JUDGE=1`);
}

// packages/core/dist/regate.js
import { existsSync as existsSync14, readFileSync as readFileSync10, renameSync, writeFileSync as writeFileSync4 } from "node:fs";
import { join as join17 } from "node:path";

// packages/core/dist/spec-write.js
import { createHash as createHash4 } from "node:crypto";
import { readFileSync as readFileSync11, renameSync as renameSync2, unlinkSync, writeFileSync as writeFileSync5 } from "node:fs";
import { dirname as dirname4, join as join18 } from "node:path";
var ConcurrentSpecModification = class extends Error {
  constructor(specPath) {
    super(`${specPath} changed on disk since it was read \u2014 refusing to append. Re-read the spec and retry; appending now would validate against a file that no longer exists.`);
    this.name = "ConcurrentSpecModification";
  }
};
var DuplicateScenarioId = class extends Error {
  constructor(id, specPath) {
    super(`scenario id \`${id}\` already exists in ${specPath}`);
    this.name = "DuplicateScenarioId";
  }
};
function specSha256(text) {
  return createHash4("sha256").update(text, "utf8").digest("hex");
}
function renderScenarioBlock(scenario) {
  const dumped = index_vite_proxy_tmp_default.dump({ scenarios: [scenario] }, { lineWidth: -1, noRefs: true });
  return "\n" + dumped.replace(/^scenarios:\n/, "");
}
function appendScenario(opts) {
  const { specPath, scenario, baseSha256 } = opts;
  const current = readFileSync11(specPath, "utf8");
  if (baseSha256 !== void 0 && specSha256(current) !== baseSha256) {
    throw new ConcurrentSpecModification(specPath);
  }
  const id = scenario.id;
  if (typeof id !== "string" || id.trim() === "") {
    throw new Error("scenario needs a non-empty string `id`");
  }
  const existing = parseSpec(current, specPath);
  if (existing.scenarios.some((s) => s.id === id)) {
    throw new DuplicateScenarioId(id, specPath);
  }
  const block = renderScenarioBlock(scenario);
  const merged = current + block;
  parseSpec(merged, specPath);
  atomicWrite(specPath, merged);
  return { id, sha256: specSha256(merged), block };
}
function atomicWrite(path, text) {
  const tmp = join18(dirname4(path), `.${Date.now()}-${process.pid}.specwrite.tmp`);
  try {
    writeFileSync5(tmp, text, "utf8");
    renameSync2(tmp, path);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
    }
    throw err;
  }
}

// packages/core/dist/affected.js
import { existsSync as existsSync15, readFileSync as readFileSync12 } from "node:fs";
import { resolve as resolve8 } from "node:path";
function parseDiffHunks(diff) {
  const hunks = [];
  let file = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const p = line.slice(4).trim();
      file = p === "/dev/null" ? null : p.replace(/^b\//, "");
      continue;
    }
    if (!line.startsWith("@@") || file === null)
      continue;
    const m = /@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!m)
      continue;
    hunks.push({ file, start: Number(m[1]), count: m[2] === void 0 ? 1 : Number(m[2]) });
  }
  return hunks;
}
function parseDiffFiles(diff) {
  const files = /* @__PURE__ */ new Set();
  for (const line of diff.split("\n")) {
    const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (m) {
      files.add(m[1]);
      files.add(m[2]);
    }
  }
  return [...files];
}
async function gitDiff(repoRoot, base) {
  const r = await exec("git", ["diff", "--unified=0", base], { cwd: repoRoot, timeoutMs: 6e4 });
  if (r.code !== 0)
    throw new Error(`git diff --unified=0 ${base} failed: ${r.stderr.trim() || `exit ${r.code}`}`);
  return r.stdout;
}
function selectAffected(opts) {
  const { scenarios, specDir, diff, repoRoot } = opts;
  const reasons = /* @__PURE__ */ new Map();
  const add = (id, reason) => {
    const list = reasons.get(id) ?? [];
    list.push(reason);
    reasons.set(id, list);
  };
  const selectAll = (why) => {
    for (const s of scenarios)
      if (!reasons.has(s.id))
        add(s.id, { kind: "unmapped-change", detail: why });
    return {
      selected: [...reasons.entries()].map(([id, rs]) => ({ id, reasons: rs })),
      conservative: true,
      conservativeReason: why,
      unmappedFiles: []
    };
  };
  for (const s of scenarios) {
    if (s.critical)
      add(s.id, { kind: "critical" });
    if (/^B/i.test(s.id))
      add(s.id, { kind: "under-pressure" });
  }
  const hunks = parseDiffHunks(diff);
  const changedFiles = parseDiffFiles(diff);
  for (const s of scenarios) {
    if (!s.covers || s.covers.length === 0)
      add(s.id, { kind: "no-covers-declared" });
  }
  const stimulusFiles = (s) => {
    const files = [];
    if (s.fixture)
      files.push(s.fixture);
    if (s.assert?.post_test)
      files.push(s.assert.post_test);
    if (s.systemPromptFile)
      files.push(s.systemPromptFile);
    for (const e of s.extensions ?? [])
      files.push(e);
    return files;
  };
  const changedAbs = new Set(changedFiles.map((f) => resolve8(repoRoot, f)));
  for (const s of scenarios) {
    for (const f of stimulusFiles(s)) {
      const abs = resolve8(specDir, f);
      const hit = [...changedAbs].some((c) => c === abs || c.startsWith(`${abs}/`));
      if (hit)
        add(s.id, { kind: "stimulus-changed", detail: f });
    }
  }
  const sectionsFor = /* @__PURE__ */ new Map();
  const load2 = (abs) => {
    if (sectionsFor.has(abs))
      return sectionsFor.get(abs);
    const parsed = existsSync15(abs) ? parseSections(readFileSync12(abs, "utf8")) : null;
    sectionsFor.set(abs, parsed);
    return parsed;
  };
  const coversIndex = /* @__PURE__ */ new Map();
  for (const s of scenarios) {
    for (const raw of s.covers ?? []) {
      const ref = parseCoversRef(raw);
      const abs = resolve8(specDir, ref.file);
      const key = ref.slug === void 0 ? abs : `${abs}#${ref.slug}`;
      coversIndex.set(key, [...coversIndex.get(key) ?? [], s.id]);
    }
  }
  const unmappedFiles = /* @__PURE__ */ new Set();
  for (const hunk of hunks) {
    const abs = resolve8(repoRoot, hunk.file);
    const referenced = [...coversIndex.keys()].some((k) => k === abs || k.startsWith(`${abs}#`));
    if (!referenced)
      continue;
    const sections = load2(abs);
    if (sections === null) {
      return selectAll(`${hunk.file} is referenced by \`covers\` but is not readable \u2014 it may have been renamed or deleted`);
    }
    for (const id of coversIndex.get(abs) ?? [])
      add(id, { kind: "covers", detail: `${hunk.file} (whole file)` });
    const lines = hunk.count === 0 ? [hunk.start] : Array.from({ length: hunk.count }, (_, i) => hunk.start + i);
    let mappedAny = false;
    for (const line of lines) {
      const section = sectionAtLine(sections, line);
      if (!section)
        continue;
      const ids = coversIndex.get(`${abs}#${section.slug}`) ?? [];
      for (const id of ids)
        add(id, { kind: "covers", detail: `${hunk.file}#${section.slug}` });
      if (ids.length > 0)
        mappedAny = true;
    }
    if (!mappedAny && (coversIndex.get(abs) ?? []).length === 0)
      unmappedFiles.add(hunk.file);
  }
  const rewritten = hunks.filter((h) => h.count > 200);
  if (rewritten.length > 0) {
    return selectAll(`${rewritten[0].file} changed by ${rewritten[0].count} lines in one hunk \u2014 too large to map to sections reliably`);
  }
  return {
    selected: [...reasons.entries()].map(([id, rs]) => ({ id, reasons: rs })),
    conservative: false,
    conservativeReason: null,
    unmappedFiles: [...unmappedFiles]
  };
}
function formatAffected(result, total) {
  const out = [];
  if (result.conservative) {
    out.push(`selecting ALL ${total} scenario(s): ${result.conservativeReason}`);
  } else {
    out.push(`selected ${result.selected.length}/${total} scenario(s):`);
  }
  for (const s of [...result.selected].sort((a, b) => a.id.localeCompare(b.id))) {
    out.push(`  ${s.id}  ${s.reasons.map(describe).join(", ")}`);
  }
  if (result.unmappedFiles.length) {
    out.push(`  note: changes in ${result.unmappedFiles.join(", ")} map to no covered section`);
  }
  out.push("");
  out.push("an affected run is partial and never reports SHIP \u2014 a full run still gates a release");
  return out.join("\n");
}
function describe(r) {
  switch (r.kind) {
    case "covers":
      return `covers ${r.detail}`;
    case "critical":
      return "critical (always run)";
    case "under-pressure":
      return "B-series (always run)";
    case "stimulus-changed":
      return `stimulus changed: ${r.detail}`;
    case "unmapped-change":
      return `conservative: ${r.detail}`;
    case "no-covers-declared":
      return "declares no `covers` \u2014 cannot be ruled out";
  }
}

// packages/core/dist/adjudication.js
import { existsSync as existsSync16, readFileSync as readFileSync13, writeFileSync as writeFileSync6 } from "node:fs";
import { join as join19 } from "node:path";
function planAdjudication(input) {
  const enabled = new Set(input.enabled ?? ["ambiguous", "contradictory", "non_unanimous", "ship_deciding"]);
  const decisions = [];
  for (const cell of input.cells) {
    const triggers = [];
    if (enabled.has("ambiguous") && cell.verdict === "JUDGE-AMBIGUOUS")
      triggers.push("ambiguous");
    if (enabled.has("contradictory") && cell.suspect && cell.verdict !== "JUDGE-AMBIGUOUS") {
      triggers.push("contradictory");
    }
    if (enabled.has("non_unanimous") && isNonUnanimous(cell))
      triggers.push("non_unanimous");
    if (enabled.has("ship_deciding") && flipsShipDecision(cell, input))
      triggers.push("ship_deciding");
    decisions.push({ id: cell.id, triggers });
  }
  const triggered = decisions.filter((d) => d.triggers.length > 0).map((d) => d.id);
  const perCell = input.tieBreakAvailable ? 2 : 1;
  return { decisions, triggered, maxAdditionalCalls: triggered.length * perCell };
}
function isNonUnanimous(cell) {
  const reps2 = cell.repVerdicts ?? [];
  if (reps2.length < 2)
    return false;
  const passes = reps2.filter((v) => v === "PASS").length;
  return passes > 0 && passes < reps2.length;
}
function flipsShipDecision(cell, input) {
  const verdictsWith = (targetVerdict) => input.cells.map((c) => c.id === cell.id ? { id: c.id, verdict: targetVerdict, suspect: false } : { id: c.id, verdict: c.verdict, suspect: c.suspect });
  const opts = { shipBar: input.shipBar, critical: input.critical };
  const flipped = cell.verdict === "PASS" ? "FAIL" : "PASS";
  return score(verdictsWith(cell.verdict), opts).ship !== score(verdictsWith(flipped), opts).ship;
}
function collapseJudgments(judgments, trigger) {
  const clean = judgments.filter((j) => !j.suspect && (j.verdict === "PASS" || j.verdict === "FAIL"));
  const base = { trigger, judgments };
  if (clean.length < 2) {
    return { ...base, state: "unresolved" };
  }
  const passes = clean.filter((j) => j.verdict === "PASS").length;
  const fails = clean.length - passes;
  if (passes === 0 || fails === 0) {
    return { ...base, state: "confirmed", verdict: clean[0].verdict };
  }
  if (passes > fails)
    return { ...base, state: "tie_broken", verdict: "PASS" };
  if (fails > passes)
    return { ...base, state: "tie_broken", verdict: "FAIL" };
  return { ...base, state: "unresolved" };
}
function projectAdjudication(result, adj) {
  if (adj.state === "unresolved") {
    return {
      ...result,
      // Verdict is left as recorded rather than forced to FAIL: `suspect` is what
      // blocks the ship, and overwriting the verdict would destroy the
      // first-wave answer an author needs in order to adjudicate.
      judge_reason: `${adj.judgments.length} judgments disagree (${adj.trigger}) \u2014 resolve or re-judge`,
      suspect: true,
      adjudication: adj
    };
  }
  return {
    ...result,
    judge_verdict: adj.verdict ?? result.judge_verdict,
    judge_reason: reasonFor(adj),
    // A confirmed or tie-broken cell is no longer untrustworthy — that is the
    // entire point of having asked again.
    suspect: false,
    adjudication: adj
  };
}
function reasonFor(adj) {
  const n = adj.judgments.length;
  const verb = adj.state === "confirmed" ? "confirmed by" : "resolved by majority of";
  return `${adj.verdict} ${verb} ${n} judgments (${adj.trigger})`;
}
async function runAdjudication(opts) {
  const byId = /* @__PURE__ */ new Map();
  const log = opts.log ?? (() => {
  });
  let callsMade = 0;
  for (const decision of opts.plan.decisions) {
    if (decision.triggers.length === 0)
      continue;
    const cell = opts.cells.find((c) => c.id === decision.id);
    if (!cell)
      continue;
    const trigger = decision.triggers[0];
    const judgments = [
      { ordinal: 1, judge: { ...opts.primaryJudge }, verdict: cell.verdict, reason: cell.reason, suspect: cell.suspect }
    ];
    const second = await opts.rejudge(decision.id, opts.secondaryJudge);
    callsMade++;
    judgments.push({ ordinal: 2, judge: { ...opts.secondaryJudge }, ...second });
    let collapsed = collapseJudgments(judgments, trigger);
    if (collapsed.state === "unresolved" && opts.tieBreakJudge) {
      const third = await opts.rejudge(decision.id, opts.tieBreakJudge);
      callsMade++;
      judgments.push({ ordinal: 3, judge: { ...opts.tieBreakJudge }, ...third });
      collapsed = collapseJudgments(judgments, trigger);
    }
    log(`  ${decision.id}: ${collapsed.state}${collapsed.verdict ? ` \u2192 ${collapsed.verdict}` : ""} (${judgments.length} judgments)`);
    byId.set(decision.id, collapsed);
  }
  return { byId, callsMade };
}
async function adjudicateRun(opts) {
  const log = opts.log ?? (() => {
  });
  const mode = opts.results.mode;
  const cells = opts.results.scenarios.map((s) => ({
    id: s.id,
    verdict: s.judge_verdict,
    reason: s.judge_reason,
    suspect: s.suspect,
    repVerdicts: repVerdictsOf(opts.runDir, s, mode)
  }));
  const plan = planAdjudication({
    cells,
    scenarios: opts.spec.scenarios,
    shipBar: opts.spec.ship_bar,
    critical: opts.spec.critical,
    tieBreakAvailable: opts.tieBreakJudge !== void 0
  });
  log(formatAdjudicationPlan(plan, { secondary: opts.secondaryJudge, tieBreak: opts.tieBreakJudge }));
  if (plan.triggered.length === 0)
    return opts.results;
  const byIdScenario = new Map(opts.spec.scenarios.map((s) => [s.id, s]));
  const { byId, callsMade } = await runAdjudication({
    plan,
    cells,
    primaryJudge: opts.primaryJudge,
    secondaryJudge: opts.secondaryJudge,
    tieBreakJudge: opts.tieBreakJudge,
    log,
    rejudge: async (id, judge) => {
      const scenario = byIdScenario.get(id);
      if (!scenario)
        throw new Error(`adjudication: scenario \`${id}\` is not in the spec`);
      return judgeCell({ ...opts, scenario, judge, mode });
    }
  });
  const scenarios = opts.results.scenarios.map((s) => {
    const adj = byId.get(s.id);
    return adj ? { ...projectAdjudication(s, adj), override: s.override, note: s.note } : s;
  });
  appendJournal(opts.runDir, {
    event: "adjudication",
    ts: opts.now(),
    triggered: plan.triggered,
    judge_calls: callsMade,
    unresolved: [...byId.entries()].filter(([, a]) => a.state === "unresolved").map(([id]) => id)
  });
  const ctx = scoreContextFor(opts.results, opts.spec);
  return writeResults(opts.runDir, { ...opts.results, scenarios }, ctx);
}
async function judgeCell(opts) {
  const files = findTranscriptFiles(opts.runDir, opts.scenario.id, opts.mode);
  if (files.length === 0) {
    throw new Error(`adjudication: no ${opts.mode} transcript for \`${opts.scenario.id}\` in ${opts.runDir} \u2014 transcripts are gitignored, so this needs the run dir that produced them`);
  }
  const transcript = readFileSync13(join19(opts.runDir, files[0]), "utf8");
  const prompt = buildJudgePrompt({
    skill: opts.spec.skill,
    persona: opts.spec.judge_persona,
    scenario: opts.scenario,
    transcript
  });
  const g = await judgeInWorkspace(opts.adapter, opts.judge, prompt, opts.specDir);
  const rep = repIndexOf(files[0]) ?? void 0;
  const base = judgeRawPath(opts.runDir, opts.scenario.id, opts.mode, rep);
  const nth = existsSync16(base.replace(/\.judge\.txt$/, ".judge2.txt")) ? 3 : 2;
  writeFileSync6(base.replace(/\.judge\.txt$/, `.judge${nth}.txt`), g.raw, "utf8");
  appendJournal(opts.runDir, {
    event: "judge-verdict",
    ts: opts.now(),
    id: opts.scenario.id,
    verdict: g.verdict,
    reason: g.reason,
    suspect: g.suspect
  });
  return { verdict: g.verdict, reason: g.reason, suspect: g.suspect };
}
function repVerdictsOf(runDir, s, mode) {
  if (!s.reps || s.reps < 2)
    return void 0;
  const out = [];
  for (let rep = 1; rep <= s.reps; rep++) {
    const path = judgeRawPath(runDir, s.id, mode, rep);
    if (!existsSync16(path))
      continue;
    out.push(parseVerdict(readFileSync13(path, "utf8")).verdict);
  }
  return out.length >= 2 ? out : void 0;
}
function resolveAdjudicationJudges(opts) {
  if (!opts.enabled)
    return null;
  let subject = null;
  try {
    subject = opts.parseRef(opts.subjectToken);
  } catch {
    opts.warn(`  \u26A0 cannot read the run's model (\`${opts.subjectToken}\`) \u2014 skipping the judge\u2260subject check`);
  }
  const secondary = opts.secondaryToken ? opts.parseRef(opts.secondaryToken) : opts.primary;
  const tieBreak = opts.tieBreakToken ? opts.parseRef(opts.tieBreakToken) : void 0;
  opts.assertAllowed(secondary, "--secondary-judge");
  if (tieBreak)
    opts.assertAllowed(tieBreak, "--tie-break-judge");
  if (subject) {
    for (const [label, judge] of [["secondary", secondary], ["tie-break", tieBreak]]) {
      if (judge && opts.resemblesSubject(judge, subject)) {
        opts.warn(`  \u26A0 ${label} judge (${judge.provider}:${judge.model}) resembles the model under test (${subject.provider}:${subject.model}) \u2014 same-family grading inflates scores.`);
      }
    }
  }
  return tieBreak ? { secondary, tieBreak } : { secondary };
}
function formatAdjudicationPlan(plan, judges) {
  if (plan.triggered.length === 0)
    return "adjudication: no cell triggered \u2014 no additional judge calls";
  const lines = [
    `adjudication: ${plan.triggered.length} cell(s) triggered \u2014 up to ${plan.maxAdditionalCalls} additional judge call(s)`,
    `  secondary judge: ${judges.secondary.provider}:${judges.secondary.model}`
  ];
  if (judges.tieBreak)
    lines.push(`  tie-break judge: ${judges.tieBreak.provider}:${judges.tieBreak.model}`);
  else
    lines.push("  no tie-break judge \u2014 a disagreement stays unresolved and blocks SHIP");
  for (const d of plan.decisions) {
    if (d.triggers.length)
      lines.push(`  ${d.id}: ${d.triggers.join(", ")}`);
  }
  return lines.join("\n");
}

// packages/adapters/dist/pi.js
import { existsSync as existsSync17, mkdtempSync as mkdtempSync2, readFileSync as readFileSync14, statSync as statSync8 } from "node:fs";
import { tmpdir as tmpdir2, homedir } from "node:os";
import { join as join20, resolve as resolve9 } from "node:path";

// packages/adapters/dist/pi-json.js
import { spawn as spawn2 } from "node:child_process";
import { createInterface } from "node:readline";
var MAX_STDERR_CHARS = 8e3;
function runPiJson(opts) {
  return new Promise((resolve12, reject) => {
    const child = spawn2("pi", opts.args, {
      cwd: opts.cwd,
      // stdin from /dev/null: pi hangs waiting on it otherwise, and a hang in a
      // wave is indistinguishable from a slow model until the timeout fires.
      stdio: ["ignore", "pipe", "pipe"]
    });
    const kept = [];
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled)
        return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`pi --mode json timed out after ${opts.timeoutMs}ms`));
    }, opts.timeoutMs);
    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
    rl.on("line", (line) => {
      if (line.includes('"message_update"') || line.includes('"tool_execution_update"'))
        return;
      if (line.trim())
        kept.push(line);
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < MAX_STDERR_CHARS)
        stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      if (settled)
        return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled)
        return;
      settled = true;
      clearTimeout(timer);
      const parsed = parseTrace(kept, {
        piVersion: opts.piVersion,
        subject: opts.subject,
        scenarioId: opts.scenarioId,
        mode: opts.mode,
        rep: opts.rep,
        turn: opts.turn,
        changedPaths: opts.changedPaths,
        homeDir: opts.homeDir
      });
      resolve12({ ...parsed, code, stderr: stderr.slice(0, MAX_STDERR_CHARS) });
    });
  });
}

// packages/adapters/dist/pi.js
var PI_TIMEOUT_MS = envNum("PI_TIMEOUT_MS", 3e5);
function requireSkillDir(skillDir, mode) {
  const abs = resolve9(skillDir);
  const md = join20(abs, "SKILL.md");
  const isDir3 = existsSync17(abs) && statSync8(abs).isDirectory();
  if (!isDir3 || !existsSync17(md)) {
    throw new Error(`mode=${mode} needs a skill directory with a SKILL.md, but ${abs} ${isDir3 ? "has none" : "is not a directory"}` + (abs === skillDir ? "" : ` (given \`${skillDir}\`, resolved against ${process.cwd()})`) + ` \u2014 pi accepts \`--skill <nonexistent>\` silently (exit 0, a normal answer, no skill in context), so this run would measure a model with no skill and report it as a result.`);
  }
  return abs;
}
function skillFlags(mode, skillDir) {
  switch (mode) {
    case "red":
      return ["--no-skills"];
    case "green":
      return ["--skill", requireSkillDir(skillDir, mode)];
    case "force": {
      const body = readFileSync14(join20(requireSkillDir(skillDir, mode), "SKILL.md"), "utf8");
      return ["--no-skills", "--append-system-prompt", body];
    }
  }
}
function extensionFlags(extensions) {
  if (!extensions || extensions.length === 0)
    return [];
  return extensions.flatMap((p) => {
    const abs = resolve9(p);
    if (!existsSync17(abs)) {
      throw new Error(`env.extensions names ${abs}, which does not exist \u2014 pi would start without it and the scenario would silently test an agent with no subagent tool at all.`);
    }
    return ["--extension", abs];
  });
}
function header(turnNo, total, text) {
  const label = total === 1 ? "USER" : `USER (turn ${turnNo}/${total})`;
  return `>>> ${label}:
${text}
`;
}
var piAdapter = {
  name: "pi",
  available() {
    return Promise.resolve(onPath("pi"));
  },
  /**
   * `pi --version` (it prints a bare version, e.g. `0.83.0`), recorded in
   * results.yaml as `harness_cli_version`.
   *
   * Null on any failure — a non-zero exit, empty output, or pi missing entirely.
   * A run must not abort because provenance was unavailable, and a fabricated
   * version would be worse than an absent one.
   */
  async version() {
    try {
      const r = await exec("pi", ["--version"], { timeoutMs: 3e4 });
      const line = r.stdout.split("\n")[0]?.trim() ?? "";
      if (r.code !== 0 || line === "")
        return null;
      return /\d+\.\d+\.\d+\S*/.exec(line)?.[0] ?? line;
    } catch {
      return null;
    }
  },
  /**
   * Run a scenario through pi. Single turn → --no-session -p. Multi turn → a
   * shared --session-dir, -c on every turn after the first. Returns a transcript
   * interleaving user turns with assistant output.
   */
  async run(req) {
    const common = [
      "--no-context-files",
      "--no-extensions",
      ...extensionFlags(req.extensions),
      "--provider",
      req.model.provider,
      "--model",
      req.model.model
    ];
    const flags = req.systemPromptFile ? ["--no-skills", "--append-system-prompt", readFileSync14(req.systemPromptFile, "utf8")] : skillFlags(req.mode, req.skillDir);
    const total = req.turns.length;
    const parts = [];
    if (total === 1) {
      const args = [...flags, ...common, "--no-session", "-p", req.turns[0]];
      const r = await exec("pi", args, { cwd: req.cwd, timeoutMs: PI_TIMEOUT_MS });
      parts.push(header(1, 1, req.turns[0]));
      parts.push(`<<< ASSISTANT:
${r.stdout.trim()}
`);
      if (r.code !== 0)
        parts.push(`[pi exited ${r.code}]
${r.stderr.trim()}
`);
      return parts.join("\n");
    }
    const session = mkdtempSync2(join20(tmpdir2(), "sc-pi-session-"));
    for (let i = 0; i < total; i++) {
      const turnFlags = i === 0 ? ["--session-dir", session] : ["--session-dir", session, "-c"];
      const args = [...flags, ...common, ...turnFlags, "-p", req.turns[i]];
      const r = await exec("pi", args, { cwd: req.cwd, timeoutMs: PI_TIMEOUT_MS });
      parts.push(header(i + 1, total, req.turns[i]));
      parts.push(`<<< ASSISTANT:
${r.stdout.trim()}
`);
      if (r.code !== 0)
        parts.push(`[pi exited ${r.code} on turn ${i + 1}]
${r.stderr.trim()}
`);
    }
    return parts.join("\n");
  },
  /**
   * Structured run: same flags, same turn loop, plus `--mode json` and a trace
   * per turn.
   *
   * Shares `skillFlags` and the turn structure with `run()` on purpose — if the
   * two drifted, a trace-gated scenario would be measuring a different delivery
   * than an ungated one, and the gate would be attesting to the wrong execution.
   *
   * The transcript is REBUILT from each turn's final assistant message rather
   * than read from stdout, which is byte-identical to print mode's output (proven
   * on a deterministic prompt; see docs/pi-native-capture-design-2026-08-08.md §2).
   */
  async runStructured(req) {
    const common = [
      "--no-context-files",
      "--no-extensions",
      ...extensionFlags(req.extensions),
      "--provider",
      req.model.provider,
      "--model",
      req.model.model
    ];
    const flags = req.systemPromptFile ? ["--no-skills", "--append-system-prompt", readFileSync14(req.systemPromptFile, "utf8")] : skillFlags(req.mode, req.skillDir);
    const piVersion = await this.version();
    const total = req.turns.length;
    const traces = [];
    const parts = [];
    const session = total === 1 ? null : mkdtempSync2(join20(tmpdir2(), "sc-pi-session-"));
    for (let i = 0; i < total; i++) {
      const turnFlags = session === null ? ["--no-session"] : i === 0 ? ["--session-dir", session] : ["--session-dir", session, "-c"];
      const args = [...flags, ...common, "--mode", "json", ...turnFlags, "-p", req.turns[i]];
      const r = await runPiJson({
        args,
        cwd: req.cwd,
        timeoutMs: PI_TIMEOUT_MS,
        piVersion,
        subject: req.model,
        scenarioId: req.scenarioId ?? "(unknown)",
        mode: req.mode,
        rep: req.rep ?? 0,
        turn: i,
        changedPaths: req.changedPaths,
        homeDir: homedir()
      });
      if (!r.isComplete) {
        throw new Error(`pi --mode json produced no terminal events for turn ${i + 1}/${total} (exit ${r.code}${r.malformedLines ? `, ${r.malformedLines} malformed line(s)` : ""})` + (r.stderr.trim() ? `: ${r.stderr.trim()}` : ""));
      }
      traces.push(r.trace);
      parts.push(header(i + 1, total, req.turns[i]));
      parts.push(`<<< ASSISTANT:
${r.trace.final_text.trim()}
`);
      if (r.code !== 0)
        parts.push(`[pi exited ${r.code} on turn ${i + 1}]
${r.stderr.trim()}
`);
    }
    return { transcript: parts.join("\n"), traces };
  },
  /**
   * Run the judge: no skills, no context files, no session, single prompt.
   * Judge provider `claude-code` routes to the Claude Code CLI (`claude -p`),
   * which authenticates via the user's Claude subscription (OAuth) instead of
   * a provider API key.
   */
  async judge(req) {
    if (req.model.provider === "claude-code") {
      const args2 = ["-p", req.prompt, "--model", req.model.model];
      const r2 = await exec("claude", args2, { cwd: req.cwd, timeoutMs: PI_TIMEOUT_MS });
      if (r2.stdout.trim().length === 0 && (r2.code !== 0 || r2.stderr.trim())) {
        return `[judge error: claude exited ${r2.code}] ${r2.stderr.trim()}`;
      }
      return r2.stdout;
    }
    const args = [
      "--no-skills",
      "--no-context-files",
      "--no-extensions",
      "--no-session",
      "--provider",
      req.model.provider,
      "--model",
      req.model.model,
      "-p",
      req.prompt
    ];
    const r = await exec("pi", args, { cwd: req.cwd, timeoutMs: PI_TIMEOUT_MS });
    if (r.stdout.trim().length === 0 && (r.code !== 0 || r.stderr.trim())) {
      return `[judge error: pi exited ${r.code}] ${r.stderr.trim()}`;
    }
    return r.stdout;
  }
};

// packages/adapters/dist/index.js
var ADAPTERS = {
  pi: piAdapter
};
function getAdapter(name) {
  const a = ADAPTERS[name];
  if (!a) {
    throw new Error(`unknown harness \`${name}\` (available: ${Object.keys(ADAPTERS).join(", ")})`);
  }
  return a;
}

// packages/cli/dist/serve.js
import { createServer } from "node:http";
import { readFileSync as readFileSync15, existsSync as existsSync18 } from "node:fs";
import { join as join21, dirname as dirname5 } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn as spawn3 } from "node:child_process";
var __dirname = dirname5(fileURLToPath(import.meta.url));
function templatePath(assetsDir) {
  if (assetsDir)
    return join21(assetsDir, "report.template.html");
  const candidates = [
    join21(__dirname, "..", "..", "..", "assets", "report.template.html"),
    // packages/cli/{dist,src} -> ../../../assets
    join21(__dirname, "..", "assets", "report.template.html"),
    join21(__dirname, "..", "..", "assets", "report.template.html")
  ];
  for (const c of candidates)
    if (existsSync18(c))
      return c;
  throw new Error("cannot find assets/report.template.html");
}
function gradeScriptPath(assetsDir) {
  return join21(dirname5(templatePath(assetsDir)), "report.grade.js");
}
function readBody(req) {
  return new Promise((resolve12) => {
    let b = "";
    req.on("data", (c) => b += c);
    req.on("end", () => resolve12(b));
  });
}
function findTranscript(runDir, id) {
  const files = findTranscriptFiles(runDir, id);
  if (files.length === 0)
    return null;
  if (files.length === 1)
    return readFileSync15(join21(runDir, files[0]), "utf8");
  return files.map((f) => `===== ${f} =====
${readFileSync15(join21(runDir, f), "utf8")}`).join("\n\n");
}
function findJudgeRaw(runDir, id) {
  const files = findJudgeRawFiles(runDir, id);
  if (files.length === 0)
    return null;
  if (files.length === 1)
    return readFileSync15(join21(runDir, files[0]), "utf8");
  return files.map((f) => `===== ${f} =====
${readFileSync15(join21(runDir, f), "utf8")}`).join("\n\n");
}
async function serveReview(opts) {
  const template = readFileSync15(templatePath(opts.assetsDir), "utf8");
  const gradeScript = readFileSync15(gradeScriptPath(opts.assetsDir), "utf8");
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/") {
        const data = collectReport(opts.skillDir);
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(renderReport(template, data, gradeScript));
        return;
      }
      if (req.method === "GET" && url.pathname === "/transcript") {
        const col = Number(url.searchParams.get("col"));
        const id = url.searchParams.get("id") ?? "";
        const data = collectReport(opts.skillDir);
        const column = data.columns.find((c) => c.index === col);
        const text = column ? findTranscript(column.runDir, id) : null;
        res.writeHead(text ? 200 : 404, { "content-type": "text/plain; charset=utf-8" });
        res.end(text ?? "transcript not found");
        return;
      }
      if (req.method === "GET" && url.pathname === "/judge") {
        const col = Number(url.searchParams.get("col"));
        const id = url.searchParams.get("id") ?? "";
        const data = collectReport(opts.skillDir);
        const column = data.columns.find((c) => c.index === col);
        const text = column ? findJudgeRaw(column.runDir, id) : null;
        res.writeHead(text ? 200 : 404, { "content-type": "text/plain; charset=utf-8" });
        res.end(text ?? "judge output not captured");
        return;
      }
      if (req.method === "GET" && url.pathname === "/trends") {
        const data = collectTrends(opts.skillDir);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(data));
        return;
      }
      if (req.method === "POST" && url.pathname === "/rejudge") {
        const body = JSON.parse(await readBody(req) || "{}");
        const data = collectReport(opts.skillDir);
        const column = data.columns.find((c) => c.index === body.col);
        if (!column) {
          res.writeHead(404).end("unknown column");
          return;
        }
        const results = readResults(column.runDir);
        if (!isScoredMode(results.mode)) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: `only scored runs (green/force) can be re-judged here \u2014 for a ${results.mode} run use \`skill-harness grade\`` }));
          return;
        }
        const specPath = join21(opts.skillDir, "tests", "specification.yaml");
        const spec = loadSpec(specPath);
        const scenario = spec.scenarios.find((s) => s.id === body.scenarioId);
        if (!scenario) {
          res.writeHead(404).end("unknown scenario");
          return;
        }
        const adapter = opts.adapter ?? getAdapter(results.harness);
        if (!await adapter.available()) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: `harness \`${results.harness}\` is not on PATH` }));
          return;
        }
        const prev = results.scenarios.find((s) => s.id === body.scenarioId);
        if (!prev) {
          res.writeHead(404).end("scenario not in this run");
          return;
        }
        const threshold = effectiveThreshold(prev, scenario);
        try {
          const rr = await regradeScenario({
            runDir: column.runDir,
            spec,
            scenario,
            adapter,
            judge: results.judge,
            specDir: dirname5(specPath),
            threshold,
            mode: results.mode
          });
          const merged = results.scenarios.map((s) => (
            // Same carry-forward contract as `grade`: the author's override/note and
            // the run's objective evidence survive a re-judge; a stale adjudication
            // panel does not (this re-judge replaced the judgments it described).
            s.id === body.scenarioId ? { ...rr, override: s.override, note: s.note, ...s.objective ? { objective: s.objective } : {} } : s
          ));
          const written = writeResults(column.runDir, {
            skill: results.skill,
            harness: results.harness,
            model: results.model,
            judge: results.judge,
            timestamp: results.timestamp,
            label: results.label,
            mode: results.mode,
            scenarios: merged,
            partial: results.partial,
            // Provenance survives a UI re-judge, same as it does through `grade`.
            harness_cli_version: results.harness_cli_version,
            delivery_canary: results.delivery_canary,
            // Recorded hashes were being dropped here entirely, which silently
            // retired the staleness gate for any run re-judged from the UI. Carried,
            // with the one `rubric:` key this re-judge actually applied refreshed —
            // the same doctrine `grade` follows (see refreshRubricHashes).
            source_hashes: refreshRubricHashes(results.source_hashes, spec, [body.scenarioId])
          }, scoreContextFor(results, spec));
          ensureResultsGitignore(join21(opts.skillDir, "tests", "results"));
          const g = written.effective_grade;
          appendJournal(column.runDir, { event: "score", ts: (/* @__PURE__ */ new Date()).toISOString(), passed: g.passed, total: g.total, pct: g.pct, letter: g.letter, ship: g.ship, note: g.note });
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true, grade: g }));
        } catch (e) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
        }
        return;
      }
      if (req.method === "POST" && url.pathname === "/adjudicate") {
        const body = JSON.parse(await readBody(req) || "{}");
        const data = collectReport(opts.skillDir);
        const column = data.columns.find((c) => c.index === body.col);
        if (!column) {
          res.writeHead(404).end("unknown column");
          return;
        }
        const results = readResults(column.runDir);
        if (!isScoredMode(results.mode)) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: `only scored runs (green/force) can be adjudicated \u2014 for a ${results.mode} run use \`skill-harness grade\`` }));
          return;
        }
        const specPath = join21(opts.skillDir, "tests", "specification.yaml");
        const spec = loadSpec(specPath);
        const adapter = opts.adapter ?? getAdapter(results.harness);
        const cells = results.scenarios.map((sc) => ({
          id: sc.id,
          verdict: sc.judge_verdict,
          reason: sc.judge_reason,
          suspect: sc.suspect
        }));
        const plan = planAdjudication({
          cells,
          scenarios: spec.scenarios,
          shipBar: spec.ship_bar,
          critical: spec.critical,
          tieBreakAvailable: false
        });
        if (body.step !== "run") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({
            ok: true,
            step: "plan",
            triggered: plan.triggered,
            maxAdditionalCalls: plan.maxAdditionalCalls,
            judge: `${results.judge.provider}:${results.judge.model}`,
            detail: plan.decisions.filter((d) => d.triggers.length).map((d) => `${d.id}: ${d.triggers.join(", ")}`)
          }));
          return;
        }
        if (!await adapter.available()) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: `harness \`${results.harness}\` is not on PATH` }));
          return;
        }
        try {
          assertJudgeAllowed(results.judge, { source: "the run's recorded judge", allowMetered: envFlag("SKILL_HARNESS_ALLOW_METERED_JUDGE") });
          const written = await adjudicateRun({
            runDir: column.runDir,
            spec,
            adapter,
            results,
            primaryJudge: results.judge,
            // Asked again as an independent draw. The judge-variance study measured
            // ~2% self-disagreement on identical transcripts, so this is a real
            // second opinion rather than a no-op.
            secondaryJudge: results.judge,
            specDir: dirname5(specPath),
            now: () => (/* @__PURE__ */ new Date()).toISOString()
          });
          ensureResultsGitignore(join21(opts.skillDir, "tests", "results"));
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true, step: "run", grade: written.effective_grade }));
        } catch (e) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
        }
        return;
      }
      if (req.method === "POST" && url.pathname === "/save") {
        const body = JSON.parse(await readBody(req) || "{}");
        const data = collectReport(opts.skillDir);
        const column = data.columns.find((c) => c.index === body.col);
        if (!column) {
          res.writeHead(404).end("unknown column");
          return;
        }
        const results = readResults(column.runDir);
        let patched;
        try {
          patched = applyOverride(results, body.scenarioId, body.override ?? null, body.note ?? "");
        } catch (e) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
          return;
        }
        const spec = loadSpec(join21(opts.skillDir, "tests", "specification.yaml"));
        writeResults(column.runDir, patched, scoreContextFor(patched, spec));
        ensureResultsGitignore(join21(opts.skillDir, "tests", "results"));
        if (body.override != null) {
          preserveTranscript(join21(opts.skillDir, "tests", "results"), column.runDir, body.scenarioId);
        }
        appendJournal(column.runDir, {
          event: "override",
          ts: (/* @__PURE__ */ new Date()).toISOString(),
          id: body.scenarioId,
          override: body.override ?? null,
          note: body.note ?? ""
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      res.writeHead(404).end("not found");
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(`server error: ${e instanceof Error ? e.message : e}`);
    }
  });
  await new Promise((resolve12) => server.listen(opts.port ?? 0, "127.0.0.1", resolve12));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : opts.port;
  const link = `http://127.0.0.1:${port}/`;
  console.log(`
  skill-harness review \xB7 ${opts.skillName}`);
  console.log(`  \u2192 ${link}`);
  console.log(`  flip verdicts + add notes in the browser; saves persist to results.yaml.`);
  console.log(`  Ctrl-C to stop.
`);
  if (opts.open !== false && !envFlag("NO_OPEN"))
    tryOpen(link);
  return { port, close: () => server.close() };
}
function tryOpen(url, cmd) {
  const opener = cmd ?? (process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open");
  try {
    const child = spawn3(opener, [url], { stdio: "ignore", detached: true });
    child.on("error", () => {
    });
    child.unref();
  } catch {
  }
}

// packages/pi-extension/src/runner.ts
import { existsSync as existsSync19 } from "node:fs";
import { dirname as dirname6, join as join22, resolve as resolve10 } from "node:path";
function resolveSkillDir(cwd, arg) {
  if (arg) {
    const dir2 = resolve10(cwd, arg);
    if (existsSync19(join22(dir2, "tests", "specification.yaml"))) return dir2;
    throw new Error(`no tests/specification.yaml found at ${dir2}`);
  }
  let dir = cwd;
  for (; ; ) {
    if (existsSync19(join22(dir, "tests", "specification.yaml"))) return dir;
    const parent = dirname6(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`no tests/specification.yaml found from ${cwd} upward`);
}
var DEFAULT_MODEL = "fireworks:accounts/fireworks/models/deepseek-v4-pro";
async function runViaExtension(opts) {
  const specPath = join22(opts.skillDir, "tests", "specification.yaml");
  const spec = loadSpec(specPath);
  const modelToken = opts.model ?? DEFAULT_MODEL;
  const model = parseModelRef(modelToken);
  const judge = parseModelRef(opts.judge ?? defaultJudge());
  assertJudgeAllowed(judge, {
    source: opts.judge ? "the judge argument" : "the default judge (SKILL_HARNESS_JUDGE or the baked value)"
  });
  const adapter = opts.adapter ?? getAdapter("pi");
  const mode = opts.mode ?? "green";
  const summary = await runSkillModel({
    spec,
    skillDir: opts.skillDir,
    specPath,
    adapter,
    model,
    modelToken,
    judge,
    mode,
    timestamp: opts.timestamp,
    now: opts.now,
    reps: opts.reps,
    canary: opts.canary,
    only: opts.only,
    onProgress: opts.log
  });
  const g = summary.results.effective_grade;
  const verdicts = effectiveVerdicts(summary.results.scenarios);
  const failedTranscripts = verdicts.filter((v) => v.verdict !== "PASS").flatMap((v) => findTranscriptFiles(summary.runDir, v.id, summary.results.mode).map((f) => join22(summary.runDir, f)));
  return {
    skill: summary.results.skill,
    model: summary.results.model,
    grade: { pct: g.pct, letter: g.letter, ship: g.ship },
    scenarios: verdicts.map((v) => ({ id: v.id, verdict: v.verdict, suspect: v.suspect ?? false })),
    failedTranscripts
  };
}

// packages/pi-extension/src/capture-cmd.ts
import { existsSync as existsSync20, mkdirSync as mkdirSync4, writeFileSync as writeFileSync7, readdirSync as readdirSync10, readFileSync as readFileSync16 } from "node:fs";
import { join as join23 } from "node:path";
import { createHash as createHash5 } from "node:crypto";
var CANCELLED = { status: "cancelled", files: [] };
var CAPTURES_GITIGNORE = "# Local review evidence for captured cases \u2014 never commit.\n.local/\n";
async function runCapture(skillDir, ctx) {
  const ui = ctx.ui;
  const now = ctx.now ?? (() => (/* @__PURE__ */ new Date()).toISOString());
  if (ctx.isStreaming()) {
    ui.say("the agent is still streaming \u2014 let it finish, then run capture again");
    return CANCELLED;
  }
  const specPath = join23(skillDir, "tests", "specification.yaml");
  if (!existsSync20(specPath)) {
    ui.say(`${specPath} does not exist \u2014 run \`skill-harness init\` before capturing into this skill`);
    return CANCELLED;
  }
  const baseSha256 = specSha256(readFileSync16(specPath, "utf8"));
  const turns = projectTurns(activeBranch(ctx.sessionEntries()));
  if (turns.length === 0) {
    ui.say("no user turns in this session yet \u2014 nothing to capture");
    return CANCELLED;
  }
  const labels = turns.map((t) => turnLabel(t));
  const start = await ui.select("capture from which turn?", labels);
  if (start === null) return CANCELLED;
  const endChoices = labels.slice(start);
  const endRel = await ui.select("\u2026through which turn?", endChoices);
  if (endRel === null) return CANCELLED;
  const end = start + endRel;
  const target = await chooseTarget(skillDir, ctx);
  if (!target) return CANCELLED;
  const cls = await ui.select("what is this?", [
    "failure \u2014 the agent got this wrong",
    "good_example \u2014 the agent got this right, keep it working"
  ]);
  if (cls === null) return CANCELLED;
  const classification = cls === 0 ? "failure" : "good_example";
  const expected = await ui.input("what SHOULD it have done? (one or two sentences)");
  if (expected === null || expected.trim() === "") {
    ui.say("cancelled \u2014 a capture needs a written expectation");
    return CANCELLED;
  }
  const drafted = draftChecklist(expected);
  const edited = await ui.editor(
    "checklist \u2014 one item per line; these are what the judge grades",
    (drafted.length ? drafted : [expected.trim()]).join("\n")
  );
  if (edited === null) return CANCELLED;
  const checklist = edited.split("\n").map((l) => l.trim()).filter(Boolean);
  if (checklist.length === 0) {
    ui.say("cancelled \u2014 a capture needs at least one checklist item");
    return CANCELLED;
  }
  const capturesDir = join23(skillDir, "tests", "captures");
  const existingIds = existsSync20(capturesDir) ? readdirSync10(capturesDir).filter((f) => f.endsWith(".yaml")).map((f) => f.replace(/\.yaml$/, "")) : [];
  const capture = buildCaptureCase({
    turns,
    range: { start, end },
    classification,
    expectedBehavior: expected,
    checklist,
    target,
    sessionPath: ctx.sessionPath(),
    created: now(),
    homeDir: ctx.homeDir,
    existingIds
  });
  const previewYaml = index_vite_proxy_tmp_default.dump(capture, { lineWidth: -1, noRefs: true });
  ui.say(`
--- ${capture.id} (preview, nothing written yet) ---
${previewYaml}---`);
  const action = await ui.select("what now?", [
    "save as a pending capture (review and promote later)",
    "promote to a scenario now",
    "cancel \u2014 write nothing"
  ]);
  if (action === null || action === 2) {
    ui.say("cancelled \u2014 no files written");
    return CANCELLED;
  }
  const files = writeCapture(capturesDir, capture, turns.slice(start, end + 1), ctx.homeDir);
  if (action === 0) {
    ui.say(`saved ${capture.id} \u2014 promote it later, or edit ${files[0]} first`);
    return { status: "pending", capture, files };
  }
  const suggested = suggestScenarioId(specPath, capture.id);
  const scenarioId = await ui.input("scenario id for the spec", suggested);
  if (scenarioId === null || scenarioId.trim() === "") {
    ui.say(`kept ${capture.id} as pending \u2014 no scenario appended`);
    return { status: "pending", capture, files };
  }
  const title = await ui.input("scenario title", defaultTitle(capture));
  if (title === null || title.trim() === "") {
    ui.say(`kept ${capture.id} as pending \u2014 no scenario appended`);
    return { status: "pending", capture, files };
  }
  appendScenario({
    specPath,
    scenario: captureToScenario(capture, scenarioId.trim(), title.trim()),
    baseSha256
  });
  const promoted = { ...capture, status: "promoted", scenario_id: scenarioId.trim() };
  writeFileSync7(join23(capturesDir, `${capture.id}.yaml`), index_vite_proxy_tmp_default.dump(promoted, { lineWidth: -1, noRefs: true }), "utf8");
  ui.say(`promoted ${capture.id} \u2192 scenario ${scenarioId.trim()} in ${specPath}`);
  if (ctx.runOnly && await ui.confirm(`run scenario ${scenarioId.trim()} now? (spends subject + judge tokens for 1 scenario)`)) {
    ui.say(await ctx.runOnly(skillDir, scenarioId.trim()));
  }
  return { status: "promoted", capture: promoted, files: [...files, specPath], scenarioId: scenarioId.trim() };
}
function turnLabel(t) {
  const head = t.user.replace(/\s+/g, " ").trim();
  const tools = t.toolCalls.length ? ` [${t.toolCalls.length} tool call(s)]` : "";
  return `${t.index + 1}. ${head.length > 70 ? `${head.slice(0, 70)}\u2026` : head}${tools}`;
}
function defaultTitle(capture) {
  const first = capture.turns[0] ?? "captured case";
  const trimmed = first.replace(/\s+/g, " ").trim();
  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}\u2026` : trimmed;
}
async function chooseTarget(skillDir, ctx) {
  const candidates = [];
  const skillMd = join23(skillDir, "SKILL.md");
  if (existsSync20(skillMd)) candidates.push({ label: "SKILL.md (this skill)", kind: "skill", path: "SKILL.md", abs: skillMd });
  const agentsDir = join23(ctx.cwd, ".pi", "agents");
  if (existsSync20(agentsDir)) {
    for (const f of readdirSync10(agentsDir).filter((x) => x.endsWith(".md"))) {
      candidates.push({ label: `subagent: ${f}`, kind: "subagent", path: join23(".pi", "agents", f), abs: join23(agentsDir, f) });
    }
  }
  if (candidates.length === 0) {
    ctx.ui.say("no SKILL.md or .pi/agents/*.md found to attribute this to");
    return null;
  }
  const pick = await ctx.ui.select("which instructions are responsible? (your call \u2014 the session cannot prove this)", candidates.map((c) => c.label));
  if (pick === null) return null;
  const chosen = candidates[pick];
  return {
    kind: chosen.kind,
    path: chosen.path,
    content_sha256: createHash5("sha256").update(readFileSync16(chosen.abs, "utf8"), "utf8").digest("hex")
  };
}
function suggestScenarioId(specPath, fallback) {
  try {
    const ids = new Set(loadSpec(specPath).scenarios.map((s) => s.id));
    for (let n = 1; n < 1e3; n++) {
      const candidate = `R${n}`;
      if (!ids.has(candidate)) return candidate;
    }
  } catch {
  }
  return fallback;
}
function writeCapture(capturesDir, capture, selected, homeDir) {
  mkdirSync4(join23(capturesDir, ".local"), { recursive: true });
  const gitignore = join23(capturesDir, ".gitignore");
  if (!existsSync20(gitignore)) writeFileSync7(gitignore, CAPTURES_GITIGNORE, "utf8");
  const casePath = join23(capturesDir, `${capture.id}.yaml`);
  writeFileSync7(casePath, index_vite_proxy_tmp_default.dump(capture, { lineWidth: -1, noRefs: true }), "utf8");
  const evidencePath = join23(capturesDir, ".local", `${capture.id}.evidence.json`);
  writeFileSync7(
    evidencePath,
    JSON.stringify(
      {
        capture_id: capture.id,
        assistant_excerpt: selected.map((t) => redactText(t.assistantText, homeDir)).join("\n---\n").slice(0, 4e3),
        tool_calls: selected.flatMap((t) => t.toolCalls.map((c) => ({ name: c.name, isError: c.isError, args: c.args })))
      },
      null,
      2
    ),
    "utf8"
  );
  return [casePath, evidencePath, gitignore];
}

// packages/pi-extension/src/commands.ts
var USAGE = "usage: /skill-harness run [skill] [--model p:m] [--reps N] [--mode red|green|force] [--canary] [--judge p:m] | judge [run-dir] [--auto-rejudge] [--secondary-judge p:m] [--tie-break-judge p:m] | review [skill] | capture [skill] | coverage [skill] | affected [skill] [--base ref]";
function parse(argstr) {
  const tokens = argstr.trim().length ? argstr.trim().split(/\s+/) : [];
  const [sub = "", ...rest] = tokens;
  const positional = [];
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i];
    if (tok.startsWith("--")) {
      const key = tok.slice(2);
      const next = rest[i + 1];
      if (next !== void 0 && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "";
      }
    } else {
      positional.push(tok);
    }
  }
  return { sub, positional, flags };
}
function say(ctx, msg, level = "info") {
  if (ctx.hasUI) ctx.ui.notify(msg, level);
  else console.log(msg);
}
async function handleSkillCheck(argstr, ctx, opts) {
  const { sub, positional, flags } = parse(argstr);
  const adapter = opts?.adapter;
  const nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
  if (sub === "run") {
    const skillDir = resolveSkillDir(ctx.cwd, positional[0]);
    const card = await runViaExtension({
      skillDir,
      // `|| undefined`: a valueless `--model` / `--mode` must fall back to the
      // default rather than pass "" down as if it were a token.
      model: flags.model || void 0,
      reps: flags.reps ? Number(flags.reps) : void 0,
      mode: flags.mode || void 0,
      canary: flags.canary !== void 0 && flags.canary !== "false",
      adapter,
      judge: flags.judge || void 0,
      timestamp: nowIso(),
      log: (m) => {
        if (ctx.hasUI) ctx.ui.setStatus?.("skill-harness", m);
      }
      // live footer only in TUI
    });
    say(ctx, `${card.skill} ${card.grade.letter} (${card.grade.pct}%) ${card.grade.ship ? "SHIP" : "NOT READY"}`, card.grade.ship ? "info" : "warning");
    for (const s of card.scenarios) say(ctx, `  ${s.id}: ${s.suspect ? "?" : s.verdict}`);
    if (card.failedTranscripts.length) say(ctx, `failed transcripts:
${card.failedTranscripts.join("\n")}`);
    return;
  }
  if (sub === "judge") {
    const runDir = resolve11(ctx.cwd, positional[0] ?? ".");
    const testsDir = dirname7(dirname7(dirname7(runDir)));
    const spec = loadSpec(join24(testsDir, "specification.yaml"));
    const prev = existsSync21(join24(runDir, "results.yaml")) ? readResults(runDir) : null;
    const judge = flags.judge ? parseModelRef(flags.judge) : prev?.judge ?? parseModelRef(defaultJudge());
    assertJudgeAllowed(judge, {
      source: flags.judge ? "--judge" : prev?.judge ? "the run's recorded judge" : "the default judge"
    });
    const resolvedAdapter = adapter ?? getAdapter(prev?.harness ?? "pi");
    const results = await regradeRun({
      runDir,
      spec,
      adapter: resolvedAdapter,
      judge,
      specDir: testsDir,
      now: nowIso
    });
    say(ctx, `re-judged ${runDir}: ${results.effective_grade.letter} (${results.effective_grade.pct}%)`);
    const judges = resolveAdjudicationJudges({
      enabled: flags["auto-rejudge"] !== void 0 && flags["auto-rejudge"] !== "false",
      primary: judge,
      secondaryToken: flags["secondary-judge"] || void 0,
      tieBreakToken: flags["tie-break-judge"] || void 0,
      subjectToken: results.model,
      parseRef: parseModelRef,
      assertAllowed: (j, source) => assertJudgeAllowed(j, { source }),
      resemblesSubject: judgeResemblesSubject,
      warn: (m) => say(ctx, m, "warning")
    });
    if (!judges) return;
    const plan = planAdjudication({
      cells: results.scenarios.map((sc) => ({
        id: sc.id,
        verdict: sc.judge_verdict,
        reason: sc.judge_reason,
        suspect: sc.suspect
      })),
      scenarios: spec.scenarios,
      shipBar: spec.ship_bar,
      critical: spec.critical,
      tieBreakAvailable: judges.tieBreak !== void 0
    });
    say(ctx, formatAdjudicationPlan(plan, judges));
    if (plan.triggered.length === 0) return;
    if (ctx.ui.confirm) {
      const ok = await ctx.ui.confirm(
        `adjudicate ${plan.triggered.length} cell(s)? up to ${plan.maxAdditionalCalls} additional judge call(s)`
      );
      if (!ok) {
        say(ctx, "cancelled \u2014 nothing spent");
        return;
      }
    } else {
      say(ctx, "  (no confirm dialog here \u2014 `--auto-rejudge` is the authorization)");
    }
    const adjudicated = await adjudicateRun({
      runDir,
      spec,
      adapter: resolvedAdapter,
      results,
      primaryJudge: judge,
      secondaryJudge: judges.secondary,
      tieBreakJudge: judges.tieBreak,
      specDir: testsDir,
      now: nowIso,
      log: (m) => say(ctx, m)
    });
    const ag = adjudicated.effective_grade;
    say(ctx, `adjudicated \u2192 ${ag.letter} (${ag.pct}%) ${ag.ship ? "SHIP" : "NOT READY"}`, ag.ship ? "info" : "warning");
    return;
  }
  if (sub === "coverage") {
    const skillDir = resolveSkillDir(ctx.cwd, positional[0]);
    const specPath = join24(skillDir, "tests", "specification.yaml");
    const spec = loadSpec(specPath);
    const specDir = dirname7(specPath);
    const report = computeCoverage({
      specDir,
      scenarios: spec.scenarios,
      baseFiles: [relative3(specDir, join24(skillDir, "SKILL.md")).split("\\").join("/")]
    });
    say(ctx, formatCoverage(report, spec.skill), report.broken.length ? "warning" : "info");
    return;
  }
  if (sub === "affected") {
    const skillDir = resolveSkillDir(ctx.cwd, positional[0]);
    const specPath = join24(skillDir, "tests", "specification.yaml");
    const spec = loadSpec(specPath);
    const base = flags.base || "HEAD";
    const rev = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: dirname7(specPath), timeoutMs: 3e4 });
    if (rev.code !== 0) {
      say(ctx, "affected needs a git repository to diff against", "error");
      return;
    }
    const repoRoot = rev.stdout.trim();
    const result = selectAffected({
      scenarios: spec.scenarios,
      specDir: dirname7(specPath),
      diff: await gitDiff(repoRoot, base),
      repoRoot
    });
    say(ctx, formatAffected(result, spec.scenarios.length));
    return;
  }
  if (sub === "capture") {
    const skillDir = resolveSkillDir(ctx.cwd, positional[0]);
    const ui = ctx.ui;
    if (!ctx.sessionManager || !ui.select || !ui.input || !ui.editor || !ui.confirm) {
      say(ctx, "capture needs an interactive pi session (it is unavailable under -p / --mode json)", "error");
      return;
    }
    const sm = ctx.sessionManager;
    const result = await runCapture(skillDir, {
      cwd: ctx.cwd,
      ui: {
        select: ui.select.bind(ui),
        input: ui.input.bind(ui),
        editor: ui.editor.bind(ui),
        confirm: ui.confirm.bind(ui),
        say: (m) => say(ctx, m)
      },
      sessionEntries: () => sm.getBranch(),
      sessionPath: () => sm.getSessionPath?.() ?? "",
      isStreaming: () => ctx.isStreaming?.() ?? false,
      homeDir: homedir2(),
      now: nowIso,
      runOnly: async (dir, scenarioId) => {
        const card = await runViaExtension({
          skillDir: dir,
          only: [scenarioId],
          adapter,
          timestamp: nowIso(),
          log: (m) => {
            if (ctx.hasUI) ctx.ui.setStatus?.("skill-harness", m);
          }
        });
        return card.scenarios.map((s) => `  ${s.id}: ${s.suspect ? "?" : s.verdict}`).join("\n");
      }
    });
    if (result.status !== "cancelled") say(ctx, `capture ${result.status}: ${result.capture?.id}`);
    return;
  }
  if (sub === "review") {
    const skillDir = resolveSkillDir(ctx.cwd, positional[0]);
    const spec = loadSpec(join24(skillDir, "tests", "specification.yaml"));
    const handle = await serveReview({
      skillDir,
      skillName: spec.skill,
      port: 0,
      open: false,
      adapter,
      assetsDir: opts?.assetsDir
      // threaded from index.ts via the closure, never off ctx
    });
    say(ctx, `review server: http://127.0.0.1:${handle.port}/`);
    return handle;
  }
  say(ctx, USAGE);
}
var reviewHandle = null;
function closeReview() {
  reviewHandle?.close();
  reviewHandle = null;
}
function registerCommand(pi, assetsDir) {
  pi.registerCommand("skill-harness", {
    description: "Run, judge, or review a skill's scenarios",
    handler: async (args, ctx) => {
      const h = await handleSkillCheck(args, ctx, { assetsDir });
      if (h) {
        reviewHandle?.close();
        reviewHandle = h;
      }
    }
  });
}

// packages/pi-extension/src/tool.ts
import { Type as Type2 } from "typebox";
var skillCheckRunTool = {
  name: "skill_check_run",
  label: "Run skill-harness",
  description: "Run a skill's scenarios and return the scorecard (grade, per-scenario verdicts, failed transcripts). Use after editing a skill to validate it.",
  promptGuidelines: ["Use skill_check_run after editing a skill to validate it against its scenarios."],
  parameters: Type2.Object({
    skill: Type2.Optional(Type2.String({ description: "skill dir/name; defaults to the current project" })),
    model: Type2.Optional(Type2.String({ description: "provider:model token under test" })),
    reps: Type2.Optional(Type2.Number({ description: "run each scenario N times", minimum: 1, maximum: 20 })),
    mode: Type2.Optional(Type2.String({ description: "red | green | force (green and force are scored; red is the baseline)" })),
    canary: Type2.Optional(Type2.Boolean({ description: "green only: spend one probe proving the skill reached the model, and abort if it did not" }))
  }),
  async execute(_id, params, _signal, onUpdate, ctx) {
    const skillDir = resolveSkillDir(ctx.cwd, params.skill);
    const card = await runViaExtension({
      skillDir,
      model: params.model,
      reps: params.reps,
      mode: params.mode,
      canary: params.canary,
      adapter: ctx.__adapter,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      log: (m) => onUpdate?.({ content: [{ type: "text", text: m }] })
    });
    const summary = `${card.skill} ${card.grade.letter} (${card.grade.pct}%) \u2014 ${card.grade.ship ? "SHIP" : "NOT READY"}
` + card.scenarios.map((s) => `  ${s.id}: ${s.suspect ? "? (suspect)" : s.verdict}`).join("\n") + (card.failedTranscripts.length ? `
failed transcripts:
${card.failedTranscripts.join("\n")}` : "");
    return { content: [{ type: "text", text: summary }], details: card };
  }
};
function registerTool(pi) {
  pi.registerTool(skillCheckRunTool);
}

// packages/pi-extension/src/index.ts
function index_default(pi) {
  const assetsDir = join25(dirname8(fileURLToPath2(import.meta.url)), "..", "..", "..", "assets");
  registerCommand(pi, assetsDir);
  registerTool(pi);
  pi.on("session_shutdown", async () => {
    closeReview();
  });
}
export {
  index_default as default
};
/*! Bundled license information:

js-yaml/dist/js-yaml.mjs:
  (*! js-yaml 4.2.0 https://github.com/nodeca/js-yaml @license MIT *)
*/
