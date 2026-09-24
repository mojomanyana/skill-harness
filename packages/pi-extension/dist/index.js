// packages/pi-extension/src/index.ts
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { basename as basename3, dirname as dirname9, join as join27 } from "node:path";

// packages/pi-extension/src/commands.ts
import { existsSync as existsSync19 } from "node:fs";
import { dirname as dirname8, join as join26, resolve as resolve12, relative as relative4 } from "node:path";

// packages/core/dist/spec.js
import { readFileSync } from "node:fs";

// node_modules/js-yaml/dist/js-yaml.mjs
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var jsYaml = {};
var loader = {};
var common = {};
var hasRequiredCommon;
function requireCommon() {
  if (hasRequiredCommon) return common;
  hasRequiredCommon = 1;
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
    for (let cycle = 0; cycle < count; cycle += 1) {
      result += string;
    }
    return result;
  }
  function isNegativeZero(number) {
    return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
  }
  common.isNothing = isNothing;
  common.isObject = isObject;
  common.toArray = toArray;
  common.repeat = repeat;
  common.isNegativeZero = isNegativeZero;
  common.extend = extend;
  return common;
}
var exception;
var hasRequiredException;
function requireException() {
  if (hasRequiredException) return exception;
  hasRequiredException = 1;
  function formatError(exception2, compact) {
    let where = "";
    const message = exception2.reason || "(unknown reason)";
    if (!exception2.mark) return message;
    if (exception2.mark.name) {
      where += 'in "' + exception2.mark.name + '" ';
    }
    where += "(" + (exception2.mark.line + 1) + ":" + (exception2.mark.column + 1) + ")";
    if (!compact && exception2.mark.snippet) {
      where += "\n\n" + exception2.mark.snippet;
    }
    return message + " " + where;
  }
  function YAMLException2(reason, mark) {
    Error.call(this);
    this.name = "YAMLException";
    this.reason = reason;
    this.mark = mark;
    this.message = formatError(this, false);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error().stack || "";
    }
  }
  YAMLException2.prototype = Object.create(Error.prototype);
  YAMLException2.prototype.constructor = YAMLException2;
  YAMLException2.prototype.toString = function toString(compact) {
    return this.name + ": " + formatError(this, compact);
  };
  exception = YAMLException2;
  return exception;
}
var snippet;
var hasRequiredSnippet;
function requireSnippet() {
  if (hasRequiredSnippet) return snippet;
  hasRequiredSnippet = 1;
  const common2 = requireCommon();
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
      // relative position
    };
  }
  function padStart(string, max) {
    return common2.repeat(" ", max - string.length) + string;
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
      if (mark.position <= match.index && foundLineNo < 0) {
        foundLineNo = lineStarts.length - 2;
      }
    }
    if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
    let result = "";
    const lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
    const maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
    for (let i = 1; i <= options.linesBefore; i++) {
      if (foundLineNo - i < 0) break;
      const line2 = getLine(
        mark.buffer,
        lineStarts[foundLineNo - i],
        lineEnds[foundLineNo - i],
        mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
        maxLineLength
      );
      result = common2.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line2.str + "\n" + result;
    }
    const line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
    result += common2.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
    result += common2.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
    for (let i = 1; i <= options.linesAfter; i++) {
      if (foundLineNo + i >= lineEnds.length) break;
      const line2 = getLine(
        mark.buffer,
        lineStarts[foundLineNo + i],
        lineEnds[foundLineNo + i],
        mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
        maxLineLength
      );
      result += common2.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line2.str + "\n";
    }
    return result.replace(/\n$/, "");
  }
  snippet = makeSnippet;
  return snippet;
}
var type;
var hasRequiredType;
function requireType() {
  if (hasRequiredType) return type;
  hasRequiredType = 1;
  const YAMLException2 = requireException();
  const TYPE_CONSTRUCTOR_OPTIONS = [
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
  const YAML_NODE_KINDS = [
    "scalar",
    "sequence",
    "mapping"
  ];
  function compileStyleAliases(map2) {
    const result = {};
    if (map2 !== null) {
      Object.keys(map2).forEach(function(style) {
        map2[style].forEach(function(alias) {
          result[String(alias)] = style;
        });
      });
    }
    return result;
  }
  function Type22(tag, options) {
    options = options || {};
    Object.keys(options).forEach(function(name) {
      if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
        throw new YAMLException2('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
      }
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
    if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
      throw new YAMLException2('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
    }
  }
  type = Type22;
  return type;
}
var schema;
var hasRequiredSchema;
function requireSchema() {
  if (hasRequiredSchema) return schema;
  hasRequiredSchema = 1;
  const YAMLException2 = requireException();
  const Type22 = requireType();
  function compileList(schema2, name) {
    const result = [];
    schema2[name].forEach(function(currentType) {
      let newIndex = result.length;
      result.forEach(function(previousType, previousIndex) {
        if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
          newIndex = previousIndex;
        }
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
    function collectType(type2) {
      if (type2.multi) {
        result.multi[type2.kind].push(type2);
        result.multi["fallback"].push(type2);
      } else {
        result[type2.kind][type2.tag] = result["fallback"][type2.tag] = type2;
      }
    }
    for (let index = 0, length = arguments.length; index < length; index += 1) {
      arguments[index].forEach(collectType);
    }
    return result;
  }
  function Schema2(definition) {
    return this.extend(definition);
  }
  Schema2.prototype.extend = function extend(definition) {
    let implicit = [];
    let explicit = [];
    if (definition instanceof Type22) {
      explicit.push(definition);
    } else if (Array.isArray(definition)) {
      explicit = explicit.concat(definition);
    } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
      if (definition.implicit) implicit = implicit.concat(definition.implicit);
      if (definition.explicit) explicit = explicit.concat(definition.explicit);
    } else {
      throw new YAMLException2("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
    }
    implicit.forEach(function(type2) {
      if (!(type2 instanceof Type22)) {
        throw new YAMLException2("Specified list of YAML types (or a single Type object) contains a non-Type object.");
      }
      if (type2.loadKind && type2.loadKind !== "scalar") {
        throw new YAMLException2("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
      }
      if (type2.multi) {
        throw new YAMLException2("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
      }
    });
    explicit.forEach(function(type2) {
      if (!(type2 instanceof Type22)) {
        throw new YAMLException2("Specified list of YAML types (or a single Type object) contains a non-Type object.");
      }
    });
    const result = Object.create(Schema2.prototype);
    result.implicit = (this.implicit || []).concat(implicit);
    result.explicit = (this.explicit || []).concat(explicit);
    result.compiledImplicit = compileList(result, "implicit");
    result.compiledExplicit = compileList(result, "explicit");
    result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
    return result;
  };
  schema = Schema2;
  return schema;
}
var str;
var hasRequiredStr;
function requireStr() {
  if (hasRequiredStr) return str;
  hasRequiredStr = 1;
  const Type22 = requireType();
  str = new Type22("tag:yaml.org,2002:str", {
    kind: "scalar",
    construct: function(data) {
      return data !== null ? data : "";
    }
  });
  return str;
}
var seq;
var hasRequiredSeq;
function requireSeq() {
  if (hasRequiredSeq) return seq;
  hasRequiredSeq = 1;
  const Type22 = requireType();
  seq = new Type22("tag:yaml.org,2002:seq", {
    kind: "sequence",
    construct: function(data) {
      return data !== null ? data : [];
    }
  });
  return seq;
}
var map;
var hasRequiredMap;
function requireMap() {
  if (hasRequiredMap) return map;
  hasRequiredMap = 1;
  const Type22 = requireType();
  map = new Type22("tag:yaml.org,2002:map", {
    kind: "mapping",
    construct: function(data) {
      return data !== null ? data : {};
    }
  });
  return map;
}
var failsafe;
var hasRequiredFailsafe;
function requireFailsafe() {
  if (hasRequiredFailsafe) return failsafe;
  hasRequiredFailsafe = 1;
  const Schema2 = requireSchema();
  failsafe = new Schema2({
    explicit: [
      requireStr(),
      requireSeq(),
      requireMap()
    ]
  });
  return failsafe;
}
var _null;
var hasRequired_null;
function require_null() {
  if (hasRequired_null) return _null;
  hasRequired_null = 1;
  const Type22 = requireType();
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
  _null = new Type22("tag:yaml.org,2002:null", {
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
  return _null;
}
var bool;
var hasRequiredBool;
function requireBool() {
  if (hasRequiredBool) return bool;
  hasRequiredBool = 1;
  const Type22 = requireType();
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
  bool = new Type22("tag:yaml.org,2002:bool", {
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
  return bool;
}
var int;
var hasRequiredInt;
function requireInt() {
  if (hasRequiredInt) return int;
  hasRequiredInt = 1;
  const common2 = requireCommon();
  const Type22 = requireType();
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
    if (ch === "-" || ch === "+") {
      ch = data[++index];
    }
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
        return hasDigits && isFinite(parseYamlInteger(data));
      }
      if (ch === "x") {
        index++;
        for (; index < max; index++) {
          if (!isHexCode(data.charCodeAt(index))) return false;
          hasDigits = true;
        }
        return hasDigits && isFinite(parseYamlInteger(data));
      }
      if (ch === "o") {
        index++;
        for (; index < max; index++) {
          if (!isOctCode(data.charCodeAt(index))) return false;
          hasDigits = true;
        }
        return hasDigits && isFinite(parseYamlInteger(data));
      }
    }
    for (; index < max; index++) {
      if (!isDecCode(data.charCodeAt(index))) {
        return false;
      }
      hasDigits = true;
    }
    if (!hasDigits) return false;
    return isFinite(parseYamlInteger(data));
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
    return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common2.isNegativeZero(object));
  }
  int = new Type22("tag:yaml.org,2002:int", {
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
  return int;
}
var float;
var hasRequiredFloat;
function requireFloat() {
  if (hasRequiredFloat) return float;
  hasRequiredFloat = 1;
  const common2 = requireCommon();
  const Type22 = requireType();
  const YAML_FLOAT_PATTERN = new RegExp(
    // 2.5e4, 2.5 and integers
    "^(?:[-+]?(?:[0-9]+)(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
  );
  const YAML_FLOAT_SPECIAL_PATTERN = new RegExp(
    "^(?:[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
  );
  function resolveYamlFloat(data) {
    if (data === null) return false;
    if (!YAML_FLOAT_PATTERN.test(data)) {
      return false;
    }
    if (isFinite(parseFloat(data, 10))) {
      return true;
    }
    return YAML_FLOAT_SPECIAL_PATTERN.test(data);
  }
  function constructYamlFloat(data) {
    let value = data.toLowerCase();
    const sign = value[0] === "-" ? -1 : 1;
    if ("+-".indexOf(value[0]) >= 0) {
      value = value.slice(1);
    }
    if (value === ".inf") {
      return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    } else if (value === ".nan") {
      return NaN;
    }
    return sign * parseFloat(value, 10);
  }
  const SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
  function representYamlFloat(object, style) {
    if (isNaN(object)) {
      switch (style) {
        case "lowercase":
          return ".nan";
        case "uppercase":
          return ".NAN";
        case "camelcase":
          return ".NaN";
      }
    } else if (Number.POSITIVE_INFINITY === object) {
      switch (style) {
        case "lowercase":
          return ".inf";
        case "uppercase":
          return ".INF";
        case "camelcase":
          return ".Inf";
      }
    } else if (Number.NEGATIVE_INFINITY === object) {
      switch (style) {
        case "lowercase":
          return "-.inf";
        case "uppercase":
          return "-.INF";
        case "camelcase":
          return "-.Inf";
      }
    } else if (common2.isNegativeZero(object)) {
      return "-0.0";
    }
    const res = object.toString(10);
    return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
  }
  function isFloat(object) {
    return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common2.isNegativeZero(object));
  }
  float = new Type22("tag:yaml.org,2002:float", {
    kind: "scalar",
    resolve: resolveYamlFloat,
    construct: constructYamlFloat,
    predicate: isFloat,
    represent: representYamlFloat,
    defaultStyle: "lowercase"
  });
  return float;
}
var json;
var hasRequiredJson;
function requireJson() {
  if (hasRequiredJson) return json;
  hasRequiredJson = 1;
  json = requireFailsafe().extend({
    implicit: [
      require_null(),
      requireBool(),
      requireInt(),
      requireFloat()
    ]
  });
  return json;
}
var core;
var hasRequiredCore;
function requireCore() {
  if (hasRequiredCore) return core;
  hasRequiredCore = 1;
  core = requireJson();
  return core;
}
var timestamp;
var hasRequiredTimestamp;
function requireTimestamp() {
  if (hasRequiredTimestamp) return timestamp;
  hasRequiredTimestamp = 1;
  const Type22 = requireType();
  const YAML_DATE_REGEXP = new RegExp(
    "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
  );
  const YAML_TIMESTAMP_REGEXP = new RegExp(
    "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
  );
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
    if (!match[4]) {
      return new Date(Date.UTC(year, month, day));
    }
    const hour = +match[4];
    const minute = +match[5];
    const second = +match[6];
    if (match[7]) {
      fraction = match[7].slice(0, 3);
      while (fraction.length < 3) {
        fraction += "0";
      }
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
  timestamp = new Type22("tag:yaml.org,2002:timestamp", {
    kind: "scalar",
    resolve: resolveYamlTimestamp,
    construct: constructYamlTimestamp,
    instanceOf: Date,
    represent: representYamlTimestamp
  });
  return timestamp;
}
var merge;
var hasRequiredMerge;
function requireMerge() {
  if (hasRequiredMerge) return merge;
  hasRequiredMerge = 1;
  const Type22 = requireType();
  function resolveYamlMerge(data) {
    return data === "<<" || data === null;
  }
  merge = new Type22("tag:yaml.org,2002:merge", {
    kind: "scalar",
    resolve: resolveYamlMerge
  });
  return merge;
}
var binary;
var hasRequiredBinary;
function requireBinary() {
  if (hasRequiredBinary) return binary;
  hasRequiredBinary = 1;
  const Type22 = requireType();
  const BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
  function resolveYamlBinary(data) {
    if (data === null) return false;
    let bitlen = 0;
    const max = data.length;
    const map2 = BASE64_MAP;
    for (let idx = 0; idx < max; idx++) {
      const code = map2.indexOf(data.charAt(idx));
      if (code > 64) continue;
      if (code < 0) return false;
      bitlen += 6;
    }
    return bitlen % 8 === 0;
  }
  function constructYamlBinary(data) {
    const input = data.replace(/[\r\n=]/g, "");
    const max = input.length;
    const map2 = BASE64_MAP;
    let bits = 0;
    const result = [];
    for (let idx = 0; idx < max; idx++) {
      if (idx % 4 === 0 && idx) {
        result.push(bits >> 16 & 255);
        result.push(bits >> 8 & 255);
        result.push(bits & 255);
      }
      bits = bits << 6 | map2.indexOf(input.charAt(idx));
    }
    const tailbits = max % 4 * 6;
    if (tailbits === 0) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    } else if (tailbits === 18) {
      result.push(bits >> 10 & 255);
      result.push(bits >> 2 & 255);
    } else if (tailbits === 12) {
      result.push(bits >> 4 & 255);
    }
    return new Uint8Array(result);
  }
  function representYamlBinary(object) {
    let result = "";
    let bits = 0;
    const max = object.length;
    const map2 = BASE64_MAP;
    for (let idx = 0; idx < max; idx++) {
      if (idx % 3 === 0 && idx) {
        result += map2[bits >> 18 & 63];
        result += map2[bits >> 12 & 63];
        result += map2[bits >> 6 & 63];
        result += map2[bits & 63];
      }
      bits = (bits << 8) + object[idx];
    }
    const tail = max % 3;
    if (tail === 0) {
      result += map2[bits >> 18 & 63];
      result += map2[bits >> 12 & 63];
      result += map2[bits >> 6 & 63];
      result += map2[bits & 63];
    } else if (tail === 2) {
      result += map2[bits >> 10 & 63];
      result += map2[bits >> 4 & 63];
      result += map2[bits << 2 & 63];
      result += map2[64];
    } else if (tail === 1) {
      result += map2[bits >> 2 & 63];
      result += map2[bits << 4 & 63];
      result += map2[64];
      result += map2[64];
    }
    return result;
  }
  function isBinary(obj) {
    return Object.prototype.toString.call(obj) === "[object Uint8Array]";
  }
  binary = new Type22("tag:yaml.org,2002:binary", {
    kind: "scalar",
    resolve: resolveYamlBinary,
    construct: constructYamlBinary,
    predicate: isBinary,
    represent: representYamlBinary
  });
  return binary;
}
var omap;
var hasRequiredOmap;
function requireOmap() {
  if (hasRequiredOmap) return omap;
  hasRequiredOmap = 1;
  const Type22 = requireType();
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  const _toString = Object.prototype.toString;
  function resolveYamlOmap(data) {
    if (data === null) return true;
    const objectKeys = {};
    const object = data;
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      let pairHasKey = false;
      if (_toString.call(pair) !== "[object Object]") return false;
      let pairKey;
      for (pairKey in pair) {
        if (_hasOwnProperty.call(pair, pairKey)) {
          if (!pairHasKey) pairHasKey = true;
          else return false;
        }
      }
      if (!pairHasKey) return false;
      if (_hasOwnProperty.call(objectKeys, pairKey)) return false;
      Object.defineProperty(objectKeys, pairKey, { value: true });
    }
    return true;
  }
  function constructYamlOmap(data) {
    return data !== null ? data : [];
  }
  omap = new Type22("tag:yaml.org,2002:omap", {
    kind: "sequence",
    resolve: resolveYamlOmap,
    construct: constructYamlOmap
  });
  return omap;
}
var pairs;
var hasRequiredPairs;
function requirePairs() {
  if (hasRequiredPairs) return pairs;
  hasRequiredPairs = 1;
  const Type22 = requireType();
  const _toString = Object.prototype.toString;
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
  pairs = new Type22("tag:yaml.org,2002:pairs", {
    kind: "sequence",
    resolve: resolveYamlPairs,
    construct: constructYamlPairs
  });
  return pairs;
}
var set;
var hasRequiredSet;
function requireSet() {
  if (hasRequiredSet) return set;
  hasRequiredSet = 1;
  const Type22 = requireType();
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  function resolveYamlSet(data) {
    if (data === null) return true;
    const object = data;
    for (const key in object) {
      if (_hasOwnProperty.call(object, key)) {
        if (object[key] !== null) return false;
      }
    }
    return true;
  }
  function constructYamlSet(data) {
    return data !== null ? data : {};
  }
  set = new Type22("tag:yaml.org,2002:set", {
    kind: "mapping",
    resolve: resolveYamlSet,
    construct: constructYamlSet
  });
  return set;
}
var _default;
var hasRequired_default;
function require_default() {
  if (hasRequired_default) return _default;
  hasRequired_default = 1;
  _default = requireCore().extend({
    implicit: [
      requireTimestamp(),
      requireMerge()
    ],
    explicit: [
      requireBinary(),
      requireOmap(),
      requirePairs(),
      requireSet()
    ]
  });
  return _default;
}
var hasRequiredLoader;
function requireLoader() {
  if (hasRequiredLoader) return loader;
  hasRequiredLoader = 1;
  const common2 = requireCommon();
  const YAMLException2 = requireException();
  const makeSnippet = requireSnippet();
  const DEFAULT_SCHEMA2 = require_default();
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  const CONTEXT_FLOW_IN = 1;
  const CONTEXT_FLOW_OUT = 2;
  const CONTEXT_BLOCK_IN = 3;
  const CONTEXT_BLOCK_OUT = 4;
  const CHOMPING_CLIP = 1;
  const CHOMPING_STRIP = 2;
  const CHOMPING_KEEP = 3;
  const PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
  const PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
  const PATTERN_FLOW_INDICATORS = /[,\[\]{}]/;
  const PATTERN_TAG_HANDLE = /^(?:!|!!|![0-9A-Za-z-]+!)$/;
  const PATTERN_TAG_URI = /^(?:!|[^,\[\]{}])(?:%[0-9a-f]{2}|[0-9a-z\-#;/?:@&=+$,_.!~*'()\[\]])*$/i;
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
    if (c >= 48 && c <= 57) {
      return c - 48;
    }
    const lc = c | 32;
    if (lc >= 97 && lc <= 102) {
      return lc - 97 + 10;
    }
    return -1;
  }
  function escapedHexLen(c) {
    if (c === 120) {
      return 2;
    }
    if (c === 117) {
      return 4;
    }
    if (c === 85) {
      return 8;
    }
    return 0;
  }
  function fromDecimalCode(c) {
    if (c >= 48 && c <= 57) {
      return c - 48;
    }
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
    if (c <= 65535) {
      return String.fromCharCode(c);
    }
    return String.fromCharCode(
      (c - 65536 >> 10) + 55296,
      (c - 65536 & 1023) + 56320
    );
  }
  function setProperty(object, key, value) {
    if (key === "__proto__") {
      Object.defineProperty(object, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value
      });
    } else {
      object[key] = value;
    }
  }
  const simpleEscapeCheck = new Array(256);
  const simpleEscapeMap = new Array(256);
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
    this.maxTotalMergeKeys = typeof options["maxTotalMergeKeys"] === "number" ? options["maxTotalMergeKeys"] : 1e4;
    this.implicitTypes = this.schema.compiledImplicit;
    this.typeMap = this.schema.compiledTypeMap;
    this.length = input.length;
    this.position = 0;
    this.line = 0;
    this.lineStart = 0;
    this.lineIndent = 0;
    this.depth = 0;
    this.totalMergeKeys = 0;
    this.firstTabInLine = -1;
    this.documents = [];
    this.anchorMapTransactions = [];
  }
  function generateError(state, message) {
    const mark = {
      name: state.filename,
      buffer: state.input.slice(0, -1),
      // omit trailing \0
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
    if (state.onWarning) {
      state.onWarning.call(null, generateError(state, message));
    }
  }
  function storeAnchor(state, name, value) {
    const transactions = state.anchorMapTransactions;
    if (transactions.length !== 0) {
      const transaction = transactions[transactions.length - 1];
      if (!_hasOwnProperty.call(transaction, name)) {
        transaction[name] = {
          existed: _hasOwnProperty.call(state.anchorMap, name),
          value: state.anchorMap[name]
        };
      }
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
      if (!_hasOwnProperty.call(parent, name)) {
        parent[name] = transaction[name];
      }
    }
  }
  function rollbackAnchorTransaction(state) {
    const transaction = state.anchorMapTransactions.pop();
    const names = Object.keys(transaction);
    for (let index = names.length - 1; index >= 0; index -= 1) {
      const entry = transaction[names[index]];
      if (entry.existed) {
        state.anchorMap[names[index]] = entry.value;
      } else {
        delete state.anchorMap[names[index]];
      }
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
  const directiveHandlers = {
    YAML: function handleYamlDirective(state, name, args) {
      if (state.version !== null) {
        throwError(state, "duplication of %YAML directive");
      }
      if (args.length !== 1) {
        throwError(state, "YAML directive accepts exactly one argument");
      }
      const match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
      if (match === null) {
        throwError(state, "ill-formed argument of the YAML directive");
      }
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      if (major !== 1) {
        throwError(state, "unacceptable YAML version of the document");
      }
      state.version = args[0];
      state.checkLineBreaks = minor < 2;
      if (minor !== 1 && minor !== 2) {
        throwWarning(state, "unsupported YAML version of the document");
      }
    },
    TAG: function handleTagDirective(state, name, args) {
      let prefix;
      if (args.length !== 2) {
        throwError(state, "TAG directive accepts exactly two arguments");
      }
      const handle = args[0];
      prefix = args[1];
      if (!PATTERN_TAG_HANDLE.test(handle)) {
        throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
      }
      if (_hasOwnProperty.call(state.tagMap, handle)) {
        throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
      }
      if (!PATTERN_TAG_URI.test(prefix)) {
        throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
      }
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
      if (checkJson) {
        for (let _position = 0, _length = _result.length; _position < _length; _position += 1) {
          const _character = _result.charCodeAt(_position);
          if (!(_character === 9 || _character >= 32 && _character <= 1114111)) {
            throwError(state, "expected valid JSON character");
          }
        }
      } else if (PATTERN_NON_PRINTABLE.test(_result)) {
        throwError(state, "the stream contains non-printable characters");
      }
      state.result += _result;
    }
  }
  function chargeMergeWork(state) {
    state.totalMergeKeys++;
    if (state.maxTotalMergeKeys !== -1 && state.totalMergeKeys > state.maxTotalMergeKeys) {
      throwError(state, "merge keys exceeded maxTotalMergeKeys (" + state.maxTotalMergeKeys + ")");
    }
  }
  function mergeMappings(state, destination, source, overridableKeys) {
    if (!common2.isObject(source)) {
      throwError(state, "cannot merge mappings; the provided source object is unacceptable");
    }
    chargeMergeWork(state);
    const sourceKeys = Object.keys(source);
    for (let index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
      const key = sourceKeys[index];
      chargeMergeWork(state);
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
        if (Array.isArray(keyNode[index])) {
          throwError(state, "nested arrays are not supported inside keys");
        }
        if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
          keyNode[index] = "[object Object]";
        }
      }
    }
    if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
      keyNode = "[object Object]";
    }
    keyNode = String(keyNode);
    if (_result === null) {
      _result = {};
    }
    if (keyTag === "tag:yaml.org,2002:merge") {
      if (Array.isArray(valueNode)) {
        if (valueNode.length > 100) {
          throwError(state, "abnormal merge sequence size");
        }
        for (let index = 0, quantity = valueNode.length; index < quantity; index += 1) {
          mergeMappings(state, _result, valueNode[index], overridableKeys);
        }
      } else {
        mergeMappings(state, _result, valueNode, overridableKeys);
      }
    } else {
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
    if (ch === 10) {
      state.position++;
    } else if (ch === 13) {
      state.position++;
      if (state.input.charCodeAt(state.position) === 10) {
        state.position++;
      }
    } else {
      throwError(state, "a line break is expected");
    }
    state.line += 1;
    state.lineStart = state.position;
    state.firstTabInLine = -1;
  }
  function skipSeparationSpace(state, allowComments, checkIndent) {
    let lineBreaks = 0;
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      while (isWhiteSpace(ch)) {
        if (ch === 9 && state.firstTabInLine === -1) {
          state.firstTabInLine = state.position;
        }
        ch = state.input.charCodeAt(++state.position);
      }
      if (allowComments && ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 10 && ch !== 13 && ch !== 0);
      }
      if (isEol(ch)) {
        readLineBreak(state);
        ch = state.input.charCodeAt(state.position);
        lineBreaks++;
        state.lineIndent = 0;
        while (ch === 32) {
          state.lineIndent++;
          ch = state.input.charCodeAt(++state.position);
        }
      } else {
        break;
      }
    }
    if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
      throwWarning(state, "deficient indentation");
    }
    return lineBreaks;
  }
  function testDocumentSeparator(state) {
    let _position = state.position;
    let ch = state.input.charCodeAt(_position);
    if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
      _position += 3;
      ch = state.input.charCodeAt(_position);
      if (ch === 0 || isWsOrEol(ch)) {
        return true;
      }
    }
    return false;
  }
  function writeFoldedLines(state, count) {
    if (count === 1) {
      state.result += " ";
    } else if (count > 1) {
      state.result += common2.repeat("\n", count - 1);
    }
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
    if (isWsOrEol(ch) || isFlowIndicator(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
      return false;
    }
    if (ch === 63 || ch === 45) {
      const following = state.input.charCodeAt(state.position + 1);
      if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) {
        return false;
      }
    }
    state.kind = "scalar";
    state.result = "";
    captureStart = captureEnd = state.position;
    hasPendingContent = false;
    while (ch !== 0) {
      if (ch === 58) {
        const following = state.input.charCodeAt(state.position + 1);
        if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) {
          break;
        }
      } else if (ch === 35) {
        const preceding = state.input.charCodeAt(state.position - 1);
        if (isWsOrEol(preceding)) {
          break;
        }
      } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && isFlowIndicator(ch)) {
        break;
      } else if (isEol(ch)) {
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
      if (!isWhiteSpace(ch)) {
        captureEnd = state.position + 1;
      }
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, captureEnd, false);
    if (state.result) {
      return true;
    }
    state.kind = _kind;
    state.result = _result;
    return false;
  }
  function readSingleQuotedScalar(state, nodeIndent) {
    let captureStart;
    let captureEnd;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 39) {
      return false;
    }
    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      if (ch === 39) {
        captureSegment(state, captureStart, state.position, true);
        ch = state.input.charCodeAt(++state.position);
        if (ch === 39) {
          captureStart = state.position;
          state.position++;
          captureEnd = state.position;
        } else {
          return true;
        }
      } else if (isEol(ch)) {
        captureSegment(state, captureStart, captureEnd, true);
        writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
        captureStart = captureEnd = state.position;
      } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
        throwError(state, "unexpected end of the document within a single quoted scalar");
      } else {
        state.position++;
        if (!isWhiteSpace(ch)) {
          captureEnd = state.position;
        }
      }
    }
    throwError(state, "unexpected end of the stream within a single quoted scalar");
  }
  function readDoubleQuotedScalar(state, nodeIndent) {
    let captureStart;
    let captureEnd;
    let tmp;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 34) {
      return false;
    }
    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      if (ch === 34) {
        captureSegment(state, captureStart, state.position, true);
        state.position++;
        return true;
      } else if (ch === 92) {
        captureSegment(state, captureStart, state.position, true);
        ch = state.input.charCodeAt(++state.position);
        if (isEol(ch)) {
          skipSeparationSpace(state, false, nodeIndent);
        } else if (ch < 256 && simpleEscapeCheck[ch]) {
          state.result += simpleEscapeMap[ch];
          state.position++;
        } else if ((tmp = escapedHexLen(ch)) > 0) {
          let hexLength = tmp;
          let hexResult = 0;
          for (; hexLength > 0; hexLength--) {
            ch = state.input.charCodeAt(++state.position);
            if ((tmp = fromHexCode(ch)) >= 0) {
              hexResult = (hexResult << 4) + tmp;
            } else {
              throwError(state, "expected hexadecimal character");
            }
          }
          state.result += charFromCodepoint(hexResult);
          state.position++;
        } else {
          throwError(state, "unknown escape sequence");
        }
        captureStart = captureEnd = state.position;
      } else if (isEol(ch)) {
        captureSegment(state, captureStart, captureEnd, true);
        writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
        captureStart = captureEnd = state.position;
      } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
        throwError(state, "unexpected end of the document within a double quoted scalar");
      } else {
        state.position++;
        if (!isWhiteSpace(ch)) {
          captureEnd = state.position;
        }
      }
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
    } else {
      return false;
    }
    if (state.anchor !== null) {
      storeAnchor(state, state.anchor, _result);
    }
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
      } else if (!readNext) {
        throwError(state, "missed comma between flow collection entries");
      } else if (ch === 44) {
        throwError(state, "expected the node content, but found ','");
      }
      keyTag = keyNode = valueNode = null;
      isPair = isExplicitPair = false;
      if (ch === 63) {
        const following = state.input.charCodeAt(state.position + 1);
        if (isWsOrEol(following)) {
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
      if (isMapping) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
      } else if (isPair) {
        _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
      } else {
        _result.push(keyNode);
      }
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if (ch === 44) {
        readNext = true;
        ch = state.input.charCodeAt(++state.position);
      } else {
        readNext = false;
      }
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
    if (ch === 124) {
      folding = false;
    } else if (ch === 62) {
      folding = true;
    } else {
      return false;
    }
    state.kind = "scalar";
    state.result = "";
    while (ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
      if (ch === 43 || ch === 45) {
        if (CHOMPING_CLIP === chomping) {
          chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
        } else {
          throwError(state, "repeat of a chomping mode identifier");
        }
      } else if ((tmp = fromDecimalCode(ch)) >= 0) {
        if (tmp === 0) {
          throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
        } else if (!detectedIndent) {
          textIndent = nodeIndent + tmp - 1;
          detectedIndent = true;
        } else {
          throwError(state, "repeat of an indentation width identifier");
        }
      } else {
        break;
      }
    }
    if (isWhiteSpace(ch)) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (isWhiteSpace(ch));
      if (ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (!isEol(ch) && ch !== 0);
      }
    }
    while (ch !== 0) {
      readLineBreak(state);
      state.lineIndent = 0;
      ch = state.input.charCodeAt(state.position);
      while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
      if (!detectedIndent && state.lineIndent > textIndent) {
        textIndent = state.lineIndent;
      }
      if (isEol(ch)) {
        emptyLines++;
        continue;
      }
      if (!detectedIndent && textIndent === 0) {
        throwError(state, "missing indentation for block scalar");
      }
      if (state.lineIndent < textIndent) {
        if (chomping === CHOMPING_KEEP) {
          state.result += common2.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
        } else if (chomping === CHOMPING_CLIP) {
          if (didReadContent) {
            state.result += "\n";
          }
        }
        break;
      }
      if (folding) {
        if (isWhiteSpace(ch)) {
          atMoreIndented = true;
          state.result += common2.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
        } else if (atMoreIndented) {
          atMoreIndented = false;
          state.result += common2.repeat("\n", emptyLines + 1);
        } else if (emptyLines === 0) {
          if (didReadContent) {
            state.result += " ";
          }
        } else {
          state.result += common2.repeat("\n", emptyLines);
        }
      } else {
        state.result += common2.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      }
      didReadContent = true;
      detectedIndent = true;
      emptyLines = 0;
      const captureStart = state.position;
      while (!isEol(ch) && ch !== 0) {
        ch = state.input.charCodeAt(++state.position);
      }
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
    if (state.anchor !== null) {
      storeAnchor(state, state.anchor, _result);
    }
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      if (state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        throwError(state, "tab characters must not be used in indentation");
      }
      if (ch !== 45) {
        break;
      }
      const following = state.input.charCodeAt(state.position + 1);
      if (!isWsOrEol(following)) {
        break;
      }
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
      if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
        throwError(state, "bad indentation of a sequence entry");
      } else if (state.lineIndent < nodeIndent) {
        break;
      }
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
    if (state.anchor !== null) {
      storeAnchor(state, state.anchor, _result);
    }
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
        } else {
          throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
        }
        state.position += 1;
        ch = following;
      } else {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
        if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
          break;
        }
        if (state.line === _line) {
          ch = state.input.charCodeAt(state.position);
          while (isWhiteSpace(ch)) {
            ch = state.input.charCodeAt(++state.position);
          }
          if (ch === 58) {
            ch = state.input.charCodeAt(++state.position);
            if (!isWsOrEol(ch)) {
              throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
            }
            if (atExplicitKey) {
              storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
              keyTag = keyNode = valueNode = null;
            }
            detected = true;
            atExplicitKey = false;
            allowCompact = false;
            keyTag = state.tag;
            keyNode = state.result;
          } else if (detected) {
            throwError(state, "can not read an implicit mapping pair; a colon is missed");
          } else {
            state.tag = _tag;
            state.anchor = _anchor;
            return true;
          }
        } else if (detected) {
          throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
        } else {
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
        if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
          if (atExplicitKey) {
            keyNode = state.result;
          } else {
            valueNode = state.result;
          }
        }
        if (!atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        skipSeparationSpace(state, true, -1);
        ch = state.input.charCodeAt(state.position);
      }
      if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
        throwError(state, "bad indentation of a mapping entry");
      } else if (state.lineIndent < nodeIndent) {
        break;
      }
    }
    if (atExplicitKey) {
      storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
    }
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
    if (state.tag !== null) {
      throwError(state, "duplication of a tag property");
    }
    ch = state.input.charCodeAt(++state.position);
    if (ch === 60) {
      isVerbatim = true;
      ch = state.input.charCodeAt(++state.position);
    } else if (ch === 33) {
      isNamed = true;
      tagHandle = "!!";
      ch = state.input.charCodeAt(++state.position);
    } else {
      tagHandle = "!";
    }
    let _position = state.position;
    if (isVerbatim) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 0 && ch !== 62);
      if (state.position < state.length) {
        tagName = state.input.slice(_position, state.position);
        ch = state.input.charCodeAt(++state.position);
      } else {
        throwError(state, "unexpected end of the stream within a verbatim tag");
      }
    } else {
      while (ch !== 0 && !isWsOrEol(ch)) {
        if (ch === 33) {
          if (!isNamed) {
            tagHandle = state.input.slice(_position - 1, state.position + 1);
            if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
              throwError(state, "named tag handle cannot contain such characters");
            }
            isNamed = true;
            _position = state.position + 1;
          } else {
            throwError(state, "tag suffix cannot contain exclamation marks");
          }
        }
        ch = state.input.charCodeAt(++state.position);
      }
      tagName = state.input.slice(_position, state.position);
      if (PATTERN_FLOW_INDICATORS.test(tagName)) {
        throwError(state, "tag suffix cannot contain flow indicator characters");
      }
    }
    if (tagName && !PATTERN_TAG_URI.test(tagName)) {
      throwError(state, "tag name cannot contain such characters: " + tagName);
    }
    try {
      tagName = decodeURIComponent(tagName);
    } catch (err) {
      throwError(state, "tag name is malformed: " + tagName);
    }
    if (isVerbatim) {
      state.tag = tagName;
    } else if (_hasOwnProperty.call(state.tagMap, tagHandle)) {
      state.tag = state.tagMap[tagHandle] + tagName;
    } else if (tagHandle === "!") {
      state.tag = "!" + tagName;
    } else if (tagHandle === "!!") {
      state.tag = "tag:yaml.org,2002:" + tagName;
    } else {
      throwError(state, 'undeclared tag handle "' + tagHandle + '"');
    }
    return true;
  }
  function readAnchorProperty(state) {
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 38) return false;
    if (state.anchor !== null) {
      throwError(state, "duplication of an anchor property");
    }
    ch = state.input.charCodeAt(++state.position);
    const _position = state.position;
    while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    if (state.position === _position) {
      throwError(state, "name of an anchor node must contain at least one character");
    }
    state.anchor = state.input.slice(_position, state.position);
    return true;
  }
  function readAlias(state) {
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 42) return false;
    ch = state.input.charCodeAt(++state.position);
    const _position = state.position;
    while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    if (state.position === _position) {
      throwError(state, "name of an alias node must contain at least one character");
    }
    const alias = state.input.slice(_position, state.position);
    if (!_hasOwnProperty.call(state.anchorMap, alias)) {
      throwError(state, 'unidentified alias "' + alias + '"');
    }
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
    let type2;
    let flowIndent;
    let blockIndent;
    if (state.depth >= state.maxDepth) {
      throwError(state, "nesting exceeded maxDepth (" + state.maxDepth + ")");
    }
    state.depth += 1;
    if (state.listener !== null) {
      state.listener("open", state);
    }
    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;
    const allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
    if (allowToSeek) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      }
    }
    if (indentStatus === 1) {
      while (true) {
        const ch = state.input.charCodeAt(state.position);
        const propertyState = snapshotState(state);
        if (atNewLine && (ch === 33 && state.tag !== null || ch === 38 && state.anchor !== null)) {
          break;
        }
        if (!readTagProperty(state) && !readAnchorProperty(state)) {
          break;
        }
        if (propertyStart === null) {
          propertyStart = propertyState;
        }
        if (skipSeparationSpace(state, true, -1)) {
          atNewLine = true;
          allowBlockCollections = allowBlockStyles;
          if (state.lineIndent > parentIndent) {
            indentStatus = 1;
          } else if (state.lineIndent === parentIndent) {
            indentStatus = 0;
          } else if (state.lineIndent < parentIndent) {
            indentStatus = -1;
          }
        } else {
          allowBlockCollections = false;
        }
      }
    }
    if (allowBlockCollections) {
      allowBlockCollections = atNewLine || allowCompact;
    }
    if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
      if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
        flowIndent = parentIndent;
      } else {
        flowIndent = parentIndent + 1;
      }
      blockIndent = state.position - state.lineStart;
      if (indentStatus === 1) {
        if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
          hasContent = true;
        } else {
          const ch = state.input.charCodeAt(state.position);
          if (propertyStart !== null && allowBlockStyles && !allowBlockCollections && ch !== 124 && ch !== 62 && tryReadBlockMappingFromProperty(
            state,
            propertyStart,
            propertyStart.position - propertyStart.lineStart,
            flowIndent
          )) {
            hasContent = true;
          } else if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
            hasContent = true;
          } else if (readAlias(state)) {
            hasContent = true;
            if (state.tag !== null || state.anchor !== null) {
              throwError(state, "alias node should not have any properties");
            }
          } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
            hasContent = true;
            if (state.tag === null) {
              state.tag = "?";
            }
          }
          if (state.anchor !== null) {
            storeAnchor(state, state.anchor, state.result);
          }
        }
      } else if (indentStatus === 0) {
        hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
      }
    }
    if (state.tag === null) {
      if (state.anchor !== null) {
        storeAnchor(state, state.anchor, state.result);
      }
    } else if (state.tag === "?") {
      if (state.result !== null && state.kind !== "scalar") {
        throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
      }
      for (let typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
        type2 = state.implicitTypes[typeIndex];
        if (type2.resolve(state.result)) {
          state.result = type2.construct(state.result);
          state.tag = type2.tag;
          if (state.anchor !== null) {
            storeAnchor(state, state.anchor, state.result);
          }
          break;
        }
      }
    } else if (state.tag !== "!") {
      if (_hasOwnProperty.call(state.typeMap[state.kind || "fallback"], state.tag)) {
        type2 = state.typeMap[state.kind || "fallback"][state.tag];
      } else {
        type2 = null;
        const typeList = state.typeMap.multi[state.kind || "fallback"];
        for (let typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
          if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
            type2 = typeList[typeIndex];
            break;
          }
        }
      }
      if (!type2) {
        throwError(state, "unknown tag !<" + state.tag + ">");
      }
      if (state.result !== null && type2.kind !== state.kind) {
        throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type2.kind + '", not "' + state.kind + '"');
      }
      if (!type2.resolve(state.result, state.tag)) {
        throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
      } else {
        state.result = type2.construct(state.result, state.tag);
        if (state.anchor !== null) {
          storeAnchor(state, state.anchor, state.result);
        }
      }
    }
    if (state.listener !== null) {
      state.listener("close", state);
    }
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
      if (state.lineIndent > 0 || ch !== 37) {
        break;
      }
      hasDirectives = true;
      ch = state.input.charCodeAt(++state.position);
      let _position = state.position;
      while (ch !== 0 && !isWsOrEol(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      const directiveName = state.input.slice(_position, state.position);
      const directiveArgs = [];
      if (directiveName.length < 1) {
        throwError(state, "directive name must not be less than one character in length");
      }
      while (ch !== 0) {
        while (isWhiteSpace(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        if (ch === 35) {
          do {
            ch = state.input.charCodeAt(++state.position);
          } while (ch !== 0 && !isEol(ch));
          break;
        }
        if (isEol(ch)) break;
        _position = state.position;
        while (ch !== 0 && !isWsOrEol(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        directiveArgs.push(state.input.slice(_position, state.position));
      }
      if (ch !== 0) readLineBreak(state);
      if (_hasOwnProperty.call(directiveHandlers, directiveName)) {
        directiveHandlers[directiveName](state, directiveName, directiveArgs);
      } else {
        throwWarning(state, 'unknown document directive "' + directiveName + '"');
      }
    }
    skipSeparationSpace(state, true, -1);
    if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    } else if (hasDirectives) {
      throwError(state, "directives end mark is expected");
    }
    composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
    skipSeparationSpace(state, true, -1);
    if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
      throwWarning(state, "non-ASCII line breaks are interpreted as content");
    }
    state.documents.push(state.result);
    if (state.position === state.lineStart && testDocumentSeparator(state)) {
      if (state.input.charCodeAt(state.position) === 46) {
        state.position += 3;
        skipSeparationSpace(state, true, -1);
      }
      return;
    }
    if (state.position < state.length - 1) {
      throwError(state, "end of the stream or a document separator is expected");
    }
  }
  function loadDocuments(input, options) {
    input = String(input);
    options = options || {};
    if (input.length !== 0) {
      if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
        input += "\n";
      }
      if (input.charCodeAt(0) === 65279) {
        input = input.slice(1);
      }
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
    while (state.position < state.length - 1) {
      readDocument(state);
    }
    return state.documents;
  }
  function loadAll2(input, iterator, options) {
    if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
      options = iterator;
      iterator = null;
    }
    const documents = loadDocuments(input, options);
    if (typeof iterator !== "function") {
      return documents;
    }
    for (let index = 0, length = documents.length; index < length; index += 1) {
      iterator(documents[index]);
    }
  }
  function load2(input, options) {
    const documents = loadDocuments(input, options);
    if (documents.length === 0) {
      return void 0;
    } else if (documents.length === 1) {
      return documents[0];
    }
    throw new YAMLException2("expected a single document in the stream, but found more");
  }
  loader.loadAll = loadAll2;
  loader.load = load2;
  return loader;
}
var dumper = {};
var hasRequiredDumper;
function requireDumper() {
  if (hasRequiredDumper) return dumper;
  hasRequiredDumper = 1;
  const common2 = requireCommon();
  const YAMLException2 = requireException();
  const DEFAULT_SCHEMA2 = require_default();
  const _toString = Object.prototype.toString;
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  const CHAR_BOM = 65279;
  const CHAR_TAB = 9;
  const CHAR_LINE_FEED = 10;
  const CHAR_CARRIAGE_RETURN = 13;
  const CHAR_SPACE = 32;
  const CHAR_EXCLAMATION = 33;
  const CHAR_DOUBLE_QUOTE = 34;
  const CHAR_SHARP = 35;
  const CHAR_PERCENT = 37;
  const CHAR_AMPERSAND = 38;
  const CHAR_SINGLE_QUOTE = 39;
  const CHAR_ASTERISK = 42;
  const CHAR_COMMA = 44;
  const CHAR_MINUS = 45;
  const CHAR_COLON = 58;
  const CHAR_EQUALS = 61;
  const CHAR_GREATER_THAN = 62;
  const CHAR_QUESTION = 63;
  const CHAR_COMMERCIAL_AT = 64;
  const CHAR_LEFT_SQUARE_BRACKET = 91;
  const CHAR_RIGHT_SQUARE_BRACKET = 93;
  const CHAR_GRAVE_ACCENT = 96;
  const CHAR_LEFT_CURLY_BRACKET = 123;
  const CHAR_VERTICAL_LINE = 124;
  const CHAR_RIGHT_CURLY_BRACKET = 125;
  const ESCAPE_SEQUENCES = {};
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
  const DEPRECATED_BOOLEANS_SYNTAX = [
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
  const DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
  function compileStyleMap(schema2, map2) {
    if (map2 === null) return {};
    const result = {};
    const keys = Object.keys(map2);
    for (let index = 0, length = keys.length; index < length; index += 1) {
      let tag = keys[index];
      let style = String(map2[tag]);
      if (tag.slice(0, 2) === "!!") {
        tag = "tag:yaml.org,2002:" + tag.slice(2);
      }
      const type2 = schema2.compiledTypeMap["fallback"][tag];
      if (type2 && _hasOwnProperty.call(type2.styleAliases, style)) {
        style = type2.styleAliases[style];
      }
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
    } else {
      throw new YAMLException2("code point within a string may not be greater than 0xFFFFFFFF");
    }
    return "\\" + handle + common2.repeat("0", length - string.length) + string;
  }
  const QUOTING_TYPE_SINGLE = 1;
  const QUOTING_TYPE_DOUBLE = 2;
  function State(options) {
    this.schema = options["schema"] || DEFAULT_SCHEMA2;
    this.indent = Math.max(1, options["indent"] || 2);
    this.noArrayIndent = options["noArrayIndent"] || false;
    this.skipInvalid = options["skipInvalid"] || false;
    this.flowLevel = common2.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
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
    const ind = common2.repeat(" ", spaces);
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
    return "\n" + common2.repeat(" ", state.indent * level);
  }
  function testImplicitResolving(state, str22) {
    for (let index = 0, length = state.implicitTypes.length; index < length; index += 1) {
      const type2 = state.implicitTypes[index];
      if (type2.resolve(str22)) {
        return true;
      }
    }
    return false;
  }
  function isWhitespace(c) {
    return c === CHAR_SPACE || c === CHAR_TAB;
  }
  function isPrintable(c) {
    return c >= 32 && c <= 126 || c >= 161 && c <= 55295 && c !== 8232 && c !== 8233 || c >= 57344 && c <= 65533 && c !== CHAR_BOM || c >= 65536 && c <= 1114111;
  }
  function isNsCharOrWhitespace(c) {
    return isPrintable(c) && c !== CHAR_BOM && // - b-char
    c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
  }
  function isPlainSafe(c, prev, inblock) {
    const cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
    const cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
    return (
      // ns-plain-safe
      (inblock ? cIsNsCharOrWhitespace : cIsNsCharOrWhitespace && // - c-flow-indicator
      c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && // ns-plain-char
      c !== CHAR_SHARP && // false on '#'
      !(prev === CHAR_COLON && !cIsNsChar) || // false on ': '
      isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || // change to true on '[^ ]#'
      prev === CHAR_COLON && cIsNsChar
    );
  }
  function isPlainSafeFirst(c) {
    return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && // - s-white
    // - (c-indicator ::=
    // “-” | “?” | “:” | “,” | “[” | “]” | “{” | “}”
    c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && // | “#” | “&” | “*” | “!” | “|” | “=” | “>” | “'” | “"”
    c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && // | “%” | “@” | “`”)
    c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
  }
  function isPlainSafeLast(c) {
    return !isWhitespace(c) && c !== CHAR_COLON;
  }
  function codePointAt(string, pos) {
    const first = string.charCodeAt(pos);
    let second;
    if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
      second = string.charCodeAt(pos + 1);
      if (second >= 56320 && second <= 57343) {
        return (first - 55296) * 1024 + second - 56320 + 65536;
      }
    }
    return first;
  }
  function needIndentIndicator(string) {
    const leadingSpaceRe = /^\n* /;
    return leadingSpaceRe.test(string);
  }
  const STYLE_PLAIN = 1;
  const STYLE_SINGLE = 2;
  const STYLE_LITERAL = 3;
  const STYLE_FOLDED = 4;
  const STYLE_DOUBLE = 5;
  function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
    let i;
    let char = 0;
    let prevChar = null;
    let hasLineBreak = false;
    let hasFoldableLine = false;
    const shouldTrackWidth = lineWidth !== -1;
    let previousLineBreak = -1;
    let plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
    if (singleLineOnly || forceQuotes) {
      for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
        char = codePointAt(string, i);
        if (!isPrintable(char)) {
          return STYLE_DOUBLE;
        }
        plain = plain && isPlainSafe(char, prevChar, inblock);
        prevChar = char;
      }
    } else {
      for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
        char = codePointAt(string, i);
        if (char === CHAR_LINE_FEED) {
          hasLineBreak = true;
          if (shouldTrackWidth) {
            hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
            i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
            previousLineBreak = i;
          }
        } else if (!isPrintable(char)) {
          return STYLE_DOUBLE;
        }
        plain = plain && isPlainSafe(char, prevChar, inblock);
        prevChar = char;
      }
      hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ");
    }
    if (!hasLineBreak && !hasFoldableLine) {
      if (plain && !forceQuotes && !testAmbiguousType(string)) {
        return STYLE_PLAIN;
      }
      return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
    }
    if (indentPerLevel > 9 && needIndentIndicator(string)) {
      return STYLE_DOUBLE;
    }
    if (!forceQuotes) {
      return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
    }
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  function writeScalar(state, string, level, iskey, inblock) {
    state.dump = (function() {
      if (string.length === 0) {
        return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
      }
      if (!state.noCompatMode) {
        if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
          return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
        }
      }
      const indent2 = state.indent * Math.max(1, level);
      const lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent2);
      const singleLineOnly = iskey || // No block styles in flow mode.
      state.flowLevel > -1 && level >= state.flowLevel;
      function testAmbiguity(string2) {
        return testImplicitResolving(state, string2);
      }
      switch (chooseScalarStyle(
        string,
        singleLineOnly,
        state.indent,
        lineWidth,
        testAmbiguity,
        state.quotingType,
        state.forceQuotes && !iskey,
        inblock
      )) {
        case STYLE_PLAIN:
          return string;
        case STYLE_SINGLE:
          return "'" + string.replace(/'/g, "''") + "'";
        case STYLE_LITERAL:
          return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent2));
        case STYLE_FOLDED:
          return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent2));
        case STYLE_DOUBLE:
          return '"' + escapeString(string) + '"';
        default:
          throw new YAMLException2("impossible error: invalid scalar style");
      }
    })();
  }
  function blockHeader(string, indentPerLevel) {
    const indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
    const clip = string[string.length - 1] === "\n";
    const keep = clip && (string[string.length - 2] === "\n" || string === "\n");
    const chomp = keep ? "+" : clip ? "" : "-";
    return indentIndicator + chomp + "\n";
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
    if (line.length - start > width && curr > start) {
      result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
    } else {
      result += line.slice(start);
    }
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
      } else {
        result += escapeSeq || encodeHex(char);
      }
    }
    return result;
  }
  function writeFlowSequence(state, level, object) {
    let _result = "";
    const _tag = state.tag;
    for (let index = 0, length = object.length; index < length; index += 1) {
      let value = object[index];
      if (state.replacer) {
        value = state.replacer.call(object, String(index), value);
      }
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
      if (state.replacer) {
        value = state.replacer.call(object, String(index), value);
      }
      if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
        if (!compact || _result !== "") {
          _result += generateNextLine(state, level);
        }
        if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
          _result += "-";
        } else {
          _result += "- ";
        }
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
      if (state.replacer) {
        objectValue = state.replacer.call(object, objectKey, objectValue);
      }
      if (!writeNode(state, level, objectKey, false, false)) {
        continue;
      }
      if (state.dump.length > 1024) pairBuffer += "? ";
      pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
      if (!writeNode(state, level, objectValue, false, false)) {
        continue;
      }
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
    if (state.sortKeys === true) {
      objectKeyList.sort();
    } else if (typeof state.sortKeys === "function") {
      objectKeyList.sort(state.sortKeys);
    } else if (state.sortKeys) {
      throw new YAMLException2("sortKeys must be a boolean or a function");
    }
    for (let index = 0, length = objectKeyList.length; index < length; index += 1) {
      let pairBuffer = "";
      if (!compact || _result !== "") {
        pairBuffer += generateNextLine(state, level);
      }
      const objectKey = objectKeyList[index];
      let objectValue = object[objectKey];
      if (state.replacer) {
        objectValue = state.replacer.call(object, objectKey, objectValue);
      }
      if (!writeNode(state, level + 1, objectKey, true, true, true)) {
        continue;
      }
      const explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
      if (explicitPair) {
        if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
          pairBuffer += "?";
        } else {
          pairBuffer += "? ";
        }
      }
      pairBuffer += state.dump;
      if (explicitPair) {
        pairBuffer += generateNextLine(state, level);
      }
      if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
        continue;
      }
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        pairBuffer += ":";
      } else {
        pairBuffer += ": ";
      }
      pairBuffer += state.dump;
      _result += pairBuffer;
    }
    state.tag = _tag;
    state.dump = _result || "{}";
  }
  function detectType(state, object, explicit) {
    const typeList = explicit ? state.explicitTypes : state.implicitTypes;
    for (let index = 0, length = typeList.length; index < length; index += 1) {
      const type2 = typeList[index];
      if ((type2.instanceOf || type2.predicate) && (!type2.instanceOf || typeof object === "object" && object instanceof type2.instanceOf) && (!type2.predicate || type2.predicate(object))) {
        if (explicit) {
          if (type2.multi && type2.representName) {
            state.tag = type2.representName(object);
          } else {
            state.tag = type2.tag;
          }
        } else {
          state.tag = "?";
        }
        if (type2.represent) {
          const style = state.styleMap[type2.tag] || type2.defaultStyle;
          let _result;
          if (_toString.call(type2.represent) === "[object Function]") {
            _result = type2.represent(object, style);
          } else if (_hasOwnProperty.call(type2.represent, style)) {
            _result = type2.represent[style](object, style);
          } else {
            throw new YAMLException2("!<" + type2.tag + '> tag resolver accepts not "' + style + '" style');
          }
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
    if (!detectType(state, object, false)) {
      detectType(state, object, true);
    }
    const type2 = _toString.call(state.dump);
    const inblock = block;
    if (block) {
      block = state.flowLevel < 0 || state.flowLevel > level;
    }
    const objectOrArray = type2 === "[object Object]" || type2 === "[object Array]";
    let duplicateIndex;
    let duplicate;
    if (objectOrArray) {
      duplicateIndex = state.duplicates.indexOf(object);
      duplicate = duplicateIndex !== -1;
    }
    if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) {
      compact = false;
    }
    if (duplicate && state.usedDuplicates[duplicateIndex]) {
      state.dump = "*ref_" + duplicateIndex;
    } else {
      if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
        state.usedDuplicates[duplicateIndex] = true;
      }
      if (type2 === "[object Object]") {
        if (block && Object.keys(state.dump).length !== 0) {
          writeBlockMapping(state, level, state.dump, compact);
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + state.dump;
          }
        } else {
          writeFlowMapping(state, level, state.dump);
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + " " + state.dump;
          }
        }
      } else if (type2 === "[object Array]") {
        if (block && state.dump.length !== 0) {
          if (state.noArrayIndent && !isblockseq && level > 0) {
            writeBlockSequence(state, level - 1, state.dump, compact);
          } else {
            writeBlockSequence(state, level, state.dump, compact);
          }
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + state.dump;
          }
        } else {
          writeFlowSequence(state, level, state.dump);
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + " " + state.dump;
          }
        }
      } else if (type2 === "[object String]") {
        if (state.tag !== "?") {
          writeScalar(state, state.dump, level, iskey, inblock);
        }
      } else if (type2 === "[object Undefined]") {
        return false;
      } else {
        if (state.skipInvalid) return false;
        throw new YAMLException2("unacceptable kind of an object to dump " + type2);
      }
      if (state.tag !== null && state.tag !== "?") {
        let tagStr = encodeURI(
          state.tag[0] === "!" ? state.tag.slice(1) : state.tag
        ).replace(/!/g, "%21");
        if (state.tag[0] === "!") {
          tagStr = "!" + tagStr;
        } else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") {
          tagStr = "!!" + tagStr.slice(18);
        } else {
          tagStr = "!<" + tagStr + ">";
        }
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
    for (let index = 0; index < length; index += 1) {
      state.duplicates.push(objects[duplicatesIndexes[index]]);
    }
    state.usedDuplicates = new Array(length);
  }
  function inspectNode(object, objects, duplicatesIndexes) {
    if (object !== null && typeof object === "object") {
      const index = objects.indexOf(object);
      if (index !== -1) {
        if (duplicatesIndexes.indexOf(index) === -1) {
          duplicatesIndexes.push(index);
        }
      } else {
        objects.push(object);
        if (Array.isArray(object)) {
          for (let i = 0, length = object.length; i < length; i += 1) {
            inspectNode(object[i], objects, duplicatesIndexes);
          }
        } else {
          const objectKeyList = Object.keys(object);
          for (let i = 0, length = objectKeyList.length; i < length; i += 1) {
            inspectNode(object[objectKeyList[i]], objects, duplicatesIndexes);
          }
        }
      }
    }
  }
  function dump2(input, options) {
    options = options || {};
    const state = new State(options);
    if (!state.noRefs) getDuplicateReferences(input, state);
    let value = input;
    if (state.replacer) {
      value = state.replacer.call({ "": value }, "", value);
    }
    if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
    return "";
  }
  dumper.dump = dump2;
  return dumper;
}
var hasRequiredJsYaml;
function requireJsYaml() {
  if (hasRequiredJsYaml) return jsYaml;
  hasRequiredJsYaml = 1;
  const loader2 = requireLoader();
  const dumper2 = requireDumper();
  function renamed(from, to) {
    return function() {
      throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
    };
  }
  jsYaml.Type = requireType();
  jsYaml.Schema = requireSchema();
  jsYaml.FAILSAFE_SCHEMA = requireFailsafe();
  jsYaml.JSON_SCHEMA = requireJson();
  jsYaml.CORE_SCHEMA = requireCore();
  jsYaml.DEFAULT_SCHEMA = require_default();
  jsYaml.load = loader2.load;
  jsYaml.loadAll = loader2.loadAll;
  jsYaml.dump = dumper2.dump;
  jsYaml.YAMLException = requireException();
  jsYaml.types = {
    binary: requireBinary(),
    float: requireFloat(),
    map: requireMap(),
    null: require_null(),
    pairs: requirePairs(),
    set: requireSet(),
    timestamp: requireTimestamp(),
    bool: requireBool(),
    int: requireInt(),
    merge: requireMerge(),
    omap: requireOmap(),
    seq: requireSeq(),
    str: requireStr()
  };
  jsYaml.safeLoad = renamed("safeLoad", "load");
  jsYaml.safeLoadAll = renamed("safeLoadAll", "loadAll");
  jsYaml.safeDump = renamed("safeDump", "dump");
  return jsYaml;
}
var jsYamlExports = requireJsYaml();
var yaml = /* @__PURE__ */ getDefaultExportFromCjs(jsYamlExports);
var {
  Type,
  Schema,
  FAILSAFE_SCHEMA,
  JSON_SCHEMA,
  CORE_SCHEMA,
  DEFAULT_SCHEMA,
  load,
  loadAll,
  dump,
  YAMLException,
  types,
  safeLoad,
  safeLoadAll,
  safeDump
} = yaml;

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
  for (const error of trace.capture_errors ?? []) {
    assertions.push({ kind: "trace_evidence", status: "ERROR", detail: error });
  }
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
      const lost = leaked.length === 0 && matched.some((i) => valueWasLost(i.task));
      assertions.push({
        kind: "require_subagent",
        status: lost ? "ERROR" : leaked.length === 0 ? "PASS" : "FAIL",
        detail: lost ? `leak check on the handoff to \`${req.agent}\` could not be run \u2014 the task text was redacted or truncated before the trace was written` : leaked.length === 0 ? `handoff to \`${req.agent}\` did not carry ${JSON.stringify(needle)}` : `handoff to \`${req.agent}\` leaked forbidden content ${JSON.stringify(needle)}`
      });
    }
  }
  for (const forbid of assert.forbid_calls ?? []) {
    const hits = trace.tool_calls.filter((c) => c.name === forbid.tool && argsMatch(c, forbid.args));
    const lost = [...new Set(trace.tool_calls.filter((c) => c.name === forbid.tool).flatMap((c) => lostArgs(c, forbid.args)))];
    if (hits.length === 0 && lost.length > 0) {
      assertions.push({
        kind: "forbid_call",
        status: "ERROR",
        detail: `\`${forbid.tool}\`${describeArgs(forbid.args)} could not be checked \u2014 ${lost.map((k) => `\`${k}\``).join(", ")} was redacted or truncated before the trace was written`
      });
      continue;
    }
    assertions.push(hits.length === 0 ? { kind: "forbid_call", status: "PASS", detail: `\`${forbid.tool}\`${describeArgs(forbid.args)} not called` } : {
      kind: "forbid_call",
      status: "FAIL",
      detail: `\`${forbid.tool}\`${describeArgs(forbid.args)} called ${hits.length} time(s) \u2014 forbidden`
    });
  }
  for (const pattern of assert.unchanged_paths ?? []) {
    if (trace.changed_paths === null) {
      assertions.push({
        kind: "unchanged_path",
        status: "ERROR",
        detail: `\`${pattern}\` could not be checked \u2014 the workspace was never observed`
      });
      continue;
    }
    const changed = trace.changed_paths.filter((p) => matchesGlob(pattern, p));
    assertions.push(changed.length === 0 ? { kind: "unchanged_path", status: "PASS", detail: `\`${pattern}\` unchanged` } : { kind: "unchanged_path", status: "FAIL", detail: `\`${pattern}\` changed: ${changed.join(", ")}` });
  }
  return {
    // ERROR outranks FAIL: "the evidence is missing" must never be reported as
    // "the assertion held", and it must not be softened into a plain failure
    // either — the two call for different fixes.
    status: assertions.some((a) => a.status === "ERROR") ? "ERROR" : assertions.some((a) => a.status === "FAIL") ? "FAIL" : "PASS",
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
function valueWasLost(value) {
  if (typeof value === "string") {
    return value === "[redacted]" || value === "[nested]" || value.includes("\u2026 [truncated ");
  }
  if (Array.isArray(value))
    return value.some(valueWasLost);
  if (value && typeof value === "object")
    return Object.values(value).some(valueWasLost);
  return false;
}
function lostArgs(call, args) {
  if (!args)
    return [];
  return Object.keys(args).filter((key) => valueWasLost(call.args[key]));
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
    doc = yaml.load(text);
  } catch (e) {
    throw new SpecError(`not valid YAML \u2014 ${e.message}`, file);
  }
  if (doc === null || typeof doc !== "object") {
    throw new SpecError("spec must be a YAML mapping", file);
  }
  const o = doc;
  if (o.schema !== void 0 && o.schema !== 1) {
    throw new SpecError(`unsupported \`schema\` ${JSON.stringify(o.schema)} (expected 1)`, file);
  }
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
    if (rawAssert?.trajectory !== void 0) {
      throw new SpecError(`scenario \`${id}\` uses removed \`assert.trajectory\`; delete it or replace it with an active objective gate`, file);
    }
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
    if (s.env && typeof s.env === "object" && Object.hasOwn(s.env, "event_sources")) {
      throw new SpecError(`scenario \`${id}\` uses removed \`env.event_sources\`; it is no longer collected`, file);
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
    if (scenario.traceAssert?.unchanged_paths?.length && scenario.workspace === "none") {
      throw new SpecError(`scenario \`${id}\` declares \`assert.trace.unchanged_paths\` but has no workspace to observe \u2014 set \`env.workspace: empty-git\` or \`fixture:<path>\`, or drop the assertion. A path policy with nothing to compare against would pass unconditionally.`, file);
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
  const effectiveCritical = [.../* @__PURE__ */ new Set([...critical, ...scenarios.filter((scenario) => scenario.critical).map((scenario) => scenario.id)])];
  return { schema: 1, skill: o.skill, judge_persona: o.judge_persona, ship_bar, critical: effectiveCritical, scenarios };
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
import { mkdirSync as mkdirSync4, writeFileSync as writeFileSync3, readFileSync as readFileSync9 } from "node:fs";
import { dirname, join as join14, resolve as resolve6 } from "node:path";

// packages/core/dist/sources.js
import { createHash as createHash2 } from "node:crypto";
import { readFileSync as readFileSync2, readdirSync as readdirSync2 } from "node:fs";
import { isAbsolute, join as join2, resolve as resolve2 } from "node:path";

// packages/core/dist/prompt-normalization.js
import { createHash } from "node:crypto";
var PROMPT_NORMALIZATION_RULE = "cwd-line-v1";
var PROMPT_NORMALIZATION_PATTERN = "^(Current working directory:)[^\\r\\n]*(\\r?)$";
var PROMPT_NORMALIZATION_FLAGS = "gm";
var PROMPT_NORMALIZATION_REPLACEMENT = "$1<normalized>$2";
var PROMPT_NORMALIZATION_SOURCE_KEY = "observation:prompt-normalization";
var PROMPT_NORMALIZATION_SOURCE_DIGEST = createHash("sha256").update(JSON.stringify([
  "prompt-normalization-registry",
  PROMPT_NORMALIZATION_RULE,
  PROMPT_NORMALIZATION_PATTERN,
  PROMPT_NORMALIZATION_FLAGS,
  PROMPT_NORMALIZATION_REPLACEMENT
])).digest("hex");

// packages/core/dist/sources.js
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
    return createHash2("sha256").update(readFileSync2(path)).digest("hex");
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
  const h = createHash2("sha256");
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
    // disk, which `regate` can redo without a subject re-run.
    // APPENDED CONDITIONALLY, never as a fixed slot. This tuple is positional and
    // its hash is stored in every published results.yaml, so adding an
    // unconditional element re-hashes every scenario that never used the field —
    // measured: 62 real lint findings became 261 across the reference corpus, all of
    // them demanding paid re-runs for scenarios nobody had edited.
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
      ...extensions ? [extensions] : []
    ]),
    rubric: JSON.stringify([id, title, checklist]),
    policy: JSON.stringify([id, critical, reps2 ?? null, passThreshold ?? null]),
    // Same rule as `stimulus` above: conditional, so a needle-gated scenario that
    // declares no trace assertions keeps the digest it was published with.
    gates: hasGates ? JSON.stringify([
      id,
      diff_contains ?? null,
      diff_excludes ?? null,
      ...traceAssert ? [traceAssert] : []
    ]) : null
  };
}
function sha(canonical) {
  return createHash2("sha256").update(canonical).digest("hex");
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
  hashes[SKILL_KEY] = fileSha256(resolve2(ctx.skillDir, "SKILL.md")) ?? UNREADABLE;
  hashes[SKILL_PROMPT_KEY] = promptDocDigestOfFile(resolve2(ctx.skillDir, "SKILL.md")) ?? UNREADABLE;
  hashes[PERSONA_KEY] = personaDigest(ctx.judgePersona);
  for (const s of ctx.scenarios) {
    hashes[STIMULUS_PREFIX + s.id] = stimulusDigest(s);
    hashes[RUBRIC_PREFIX + s.id] = rubricDigest(s);
    hashes[POLICY_PREFIX + s.id] = policyDigest(s);
    const gates = gatesDigest(s);
    if (gates !== null)
      hashes[GATES_PREFIX + s.id] = gates;
    if (s.systemPromptFile && !(s.systemPromptFile in hashes)) {
      const abs = resolve2(ctx.specDir, s.systemPromptFile);
      hashes[s.systemPromptFile] = fileSha256(abs) ?? UNREADABLE;
      hashes[PROMPT_PREFIX + s.systemPromptFile] = promptDocDigestOfFile(abs) ?? UNREADABLE;
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
  if (key === PROMPT_NORMALIZATION_SOURCE_KEY)
    return "the prompt normalization rule registry";
  if (key === PERSONA_KEY)
    return "the judge persona";
  if (key === SKILL_PROMPT_KEY)
    return SKILL_KEY;
  if (key.startsWith(PROMPT_PREFIX))
    return key.slice(PROMPT_PREFIX.length);
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
var SKILL_PROMPT_KEY = "skill:prompt";
var PROMPT_PREFIX = "prompt:";
var CAPABILITY_KEYS = /* @__PURE__ */ new Set(["allowed-tools", "tools"]);
var FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
function splitPromptDoc(text) {
  const m = FRONTMATTER_RE.exec(text);
  return m ? { frontmatter: m[1], body: text.slice(m[0].length) } : { frontmatter: null, body: text };
}
function canonicalValue(v) {
  if (typeof v === "string")
    return v.trim();
  if (Array.isArray(v))
    return v.map(canonicalValue);
  if (v && typeof v === "object") {
    return Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, val]) => [k, canonicalValue(val)]);
  }
  return v;
}
function modelVisibleFrontmatter(fm) {
  if (fm === null)
    return null;
  let parsed;
  try {
    parsed = yaml.load(fm);
  } catch {
    return ["unparsed", fm];
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
    return ["unparsed", fm];
  return [
    "parsed",
    Object.entries(parsed).filter(([k]) => !CAPABILITY_KEYS.has(k)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonicalValue(v)])
  ];
}
function promptDocDigest(text) {
  const { frontmatter, body } = splitPromptDoc(text);
  return sha(JSON.stringify(["prompt-doc/1", modelVisibleFrontmatter(frontmatter), body]));
}
function promptDocDigestOfFile(path) {
  try {
    return promptDocDigest(readFileSync2(path, "utf8"));
  } catch {
    return null;
  }
}
function isSupersededKey(key, recorded) {
  if (key === SKILL_PROMPT_KEY || key.startsWith(PROMPT_PREFIX))
    return false;
  if (recorded[key] === UNREADABLE)
    return false;
  const upgraded = key === SKILL_KEY ? SKILL_PROMPT_KEY : PROMPT_PREFIX + key;
  const v = recorded[upgraded];
  return v !== void 0 && v !== UNREADABLE;
}
function scenarioSourceKeys(s) {
  const keys = [
    STIMULUS_PREFIX + s.id,
    RUBRIC_PREFIX + s.id,
    SCENARIO_PREFIX + s.id
    // legacy combined (pre-0.4.0 runs)
  ];
  if (gatesDigest(s) !== null)
    keys.push(GATES_PREFIX + s.id);
  if (s.systemPromptFile) {
    keys.push(s.systemPromptFile);
    keys.push(PROMPT_PREFIX + s.systemPromptFile);
  }
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
import { createHash as createHash3 } from "node:crypto";
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
var TOOL_ARTIFACTS = ["node_modules/", "coverage/", ".vitest/", ".pi/skills/"];
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
  const bare = mkdtempSync(join3(tmpdir(), "sc-remote-"));
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
var SNAPSHOT_SKIP = /* @__PURE__ */ new Set([".git", "node_modules", "coverage", ".vitest"]);
var SNAPSHOT_SKIP_RELS = /* @__PURE__ */ new Set([".pi/skills"]);
function snapshotPaths(cwd, kind) {
  if (kind === "none" || !cwd || !existsSync2(cwd))
    return null;
  const out = /* @__PURE__ */ new Map();
  const walk2 = (dir, prefix) => {
    let entries;
    try {
      entries = readdirSync3(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (SNAPSHOT_SKIP.has(e.name))
        continue;
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (SNAPSHOT_SKIP_RELS.has(rel))
        continue;
      const abs = join3(dir, e.name);
      if (e.isDirectory()) {
        walk2(abs, rel);
      } else if (e.isFile()) {
        try {
          out.set(rel, createHash3("sha256").update(readFileSync3(abs)).digest("hex"));
        } catch {
          out.set(rel, "<unreadable>");
        }
      }
    }
  };
  walk2(cwd, "");
  return out;
}
function diffSnapshots(before, after) {
  if (!before || !after)
    return null;
  const changed = /* @__PURE__ */ new Set();
  for (const [path, hash] of after)
    if (before.get(path) !== hash)
      changed.add(path);
  for (const path of before.keys())
    if (!after.has(path))
      changed.add(path);
  return [...changed].sort();
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
  let errorCount = 0;
  let notMeasuredCount = 0;
  for (const v of verdicts) {
    if (v.suspect) {
      suspectCount++;
      continue;
    }
    if (v.verdict === "NOT-MEASURED") {
      notMeasuredCount++;
      continue;
    }
    if (v.verdict === "ERROR" || v.verdict === "JUDGE-AMBIGUOUS") {
      errorCount++;
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
  const validBar = Number.isInteger(shipBar.total) && shipBar.total >= 1 && Number.isInteger(shipBar.min_pass) && shipBar.min_pass >= 1 && shipBar.min_pass <= shipBar.total;
  const ship = validBar && total >= shipBar.total && passed >= shipBar.min_pass && (!shipBar.no_critical_fail || criticalFails === 0) && bSeriesFails === 0 && suspectCount === 0 && errorCount === 0 && notMeasuredCount === 0;
  let note = "";
  if (!validBar) {
    note = "invalid ship bar: total/min_pass must be positive integers with min_pass <= total";
  } else if (suspectCount > 0) {
    note = `${suspectCount} suspect: re-judge/resolve`;
  } else if (errorCount > 0) {
    note = `${errorCount} infrastructure error${errorCount === 1 ? "" : "s"}: retry/repair evidence`;
  } else if (notMeasuredCount > 0) {
    note = `${notMeasuredCount} not measured: skill delivery was not established`;
  } else if (criticalFails > 0) {
    note = `gated: ${criticalFails} critical fail${criticalFails === 1 ? "" : "s"}`;
  } else if (bSeriesFails > 0) {
    note = `gated: ${bSeriesFails} B-series fail${bSeriesFails === 1 ? "" : "s"}`;
  }
  return { passed, total, pct, letter, ship, criticalFails, bSeriesFails, suspectCount, errorCount, notMeasuredCount, note };
}

// packages/core/dist/version.js
import { createRequire } from "node:module";
var require2 = createRequire(import.meta.url);
var HARNESS_VERSION = require2("../package.json").version;

// packages/core/dist/vote-panel.js
function isCleanPanelVote(vote) {
  return !vote.suspect && (vote.verdict === "PASS" || vote.verdict === "FAIL");
}
function collapseVotePanel(votes) {
  const clean = votes.filter(isCleanPanelVote);
  const passVotes = clean.filter((vote) => vote.verdict === "PASS").length;
  const failVotes = clean.length - passVotes;
  const firstTwo = votes.filter((vote) => vote.ordinal === 1 || vote.ordinal === 2);
  const split = firstTwo.length === 2 && firstTwo.every(isCleanPanelVote) && firstTwo[0].verdict !== firstTwo[1].verdict;
  const minority = Math.min(passVotes, failVotes);
  const base = {
    clean_votes: clean.length,
    pass_votes: passVotes,
    fail_votes: failVotes,
    split,
    minority_rate: clean.length === 0 ? 0 : minority / clean.length
  };
  if (clean.length < 2)
    return { ...base, state: "unresolved" };
  if (passVotes === 0 || failVotes === 0)
    return { ...base, state: "confirmed", verdict: clean[0].verdict };
  if (passVotes > failVotes)
    return { ...base, state: "tie_broken", verdict: "PASS" };
  if (failVotes > passVotes)
    return { ...base, state: "tie_broken", verdict: "FAIL" };
  return { ...base, state: "unresolved" };
}

// packages/core/dist/results.js
function mergeScenarioMetrics(prior, fresh) {
  if (!prior)
    return fresh;
  if (!fresh)
    return prior;
  const subject = prior.subject_metrics_reps > 0 ? prior : fresh;
  return {
    wall_time_ms: prior.wall_time_ms + fresh.wall_time_ms,
    judge_calls: prior.judge_calls + fresh.judge_calls,
    judge_rejudge_calls: prior.judge_rejudge_calls + fresh.judge_rejudge_calls,
    subject_metrics_reps: subject.subject_metrics_reps,
    total_reps: prior.total_reps,
    ...subject.input_tokens === void 0 ? {} : { input_tokens: subject.input_tokens },
    ...subject.output_tokens === void 0 ? {} : { output_tokens: subject.output_tokens },
    ...subject.cache_read_tokens === void 0 ? {} : { cache_read_tokens: subject.cache_read_tokens },
    ...subject.cache_write_tokens === void 0 ? {} : { cache_write_tokens: subject.cache_write_tokens },
    ...subject.subject_cost_usd === void 0 ? {} : { subject_cost_usd: subject.subject_cost_usd },
    ...subject.cost_source === void 0 ? {} : { cost_source: subject.cost_source },
    ...subject.tool_calls === void 0 ? {} : { tool_calls: subject.tool_calls },
    ...subject.delegated_children === void 0 ? {} : { delegated_children: subject.delegated_children },
    ...subject.max_concurrency === void 0 ? {} : { max_concurrency: subject.max_concurrency }
  };
}
function carryRepObjectives(fresh, prior) {
  if (!fresh)
    return prior;
  return fresh.map((panel) => {
    const objective = prior?.find((candidate) => candidate.repetition === panel.repetition)?.objective;
    return objective ? { ...panel, objective } : panel;
  });
}
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
  if (scenario.critical)
    return 1;
  return prevScenario?.pass_threshold ?? scenario.passThreshold ?? 0.5;
}
function timestampSlug(iso) {
  return iso.replace(/[:.]/g, "-");
}
function runDirFor(skillDir, harness, model, timestamp2, armName) {
  const arm = armName && armName !== "none" ? `+${armName}` : "";
  return join4(skillDir, "tests", "results", `${harness}-${modelSlug(model)}${arm}`, timestampSlug(timestamp2));
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
    verdict: s.override ?? objectiveVerdict(s) ?? s.judge_verdict,
    suspect: s.suspect && s.override == null
    // an override resolves the misfire
  }));
}
function objectiveVerdict(s) {
  if (!s.objective)
    return void 0;
  if (s.objective.status === "ERROR")
    return "ERROR";
  if (s.objective.status === "NOT-MEASURED")
    return "NOT-MEASURED";
  if (s.objective.status === "FAIL")
    return "FAIL";
  return void 0;
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
  const schema2 = draft.schema ?? (draft.subject_invocations ? 3 : 2);
  return {
    schema: schema2,
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
    ...draft.arm ? { arm: draft.arm } : {},
    ...draft.partial ? { partial: true } : {},
    ...draft.source_hashes ? { source_hashes: draft.source_hashes } : {},
    effective_grade,
    scenarios: draft.scenarios,
    ...draft.subject_invocations ? { subject_invocations: draft.subject_invocations } : {}
  };
}
function writeResults(runDir, draft, ctx) {
  const results = finalizeResults(draft, ctx);
  validateResults(results);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(resultsPath(runDir), yaml.dump(results, { lineWidth: 100 }), "utf8");
  return results;
}
var SUSPECT_PREFIX_RE = /^\[suspect misfire[^\]]*\]\s*/;
function migrateResults(raw) {
  if (raw == null || typeof raw !== "object") {
    throw new Error("empty or invalid results.yaml");
  }
  const o = raw;
  if (o.schema === 2 || o.schema === 3)
    return validateResults(raw);
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
  return migrateResults(yaml.load(text));
}
var CRITERION_RE = /^\s*(\d+)[.)]\s*\**\s*(PASS|FAIL)\b\**\s*(.*)$/gim;
function parseCriterionVotes(raw) {
  return [...raw.matchAll(CRITERION_RE)].map((match) => ({
    index: Number(match[1]),
    verdict: match[2].toUpperCase(),
    reason: match[3].trim().replace(/^[-—:]\s*/, "")
  }));
}
function completeCriterionVotes(votes, expected) {
  return Array.from({ length: expected }, (_, offset) => votes.find((vote) => vote.index === offset + 1) ?? {
    index: offset + 1,
    verdict: "ERROR",
    reason: "judge emitted no parseable vote for this criterion"
  });
}
function deliveryStatusForObservations(observations) {
  if (observations.length === 0)
    return "ERROR";
  const terminalAttempt = Math.max(...observations.map((observation) => observation.attempt ?? 0));
  const terminal = observations.filter((observation) => (observation.attempt ?? 0) === terminalAttempt);
  if (terminal.some((observation) => observation.prompt.status === "ERROR"))
    return "ERROR";
  const mechanism = terminal[0].prompt.mechanism;
  if (terminal.some((observation) => observation.prompt.mechanism !== mechanism))
    return "ERROR";
  const counts = terminal.map((observation) => observation.prompt.contract_occurrences);
  if (mechanism === "none")
    return counts.every((count) => count === 0) ? "PASS" : "NOT-MEASURED";
  if (mechanism === "pi-skill") {
    const firstDelivered = counts.indexOf(1);
    return firstDelivered >= 0 && counts.slice(0, firstDelivered).every((count) => count === 0) && counts.slice(firstDelivered).every((count) => count === 1) ? "PASS" : "NOT-MEASURED";
  }
  return counts.every((count) => count === 1) ? "PASS" : "NOT-MEASURED";
}
function recomputeRecordedPanels(results) {
  const out = [];
  for (const scenario of results.scenarios)
    for (const panel of scenario.rep_judgments ?? []) {
      const clean = panel.judgments.filter((j) => !j.suspect && (j.verdict === "PASS" || j.verdict === "FAIL"));
      let verdict = panel.recorded_verdict;
      if (clean.length === 1)
        verdict = clean[0].verdict;
      else if (clean.length >= 2)
        verdict = collapseVotePanel(panel.judgments).verdict ?? "JUDGE-AMBIGUOUS";
      out.push({ scenario_id: scenario.id, repetition: panel.repetition, verdict });
    }
  return out;
}
function validateResults(raw) {
  if (!raw || typeof raw !== "object")
    throw new Error("invalid results");
  const result = raw;
  if (result.schema !== 2 && result.schema !== 3)
    throw new Error(`unsupported results schema ${String(raw.schema)}`);
  if (!Array.isArray(result.scenarios))
    throw new Error("results scenarios missing");
  if (result.schema === 2)
    return result;
  if (!Array.isArray(result.subject_invocations))
    throw new Error("schema v3 delivery observations missing");
  for (const observation of result.subject_invocations) {
    const p = observation?.prompt;
    if (!p || !["PASS", "NOT-MEASURED", "ERROR"].includes(p.status))
      throw new Error("delivery status missing");
    if (p.normalization_rule !== "cwd-line-v1")
      throw new Error("unknown prompt normalization rule");
    if (!/^[a-f0-9]{64}$/i.test(p.raw_sha256) || !/^[a-f0-9]{64}$/i.test(p.normalized_sha256) || !/^[a-f0-9]{64}$/i.test(p.contract_sha256))
      throw new Error("invalid prompt provenance digest");
    if (!Number.isInteger(p.bytes) || p.bytes < 0 || !Number.isInteger(p.contract_bytes) || p.contract_bytes < 0)
      throw new Error("invalid prompt provenance byte length");
    if (!Number.isInteger(p.contract_occurrences) || p.contract_occurrences < 0)
      throw new Error("invalid delivery occurrence count");
    const expected = p.mechanism === "none" ? 0 : 1;
    const computed = p.contract_occurrences === expected ? "PASS" : "NOT-MEASURED";
    if (p.status !== "ERROR" && p.status !== computed)
      throw new Error("delivery status contradicts occurrence count");
  }
  const scenarioIds = new Set(result.scenarios.map((scenario) => scenario.id));
  const repsByScenario = new Map(result.scenarios.map((scenario) => [scenario.id, scenario.reps ?? 1]));
  if (result.subject_invocations.some((observation) => !scenarioIds.has(observation.scenario_id) || !Number.isInteger(observation.repetition) || observation.repetition < 0 || observation.repetition >= (repsByScenario.get(observation.scenario_id) ?? 0)))
    throw new Error("schema v3 contains orphan or out-of-range subject invocation observation");
  const recomputed = recomputeRecordedPanels(result);
  for (const scenario of result.scenarios) {
    const reps2 = scenario.reps ?? 1;
    if (!Array.isArray(scenario.rep_judgments) || scenario.rep_judgments.length !== reps2)
      throw new Error(`schema v3 repetition judgments missing for ${scenario.id}`);
    const panelRepetitions = scenario.rep_judgments.map((panel) => panel.repetition).sort((a, b) => a - b);
    if (panelRepetitions.some((repetition, index) => repetition !== index))
      throw new Error(`schema v3 repetition judgments duplicate, missing, or out of range for ${scenario.id}`);
    for (let repetition = 0; repetition < reps2; repetition++) {
      const observations = result.subject_invocations.filter((o) => o.scenario_id === scenario.id && o.repetition === repetition);
      const attempts = [...new Set(observations.map((observation) => observation.attempt ?? 0))].sort((a, b) => a - b);
      if (attempts.some((attempt, index) => !Number.isInteger(attempt) || attempt !== index))
        throw new Error(`delivery attempts are duplicate, missing, or out of range for ${scenario.id}#${repetition}`);
      for (const attempt of attempts) {
        const indexes = observations.filter((observation) => (observation.attempt ?? 0) === attempt).map((observation) => observation.prompt.request_index).sort((a, b) => a - b);
        if (indexes.some((requestIndex, index) => !Number.isInteger(requestIndex) || requestIndex !== index))
          throw new Error(`prompt request indexes are duplicate, missing, or out of range for ${scenario.id}#${repetition} attempt ${attempt}`);
      }
    }
    const repStatuses = Array.from({ length: reps2 }, (_, repetition) => deliveryStatusForObservations(result.subject_invocations.filter((o) => o.scenario_id === scenario.id && o.repetition === repetition)));
    const expectedStatus = repStatuses.includes("ERROR") ? "ERROR" : repStatuses.includes("NOT-MEASURED") ? "NOT-MEASURED" : "PASS";
    const gate = scenario.objective?.assertions.find((assertion) => assertion.kind === "skill_delivered");
    if (!gate || gate.status !== expectedStatus)
      throw new Error(`skill_delivered gate missing or inconsistent for ${scenario.id}`);
    if (!Number.isInteger(scenario.criterion_count) || scenario.criterion_count < 1)
      throw new Error(`schema v3 criterion count missing for ${scenario.id}`);
    const assertCriteria = (judgment) => {
      if (!Array.isArray(judgment.criteria))
        throw new Error("schema v3 criterion votes missing");
      const indexes = judgment.criteria.map((vote) => vote.index).sort((a, b) => a - b);
      if (indexes.length !== scenario.criterion_count || indexes.some((index, offset) => index !== offset + 1))
        throw new Error(`schema v3 criterion votes are not complete contiguous indexes for ${scenario.id}`);
    };
    for (const panel of scenario.rep_judgments) {
      for (const judgment of panel.judgments)
        assertCriteria(judgment);
      const cleanJudgments = panel.judgments.filter((judgment) => !judgment.suspect && (judgment.verdict === "PASS" || judgment.verdict === "FAIL"));
      const objectiveBehavioralFail = panel.objective?.status === "FAIL" && panel.recorded_verdict === "FAIL";
      if ((panel.recorded_verdict === "PASS" || panel.recorded_verdict === "FAIL") && cleanJudgments.length === 0 && !objectiveBehavioralFail)
        throw new Error(`recorded behavioral verdict is unsupported by a clean judgment for ${scenario.id}#${panel.repetition}`);
      const actual = recomputed.find((x) => x.scenario_id === scenario.id && x.repetition === panel.repetition);
      if (panel.judgments.length > 0 && actual.verdict !== panel.recorded_verdict)
        throw new Error(`recorded panel verdict diverges from recomputed votes for ${scenario.id}#${panel.repetition}`);
      if (!panel.objective)
        throw new Error(`schema v3 per-repetition objective missing for ${scenario.id}#${panel.repetition}`);
      const observations = result.subject_invocations.filter((o) => o.scenario_id === scenario.id && o.repetition === panel.repetition);
      const deliveryStatus = deliveryStatusForObservations(observations);
      const delivery = panel.objective.assertions.find((assertion) => assertion.kind === "skill_delivered");
      if (!delivery || delivery.status !== deliveryStatus)
        throw new Error(`per-repetition skill_delivered gate missing or inconsistent for ${scenario.id}#${panel.repetition}`);
      if (deliveryStatus === "ERROR" && panel.objective.status !== "ERROR")
        throw new Error(`per-repetition objective weakens delivery ERROR for ${scenario.id}#${panel.repetition}`);
      if (deliveryStatus === "NOT-MEASURED" && !["ERROR", "NOT-MEASURED"].includes(panel.objective.status))
        throw new Error(`per-repetition objective weakens delivery NOT-MEASURED for ${scenario.id}#${panel.repetition}`);
      const objectiveVerdict2 = panel.objective.status === "ERROR" ? "ERROR" : panel.objective.status === "NOT-MEASURED" ? "NOT-MEASURED" : panel.objective.status === "FAIL" ? "FAIL" : void 0;
      if (objectiveVerdict2 && panel.recorded_verdict !== objectiveVerdict2)
        throw new Error(`recorded panel verdict weakens objective evidence for ${scenario.id}#${panel.repetition}`);
    }
    const objectiveStatuses = scenario.rep_judgments.map((panel) => panel.objective.status);
    const aggregateObjectiveStatus = objectiveStatuses.includes("ERROR") ? "ERROR" : objectiveStatuses.includes("NOT-MEASURED") ? "NOT-MEASURED" : objectiveStatuses.includes("FAIL") ? "FAIL" : "PASS";
    if (!scenario.objective || scenario.objective.status !== aggregateObjectiveStatus)
      throw new Error(`scenario objective diverges from per-repetition objectives for ${scenario.id}`);
    for (const judgment of scenario.adjudication?.judgments ?? [])
      assertCriteria(judgment);
    let adjudicatedVerdict;
    if (scenario.adjudication) {
      if (!Number.isInteger(scenario.adjudication.repetition) || scenario.adjudication.repetition < 0 || scenario.adjudication.repetition >= reps2)
        throw new Error(`schema v3 adjudication repetition missing or out of range for ${scenario.id}`);
      const collapsed = collapseVotePanel(scenario.adjudication.judgments);
      const boundedCriticalAggregate = (scenario.reps ?? 1) > 1 && scenario.pass_threshold === 1 && scenario.judge_verdict !== "PASS" && collapsed.verdict === "PASS" && scenario.adjudication.state === "unresolved" && scenario.adjudication.verdict === void 0;
      if (!boundedCriticalAggregate && (scenario.adjudication.state !== collapsed.state || scenario.adjudication.verdict !== collapsed.verdict))
        throw new Error(`recorded adjudication state/verdict diverges from recomputed votes for ${scenario.id}`);
      if (scenario.adjudication.state !== "unresolved")
        adjudicatedVerdict = scenario.adjudication.verdict;
    }
    const panels = scenario.rep_judgments;
    const errorCount = panels.filter((panel) => panel.recorded_verdict === "ERROR").length;
    const notMeasuredCount = panels.filter((panel) => panel.recorded_verdict === "NOT-MEASURED").length;
    const cleanPanels = panels.filter((panel) => !(panel.judgments[0]?.suspect ?? false));
    const passes = cleanPanels.filter((panel) => panel.recorded_verdict === "PASS").length;
    let aggregateVerdict;
    let aggregateSuspect = false;
    if (panels.length === 1) {
      aggregateVerdict = panels[0].recorded_verdict;
      aggregateSuspect = panels[0].judgments[0]?.suspect ?? false;
    } else if (errorCount > 0)
      aggregateVerdict = "ERROR";
    else if (notMeasuredCount > 0)
      aggregateVerdict = "NOT-MEASURED";
    else if (cleanPanels.length * 2 < panels.length) {
      aggregateVerdict = "FAIL";
      aggregateSuspect = true;
    } else
      aggregateVerdict = passes / cleanPanels.length >= (scenario.pass_threshold ?? 0.5) ? "PASS" : "FAIL";
    const expectedVerdict = adjudicatedVerdict ?? aggregateVerdict;
    const expectedSuspect = scenario.adjudication ? scenario.adjudication.state === "unresolved" : aggregateSuspect;
    if (scenario.judge_verdict !== expectedVerdict || scenario.suspect !== expectedSuspect)
      throw new Error(`schema v3 scenario verdict/suspect diverges from repetition aggregate for ${scenario.id}`);
  }
  return result;
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
var REP_SUFFIX_RE = /\.rep(\d+)\.(?:(?:judge|diff)\.txt|(?:trace|events)\.jsonl|txt)$/;
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
  const re = mode === void 0 ? new RegExp(`^${esc}\\..*\\.judge\\d*\\.txt$`) : new RegExp(`^${esc}\\.${mode}(\\.rep\\d+)?\\.judge\\d*\\.txt$`);
  return sortByRep(readdirSync4(runDir).filter((f) => re.test(f)));
}
function diffPath(runDir, scenarioId, mode, rep) {
  const base = rep === void 0 ? `${scenarioId}.${mode}` : `${scenarioId}.${mode}.rep${rep}`;
  return join4(runDir, `${base}.diff.txt`);
}
function rebuildScenarioResult(fresh, prior, policy) {
  const { id, criterion_count: freshCriterionCount, judge_verdict, judge_reason, suspect, override: _freshOverride, note: _freshNote, reps: reps2, passes, clean, flakiness, pass_threshold, metrics: freshMetrics, objective: freshObjective, adjudication: freshAdjudication, rep_judgments: freshRepJudgments, ...rest } = fresh;
  const _exhaustive = rest;
  void _exhaustive;
  void _freshOverride;
  void _freshNote;
  const pick = (p, freshValue, priorValue) => {
    if (p === "drop")
      return void 0;
    return p === "fresh" ? freshValue : priorValue;
  };
  const objective = pick(policy.objective, freshObjective, prior?.objective);
  const pickedAdjudication = pick(policy.adjudication, freshAdjudication, prior?.adjudication);
  const conflictsWithFreshEvidence = Boolean(pickedAdjudication?.verdict && (objective?.status === "FAIL" || objective?.status === "ERROR" || objective?.status === "NOT-MEASURED" || pass_threshold === 1 && (reps2 ?? 1) > 1 && judge_verdict !== "PASS"));
  const adjudication = conflictsWithFreshEvidence && pickedAdjudication ? { ...pickedAdjudication, state: "unresolved", verdict: void 0 } : pickedAdjudication;
  const unresolved = adjudication?.state === "unresolved";
  const settled = policy.adjudication === "carry" && !conflictsWithFreshEvidence ? adjudication?.verdict : void 0;
  return {
    id,
    ...(freshCriterionCount ?? prior?.criterion_count) === void 0 ? {} : { criterion_count: freshCriterionCount ?? prior.criterion_count },
    judge_verdict: settled ?? judge_verdict,
    judge_reason,
    suspect: suspect || unresolved,
    // Aggregation shape always comes from the fresh computation — these describe
    // how THIS result was aggregated, not the previous one.
    ...reps2 === void 0 ? {} : { reps: reps2 },
    ...passes === void 0 ? {} : { passes },
    ...clean === void 0 ? {} : { clean },
    ...flakiness === void 0 ? {} : { flakiness },
    ...pass_threshold === void 0 ? {} : { pass_threshold },
    ...freshMetrics ?? prior?.metrics ? { metrics: freshMetrics ?? prior.metrics } : {},
    // The author owns the verdict; a re-measurement never discards their call.
    override: prior?.override ?? null,
    note: prior?.note ?? "",
    // Omitted rather than set to undefined: absent must stay absent, so a result
    // with no evidence serialises byte-identically to one from before the field
    // existed.
    ...objective ? { objective } : {},
    ...adjudication ? { adjudication } : {},
    ...freshRepJudgments ?? prior?.rep_judgments ? { rep_judgments: freshRepJudgments ?? prior.rep_judgments } : {}
  };
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
function findTraceFiles(runDir, scenarioId, mode) {
  if (!existsSync3(runDir))
    return [];
  const esc = scenarioId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = mode === void 0 ? new RegExp(`^${esc}\\..*\\.trace\\.jsonl$`) : new RegExp(`^${esc}\\.${mode}(\\.rep\\d+)?\\.trace\\.jsonl$`);
  return sortByRep(readdirSync4(runDir).filter((f) => re.test(f)));
}
function preserveTranscript(resultsRoot, runDir, scenarioId) {
  const files = [
    ...findTranscriptFiles(runDir, scenarioId),
    ...findJudgeRawFiles(runDir, scenarioId),
    ...findDiffFiles(runDir, scenarioId),
    // On a trace-gated scenario the trace IS the evidence for the override — the
    // same role the staged diff plays on a seeded one. Omitting it committed an
    // override whose justification was gitignored, and left `regate` with nothing
    // to re-evaluate on the one cell a human had disputed.
    ...findTraceFiles(runDir, scenarioId)
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
    const snippet2 = raw.trim().replace(/\s+/g, " ").slice(0, 160);
    if (snippet2)
      parsed.reason = `judge unparseable: ${snippet2}`;
  }
  const suspect = detectMisfire(raw, parsed.verdict);
  return { ...parsed, raw, suspect, criteria: parseCriterionVotes(raw) };
}
async function judgeInWorkspace(adapter, judge, prompt, specDir) {
  const ws = createWorkspace("none", { specDir });
  try {
    return await gradeTranscript(adapter, judge, prompt, ws.cwd);
  } finally {
    ws.cleanup();
  }
}

// packages/core/dist/arms.js
import { copyFileSync, existsSync as existsSync4, mkdirSync as mkdirSync2, readdirSync as readdirSync5, readFileSync as readFileSync5, realpathSync, statSync as statSync2 } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute as isAbsolute3, join as join5, resolve as resolve4, sep as sep2 } from "node:path";
var NONE_ARM = { name: "none", extensions: [], seedSkills: [], requireDefinitions: 0, env: {} };
function realpathOr(p) {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}
function defaultAmbientSkillsDir() {
  return join5(homedir(), ".pi", "agent", "skills");
}
function seedArmDefinitions(arm, skillsRoot, workspaceCwd, opts = {}) {
  if (arm.name === NONE_ARM.name)
    return 0;
  const ambient = opts.ambientSkillsDir ?? defaultAmbientSkillsDir();
  let ambientEntries = [];
  try {
    ambientEntries = readdirSync5(ambient);
  } catch (err) {
    if (err.code === "ENOENT") {
      ambientEntries = [];
    } else {
      throw new Error(`arm \`${arm.name}\`: could not read the ambient skill root ${ambient}: ${err.message} \u2014 pi-daddy reads it as well as the workspace, so this can't be verified empty.`);
    }
  }
  if (ambientEntries.length > 0) {
    throw new Error(`arm \`${arm.name}\`: the ambient skill root ${ambient} is not empty (${ambientEntries.slice(0, 5).join(", ")}) \u2014 pi-daddy reads it as well as the workspace, so those definitions would be an uncontrolled variable in the measurement. Move them aside for the run.`);
  }
  if (arm.seedSkills.length === 0) {
    if (arm.requireDefinitions > 0) {
      throw new Error(`arm \`${arm.name}\`: seeded 0 definition(s) (no \`seed_skills\` declared) but require_definitions is ${arm.requireDefinitions} \u2014 pi-daddy would have nothing to spawn, and the arm would measure nothing while looking green.`);
    }
    return 0;
  }
  const dest = join5(workspaceCwd, ".pi", "skills");
  mkdirSync2(dest, { recursive: true });
  const resolvedRoot = realpathOr(resolve4(skillsRoot));
  const seen = /* @__PURE__ */ new Set();
  for (const rel of arm.seedSkills) {
    const src = realpathOr(resolve4(skillsRoot, rel));
    if (src !== resolvedRoot && !src.startsWith(resolvedRoot + sep2)) {
      throw new Error(`arm \`${arm.name}\`: seed_skills entry ${JSON.stringify(rel)} resolves to ${src}, which is outside the skills root ${resolvedRoot} \u2014 refusing to seed from outside the corpus`);
    }
    let names;
    try {
      names = readdirSync5(src);
    } catch {
      throw new Error(`arm \`${arm.name}\`: seed_skills names ${src}, which cannot be read \u2014 pi would start with nothing to spawn`);
    }
    for (const name of names) {
      const from = join5(src, name);
      if (!name.endsWith(".md"))
        continue;
      let isFile;
      try {
        isFile = statSync2(from).isFile();
      } catch (err) {
        throw new Error(`arm \`${arm.name}\`: seed_skills entry ${JSON.stringify(rel)} contains ${from}, which cannot be read (${err.message}) \u2014 likely a dangling symlink`);
      }
      if (!isFile)
        continue;
      if (seen.has(name)) {
        throw new Error(`arm \`${arm.name}\`: two seed_skills entries both provide \`${name}\` (latest: ${from}) \u2014 they are copied into the one flat directory ${dest}, so one would silently overwrite the other. Rename one, or drop the duplicate entry.`);
      }
      seen.add(name);
      copyFileSync(from, join5(dest, name));
    }
  }
  const count = seen.size;
  if (count < arm.requireDefinitions) {
    throw new Error(`arm \`${arm.name}\`: seeded ${count} definition(s) into ${dest} but require_definitions is ${arm.requireDefinitions} \u2014 pi-daddy would have nothing (or too little) to spawn, and the arm would measure nothing while looking green.`);
  }
  return count;
}

// packages/core/dist/journal.js
import { appendFileSync as appendFileSync3, existsSync as existsSync5, mkdirSync as mkdirSync3, readFileSync as readFileSync6 } from "node:fs";
import { join as join6 } from "node:path";
function journalPath(runDir) {
  return join6(runDir, "journal.jsonl");
}
function appendJournal(runDir, e) {
  mkdirSync3(runDir, { recursive: true });
  appendFileSync3(journalPath(runDir), JSON.stringify(e) + "\n", "utf8");
}

// packages/core/dist/lift.js
import { existsSync as existsSync6, readdirSync as readdirSync6, statSync as statSync3 } from "node:fs";
import { join as join7 } from "node:path";
function aggregationShape(s) {
  const reps2 = s.reps ?? 1;
  return { reps: reps2, threshold: reps2 > 1 ? s.pass_threshold ?? null : null };
}
function comparableAggregation(red, green) {
  return red.reps === green.reps && red.threshold === green.threshold;
}
function conclusive(verdict, suspect) {
  return !suspect && verdict !== "ERROR" && verdict !== "NOT-MEASURED" && verdict !== "JUDGE-AMBIGUOUS";
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
    return statSync3(p).isDirectory();
  } catch {
    return false;
  }
}
function modeInsensitiveIds(skillDir) {
  const specPath = join7(skillDir, "tests", "specification.yaml");
  if (!existsSync6(specPath))
    return [];
  try {
    return loadSpec(specPath).scenarios.filter((s) => s.systemPromptFile).map((s) => s.id);
  } catch {
    return [];
  }
}
function collectLift(skillDir) {
  const resultsRoot = join7(skillDir, "tests", "results");
  if (!existsSync6(resultsRoot))
    return [];
  const modeInsensitive = modeInsensitiveIds(skillDir);
  const lifts = [];
  for (const tag of readdirSync6(resultsRoot).filter((n) => isDir(join7(resultsRoot, n))).sort()) {
    const tagDir = join7(resultsRoot, tag);
    const runDirs = readdirSync6(tagDir).map((n) => join7(tagDir, n)).filter((p) => isDir(p) && existsSync6(join7(p, "results.yaml"))).sort();
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
import { copyFileSync as copyFileSync2, statSync as statSync4 } from "node:fs";
import { extname, isAbsolute as isAbsolute4, join as join9, resolve as resolve5 } from "node:path";

// packages/core/dist/util/exec.js
import { spawn } from "node:child_process";
import { existsSync as existsSync7 } from "node:fs";
import { join as join8, delimiter } from "node:path";
function exec(cmd, args, opts = {}) {
  return new Promise((resolve13, reject) => {
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
      resolve13({ stdout, stderr, code });
    });
  });
}
function onPath(bin) {
  const dirs = (process.env.PATH ?? "").split(delimiter);
  const exts = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  return dirs.some((d) => d && exts.some((ext) => existsSync7(join8(d, bin + ext))));
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
    // Resolved against the spec dir, exactly like fixtures and post-tests —
    // the arm's extensions (already absolute) join alongside, same as the
    // non-seeded path in run.ts.
    extensions: [
      ...scenario.extensions?.map((e) => resolve5(opts.specDir, e)) ?? [],
      ...opts.armExtensions ?? []
    ],
    ...opts.armEnv ? { armEnv: opts.armEnv } : {}
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
  let gateError = null;
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
    gateError = msg;
    return finish(parts, gateFailure, gateError, diff, traces);
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
    if (!passed) {
      const problem = killed ? `vitest timed out after ${VITEST_TIMEOUT_MS}ms \u2014 infrastructure, not model behavior` : `vitest failed (exit ${v.code})`;
      if (!gateFailure)
        gateFailure = problem;
      if (killed)
        gateError = problem;
    }
  }
  const postTest = scenario.assert?.post_test;
  if (postTest) {
    const src = isAbsolute4(postTest) ? postTest : resolve5(opts.specDir, postTest);
    if (!isReadableFile(src)) {
      const msg = `post_test is not a readable file: ${postTest} \u2014 spec error, not model behavior`;
      parts.push(`  post_test: ERROR (${msg})`);
      if (!gateFailure)
        gateFailure = msg;
      gateError = msg;
    } else {
      const dest = join9(repo, `${POST_TEST_BASE}.test${extname(src) || ".ts"}`);
      try {
        copyFileSync2(src, dest);
      } catch (e) {
        const msg = `post_test could not be copied into the workspace (${e instanceof Error ? e.message : String(e)}) \u2014 infrastructure, not model behavior`;
        parts.push(`  post_test: ERROR (${msg})`);
        if (!gateFailure)
          gateFailure = msg;
        gateError = msg;
        return finish(parts, gateFailure, gateError, diff, traces);
      }
      const v = await runVitest([POST_TEST_BASE], repo);
      const out = `${v.stdout}
${v.stderr}`;
      const tally = vitestTally(out);
      const notCollected = /^\s*No test files found/im.test(out);
      const killed = v.code === null;
      let problem = null;
      let problemIsError = false;
      if (killed) {
        problemIsError = true;
        problem = `post_test ${JSON.stringify(postTest)} timed out after ${VITEST_TIMEOUT_MS}ms \u2014 infrastructure, not model behavior`;
      } else if (notCollected) {
        problemIsError = true;
        problem = `post_test ${JSON.stringify(postTest)} was never collected by vitest \u2014 spec/fixture error, not model behavior`;
      } else if (tally === null) {
        problemIsError = true;
        problem = `post_test ${JSON.stringify(postTest)} produced no parseable vitest summary (exit ${v.code}) \u2014 cannot confirm it ran`;
      } else if (v.code !== 0 || tally.failed > 0) {
        problem = `post_test ${JSON.stringify(postTest)} failed (exit ${v.code})`;
      } else if (tally.skipped > 0 || tally.todo > 0) {
        problemIsError = true;
        problem = `post_test ${JSON.stringify(postTest)} has ${tally.skipped + tally.todo} skipped/todo test(s) \u2014 a hidden gate must actually run; spec error, not model behavior`;
      } else if (tally.passed === 0) {
        problemIsError = true;
        problem = `post_test ${JSON.stringify(postTest)} ran no assertions \u2014 spec error, not model behavior`;
      }
      parts.push(problem === null ? `  post_test ${JSON.stringify(postTest)}: PASS (${tally.passed} assertion-bearing test(s))` : `  post_test ${JSON.stringify(postTest)}: ${problemIsError ? "ERROR" : "FAIL"} (${problem})`);
      parts.push(indent(bothStreams(v)));
      if (problem && !gateFailure)
        gateFailure = problem;
      if (problem && problemIsError)
        gateError = problem;
    }
  }
  return finish(parts, gateFailure, gateError, diff, traces);
}
function git(cwd, args) {
  return exec("git", args, { cwd, timeoutMs: 3e4 });
}
function indent(s) {
  return s.split("\n").map((l) => `    ${l}`).join("\n");
}
function isReadableFile(p) {
  try {
    return statSync4(p).isFile();
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
function finish(parts, gateFailure, gateError, diff, traces = []) {
  parts.push("", "=== STAGED DIFF ===");
  parts.push(diff.trim() === "" ? "  (empty \u2014 the model left no staged changes)" : capDiff(diff));
  return { transcript: parts.join("\n"), gateFailure, gateError, diff, traces };
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
import { createHash as createHash4 } from "node:crypto";

// packages/core/dist/capture-trace-types.js
var EXECUTION_TRACE_VERSION = 2;

// packages/core/dist/redaction.js
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
  /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\b([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi
];
function redactText(input, homeDir) {
  let out = input;
  out = out.replace(SECRET_VALUE[SECRET_VALUE.length - 1], `$1${REDACTED}@`);
  for (const re of SECRET_VALUE.slice(0, -1))
    out = out.replace(re, REDACTED);
  if (homeDir && homeDir.length > 1)
    out = out.split(homeDir).join("~");
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

// packages/core/dist/execution-trace.js
var SKIPPED = /* @__PURE__ */ new Set(["message_update", "tool_execution_update"]);
var MAX_DETAILS_CHARS = 2e3;
function parseTrace(lines, meta) {
  const calls = /* @__PURE__ */ new Map();
  const issuedAt = /* @__PURE__ */ new Map();
  const completedAt = /* @__PURE__ */ new Map();
  let issueCounter = 0;
  let completionCounter = 0;
  let malformedLines = 0;
  let sawTerminal = false;
  let finalText = "";
  let lastAssistantText = "";
  let cost = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let sawUsage = false;
  let activeCalls = 0;
  let maxConcurrency = 0;
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
    const type2 = ev.type;
    if (typeof type2 !== "string" || SKIPPED.has(type2))
      continue;
    if (type2 === "tool_execution_start") {
      const id = str2(ev.toolCallId);
      if (!id)
        continue;
      calls.set(id, {
        id,
        name: str2(ev.toolName) ?? "(unknown)",
        args: redactArgs(ev.args, meta.homeDir),
        issueIndex: issueCounter++,
        ...issuedAt.get(id) ? { started_at: issuedAt.get(id) } : {},
        completionIndex: -1,
        // filled in on `end`; -1 means it never completed
        isError: false,
        result: { bytes: 0, sha256: sha256("") }
      });
      activeCalls++;
      maxConcurrency = Math.max(maxConcurrency, activeCalls);
      continue;
    }
    if (type2 === "tool_execution_end") {
      const id = str2(ev.toolCallId);
      if (!id)
        continue;
      const call = calls.get(id);
      if (!call)
        continue;
      if (call.completionIndex < 0)
        activeCalls = Math.max(0, activeCalls - 1);
      call.completionIndex = completionCounter++;
      if (completedAt.get(id))
        call.completed_at = completedAt.get(id);
      call.isError = ev.isError === true;
      call.result = resultMeta(ev.result, meta.homeDir);
      continue;
    }
    if (type2 === "message_end") {
      sawTerminal = true;
      const msg = ev.message;
      const at = isoTime(msg?.timestamp);
      if (msg?.role === "assistant" && at) {
        for (const block of msg.content ?? []) {
          if (block.type !== "toolCall" || typeof block.id !== "string")
            continue;
          issuedAt.set(block.id, at);
          const call = calls.get(block.id);
          if (call)
            call.started_at = at;
        }
      }
      if (msg?.role === "toolResult" && typeof msg.toolCallId === "string" && at) {
        completedAt.set(msg.toolCallId, at);
        const call = calls.get(msg.toolCallId);
        if (call)
          call.completed_at = at;
      }
      if (msg?.role !== "assistant")
        continue;
      const text = assistantText(msg);
      if (text) {
        lastAssistantText = text;
        if (msg.stopReason === "stop")
          finalText = text;
      }
      if (msg.usage && (typeof msg.usage.input === "number" || typeof msg.usage.output === "number" || typeof msg.usage.cacheRead === "number" || typeof msg.usage.cacheWrite === "number" || typeof msg.usage.cost?.total === "number"))
        sawUsage = true;
      const total = msg.usage?.cost?.total;
      if (typeof total === "number")
        cost = (cost ?? 0) + total;
      if (typeof msg.usage?.input === "number")
        inputTokens += msg.usage.input;
      if (typeof msg.usage?.output === "number")
        outputTokens += msg.usage.output;
      if (typeof msg.usage?.cacheRead === "number")
        cacheReadTokens += msg.usage.cacheRead;
      if (typeof msg.usage?.cacheWrite === "number")
        cacheWriteTokens += msg.usage.cacheWrite;
      continue;
    }
    if (type2 === "turn_end" || type2 === "agent_end" || type2 === "agent_settled") {
      sawTerminal = true;
      continue;
    }
  }
  const toolCalls = [...calls.values()].sort((a, b) => a.issueIndex - b.issueIndex);
  const subscription = meta.subject.provider === "openai-codex" || meta.subject.provider === "claude-code";
  const costSource = subscription ? "subscription" : cost !== null ? "provider-reported" : "unreported";
  const metrics = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_read_tokens: cacheReadTokens,
    cache_write_tokens: cacheWriteTokens,
    cost_usd: cost ?? 0,
    cost_source: costSource,
    tool_calls: toolCalls.length,
    delegated_children: toolCalls.filter((call) => call.name === "Agent").reduce((count, call) => count + normalizeSubagentCall(call.args).length, 0),
    max_concurrency: maxConcurrency
  };
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
    // Redacted: the model's own answer routinely quotes the paths it just read,
    // and `smoke-real-pi.sh` asserts no `/home/` survives into a persisted trace
    // — an assertion that used to pass only because the smoke model happened not
    // to echo one.
    final_text: redactText(finalText || lastAssistantText, meta.homeDir),
    tool_calls: toolCalls,
    // `null`, not `[]`: the stream says nothing about the filesystem. The runner
    // overwrites this after observing the workspace. Defaulting to `[]` claimed
    // "observed, nothing changed" for every trace ever parsed.
    changed_paths: meta.changedPaths ? [...meta.changedPaths].sort() : null,
    cost_usd: cost,
    // Tool calls remain in the trace for objective gates. Aggregate usage/cost/
    // tool metrics are published only when pi actually reported usage; otherwise
    // zero would mean "free" instead of "unavailable".
    ...sawUsage ? { metrics } : {}
  };
  trace.trace_sha256 = traceSha256(trace);
  return { trace, isComplete: sawTerminal, malformedLines };
}
function assistantText(msg) {
  return (msg.content ?? []).filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n").trim();
}
function resultMeta(result, homeDir) {
  const body = JSON.stringify(result?.content ?? result ?? null);
  const meta = { bytes: Buffer.byteLength(body, "utf8"), sha256: sha256(body) };
  const details = result?.details;
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const encoded = JSON.stringify(details);
    if (encoded.length <= MAX_DETAILS_CHARS)
      meta.details = redactArgs(details, homeDir);
  }
  return meta;
}
function str2(v) {
  return typeof v === "string" && v.length > 0 ? v : void 0;
}
function isoTime(value) {
  if (typeof value !== "number" && typeof value !== "string")
    return void 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? void 0 : date.toISOString();
}
function sha256(text) {
  return createHash4("sha256").update(text, "utf8").digest("hex");
}
function traceSha256(trace) {
  const { trace_sha256: _omit, ...rest } = trace;
  return sha256(stableStringify(rest));
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
    return { ...only, trace_sha256: traceSha256(only) };
  }
  const calls = [];
  const changed = /* @__PURE__ */ new Set();
  let anyUnobserved = false;
  let cost = null;
  let completed = 0;
  for (const t of traces) {
    const mergedCompletion = new Map([...t.tool_calls].filter((c) => c.completionIndex >= 0).sort((a, b) => a.completionIndex - b.completionIndex).map((c) => [c.id, completed++]));
    for (const c of [...t.tool_calls].sort((a, b) => a.issueIndex - b.issueIndex)) {
      calls.push({ ...c, issueIndex: calls.length, completionIndex: mergedCompletion.get(c.id) ?? -1 });
    }
    if (t.changed_paths === null)
      anyUnobserved = true;
    else
      for (const p of t.changed_paths)
        changed.add(p);
    if (t.cost_usd !== null)
      cost = (cost ?? 0) + t.cost_usd;
  }
  const completeMetrics = traces.every((trace) => trace.metrics !== void 0);
  const metrics = completeMetrics ? traces.reduce((sum, trace) => ({
    input_tokens: sum.input_tokens + trace.metrics.input_tokens,
    output_tokens: sum.output_tokens + trace.metrics.output_tokens,
    cache_read_tokens: sum.cache_read_tokens + trace.metrics.cache_read_tokens,
    cache_write_tokens: sum.cache_write_tokens + trace.metrics.cache_write_tokens,
    cost_usd: sum.cost_usd + trace.metrics.cost_usd,
    cost_source: sum.cost_source === trace.metrics.cost_source ? sum.cost_source : "unreported",
    tool_calls: sum.tool_calls + trace.metrics.tool_calls,
    delegated_children: sum.delegated_children + trace.metrics.delegated_children,
    max_concurrency: Math.max(sum.max_concurrency, trace.metrics.max_concurrency)
  }), {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    cost_usd: 0,
    cost_source: traces[0].metrics.cost_source,
    tool_calls: 0,
    delegated_children: 0,
    max_concurrency: 0
  }) : void 0;
  const last = traces[traces.length - 1];
  const captureErrors = traces.flatMap((trace) => trace.capture_errors ?? []);
  const { capture_errors: _lastCaptureErrors, ...lastWithoutCaptureErrors } = last;
  void _lastCaptureErrors;
  const merged = {
    ...lastWithoutCaptureErrors,
    // The scenario's answer is its LAST turn's answer, matching how the
    // transcript reads and how the judge is asked to grade it.
    final_text: last.final_text,
    tool_calls: calls,
    changed_paths: anyUnobserved ? null : [...changed].sort(),
    cost_usd: cost,
    ...captureErrors.length ? { capture_errors: captureErrors } : {},
    ...metrics ? { metrics } : {}
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
  const picked = present.find((o) => o.status === "ERROR") ?? present.find((o) => o.status === "NOT-MEASURED") ?? present.find((o) => o.status === "FAIL") ?? present[0];
  if (present.length === 1)
    return picked;
  const traceHashes = present.map((objective) => objective.trace_sha256);
  return {
    ...picked,
    ...traceHashes.every((hash) => typeof hash === "string") ? { rep_trace_sha256: traceHashes } : {}
  };
}
function aggregateReps(outcomes, threshold) {
  const reps2 = outcomes.length;
  const clean = outcomes.filter((o) => !o.suspect);
  const passes = clean.filter((o) => o.verdict === "PASS").length;
  const errored = outcomes.filter((o) => o.verdict === "ERROR").length;
  if (errored > 0) {
    return { verdict: "ERROR", reason: `${errored}/${reps2} reps errored \u2014 infrastructure, not behavior`, passes, reps: reps2, clean: clean.length, flakiness: 0, suspect: false };
  }
  const notMeasured = outcomes.filter((o) => o.verdict === "NOT-MEASURED").length;
  if (notMeasured > 0) {
    return { verdict: "NOT-MEASURED", reason: `${notMeasured}/${reps2} reps not measured \u2014 skill delivery was not established`, passes, reps: reps2, clean: clean.length - notMeasured, flakiness: 0, suspect: false };
  }
  if (clean.length * 2 < reps2) {
    return { verdict: "FAIL", reason: `${reps2 - clean.length}/${reps2} reps misfired \u2014 re-judge`, passes, reps: reps2, clean: clean.length, flakiness: 0, suspect: true };
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
  const metrics = aggregateMetrics(outcomes);
  const metricsField = metrics ? { metrics } : {};
  const repJudgments = outcomes.map((outcome, repetition) => ({ repetition, judgments: outcome.judgment ? [outcome.judgment] : [], recorded_verdict: outcome.verdict, ...outcome.objective ? { objective: outcome.objective } : {} }));
  const repJudgmentField = outcomes.some((outcome) => outcome.judgment) ? { rep_judgments: repJudgments } : {};
  if (repCount === 1) {
    const o = outcomes[0];
    return { id, judge_verdict: o.verdict, judge_reason: o.reason, suspect: o.suspect, ...metricsField, override: null, note: "", ...objectiveField, ...repJudgmentField };
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
    ...metricsField,
    override: null,
    note: "",
    ...objectiveField,
    ...repJudgmentField
  };
}
function aggregateMetrics(outcomes) {
  const present = outcomes.map((outcome) => outcome.metrics).filter((metrics) => metrics !== void 0);
  if (present.length === 0)
    return void 0;
  const subjects = present.map((metrics) => metrics.subject).filter((metrics) => metrics !== void 0);
  const base = {
    wall_time_ms: present.reduce((sum, metrics) => sum + metrics.wall_time_ms, 0),
    judge_calls: present.reduce((sum, metrics) => sum + metrics.judge_calls, 0),
    judge_rejudge_calls: present.reduce((sum, metrics) => sum + metrics.judge_rejudge_calls, 0),
    subject_metrics_reps: subjects.length,
    total_reps: outcomes.length
  };
  if (subjects.length === 0)
    return base;
  return {
    ...base,
    input_tokens: subjects.reduce((sum, metrics) => sum + metrics.input_tokens, 0),
    output_tokens: subjects.reduce((sum, metrics) => sum + metrics.output_tokens, 0),
    cache_read_tokens: subjects.reduce((sum, metrics) => sum + metrics.cache_read_tokens, 0),
    cache_write_tokens: subjects.reduce((sum, metrics) => sum + metrics.cache_write_tokens, 0),
    subject_cost_usd: subjects.reduce((sum, metrics) => sum + metrics.cost_usd, 0),
    cost_source: subjects.every((metrics) => metrics.cost_source === subjects[0].cost_source) ? subjects[0].cost_source : "unreported",
    tool_calls: subjects.reduce((sum, metrics) => sum + metrics.tool_calls, 0),
    delegated_children: subjects.reduce((sum, metrics) => sum + metrics.delegated_children, 0),
    max_concurrency: Math.max(...subjects.map((metrics) => metrics.max_concurrency))
  };
}

// packages/core/dist/regrade.js
import { readFileSync as readFileSync7, writeFileSync as writeFileSync2, existsSync as existsSync8 } from "node:fs";
import { join as join10 } from "node:path";

// packages/core/dist/provider-failure.js
var PROVIDER_FAILURE_MARKER = "[skill-harness] provider failure:";
var TURN_HEADER_PREFIX = ">>> ";
function withProviderFailure(transcript, failure) {
  return failure ? `${PROVIDER_FAILURE_MARKER} ${failure}

${transcript}` : transcript;
}
var FAILURE_DIAGNOSTICS = /* @__PURE__ */ new Set(["provider_transport_failure"]);
function providerFailureFromJsonLine(line) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  const message = parsed?.message;
  if (!message || typeof message !== "object")
    return null;
  const diagnostics = message.diagnostics;
  if (!Array.isArray(diagnostics))
    return null;
  for (const raw of diagnostics) {
    if (typeof raw?.type !== "string" || !FAILURE_DIAGNOSTICS.has(raw.type))
      continue;
    const provider = typeof message.provider === "string" ? message.provider : "unknown provider";
    const detail = typeof raw.error?.message === "string" ? raw.error.message : raw.type;
    return `${provider}: ${detail}`;
  }
  return null;
}
function providerFailureFromTranscript(transcript) {
  for (const line of transcript.split("\n")) {
    if (line.startsWith(TURN_HEADER_PREFIX))
      return null;
    if (line.startsWith(PROVIDER_FAILURE_MARKER))
      return line.slice(PROVIDER_FAILURE_MARKER.length).trim();
  }
  return null;
}

// packages/core/dist/regrade.js
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
  const startedAt = performance.now();
  const repField = rep === void 0 ? {} : { rep };
  const providerFailure = providerFailureFromTranscript(transcript);
  if (providerFailure) {
    const reason = `provider failure \u2014 ${providerFailure}`;
    appendJournal(runDir, { event: "judge-verdict", ts: now(), id: scenario.id, verdict: "ERROR", reason, suspect: false, ...repField });
    return {
      verdict: "ERROR",
      reason,
      suspect: false,
      metrics: { wall_time_ms: Math.max(0, Math.round(performance.now() - startedAt)), judge_calls: 0, judge_rejudge_calls: 0 }
    };
  }
  const prompt = buildJudgePrompt({ skill: spec.skill, persona: spec.judge_persona, scenario, transcript });
  const g = await judgeInWorkspace(adapter, judge, prompt, specDir);
  writeFileSync2(judgeRawPath(runDir, scenario.id, mode, rep), g.raw, "utf8");
  appendJournal(runDir, { event: "judge-verdict", ts: now(), id: scenario.id, verdict: g.verdict, reason: g.reason, suspect: g.suspect, ...repField });
  if (g.suspect)
    appendJournal(runDir, { event: "misfire-flag", ts: now(), id: scenario.id, reason: g.reason, ...repField });
  return {
    verdict: g.verdict,
    reason: g.reason,
    suspect: g.suspect,
    judgment: { ordinal: 1, judge: { ...judge }, verdict: g.verdict, reason: g.reason, suspect: g.suspect, criteria: completeCriterionVotes(g.criteria, scenario.checklist.length) },
    metrics: {
      wall_time_ms: Math.max(0, Math.round(performance.now() - startedAt)),
      judge_calls: 1,
      judge_rejudge_calls: opts.rejudge ? 1 : 0
    }
  };
}
async function regradeScenario(opts) {
  const now = opts.now ?? (() => (/* @__PURE__ */ new Date()).toISOString());
  const mode = opts.mode ?? "green";
  const files = findTranscriptFiles(opts.runDir, opts.scenario.id, mode);
  if (files.length === 0)
    throw new Error(`no ${mode} transcripts for ${opts.scenario.id} in ${opts.runDir}`);
  const expected = opts.expectedReps ?? files.length;
  const expectedIndices = expected === 1 ? [null] : Array.from({ length: expected }, (_, index) => index);
  const actualIndices = files.map((file) => repIndexOf(file)).sort((a, b) => (a ?? -1) - (b ?? -1));
  if (files.length !== expected || JSON.stringify(actualIndices) !== JSON.stringify(expectedIndices)) {
    throw new Error(`${opts.scenario.id}: transcript artifacts are incomplete for ${expected} recorded rep(s) \u2014 re-run instead of grading a smaller repetition set`);
  }
  const repCount = expected;
  const outcomes = [];
  for (const file of files) {
    const rep = repIndexOf(file) ?? void 0;
    const transcript = readFileSync7(join10(opts.runDir, file), "utf8");
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
      now,
      rejudge: true
    }));
  }
  return outcomesToResult(opts.scenario.id, outcomes, repCount, opts.threshold);
}
async function regradeRun(opts) {
  const { runDir, spec, adapter, judge, specDir } = opts;
  const now = opts.now ?? (() => (/* @__PURE__ */ new Date()).toISOString());
  const prev = existsSync8(join10(runDir, "results.yaml")) ? readResults(runDir) : null;
  const overrides = new Map((prev?.scenarios ?? []).map((s) => [s.id, s]));
  const mode = prev?.mode ?? "green";
  const specById = new Map(spec.scenarios.map((s) => [s.id, s]));
  const recorded = prev?.scenarios ?? spec.scenarios.map((s) => ({ id: s.id }));
  let targets = recorded.map((s) => s.id);
  if (opts.onlySuspect) {
    if (!prev)
      throw new Error(`--suspect-only needs a prior results.yaml in ${runDir}`);
    targets = prev.scenarios.filter((s) => s.suspect || s.judge_verdict === "JUDGE-AMBIGUOUS").map((s) => s.id);
  }
  if (prev?.schema === 3) {
    const blocked = new Set(prev.scenarios.filter((s) => s.objective?.assertions.some((a) => a.kind === "skill_delivered" && a.status !== "PASS")).map((s) => s.id));
    targets = targets.filter((id) => !blocked.has(id));
  }
  if (targets.length === 0 && prev) {
    return prev;
  }
  const completeTranscripts = (record) => {
    const expected = record.reps ?? 1;
    const files = findTranscriptFiles(runDir, record.id, mode);
    const expectedIndices = expected === 1 ? [null] : Array.from({ length: expected }, (_, index) => index);
    const actualIndices = files.map((file) => repIndexOf(file)).sort((a, b) => (a ?? -1) - (b ?? -1));
    return files.length === expected && JSON.stringify(actualIndices) === JSON.stringify(expectedIndices);
  };
  const recordedById = new Map(recorded.map((record) => [record.id, record]));
  const missing = targets.filter((id) => !specById.has(id) || !completeTranscripts(recordedById.get(id)));
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
      now,
      expectedReps: prevScenario?.reps ?? 1
    });
    const carry = overrides.get(id);
    if (prev?.schema === 3)
      rr.criterion_count = scenario.checklist.length;
    rr.metrics = mergeScenarioMetrics(carry?.metrics, rr.metrics);
    rr.rep_judgments = carryRepObjectives(rr.rep_judgments, carry?.rep_judgments);
    scenarioResults.push(rebuildScenarioResult(rr, carry, { objective: "carry", adjudication: "drop" }));
  }
  const ctx = scoreContextFor({ mode, partial: prev?.partial }, spec);
  const results = writeResults(runDir, {
    schema: prev?.schema,
    subject_invocations: prev?.subject_invocations,
    skill: spec.skill,
    harness: prev?.harness ?? "pi",
    // The harness CLI that produced these transcripts, carried verbatim: a re-grade
    // re-asks the judge, it does not re-deliver the skill, so stamping today's pi
    // here would credit the old transcripts to a version that never ran them.
    harness_cli_version: prev?.harness_cli_version,
    delivery_canary: prev?.delivery_canary,
    // The arm is provenance of the MEASUREMENT, not of this rewrite, and it is the
    // only record that a `+<arm>` run actually delegated: rebuilding the draft
    // field-by-field without it silently deleted `definitions`/`ledger_events`
    // from any arm run that was ever re-graded, leaving a record
    // indistinguishable from a vacuous arm. Same reason `harness_cli_version`,
    // `delivery_canary` and `source_hashes` are carried here.
    arm: prev?.arm,
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
import { readFileSync as readFileSync8 } from "node:fs";
import { join as join11 } from "node:path";
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
  const skillMd = readFileSync8(join11(opts.skillDir, "SKILL.md"), "utf8");
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
import { join as join13 } from "node:path";

// packages/core/dist/trends.js
import { existsSync as existsSync9, readdirSync as readdirSync7, statSync as statSync5 } from "node:fs";
import { join as join12 } from "node:path";
function isDir2(p) {
  try {
    return statSync5(p).isDirectory();
  } catch {
    return false;
  }
}
function collectScoredRuns(skillDir) {
  const resultsRoot = join12(skillDir, "tests", "results");
  if (!existsSync9(resultsRoot))
    return [];
  const groups = [];
  const tags = readdirSync7(resultsRoot).filter((n) => isDir2(join12(resultsRoot, n))).sort();
  for (const tag of tags) {
    const tagDir = join12(resultsRoot, tag);
    const runDirs = readdirSync7(tagDir).map((n) => join12(tagDir, n)).filter((p) => isDir2(p) && existsSync9(join12(p, "results.yaml"))).sort();
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
  const specPath = join12(skillDir, "tests", "specification.yaml");
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
  return !v.suspect && v.verdict !== "ERROR" && v.verdict !== "NOT-MEASURED" && v.verdict !== "JUDGE-AMBIGUOUS";
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
function skillTextChanged(prev, cur) {
  for (const key of [SKILL_PROMPT_KEY, SKILL_KEY]) {
    const a = prev?.[key];
    const b = cur?.[key];
    if (a === void 0 || b === void 0)
      continue;
    return a !== b;
  }
  return false;
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
    if (isSupersededKey(key, a) && isSupersededKey(key, b))
      continue;
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
  const pairs2 = [];
  for (let i = 1; i < raw.length; i++) {
    const prev = raw[i - 1];
    const cur = raw[i];
    const from = points[i - 1];
    const to = points[i];
    const skillChanged = skillTextChanged(prev.r.source_hashes, cur.r.source_hashes);
    const base = { from, to, flipped: false, skillChanged, changedSources: [], unanimousFlip: false };
    if (!prev.ok || !cur.ok) {
      pairs2.push({ ...base, status: "inconclusive" });
      continue;
    }
    if (shapeOf(prev.s) !== shapeOf(cur.s)) {
      pairs2.push({ ...base, status: "aggregation" });
      continue;
    }
    const src = compareSources(prev.r.source_hashes, cur.r.source_hashes, keys);
    if (src.shared === 0) {
      pairs2.push({ ...base, status: "unverified" });
      continue;
    }
    if (src.changed.length > 0) {
      pairs2.push({ ...base, status: "sources", changedSources: src.changed });
      continue;
    }
    const flipped2 = from.verdict !== to.verdict;
    pairs2.push({
      ...base,
      status: "compared",
      flipped: flipped2,
      unanimousFlip: flipped2 && from.unanimous && to.unanimous
    });
  }
  const compared = pairs2.filter((p) => p.status === "compared").length;
  const flipped = pairs2.filter((p) => p.status === "compared" && p.flipped);
  return {
    id: scenario.id,
    title: scenario.title,
    critical: scenario.critical,
    tag: group.tag,
    mode: group.mode,
    model: group.model,
    points,
    pairs: pairs2,
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
  const spec = loadSpec(join13(skillDir, "tests", "specification.yaml"));
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

// packages/core/dist/metrics.js
function aggregateMetrics2(scenarios) {
  const metrics = scenarios.map((scenario) => scenario.metrics).filter((value) => value !== void 0);
  const sumOptional = (field) => {
    const values = metrics.map((value) => value[field]).filter((value) => typeof value === "number");
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  };
  const maxValues = metrics.map((value) => value.max_concurrency).filter((value) => typeof value === "number");
  return {
    wall_time_ms: metrics.reduce((sum, value) => sum + value.wall_time_ms, 0),
    judge_calls: metrics.reduce((sum, value) => sum + value.judge_calls, 0),
    judge_rejudge_calls: metrics.reduce((sum, value) => sum + value.judge_rejudge_calls, 0),
    subject_metrics_reps: metrics.reduce((sum, value) => sum + value.subject_metrics_reps, 0),
    total_reps: metrics.reduce((sum, value) => sum + value.total_reps, 0),
    input_tokens: sumOptional("input_tokens"),
    output_tokens: sumOptional("output_tokens"),
    cache_read_tokens: sumOptional("cache_read_tokens"),
    cache_write_tokens: sumOptional("cache_write_tokens"),
    subject_cost_usd: sumOptional("subject_cost_usd"),
    cost_source: (() => {
      const sources = scenarios.map((scenario) => scenario.metrics?.cost_source).filter((source) => source !== void 0);
      return sources.length === 0 ? null : sources.every((source) => source === sources[0]) ? sources[0] : "unreported";
    })(),
    tool_calls: sumOptional("tool_calls"),
    delegated_children: sumOptional("delegated_children"),
    max_concurrency: maxValues.length ? Math.max(...maxValues) : null
  };
}

// packages/core/dist/run.js
var LEDGER_FILENAME = "pi-daddy.ledger.jsonl";
function countLedgerEvents(runDir) {
  let text;
  try {
    text = readFileSync9(join14(runDir, LEDGER_FILENAME), "utf8");
  } catch {
    return 0;
  }
  return text.split("\n").filter((line) => line.trim().length > 0).length;
}
async function runSkillModel(opts) {
  const { spec, skillDir, adapter, model, judge, mode, timestamp: timestamp2 } = opts;
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
  const arm = opts.arm ?? NONE_ARM;
  const runDir = runDirFor(skillDir, adapter.name, model, timestamp2, arm.name);
  mkdirSync4(runDir, { recursive: true });
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
    if (canary.status === "skipped") {
      canaryStatus = "skipped";
      log(`  \u26A0 delivery canary skipped \u2014 ${canary.detail}`);
    } else {
      canaryStatus = "pass";
      log(`  \u2713 delivery canary \u2014 the model quoted its skill instructions back (\`${canary.anchor}\`)`);
    }
  }
  const repCounts = scenarios.map((s) => s.reps ?? opts.reps ?? 1);
  const owners = [];
  const tasks = [];
  const armDefinitions = { count: 0 };
  scenarios.forEach((scenario, si) => {
    for (let k = 0; k < repCounts[si]; k++) {
      const rep = k;
      const total = repCounts[si];
      owners.push(si);
      tasks.push(() => runRep(scenario, rep, total, { ...opts, runDir, now, log, armDefinitions }));
    }
  });
  const flat = await runPool(tasks, opts.concurrency ?? 1);
  const grouped = scenarios.map(() => []);
  flat.forEach((outcome, i) => grouped[owners[i]].push(outcome));
  const scenarioResults = scenarios.map((scenario, si) => {
    const threshold = scenario.critical ? effectiveThreshold(void 0, scenario) : scenario.passThreshold ?? opts.passThreshold ?? 0.5;
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
    timestamp: timestamp2,
    label: opts.label ?? null,
    mode,
    ...partial ? { partial: true } : {},
    // Only the scenarios this run actually measured: a --only run must not claim
    // coverage of scenarios it skipped.
    source_hashes: sourceHashes({ skillDir, specDir: dirname(opts.specPath), scenarios, judgePersona: spec.judge_persona }),
    scenarios: scenarioResults,
    ...arm.name === NONE_ARM.name ? {} : {
      arm: {
        name: arm.name,
        extensions: arm.extensions,
        definitions: armDefinitions.count,
        ledger_events: countLedgerEvents(runDir),
        // The DECLARED env, `<run-dir>` left unsubstituted. It is the condition
        // being measured (grant, max depth), so leaving it out made two runs at
        // different settings byte-identical here and inside the same `+<arm>`
        // tag — `stability` then reads the verdict difference between two
        // conditions as one lineage flipping. The substituted form would be the
        // opposite error: it embeds this run's temp path, so re-running the SAME
        // condition would record two different-looking arms.
        env: arm.env
      }
    }
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
  const startedAt = performance.now();
  const { spec, judge, mode, runDir, now, log } = ctx;
  const repField = repCount > 1 ? { rep } : {};
  const arm = ctx.arm ?? NONE_ARM;
  const skillsRoot = ctx.skillsRoot ?? dirname(ctx.skillDir);
  const armEnvFor = (workspace) => Object.keys(arm.env).length ? Object.fromEntries(Object.entries(arm.env).map(([k, v]) => [k, v.split("<run-dir>").join(runDir).split("<workspace>").join(workspace)])) : void 0;
  if (rep === 0) {
    log(`  ${scenario.id} (${scenario.title})${repCount > 1 ? ` \xD7${repCount}` : ""} \u2026`);
    appendJournal(runDir, { event: "scenario-started", ts: now(), id: scenario.id, title: scenario.title });
  }
  let ws = null;
  let transcript = "";
  let gatePrefix = null;
  let infrastructureFailure = null;
  let stagedDiff = null;
  try {
    try {
      ws = createWorkspace(scenario.workspace, { specDir: dirname(ctx.specPath), remote: scenario.remote });
    } catch (e) {
      gatePrefix = e instanceof Error ? e.message : String(e);
      infrastructureFailure = gatePrefix;
      transcript = `[workspace setup failed] ${gatePrefix}`;
    }
    let noResponse = false;
    let traces = [];
    let unobservablePaths = false;
    let before = ws ? snapshotPaths(ws.cwd, scenario.workspace) : null;
    if (ws) {
      ctx.armDefinitions.count = seedArmDefinitions(arm, skillsRoot, ws.cwd, { ambientSkillsDir: ctx.ambientSkillsDir });
    }
    let adapterFailure = null;
    if (ws) {
      const needsStructuredEvidence = Boolean(scenario.traceAssert);
      if (needsStructuredEvidence && !ctx.adapter.runStructured) {
        throw new Error(`scenario \`${scenario.id}\` declares structured objective assertions, but the \`${ctx.adapter.name}\` adapter cannot produce execution traces \u2014 the gate would have no evidence to read.`);
      }
      const useStructured = (Boolean(ctx.structured) || needsStructuredEvidence) && Boolean(ctx.adapter.runStructured);
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) {
          const why = adapterFailure ? `adapter failed (${adapterFailure})` : "empty response";
          appendJournal(runDir, { event: "empty-response-retry", ts: now(), id: scenario.id, attempt, reason: why, ...repField });
          log(`  ${scenario.id}${repCount > 1 ? `#${rep}` : ""} ${why} \u2014 retrying once`);
          ws.cleanup();
          ws = createWorkspace(scenario.workspace, { specDir: dirname(ctx.specPath), remote: scenario.remote });
          before = snapshotPaths(ws.cwd, scenario.workspace);
          ctx.armDefinitions.count = seedArmDefinitions(arm, skillsRoot, ws.cwd, { ambientSkillsDir: ctx.ambientSkillsDir });
        }
        infrastructureFailure = null;
        adapterFailure = null;
        try {
          if (scenario.mode === "seeded") {
            const r = await runSeeded(scenario, {
              skillDir: ctx.skillDir,
              adapter: ctx.adapter,
              model: ctx.model,
              mode,
              cwd: ws.cwd,
              specDir: dirname(ctx.specPath),
              // assert.post_test resolves like a fixture
              // `ctx.structured` (a bare `--structured` request, with no gate depending
              // on it) must route through the structured path here too, exactly as it
              // does for the non-seeded branch below — without it, `--structured` on a
              // `mode: seeded` scenario silently called the adapter's plain `run()` and
              // recorded zero subject tokens/cost, which is the one thing the flag exists
              // to capture. `useStructured` (not the raw request) so an adapter with no
              // `runStructured` degrades here exactly as it does below.
              trace: useStructured ? { scenarioId: scenario.id, rep } : void 0,
              // `runSeeded` merges these with `scenario.extensions` itself when it
              // builds the RunReq — the arm's extensions and env (with `<run-dir>`
              // already substituted) both must reach pi.
              armExtensions: arm.extensions,
              ...armEnvFor(ws.cwd) ? { armEnv: armEnvFor(ws.cwd) } : {}
            });
            transcript = r.transcript;
            gatePrefix = r.gateFailure;
            infrastructureFailure = r.gateError;
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
              systemPromptFile: scenario.systemPromptFile ? resolve6(dirname(ctx.specPath), scenario.systemPromptFile) : void 0,
              // Absolute before it reaches a child process running in a neutral cwd.
              // The arm's extensions are added alongside whatever the scenario
              // itself declares — both must reach pi.
              extensions: [
                ...scenario.extensions?.map((e) => resolve6(dirname(ctx.specPath), e)) ?? [],
                ...arm.extensions
              ],
              ...armEnvFor(ws.cwd) ? { armEnv: armEnvFor(ws.cwd) } : {}
            };
            if (useStructured) {
              const structured = await ctx.adapter.runStructured({ ...req, scenarioId: scenario.id, rep });
              transcript = structured.transcript;
              traces = structured.traces;
              if (structured.providerFailure)
                infrastructureFailure = `provider failure \u2014 ${structured.providerFailure}`;
            } else {
              transcript = await ctx.adapter.run(req);
            }
          }
        } catch (e) {
          adapterFailure = e instanceof Error ? e.message : String(e);
          transcript = `[adapter failure] ${adapterFailure}`;
          gatePrefix = null;
          stagedDiff = null;
          traces = [];
        }
        if (!infrastructureFailure) {
          const provider = providerFailureFromTranscript(transcript);
          if (provider)
            infrastructureFailure = `provider failure \u2014 ${provider}`;
        }
        noResponse = hasEmptyAssistantTurn(transcript);
        if (!noResponse && !adapterFailure)
          break;
      }
      if (adapterFailure && !infrastructureFailure) {
        infrastructureFailure = `adapter failure \u2014 ${adapterFailure}`;
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
    if (scenario.traceAssert?.unchanged_paths?.length && traces.length > 0 && ws) {
      const changed = diffSnapshots(before, snapshotPaths(ws.cwd, scenario.workspace));
      if (changed === null) {
        unobservablePaths = true;
      } else {
        traces = traces.map((t) => {
          const withPaths = { ...t, changed_paths: changed };
          return { ...withPaths, trace_sha256: traceSha256(withPaths) };
        });
      }
    }
    let objective;
    if (scenario.traceAssert && !adapterFailure) {
      const assertionResults = [];
      let status = "PASS";
      let traceMeta = {};
      if (scenario.traceAssert) {
        if (traces.length > 0) {
          writeFileSync3(tracePath(runDir, scenario.id, mode, repSuffix), traces.map(serializeTrace).join(""), "utf8");
        }
        const merged = mergeTraces(traces);
        if (unobservablePaths) {
          status = "ERROR";
          assertionResults.push({ kind: "unchanged_path", status: "ERROR", detail: "workspace changes could not be observed" });
        } else if (merged === null) {
          status = "ERROR";
          assertionResults.push({ kind: "trace_evidence", status: "ERROR", detail: "no execution trace was produced" });
        } else {
          const gate = evaluateTraceGates(scenario.traceAssert, merged);
          status = gate.status;
          assertionResults.push(...gate.assertions);
          traceMeta = { trace_version: merged.trace_version, trace_sha256: merged.trace_sha256 };
        }
      }
      objective = { status, ...traceMeta, assertions: assertionResults };
      if (status !== "PASS") {
        const details = assertionResults.filter((result) => result.status === status).map((result) => result.detail);
        gatePrefix = `objective: ${details.join("; ") || "structured evidence could not be evaluated"}`;
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
    let judgment;
    let judgeCalls = 0;
    if (objective?.status === "ERROR") {
      verdict = "ERROR";
      reason = gatePrefix ?? "objective evidence missing";
      appendJournal(runDir, { event: "judge-verdict", ts: now(), id: scenario.id, verdict, reason, suspect, ...repField });
    } else if (objective?.status === "NOT-MEASURED") {
      verdict = "NOT-MEASURED";
      reason = gatePrefix ?? "skill delivery was not established";
      appendJournal(runDir, { event: "judge-verdict", ts: now(), id: scenario.id, verdict, reason, suspect, ...repField });
    } else if (infrastructureFailure) {
      verdict = "ERROR";
      reason = infrastructureFailure;
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
      judgment = o.judgment;
      judgeCalls = 1;
    }
    log(`  \u2192 ${scenario.id}${repCount > 1 ? `#${rep}` : ""} ${verdict}${reason ? `: ${reason}` : ""}${suspect ? "  \u26A0 suspect" : ""}`);
    const subject = mergeTraces(traces)?.metrics;
    return {
      verdict,
      reason,
      suspect,
      objective,
      judgment,
      metrics: {
        wall_time_ms: Math.max(0, Math.round(performance.now() - startedAt)),
        judge_calls: judgeCalls,
        judge_rejudge_calls: 0,
        ...subject ? { subject } : {}
      }
    };
  } finally {
    ws?.cleanup();
  }
}

// packages/core/dist/rescore.js
import { existsSync as existsSync10 } from "node:fs";
import { join as join15 } from "node:path";

// packages/core/dist/report.js
import { existsSync as existsSync11, readdirSync as readdirSync8, statSync as statSync6 } from "node:fs";
import { join as join16 } from "node:path";
function latestRunDir(tagDir) {
  if (!statSync6(tagDir).isDirectory())
    return null;
  const runs = readdirSync8(tagDir).map((n) => join16(tagDir, n)).filter((p) => statSync6(p).isDirectory() && existsSync11(join16(p, "results.yaml"))).sort();
  return runs.length ? runs[runs.length - 1] : null;
}
function collectReport(skillDir) {
  const specPath = join16(skillDir, "tests", "specification.yaml");
  const spec = loadSpec(specPath);
  const scenarios = spec.scenarios.map((s) => ({ id: s.id, title: s.title, critical: s.critical }));
  const resultsRoot = join16(skillDir, "tests", "results");
  const liftByTag = new Map(collectLift(skillDir).map((l) => [l.tag, l]));
  const boundaryByCell = new Map(boundaryCells(collectStability(skillDir)).map((c) => [`${c.tag}\0${c.mode}\0${c.id}`, c]));
  const columns = [];
  if (existsSync11(resultsRoot)) {
    const tags = readdirSync8(resultsRoot).map((n) => join16(resultsRoot, n)).filter((p) => statSync6(p).isDirectory()).sort();
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
          judge_verdict: s.judge_verdict,
          judge_reason: s.judge_reason,
          suspect: s.suspect ?? false,
          // suspect defaults false for older results that predate the field
          reps: s.reps,
          passes: s.passes,
          clean: s.clean,
          flakiness: s.flakiness,
          metrics: s.metrics,
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
        partial: r.partial === true,
        grade: r.effective_grade,
        judge: r.judge,
        metrics: aggregateMetrics2(r.scenarios),
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
      partial: c.partial,
      grade: c.grade,
      judge: c.judge,
      metrics: c.metrics,
      cells: c.cells,
      ...c.lift ? { lift: c.lift, liftHeadline: c.liftHeadline } : {}
    }))
  };
}
function stripExports(js) {
  return js.replace(/^export\s+/gm, "");
}
function renderReport(template, data, gradeScript) {
  const json2 = JSON.stringify(publicView(data));
  return template.replace("/*__DATA__*/null", json2).replace("/*__GRADE__*/", stripExports(gradeScript)).replace("__SKILL__", data.skill);
}

// packages/core/dist/lint.js
import { existsSync as existsSync14, statSync as statSync8, readdirSync as readdirSync10, readFileSync as readFileSync11 } from "node:fs";
import { basename, dirname as dirname3, isAbsolute as isAbsolute6, join as join18, resolve as resolve8 } from "node:path";

// packages/core/dist/instruction-coverage.js
import { existsSync as existsSync12, readFileSync as readFileSync10 } from "node:fs";
import { resolve as resolve7, dirname as dirname2, relative as relative2, isAbsolute as isAbsolute5 } from "node:path";
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
    const abs = isAbsolute5(file) ? file : resolve7(opts.specDir, file);
    if (!existsSync12(abs))
      return null;
    const sections2 = parseSections(readFileSync10(abs, "utf8"));
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
      entry = { file, section, scenarios: [] };
      bySection.set(k, entry);
    }
    return entry;
  };
  for (const [file, sections2] of fileSections)
    for (const s of sections2)
      ensure(file, s);
  const broken = [];
  const unmapped = [];
  const attach = (id, refs) => {
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
          ensure(ref.file, s).scenarios.push(id);
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
      ensure(ref.file, match).scenarios.push(id);
    }
  };
  for (const s of opts.scenarios) {
    if (!s.covers || s.covers.length === 0) {
      unmapped.push(s.id);
      continue;
    }
    attach(s.id, s.covers);
  }
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
import { existsSync as existsSync13, readdirSync as readdirSync9, statSync as statSync7 } from "node:fs";
import { join as join17 } from "node:path";

// packages/core/dist/restamp.js
import { createHash as createHash5 } from "node:crypto";
import { execFileSync as execFileSync2 } from "node:child_process";
import { readFileSync as readFileSync12, renameSync, rmSync as rmSync2, writeFileSync as writeFileSync4 } from "node:fs";
import { dirname as dirname4, join as join19, relative as relative3, resolve as resolve9 } from "node:path";

// packages/core/dist/defaults.js
var BAKED_DEFAULT_JUDGE = "claude-code:claude-opus-4-8";
function defaultJudge() {
  return readEnv("JUDGE") ?? BAKED_DEFAULT_JUDGE;
}

// packages/core/dist/judge-policy.js
var FREE_JUDGE_PROVIDERS = /* @__PURE__ */ new Set(["claude-code", "openai-codex", "ollama", "lmstudio", "llamacpp", "local"]);
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
import { existsSync as existsSync15, readFileSync as readFileSync13, renameSync as renameSync2, writeFileSync as writeFileSync5 } from "node:fs";
import { basename as basename2, join as join20 } from "node:path";

// packages/core/dist/spec-write.js
import { createHash as createHash6 } from "node:crypto";
import { readFileSync as readFileSync14, renameSync as renameSync3, unlinkSync, writeFileSync as writeFileSync6 } from "node:fs";
import { dirname as dirname5, join as join21 } from "node:path";

// packages/core/dist/trajectory-events.js
var V11_EVENT_KEYS = /* @__PURE__ */ new Set(["execution_id", "parent_execution_id", "task_from_execution_id", "workflow_fact_id", "deadline_at"]);
var EVENT_KEYS = /* @__PURE__ */ new Set([
  "event_version",
  "seq",
  "type",
  "source",
  "at",
  "run_id",
  "task_id",
  "workspace_id",
  "context_id",
  "finding_id",
  "parent_id",
  "child_id",
  ...V11_EVENT_KEYS,
  "phase",
  "tool",
  "capability",
  "requested_capabilities",
  "effective_capabilities",
  "refusal_code",
  "exit_code",
  "digests",
  "approval",
  "requirements",
  "attributes"
]);

// packages/adapters/dist/pi.js
import { existsSync as existsSync16, mkdtempSync as mkdtempSync2, readFileSync as readFileSync15, statSync as statSync9 } from "node:fs";
import { tmpdir as tmpdir2, homedir as homedir2 } from "node:os";
import { join as join22, resolve as resolve10 } from "node:path";

// packages/adapters/dist/pi-json.js
import { spawn as spawn2 } from "node:child_process";
import { createInterface } from "node:readline";
var SKIPPED_TYPE_RE = /^\s*\{\s*"type"\s*:\s*"(?:message_update|tool_execution_update)"/;
var MAX_STDERR_CHARS = 8e3;
function runPiJson(opts) {
  return new Promise((resolve13, reject) => {
    const child = spawn2("pi", opts.args, {
      cwd: opts.cwd,
      env: opts.env,
      // stdin from /dev/null: pi hangs waiting on it otherwise, and a hang in a
      // wave is indistinguishable from a slow model until the timeout fires.
      stdio: ["ignore", "pipe", "pipe"]
    });
    const kept = [];
    let stderr = "";
    let providerFailure = null;
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
      if (!line.trim())
        return;
      if (SKIPPED_TYPE_RE.test(line))
        return;
      kept.push(line);
      if (providerFailure === null)
        providerFailure = providerFailureFromJsonLine(line);
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
      resolve13({ ...parsed, code, stderr: stderr.slice(0, MAX_STDERR_CHARS), providerFailure });
    });
  });
}

// packages/adapters/dist/pi.js
var PI_TIMEOUT_MS = envNum("PI_TIMEOUT_MS", 3e5);
var PROVIDER_STDERR_SIGNATURES = [
  "invalidated oauth token",
  "invalid_api_key",
  "insufficient_quota"
];
function providerStderr(stderr) {
  const hay = stderr.toLowerCase();
  return PROVIDER_STDERR_SIGNATURES.some((sig) => hay.includes(sig)) ? stderr.trim() : null;
}
function requireSkillDir(skillDir, mode) {
  const abs = resolve10(skillDir);
  const md = join22(abs, "SKILL.md");
  const isDir3 = existsSync16(abs) && statSync9(abs).isDirectory();
  if (!isDir3 || !existsSync16(md)) {
    throw new Error(`mode=${mode} needs a skill directory with a SKILL.md, but ${abs} ${isDir3 ? "has none" : "is not a directory"}` + (abs === skillDir ? "" : ` (given \`${skillDir}\`, resolved against ${process.cwd()})`) + ` \u2014 pi accepts \`--skill <nonexistent>\` silently (exit 0, a normal answer, no skill in context), so this run would measure a model with no skill and report it as a result.`);
  }
  return abs;
}
function skillFlags(mode, skillDir, boundRaw) {
  switch (mode) {
    case "red":
      return ["--no-skills"];
    case "green":
      return ["--skill", requireSkillDir(skillDir, mode)];
    case "force": {
      requireSkillDir(skillDir, mode);
      const body = boundRaw ?? readFileSync15(join22(resolve10(skillDir), "SKILL.md"), "utf8");
      return ["--no-skills", "--append-system-prompt", body];
    }
  }
}
function extensionFlags(extensions) {
  if (!extensions || extensions.length === 0)
    return [];
  return extensions.flatMap((p) => {
    const abs = resolve10(p);
    if (!existsSync16(abs)) {
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
    const common2 = [
      "--no-context-files",
      "--no-extensions",
      ...extensionFlags(req.extensions),
      "--provider",
      req.model.provider,
      "--model",
      req.model.model
    ];
    const flags = req.systemPromptFile ? ["--no-skills", "--append-system-prompt", readFileSync15(req.systemPromptFile, "utf8")] : skillFlags(req.mode, req.skillDir);
    const total = req.turns.length;
    const parts = [];
    const env = req.armEnv ? { ...process.env, ...req.armEnv } : void 0;
    let providerFailure = null;
    if (total === 1) {
      const args = [...flags, ...common2, "--no-session", "-p", req.turns[0]];
      const r = await exec("pi", args, { cwd: req.cwd, timeoutMs: PI_TIMEOUT_MS, env });
      parts.push(header(1, 1, req.turns[0]));
      parts.push(`<<< ASSISTANT:
${r.stdout.trim()}
`);
      if (r.code !== 0) {
        providerFailure = providerStderr(r.stderr);
        if (!providerFailure)
          parts.push(`[pi exited ${r.code}]
${r.stderr.trim()}
`);
      }
      return withProviderFailure(parts.join("\n"), providerFailure);
    }
    const session = mkdtempSync2(join22(tmpdir2(), "sc-pi-session-"));
    for (let i = 0; i < total; i++) {
      const turnFlags = i === 0 ? ["--session-dir", session] : ["--session-dir", session, "-c"];
      const args = [...flags, ...common2, ...turnFlags, "-p", req.turns[i]];
      const r = await exec("pi", args, { cwd: req.cwd, timeoutMs: PI_TIMEOUT_MS, env });
      parts.push(header(i + 1, total, req.turns[i]));
      parts.push(`<<< ASSISTANT:
${r.stdout.trim()}
`);
      if (r.code !== 0) {
        const provider = providerStderr(r.stderr);
        if (provider && providerFailure === null)
          providerFailure = provider;
        if (!provider)
          parts.push(`[pi exited ${r.code} on turn ${i + 1}]
${r.stderr.trim()}
`);
      }
    }
    return withProviderFailure(parts.join("\n"), providerFailure);
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
    const common2 = [
      "--no-context-files",
      "--no-extensions",
      ...extensionFlags(req.extensions),
      "--provider",
      req.model.provider,
      "--model",
      req.model.model
    ];
    const flags = req.systemPromptFile ? ["--no-skills", "--append-system-prompt", readFileSync15(req.systemPromptFile, "utf8")] : skillFlags(req.mode, req.skillDir);
    const piVersion = await this.version();
    const total = req.turns.length;
    const traces = [];
    const parts = [];
    const session = total === 1 ? null : mkdtempSync2(join22(tmpdir2(), "sc-pi-session-"));
    let providerFailure = null;
    const env = req.armEnv ? { ...process.env, ...req.armEnv } : void 0;
    for (let i = 0; i < total; i++) {
      const turnFlags = session === null ? ["--no-session"] : i === 0 ? ["--session-dir", session] : ["--session-dir", session, "-c"];
      const args = [...flags, ...common2, "--mode", "json", ...turnFlags, "-p", req.turns[i]];
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
        homeDir: homedir2(),
        env
      });
      if (!r.isComplete) {
        throw new Error(`pi --mode json produced no terminal events for turn ${i + 1}/${total} (exit ${r.code}${r.malformedLines ? `, ${r.malformedLines} malformed line(s)` : ""})` + (r.stderr.trim() ? `: ${r.stderr.trim()}` : ""));
      }
      if (r.malformedLines > 0) {
        r.trace.capture_errors = [`pi JSONL contained ${r.malformedLines} malformed line(s); absence-based trace assertions are unsafe`];
        r.trace.trace_sha256 = traceSha256(r.trace);
      }
      if (providerFailure === null && r.providerFailure)
        providerFailure = r.providerFailure;
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
    return {
      transcript: withProviderFailure(parts.join("\n"), providerFailure),
      traces,
      ...providerFailure ? { providerFailure } : {}
    };
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

// packages/adapters/dist/trajectory.js
import { createHash as createHash7 } from "node:crypto";
import { readFileSync as readFileSync16, readdirSync as readdirSync11 } from "node:fs";
import { join as join23 } from "node:path";

// packages/adapters/dist/closed-schema.js
var ANNOTATION_KEYWORDS = /* @__PURE__ */ new Set(["$schema", "$id", "title", "description", "$defs"]);
var SUPPORTED_KEYWORDS = /* @__PURE__ */ new Set([
  ...ANNOTATION_KEYWORDS,
  // structure
  "$ref",
  "oneOf",
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  // value constraints
  "enum",
  "const",
  "minLength",
  "maxLength",
  "minimum",
  "pattern",
  "format"
]);
var V3_SUPPORTED_KEYWORDS = /* @__PURE__ */ new Set([
  ...SUPPORTED_KEYWORDS,
  "allOf",
  "anyOf",
  "if",
  "then",
  "propertyNames",
  "minItems",
  "maxItems"
]);

// packages/adapters/dist/pi-daddy-ledger-v2.js
var PI_DADDY_LEDGER_V2_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/mojomanyana/pi-daddy/contracts/ledger/v2/ledger-event.schema.json",
  "title": "pi-daddy ledgerVersion 2 event",
  "description": "One JSON object per JSONL line. This schema covers only explicit ledgerVersion 2 events; legacy GrantRecord lines have no version/event discriminator and are intentionally outside this schema.",
  "oneOf": [
    {
      "$ref": "#/$defs/capabilityDecision"
    },
    {
      "$ref": "#/$defs/workspaceLease"
    },
    {
      "$ref": "#/$defs/childLifecycle"
    },
    {
      "$ref": "#/$defs/checkReceipt"
    }
  ],
  "$defs": {
    "correlation": {
      "type": "object",
      "description": "Opaque, non-authoritative controller metadata. String and aggregate byte limits are additionally enforced by the runtime and cannot be represented exactly in JSON Schema.",
      "properties": {
        "schema_version": {
          "type": "string",
          "maxLength": 512
        },
        "run_id": {
          "type": "string",
          "maxLength": 512
        },
        "task_id": {
          "type": "string",
          "maxLength": 512
        },
        "workspace_id": {
          "type": "string",
          "maxLength": 512
        },
        "context_id": {
          "type": "string",
          "maxLength": 512
        },
        "phase": {
          "type": "string",
          "maxLength": 512
        },
        "assurance": {
          "type": "string",
          "maxLength": 512
        },
        "assurance_effective": {
          "type": "string",
          "maxLength": 512
        },
        "policy_label": {
          "type": "string",
          "maxLength": 512
        },
        "assurance_source": {
          "type": "string",
          "maxLength": 512
        },
        "assurance_scope": {},
        "activated_at": {
          "type": "string",
          "maxLength": 512
        },
        "plan_digest": {
          "type": "string",
          "maxLength": 512
        },
        "definition_digest": {
          "type": "string",
          "maxLength": 512
        },
        "task_digest": {
          "type": "string",
          "maxLength": 512
        },
        "base_sha": {
          "type": "string",
          "maxLength": 512
        },
        "head_sha": {
          "type": "string",
          "maxLength": 512
        },
        "tree_sha": {
          "type": "string",
          "maxLength": 512
        },
        "event_seq": {
          "type": "number"
        },
        "last_change_seq": {
          "type": "number"
        },
        "last_authority_seq": {
          "type": "number"
        },
        "check_receipt_id": {
          "type": "string",
          "maxLength": 512
        }
      },
      "additionalProperties": false
    },
    "refusalCode": {
      "type": "string",
      "enum": [
        "CAPABILITY_ESCALATION",
        "GRANT_ID_MALFORMED",
        "DEFINITION_NOT_AUTHORIZED",
        "UNDECLARED_TOOLS",
        "UNKNOWN_TOOL",
        "GATED_UNAPPROVED",
        "APPROVAL_EXPIRED",
        "APPROVAL_SCOPE_MISMATCH",
        "APPROVAL_FLOW_FAILED",
        "DEPTH_EXCEEDED",
        "FANOUT_EXCEEDED",
        "EXECUTOR_UNAVAILABLE",
        "CHILD_TIMED_OUT",
        "CHILD_CANCELLED",
        "CHILD_EXIT_NONZERO",
        "TASK_MISSING",
        "UNKNOWN_DEFINITION",
        "CEILING_PATTERNS_UNRESOLVED",
        "NARROWING_VIOLATED",
        "DEFINITION_UNREADABLE",
        "CORRELATION_TOO_LARGE",
        "CORRELATION_INVALID",
        "LEDGER_WRITE_FAILED",
        "FANOUT_FAILED",
        "WORKSPACE_NOT_REGISTERED",
        "WORKSPACE_NOT_AUTHORIZED",
        "WORKSPACE_WRITE_CONFLICT",
        "WORKSPACE_LEASE_STALE",
        "CHECK_NOT_CONFIGURED",
        "CHECK_CONFIGURATION_INVALID",
        "CHECK_IDENTITY_UNAVAILABLE",
        "CHECK_IDENTITY_MISMATCH"
      ]
    },
    "refusal": {
      "type": "object",
      "properties": {
        "code": {
          "$ref": "#/$defs/refusalCode"
        },
        "message": {
          "type": "string"
        },
        "details": {
          "type": "object",
          "additionalProperties": {
            "type": [
              "string",
              "number",
              "boolean",
              "null"
            ]
          }
        }
      },
      "required": [
        "code",
        "message"
      ],
      "additionalProperties": false
    },
    "approvalSource": {
      "type": "string",
      "enum": [
        "prompt",
        "session",
        "persisted",
        "inherited"
      ]
    },
    "approvalScope": {
      "type": "string",
      "enum": [
        "once",
        "session",
        "always"
      ]
    },
    "approvalUse": {
      "type": "object",
      "properties": {
        "max": {
          "type": "integer",
          "minimum": 0
        },
        "remaining": {
          "type": "integer",
          "minimum": 0
        }
      },
      "required": [
        "max",
        "remaining"
      ],
      "additionalProperties": false
    },
    "definitionDigest": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string"
        },
        "source": {
          "type": "string"
        },
        "sha256": {
          "type": "string",
          "pattern": "^[a-fA-F0-9]{64}$"
        }
      },
      "required": [
        "name",
        "source",
        "sha256"
      ],
      "additionalProperties": false
    },
    "capabilityDecision": {
      "type": "object",
      "properties": {
        "ledgerVersion": {
          "const": 2
        },
        "event": {
          "const": "capability_decision"
        },
        "ts": {
          "type": "string",
          "format": "date-time"
        },
        "parentId": {
          "type": "string",
          "minLength": 1
        },
        "childId": {
          "type": "string",
          "minLength": 1
        },
        "depth": {
          "type": "integer",
          "minimum": 0
        },
        "agentType": {
          "type": "string"
        },
        "requested": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "parentGrant": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "effective": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "denied": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "clipped": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "gatedBlocked": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "blocked": {
          "type": "boolean"
        },
        "reason": {
          "type": "string"
        },
        "approved": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "approvalSource": {
          "$ref": "#/$defs/approvalSource"
        },
        "approvalSources": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/$defs/approvalSource"
          }
        },
        "approvalScopes": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/$defs/approvalScope"
          }
        },
        "approvalExpiresAt": {
          "type": "object",
          "additionalProperties": {
            "type": "string",
            "format": "date-time"
          }
        },
        "approvalUses": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/$defs/approvalUse"
          }
        },
        "approvalScope": {
          "$ref": "#/$defs/approvalScope"
        },
        "humanDenied": {
          "const": true
        },
        "gateOutcome": {
          "type": "string",
          "enum": [
            "declined",
            "dismissed",
            "no-ui",
            "error"
          ]
        },
        "definitionDigest": {
          "$ref": "#/$defs/definitionDigest"
        },
        "executor": {
          "type": "string",
          "enum": [
            "process",
            "herdr"
          ]
        },
        "taskFrom": {
          "type": "string"
        },
        "taskDigest": {
          "type": "string",
          "pattern": "^[a-fA-F0-9]{64}$"
        },
        "correlation": {
          "$ref": "#/$defs/correlation"
        },
        "refusal": {
          "$ref": "#/$defs/refusal"
        }
      },
      "required": [
        "ledgerVersion",
        "event",
        "ts",
        "parentId",
        "childId",
        "depth",
        "requested",
        "parentGrant",
        "effective",
        "denied",
        "clipped",
        "gatedBlocked",
        "blocked",
        "executor",
        "taskDigest"
      ],
      "additionalProperties": false
    },
    "workspaceLease": {
      "type": "object",
      "properties": {
        "ledgerVersion": {
          "const": 2
        },
        "event": {
          "const": "workspace_lease"
        },
        "ts": {
          "type": "string",
          "format": "date-time"
        },
        "childId": {
          "type": "string",
          "minLength": 1
        },
        "workspaceId": {
          "type": "string",
          "minLength": 1
        },
        "root": {
          "type": "string",
          "minLength": 1
        },
        "access": {
          "type": "string",
          "enum": [
            "read",
            "write"
          ]
        },
        "outcome": {
          "type": "string",
          "enum": [
            "acquired",
            "uncontended",
            "refused",
            "released",
            "released-unrecorded",
            "lost",
            "retained",
            "timeout",
            "recovered"
          ]
        },
        "recovered": {
          "oneOf": [
            {
              "type": "boolean"
            },
            {
              "const": "unknown"
            }
          ]
        },
        "releaseReason": {
          "type": "string"
        },
        "refusal": {
          "$ref": "#/$defs/refusal"
        },
        "correlation": {
          "$ref": "#/$defs/correlation"
        }
      },
      "required": [
        "ledgerVersion",
        "event",
        "ts",
        "childId",
        "workspaceId",
        "root",
        "access",
        "outcome"
      ],
      "additionalProperties": false
    },
    "childLifecycle": {
      "type": "object",
      "properties": {
        "ledgerVersion": {
          "const": 2
        },
        "event": {
          "const": "child_lifecycle"
        },
        "ts": {
          "type": "string",
          "format": "date-time"
        },
        "childId": {
          "type": "string",
          "minLength": 1
        },
        "state": {
          "type": "string",
          "enum": [
            "starting",
            "completed",
            "failed"
          ]
        },
        "executor": {
          "type": "string",
          "enum": [
            "process",
            "herdr"
          ]
        },
        "exitCode": {
          "type": [
            "integer",
            "null"
          ]
        },
        "signal": {
          "oneOf": [
            {
              "type": "string",
              "enum": [
                "SIGABRT",
                "SIGALRM",
                "SIGBUS",
                "SIGCHLD",
                "SIGCONT",
                "SIGFPE",
                "SIGHUP",
                "SIGILL",
                "SIGINT",
                "SIGIO",
                "SIGIOT",
                "SIGKILL",
                "SIGPIPE",
                "SIGPOLL",
                "SIGPROF",
                "SIGPWR",
                "SIGQUIT",
                "SIGSEGV",
                "SIGSTKFLT",
                "SIGSTOP",
                "SIGSYS",
                "SIGTERM",
                "SIGTRAP",
                "SIGTSTP",
                "SIGTTIN",
                "SIGTTOU",
                "SIGUNUSED",
                "SIGURG",
                "SIGUSR1",
                "SIGUSR2",
                "SIGVTALRM",
                "SIGWINCH",
                "SIGXCPU",
                "SIGXFSZ",
                "SIGBREAK",
                "SIGLOST",
                "SIGINFO"
              ]
            },
            {
              "type": "null"
            }
          ]
        },
        "timedOut": {
          "const": true
        },
        "aborted": {
          "const": true
        },
        "truncated": {
          "const": true
        },
        "reason": {
          "type": "string"
        },
        "correlation": {
          "$ref": "#/$defs/correlation"
        }
      },
      "required": [
        "ledgerVersion",
        "event",
        "ts",
        "childId",
        "state",
        "executor"
      ],
      "additionalProperties": false
    },
    "checkReceipt": {
      "type": "object",
      "properties": {
        "ledgerVersion": {
          "const": 2
        },
        "event": {
          "const": "check_receipt"
        },
        "ts": {
          "type": "string",
          "format": "date-time"
        },
        "childId": {
          "type": "string",
          "minLength": 1
        },
        "receiptId": {
          "type": "string",
          "pattern": "^[a-fA-F0-9]{64}$"
        },
        "workspaceId": {
          "type": "string",
          "minLength": 1
        },
        "checkId": {
          "type": "string",
          "minLength": 1
        },
        "treeSha": {
          "type": "string",
          "minLength": 1
        },
        "correlation": {
          "$ref": "#/$defs/correlation"
        }
      },
      "required": [
        "ledgerVersion",
        "event",
        "ts",
        "childId",
        "receiptId",
        "workspaceId",
        "checkId",
        "treeSha"
      ],
      "additionalProperties": false
    }
  }
};

// packages/adapters/dist/pi-daddy-ledger-v3.js
var PI_DADDY_LEDGER_V3_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/mojomanyana/pi-daddy/contracts/ledger/v3/ledger-event.schema.json",
  "title": "pi-daddy ledgerVersion 3 event",
  "description": "One JSON object per JSONL line. Version 3 adds unique execution identity and explicit parent execution identity; legacy and v2 lines are intentionally outside this schema.",
  "oneOf": [
    {
      "$ref": "#/$defs/capabilityDecision"
    },
    {
      "$ref": "#/$defs/workspaceLease"
    },
    {
      "$ref": "#/$defs/childLifecycle"
    },
    {
      "$ref": "#/$defs/checkReceipt"
    },
    {
      "$ref": "#/$defs/workflowFact"
    }
  ],
  "$defs": {
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "pattern": ":[0-5][0-9](?:\\.[0-9]+)?(?:[Zz]|[+-][0-9]{2}:[0-9]{2})$"
    },
    "correlation": {
      "type": "object",
      "description": "Non-authoritative controller metadata under the pinned 1.0 contract. String and aggregate byte limits are additionally enforced by the runtime and cannot be represented exactly in JSON Schema.",
      "properties": {
        "schema_version": {
          "const": "1.0"
        },
        "run_id": {
          "$ref": "#/$defs/ledgerCorrelationIdentifier"
        },
        "task_id": {
          "$ref": "#/$defs/ledgerCorrelationIdentifier"
        },
        "workspace_id": {
          "$ref": "#/$defs/ledgerCorrelationIdentifier"
        },
        "context_id": {
          "$ref": "#/$defs/ledgerCorrelationIdentifier"
        },
        "phase": {
          "$ref": "#/$defs/ledgerCorrelationIdentifier"
        },
        "assurance": {
          "$ref": "#/$defs/ledgerCorrelationIdentifier"
        },
        "assurance_effective": {
          "$ref": "#/$defs/ledgerCorrelationIdentifier"
        },
        "policy_label": {
          "$ref": "#/$defs/ledgerCorrelationIdentifier"
        },
        "assurance_source": {
          "$ref": "#/$defs/ledgerCorrelationIdentifier"
        },
        "assurance_scope": {
          "oneOf": [
            {
              "type": "object",
              "properties": {
                "type": {
                  "const": "entire-run"
                },
                "selectors": {
                  "type": "array",
                  "maxItems": 0
                }
              },
              "required": [
                "type",
                "selectors"
              ],
              "additionalProperties": false
            },
            {
              "type": "object",
              "properties": {
                "type": {
                  "const": "selectors"
                },
                "selectors": {
                  "type": "array",
                  "minItems": 1,
                  "items": {
                    "type": "string",
                    "minLength": 1
                  }
                }
              },
              "required": [
                "type",
                "selectors"
              ],
              "additionalProperties": false
            }
          ]
        },
        "activated_at": {
          "type": "string",
          "maxLength": 512
        },
        "plan_digest": {
          "type": "string",
          "maxLength": 512
        },
        "definition_digest": {
          "type": "string",
          "maxLength": 512
        },
        "task_digest": {
          "type": "string",
          "maxLength": 512
        },
        "base_sha": {
          "type": "string",
          "maxLength": 512
        },
        "head_sha": {
          "type": "string",
          "maxLength": 512
        },
        "tree_sha": {
          "type": "string",
          "maxLength": 512
        },
        "event_seq": {
          "type": "number"
        },
        "last_change_seq": {
          "type": "number"
        },
        "last_authority_seq": {
          "type": "number"
        },
        "check_receipt_id": {
          "type": "string",
          "maxLength": 512
        }
      },
      "additionalProperties": false
    },
    "ledgerDisplayIdentifier": {
      "type": "string",
      "pattern": "^[A-Za-z0-9@*][A-Za-z0-9@*._:/-]{0,511}$"
    },
    "ledgerCorrelationIdentifier": {
      "type": "string",
      "pattern": "^[A-Za-z0-9@*][A-Za-z0-9@*._:/-]{0,127}$"
    },
    "ledgerCapabilityIdentifier": {
      "type": "string",
      "pattern": "^(tool|skill|agent|workspace|ext):[A-Za-z0-9@*][A-Za-z0-9@*._/-]{0,255}$"
    },
    "refusalCode": {
      "type": "string",
      "enum": [
        "CAPABILITY_ESCALATION",
        "GRANT_ID_MALFORMED",
        "DEFINITION_NOT_AUTHORIZED",
        "UNDECLARED_TOOLS",
        "UNKNOWN_TOOL",
        "GATED_UNAPPROVED",
        "APPROVAL_EXPIRED",
        "APPROVAL_SCOPE_MISMATCH",
        "APPROVAL_FLOW_FAILED",
        "DEPTH_EXCEEDED",
        "FANOUT_EXCEEDED",
        "EXECUTOR_UNAVAILABLE",
        "MODEL_UNRESOLVED",
        "GRANT_STORE_INVALID",
        "CHILD_TIMED_OUT",
        "CHILD_CANCELLED",
        "CHILD_EXIT_NONZERO",
        "TASK_MISSING",
        "UNKNOWN_DEFINITION",
        "CEILING_PATTERNS_UNRESOLVED",
        "NARROWING_VIOLATED",
        "DEFINITION_UNREADABLE",
        "CORRELATION_TOO_LARGE",
        "CORRELATION_INVALID",
        "LEDGER_WRITE_FAILED",
        "FANOUT_FAILED",
        "WORKSPACE_NOT_REGISTERED",
        "WORKSPACE_NOT_AUTHORIZED",
        "WORKSPACE_WRITE_CONFLICT",
        "WORKSPACE_LEASE_STALE",
        "CHECK_NOT_CONFIGURED",
        "CHECK_CONFIGURATION_INVALID",
        "CHECK_IDENTITY_UNAVAILABLE",
        "CHECK_IDENTITY_MISMATCH"
      ]
    },
    "refusal": {
      "type": "object",
      "properties": {
        "code": {
          "$ref": "#/$defs/refusalCode"
        },
        "message": {
          "type": "string"
        },
        "details": {
          "type": "object",
          "additionalProperties": {
            "type": [
              "string",
              "number",
              "boolean",
              "null"
            ]
          }
        }
      },
      "required": [
        "code",
        "message"
      ],
      "additionalProperties": false
    },
    "approvalSource": {
      "type": "string",
      "enum": [
        "prompt",
        "session",
        "persisted",
        "inherited"
      ]
    },
    "approvalScope": {
      "type": "string",
      "enum": [
        "once",
        "session",
        "always"
      ]
    },
    "approvalUse": {
      "type": "object",
      "properties": {
        "max": {
          "type": "integer",
          "minimum": 0
        },
        "remaining": {
          "type": "integer",
          "minimum": 0
        }
      },
      "required": [
        "max",
        "remaining"
      ],
      "additionalProperties": false
    },
    "definitionDigest": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string"
        },
        "source": {
          "type": "string"
        },
        "sha256": {
          "type": "string",
          "pattern": "^[a-fA-F0-9]{64}$"
        }
      },
      "required": [
        "name",
        "source",
        "sha256"
      ],
      "additionalProperties": false
    },
    "capabilityDecision": {
      "type": "object",
      "properties": {
        "ledgerVersion": {
          "const": 3
        },
        "event": {
          "const": "capability_decision"
        },
        "ts": {
          "$ref": "#/$defs/timestamp"
        },
        "parentId": {
          "$ref": "#/$defs/ledgerDisplayIdentifier"
        },
        "childId": {
          "$ref": "#/$defs/ledgerDisplayIdentifier"
        },
        "depth": {
          "type": "integer",
          "minimum": 0
        },
        "agentType": {
          "$ref": "#/$defs/ledgerDisplayIdentifier"
        },
        "requested": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ledgerCapabilityIdentifier"
          }
        },
        "parentGrant": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ledgerCapabilityIdentifier"
          }
        },
        "effective": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ledgerCapabilityIdentifier"
          }
        },
        "denied": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ledgerCapabilityIdentifier"
          }
        },
        "clipped": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ledgerCapabilityIdentifier"
          }
        },
        "gatedBlocked": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ledgerCapabilityIdentifier"
          }
        },
        "blocked": {
          "type": "boolean"
        },
        "reason": {
          "type": "string"
        },
        "approved": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ledgerCapabilityIdentifier"
          }
        },
        "approvalSource": {
          "$ref": "#/$defs/approvalSource"
        },
        "approvalSources": {
          "type": "object",
          "propertyNames": {
            "$ref": "#/$defs/ledgerCapabilityIdentifier"
          },
          "additionalProperties": {
            "$ref": "#/$defs/approvalSource"
          }
        },
        "approvalScopes": {
          "type": "object",
          "propertyNames": {
            "$ref": "#/$defs/ledgerCapabilityIdentifier"
          },
          "additionalProperties": {
            "$ref": "#/$defs/approvalScope"
          }
        },
        "approvalExpiresAt": {
          "type": "object",
          "propertyNames": {
            "$ref": "#/$defs/ledgerCapabilityIdentifier"
          },
          "additionalProperties": {
            "$ref": "#/$defs/timestamp"
          }
        },
        "approvalUses": {
          "type": "object",
          "propertyNames": {
            "$ref": "#/$defs/ledgerCapabilityIdentifier"
          },
          "additionalProperties": {
            "$ref": "#/$defs/approvalUse"
          }
        },
        "approvalScope": {
          "$ref": "#/$defs/approvalScope"
        },
        "humanDenied": {
          "const": true
        },
        "gateOutcome": {
          "type": "string",
          "enum": [
            "declined",
            "dismissed",
            "no-ui",
            "error"
          ]
        },
        "definitionDigest": {
          "$ref": "#/$defs/definitionDigest"
        },
        "executor": {
          "type": "string",
          "enum": [
            "process",
            "herdr"
          ]
        },
        "taskFrom": {
          "$ref": "#/$defs/ledgerDisplayIdentifier"
        },
        "taskDigest": {
          "type": "string",
          "pattern": "^[a-fA-F0-9]{64}$"
        },
        "correlation": {
          "$ref": "#/$defs/correlation"
        },
        "refusal": {
          "$ref": "#/$defs/refusal"
        },
        "executionId": {
          "$ref": "#/$defs/executionId"
        },
        "parentExecutionId": {
          "oneOf": [
            {
              "$ref": "#/$defs/executionId"
            },
            {
              "type": "null"
            }
          ]
        },
        "taskFromExecutionId": {
          "$ref": "#/$defs/executionId"
        }
      },
      "required": [
        "ledgerVersion",
        "event",
        "ts",
        "executionId",
        "parentExecutionId",
        "parentId",
        "childId",
        "depth",
        "requested",
        "parentGrant",
        "effective",
        "denied",
        "clipped",
        "gatedBlocked",
        "blocked",
        "executor",
        "taskDigest"
      ],
      "additionalProperties": false
    },
    "workspaceLease": {
      "type": "object",
      "properties": {
        "ledgerVersion": {
          "const": 3
        },
        "event": {
          "const": "workspace_lease"
        },
        "ts": {
          "$ref": "#/$defs/timestamp"
        },
        "childId": {
          "$ref": "#/$defs/ledgerDisplayIdentifier"
        },
        "workspaceId": {
          "$ref": "#/$defs/ledgerDisplayIdentifier"
        },
        "root": {
          "type": "string",
          "minLength": 1
        },
        "access": {
          "type": "string",
          "enum": [
            "read",
            "write"
          ]
        },
        "outcome": {
          "type": "string",
          "enum": [
            "acquired",
            "uncontended",
            "refused",
            "released",
            "released-unrecorded",
            "lost",
            "retained",
            "timeout",
            "recovered"
          ]
        },
        "recovered": {
          "oneOf": [
            {
              "type": "boolean"
            },
            {
              "const": "unknown"
            }
          ]
        },
        "releaseReason": {
          "type": "string"
        },
        "refusal": {
          "$ref": "#/$defs/refusal"
        },
        "correlation": {
          "$ref": "#/$defs/correlation"
        },
        "executionId": {
          "$ref": "#/$defs/executionId"
        },
        "parentExecutionId": {
          "oneOf": [
            {
              "$ref": "#/$defs/executionId"
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "ledgerVersion",
        "event",
        "ts",
        "executionId",
        "parentExecutionId",
        "childId",
        "workspaceId",
        "root",
        "access",
        "outcome"
      ],
      "additionalProperties": false
    },
    "childLifecycle": {
      "type": "object",
      "properties": {
        "ledgerVersion": {
          "const": 3
        },
        "event": {
          "const": "child_lifecycle"
        },
        "ts": {
          "$ref": "#/$defs/timestamp"
        },
        "childId": {
          "$ref": "#/$defs/ledgerDisplayIdentifier"
        },
        "state": {
          "type": "string",
          "enum": [
            "starting",
            "running",
            "completed",
            "failed"
          ]
        },
        "executor": {
          "type": "string",
          "enum": [
            "process",
            "herdr"
          ]
        },
        "exitCode": {
          "type": [
            "integer",
            "null"
          ]
        },
        "signal": {
          "oneOf": [
            {
              "type": "string",
              "enum": [
                "SIGABRT",
                "SIGALRM",
                "SIGBUS",
                "SIGCHLD",
                "SIGCONT",
                "SIGFPE",
                "SIGHUP",
                "SIGILL",
                "SIGINT",
                "SIGIO",
                "SIGIOT",
                "SIGKILL",
                "SIGPIPE",
                "SIGPOLL",
                "SIGPROF",
                "SIGPWR",
                "SIGQUIT",
                "SIGSEGV",
                "SIGSTKFLT",
                "SIGSTOP",
                "SIGSYS",
                "SIGTERM",
                "SIGTRAP",
                "SIGTSTP",
                "SIGTTIN",
                "SIGTTOU",
                "SIGUNUSED",
                "SIGURG",
                "SIGUSR1",
                "SIGUSR2",
                "SIGVTALRM",
                "SIGWINCH",
                "SIGXCPU",
                "SIGXFSZ",
                "SIGBREAK",
                "SIGLOST",
                "SIGINFO"
              ]
            },
            {
              "type": "null"
            }
          ]
        },
        "timedOut": {
          "const": true
        },
        "aborted": {
          "const": true
        },
        "truncated": {
          "const": true
        },
        "reason": {
          "type": "string"
        },
        "correlation": {
          "$ref": "#/$defs/correlation"
        },
        "executionId": {
          "$ref": "#/$defs/executionId"
        },
        "parentExecutionId": {
          "oneOf": [
            {
              "$ref": "#/$defs/executionId"
            },
            {
              "type": "null"
            }
          ]
        },
        "deadlineAt": {
          "$ref": "#/$defs/timestamp"
        },
        "herdrPaneId": {
          "$ref": "#/$defs/ledgerDisplayIdentifier"
        },
        "herdrAgentName": {
          "$ref": "#/$defs/ledgerDisplayIdentifier"
        }
      },
      "required": [
        "ledgerVersion",
        "event",
        "ts",
        "executionId",
        "parentExecutionId",
        "childId",
        "state",
        "executor"
      ],
      "additionalProperties": false,
      "allOf": [
        {
          "if": {
            "properties": {
              "state": {
                "enum": [
                  "starting",
                  "running"
                ]
              }
            },
            "required": [
              "state"
            ]
          },
          "then": {
            "required": [
              "deadlineAt"
            ]
          }
        },
        {
          "if": {
            "anyOf": [
              {
                "required": [
                  "herdrPaneId"
                ]
              },
              {
                "required": [
                  "herdrAgentName"
                ]
              }
            ]
          },
          "then": {
            "required": [
              "herdrPaneId",
              "herdrAgentName"
            ],
            "properties": {
              "executor": {
                "const": "herdr"
              }
            }
          }
        }
      ]
    },
    "checkReceipt": {
      "type": "object",
      "properties": {
        "ledgerVersion": {
          "const": 3
        },
        "event": {
          "const": "check_receipt"
        },
        "ts": {
          "$ref": "#/$defs/timestamp"
        },
        "childId": {
          "$ref": "#/$defs/ledgerDisplayIdentifier"
        },
        "receiptId": {
          "type": "string",
          "pattern": "^[a-fA-F0-9]{64}$"
        },
        "workspaceId": {
          "$ref": "#/$defs/ledgerDisplayIdentifier"
        },
        "checkId": {
          "$ref": "#/$defs/ledgerDisplayIdentifier"
        },
        "treeSha": {
          "type": "string",
          "minLength": 1
        },
        "correlation": {
          "$ref": "#/$defs/correlation"
        },
        "executionId": {
          "$ref": "#/$defs/executionId"
        },
        "parentExecutionId": {
          "oneOf": [
            {
              "$ref": "#/$defs/executionId"
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "ledgerVersion",
        "event",
        "ts",
        "executionId",
        "parentExecutionId",
        "childId",
        "receiptId",
        "workspaceId",
        "checkId",
        "treeSha"
      ],
      "additionalProperties": false
    },
    "executionId": {
      "type": "string",
      "pattern": "^exec:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
    },
    "workflowFact": {
      "type": "object",
      "properties": {
        "ledgerVersion": {
          "const": 3
        },
        "event": {
          "const": "workflow_fact"
        },
        "ts": {
          "$ref": "#/$defs/timestamp"
        },
        "factId": {
          "type": "string",
          "pattern": "^fact:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
        },
        "source": {
          "type": "string",
          "pattern": "^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$"
        },
        "provenance": {
          "enum": [
            "planned",
            "observed",
            "controller_validated"
          ]
        },
        "kind": {
          "enum": [
            "workflow_phase",
            "inline_skill",
            "transition"
          ]
        },
        "subject": {
          "type": "string",
          "pattern": "^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$"
        },
        "state": {
          "enum": [
            "pending",
            "observed",
            "started",
            "completed",
            "blocked"
          ]
        },
        "correlation": {
          "allOf": [
            {
              "$ref": "#/$defs/correlation"
            },
            {
              "type": "object",
              "properties": {
                "run_id": {
                  "type": "string",
                  "minLength": 1
                }
              },
              "required": [
                "run_id"
              ]
            }
          ]
        }
      },
      "required": [
        "ledgerVersion",
        "event",
        "ts",
        "factId",
        "source",
        "provenance",
        "kind",
        "subject",
        "state",
        "correlation"
      ],
      "additionalProperties": false,
      "allOf": [
        {
          "if": {
            "properties": {
              "provenance": {
                "const": "planned"
              }
            },
            "required": [
              "provenance"
            ]
          },
          "then": {
            "properties": {
              "state": {
                "const": "pending"
              }
            }
          }
        },
        {
          "if": {
            "properties": {
              "provenance": {
                "const": "observed"
              }
            },
            "required": [
              "provenance"
            ]
          },
          "then": {
            "properties": {
              "state": {
                "const": "observed"
              }
            }
          }
        },
        {
          "if": {
            "properties": {
              "provenance": {
                "const": "controller_validated"
              }
            },
            "required": [
              "provenance"
            ]
          },
          "then": {
            "properties": {
              "state": {
                "enum": [
                  "started",
                  "completed",
                  "blocked"
                ]
              }
            }
          }
        }
      ]
    }
  }
};

// packages/adapters/dist/trajectory.js
var V2_REFUSAL_CODES = new Set(PI_DADDY_LEDGER_V2_SCHEMA.$defs.refusalCode.enum);
var V3_REFUSAL_CODES = new Set(PI_DADDY_LEDGER_V3_SCHEMA.$defs.refusalCode.enum);
var V2_CORRELATION_MAX_BYTES = 32 * 1024;
var V2_CORRELATION_MAX_SCOPE_BYTES = 4 * 1024;

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
import { readFileSync as readFileSync17, existsSync as existsSync17 } from "node:fs";
import { join as join24, dirname as dirname6 } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn as spawn3 } from "node:child_process";
var __dirname = dirname6(fileURLToPath(import.meta.url));
function templatePath(assetsDir) {
  if (assetsDir)
    return join24(assetsDir, "report.template.html");
  const candidates = [
    join24(__dirname, "..", "..", "..", "assets", "report.template.html"),
    // packages/cli/{dist,src} -> ../../../assets
    join24(__dirname, "..", "assets", "report.template.html"),
    join24(__dirname, "..", "..", "assets", "report.template.html")
  ];
  for (const c of candidates)
    if (existsSync17(c))
      return c;
  throw new Error("cannot find assets/report.template.html");
}
function gradeScriptPath(assetsDir) {
  return join24(dirname6(templatePath(assetsDir)), "report.grade.js");
}
function readBody(req) {
  return new Promise((resolve13) => {
    let b = "";
    req.on("data", (c) => b += c);
    req.on("end", () => resolve13(b));
  });
}
function findTranscript(runDir, id) {
  const files = findTranscriptFiles(runDir, id);
  if (files.length === 0)
    return null;
  if (files.length === 1)
    return readFileSync17(join24(runDir, files[0]), "utf8");
  return files.map((f) => `===== ${f} =====
${readFileSync17(join24(runDir, f), "utf8")}`).join("\n\n");
}
function findJudgeRaw(runDir, id) {
  const files = findJudgeRawFiles(runDir, id);
  if (files.length === 0)
    return null;
  if (files.length === 1)
    return readFileSync17(join24(runDir, files[0]), "utf8");
  return files.map((f) => `===== ${f} =====
${readFileSync17(join24(runDir, f), "utf8")}`).join("\n\n");
}
async function serveReview(opts) {
  const template = readFileSync17(templatePath(opts.assetsDir), "utf8");
  const gradeScript = readFileSync17(gradeScriptPath(opts.assetsDir), "utf8");
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
        const specPath = join24(opts.skillDir, "tests", "specification.yaml");
        const spec = loadSpec(specPath);
        const scenario = spec.scenarios.find((s) => s.id === body.scenarioId);
        if (!scenario) {
          res.writeHead(404).end("unknown scenario");
          return;
        }
        const prev = results.scenarios.find((s) => s.id === body.scenarioId);
        if (!prev) {
          res.writeHead(404).end("scenario not in this run");
          return;
        }
        const delivery = prev.objective?.assertions.find((assertion) => assertion.kind === "skill_delivered");
        if (results.schema === 3 && delivery?.status !== "PASS") {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: `scenario ${body.scenarioId} is ${delivery?.status ?? "ERROR"}: delivery-gated evidence cannot be re-judged` }));
          return;
        }
        const adapter = opts.adapter ?? getAdapter(results.harness);
        if (!await adapter.available()) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: `harness \`${results.harness}\` is not on PATH` }));
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
            specDir: dirname6(specPath),
            threshold,
            mode: results.mode,
            expectedReps: prev.reps ?? 1
          });
          const merged = results.scenarios.map((s) => {
            if (s.id !== body.scenarioId)
              return s;
            return rebuildScenarioResult({ ...rr, metrics: mergeScenarioMetrics(s.metrics, rr.metrics), rep_judgments: carryRepObjectives(rr.rep_judgments, s.rep_judgments) }, s, { objective: "carry", adjudication: "drop" });
          });
          const written = writeResults(column.runDir, {
            schema: results.schema,
            subject_invocations: results.subject_invocations,
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
            // The arm is provenance of the MEASUREMENT, not of this rewrite, and it is the
            // only record that a `+<arm>` run actually delegated: rebuilding the draft
            // field-by-field without it silently deleted `definitions`/`ledger_events`
            // from any arm run that was ever re-graded, leaving a record
            // indistinguishable from a vacuous arm. Same reason `harness_cli_version`,
            // `delivery_canary` and `source_hashes` are carried here.
            arm: results.arm,
            // Recorded hashes were being dropped here entirely, which silently
            // retired the staleness gate for any run re-judged from the UI. Carried,
            // with the one `rubric:` key this re-judge actually applied refreshed —
            // the same doctrine `grade` follows (see refreshRubricHashes).
            source_hashes: refreshRubricHashes(results.source_hashes, spec, [body.scenarioId])
          }, scoreContextFor(results, spec));
          ensureResultsGitignore(join24(opts.skillDir, "tests", "results"));
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
        const spec = loadSpec(join24(opts.skillDir, "tests", "specification.yaml"));
        writeResults(column.runDir, patched, scoreContextFor(patched, spec));
        ensureResultsGitignore(join24(opts.skillDir, "tests", "results"));
        if (body.override != null) {
          preserveTranscript(join24(opts.skillDir, "tests", "results"), column.runDir, body.scenarioId);
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
  await new Promise((resolve13) => server.listen(opts.port ?? 0, "127.0.0.1", resolve13));
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
import { existsSync as existsSync18 } from "node:fs";
import { dirname as dirname7, join as join25, resolve as resolve11 } from "node:path";
function resolveSkillDir(cwd, arg) {
  if (arg) {
    const dir2 = resolve11(cwd, arg);
    if (existsSync18(join25(dir2, "tests", "specification.yaml"))) return dir2;
    throw new Error(`no tests/specification.yaml found at ${dir2}`);
  }
  let dir = cwd;
  for (; ; ) {
    if (existsSync18(join25(dir, "tests", "specification.yaml"))) return dir;
    const parent = dirname7(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`no tests/specification.yaml found from ${cwd} upward`);
}
var DEFAULT_MODEL = "fireworks:accounts/fireworks/models/deepseek-v4-pro";
async function runViaExtension(opts) {
  const specPath = join25(opts.skillDir, "tests", "specification.yaml");
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
  const failedTranscripts = verdicts.filter((v) => v.verdict !== "PASS").flatMap((v) => findTranscriptFiles(summary.runDir, v.id, summary.results.mode).map((f) => join25(summary.runDir, f)));
  return {
    skill: summary.results.skill,
    model: summary.results.model,
    grade: { pct: g.pct, letter: g.letter, ship: g.ship },
    scenarios: verdicts.map((v) => ({ id: v.id, verdict: v.verdict, suspect: v.suspect ?? false })),
    failedTranscripts
  };
}

// packages/pi-extension/src/commands.ts
var USAGE = "usage: /skill-harness run [skill] [--model p:m] [--reps N] [--mode red|green|force] [--canary] [--judge p:m] | judge [run-dir] | review [skill] | coverage [skill]";
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
  const retired = sub === "run" ? ["affected"] : sub === "judge" ? ["auto-rejudge", "secondary-judge", "tie-break-judge"] : [];
  const retiredFlag = retired.find((flag) => Object.hasOwn(flags, flag));
  if (retiredFlag) throw new Error(`--${retiredFlag} was removed; this command refuses to silently run with different behavior`);
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
    const runDir = resolve12(ctx.cwd, positional[0] ?? ".");
    const testsDir = dirname8(dirname8(dirname8(runDir)));
    const spec = loadSpec(join26(testsDir, "specification.yaml"));
    const prev = existsSync19(join26(runDir, "results.yaml")) ? readResults(runDir) : null;
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
    return;
  }
  if (sub === "coverage") {
    const skillDir = resolveSkillDir(ctx.cwd, positional[0]);
    const specPath = join26(skillDir, "tests", "specification.yaml");
    const spec = loadSpec(specPath);
    const specDir = dirname8(specPath);
    const report = computeCoverage({
      specDir,
      scenarios: spec.scenarios,
      baseFiles: [relative4(specDir, join26(skillDir, "SKILL.md")).split("\\").join("/")]
    });
    say(ctx, formatCoverage(report, spec.skill), report.broken.length ? "warning" : "info");
    return;
  }
  if (sub === "review") {
    const skillDir = resolveSkillDir(ctx.cwd, positional[0]);
    const spec = loadSpec(join26(skillDir, "tests", "specification.yaml"));
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
    description: "Run, judge, and review skill scenarios",
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
  const moduleDir = dirname9(fileURLToPath2(import.meta.url));
  const assetsDir = basename3(dirname9(moduleDir)) === "skill-harness" ? join27(moduleDir, "..", "assets") : join27(moduleDir, "..", "..", "..", "assets");
  registerCommand(pi, assetsDir);
  registerTool(pi);
  pi.on("session_shutdown", async () => {
    closeReview();
  });
}
export {
  index_default as default
};
