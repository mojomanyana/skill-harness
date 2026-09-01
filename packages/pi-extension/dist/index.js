// packages/pi-extension/src/index.ts
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { dirname as dirname12, join as join32 } from "node:path";

// packages/pi-extension/src/commands.ts
import { existsSync as existsSync24 } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { dirname as dirname11, join as join31, resolve as resolve14, relative as relative5 } from "node:path";

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
  function repeat(string2, count) {
    let result = "";
    for (let cycle = 0; cycle < count; cycle += 1) {
      result += string2;
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
  function padStart(string2, max) {
    return common2.repeat(" ", max - string2.length) + string2;
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
  function isNull(object3) {
    return object3 === null;
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
  function isBoolean(object3) {
    return Object.prototype.toString.call(object3) === "[object Boolean]";
  }
  bool = new Type22("tag:yaml.org,2002:bool", {
    kind: "scalar",
    resolve: resolveYamlBoolean,
    construct: constructYamlBoolean,
    predicate: isBoolean,
    represent: {
      lowercase: function(object3) {
        return object3 ? "true" : "false";
      },
      uppercase: function(object3) {
        return object3 ? "TRUE" : "FALSE";
      },
      camelcase: function(object3) {
        return object3 ? "True" : "False";
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
  function isInteger(object3) {
    return Object.prototype.toString.call(object3) === "[object Number]" && (object3 % 1 === 0 && !common2.isNegativeZero(object3));
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
  function representYamlFloat(object3, style) {
    if (isNaN(object3)) {
      switch (style) {
        case "lowercase":
          return ".nan";
        case "uppercase":
          return ".NAN";
        case "camelcase":
          return ".NaN";
      }
    } else if (Number.POSITIVE_INFINITY === object3) {
      switch (style) {
        case "lowercase":
          return ".inf";
        case "uppercase":
          return ".INF";
        case "camelcase":
          return ".Inf";
      }
    } else if (Number.NEGATIVE_INFINITY === object3) {
      switch (style) {
        case "lowercase":
          return "-.inf";
        case "uppercase":
          return "-.INF";
        case "camelcase":
          return "-.Inf";
      }
    } else if (common2.isNegativeZero(object3)) {
      return "-0.0";
    }
    const res = object3.toString(10);
    return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
  }
  function isFloat(object3) {
    return Object.prototype.toString.call(object3) === "[object Number]" && (object3 % 1 !== 0 || common2.isNegativeZero(object3));
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
  function representYamlTimestamp(object3) {
    return object3.toISOString();
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
  function representYamlBinary(object3) {
    let result = "";
    let bits = 0;
    const max = object3.length;
    const map2 = BASE64_MAP;
    for (let idx = 0; idx < max; idx++) {
      if (idx % 3 === 0 && idx) {
        result += map2[bits >> 18 & 63];
        result += map2[bits >> 12 & 63];
        result += map2[bits >> 6 & 63];
        result += map2[bits & 63];
      }
      bits = (bits << 8) + object3[idx];
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
    const object3 = data;
    for (let index = 0, length = object3.length; index < length; index += 1) {
      const pair = object3[index];
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
    const object3 = data;
    const result = new Array(object3.length);
    for (let index = 0, length = object3.length; index < length; index += 1) {
      const pair = object3[index];
      if (_toString.call(pair) !== "[object Object]") return false;
      const keys = Object.keys(pair);
      if (keys.length !== 1) return false;
      result[index] = [keys[0], pair[keys[0]]];
    }
    return true;
  }
  function constructYamlPairs(data) {
    if (data === null) return [];
    const object3 = data;
    const result = new Array(object3.length);
    for (let index = 0, length = object3.length; index < length; index += 1) {
      const pair = object3[index];
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
    const object3 = data;
    for (const key in object3) {
      if (_hasOwnProperty.call(object3, key)) {
        if (object3[key] !== null) return false;
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
  function setProperty(object3, key, value) {
    if (key === "__proto__") {
      Object.defineProperty(object3, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value
      });
    } else {
      object3[key] = value;
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
  function mergeMappings(state, destination, source, overridableKeys) {
    if (!common2.isObject(source)) {
      throwError(state, "cannot merge mappings; the provided source object is unacceptable");
    }
    const sourceKeys = Object.keys(source);
    for (let index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
      const key = sourceKeys[index];
      if (state.maxTotalMergeKeys !== -1 && ++state.totalMergeKeys > state.maxTotalMergeKeys) {
        throwError(state, "merge keys exceeded maxTotalMergeKeys (" + state.maxTotalMergeKeys + ")");
      }
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
        const typeList2 = state.typeMap.multi[state.kind || "fallback"];
        for (let typeIndex = 0, typeQuantity = typeList2.length; typeIndex < typeQuantity; typeIndex += 1) {
          if (state.tag.slice(0, typeList2[typeIndex].tag.length) === typeList2[typeIndex].tag) {
            type2 = typeList2[typeIndex];
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
    const string2 = character.toString(16).toUpperCase();
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
    return "\\" + handle + common2.repeat("0", length - string2.length) + string2;
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
  function indentString(string2, spaces) {
    const ind = common2.repeat(" ", spaces);
    let position = 0;
    let result = "";
    const length = string2.length;
    while (position < length) {
      let line;
      const next = string2.indexOf("\n", position);
      if (next === -1) {
        line = string2.slice(position);
        position = length;
      } else {
        line = string2.slice(position, next + 1);
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
  function codePointAt(string2, pos) {
    const first = string2.charCodeAt(pos);
    let second;
    if (first >= 55296 && first <= 56319 && pos + 1 < string2.length) {
      second = string2.charCodeAt(pos + 1);
      if (second >= 56320 && second <= 57343) {
        return (first - 55296) * 1024 + second - 56320 + 65536;
      }
    }
    return first;
  }
  function needIndentIndicator(string2) {
    const leadingSpaceRe = /^\n* /;
    return leadingSpaceRe.test(string2);
  }
  const STYLE_PLAIN = 1;
  const STYLE_SINGLE = 2;
  const STYLE_LITERAL = 3;
  const STYLE_FOLDED = 4;
  const STYLE_DOUBLE = 5;
  function chooseScalarStyle(string2, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
    let i;
    let char = 0;
    let prevChar = null;
    let hasLineBreak = false;
    let hasFoldableLine = false;
    const shouldTrackWidth = lineWidth !== -1;
    let previousLineBreak = -1;
    let plain = isPlainSafeFirst(codePointAt(string2, 0)) && isPlainSafeLast(codePointAt(string2, string2.length - 1));
    if (singleLineOnly || forceQuotes) {
      for (i = 0; i < string2.length; char >= 65536 ? i += 2 : i++) {
        char = codePointAt(string2, i);
        if (!isPrintable(char)) {
          return STYLE_DOUBLE;
        }
        plain = plain && isPlainSafe(char, prevChar, inblock);
        prevChar = char;
      }
    } else {
      for (i = 0; i < string2.length; char >= 65536 ? i += 2 : i++) {
        char = codePointAt(string2, i);
        if (char === CHAR_LINE_FEED) {
          hasLineBreak = true;
          if (shouldTrackWidth) {
            hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
            i - previousLineBreak - 1 > lineWidth && string2[previousLineBreak + 1] !== " ";
            previousLineBreak = i;
          }
        } else if (!isPrintable(char)) {
          return STYLE_DOUBLE;
        }
        plain = plain && isPlainSafe(char, prevChar, inblock);
        prevChar = char;
      }
      hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i - previousLineBreak - 1 > lineWidth && string2[previousLineBreak + 1] !== " ");
    }
    if (!hasLineBreak && !hasFoldableLine) {
      if (plain && !forceQuotes && !testAmbiguousType(string2)) {
        return STYLE_PLAIN;
      }
      return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
    }
    if (indentPerLevel > 9 && needIndentIndicator(string2)) {
      return STYLE_DOUBLE;
    }
    if (!forceQuotes) {
      return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
    }
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  function writeScalar(state, string2, level, iskey, inblock) {
    state.dump = (function() {
      if (string2.length === 0) {
        return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
      }
      if (!state.noCompatMode) {
        if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string2) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string2)) {
          return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string2 + '"' : "'" + string2 + "'";
        }
      }
      const indent2 = state.indent * Math.max(1, level);
      const lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent2);
      const singleLineOnly = iskey || // No block styles in flow mode.
      state.flowLevel > -1 && level >= state.flowLevel;
      function testAmbiguity(string22) {
        return testImplicitResolving(state, string22);
      }
      switch (chooseScalarStyle(
        string2,
        singleLineOnly,
        state.indent,
        lineWidth,
        testAmbiguity,
        state.quotingType,
        state.forceQuotes && !iskey,
        inblock
      )) {
        case STYLE_PLAIN:
          return string2;
        case STYLE_SINGLE:
          return "'" + string2.replace(/'/g, "''") + "'";
        case STYLE_LITERAL:
          return "|" + blockHeader(string2, state.indent) + dropEndingNewline(indentString(string2, indent2));
        case STYLE_FOLDED:
          return ">" + blockHeader(string2, state.indent) + dropEndingNewline(indentString(foldString(string2, lineWidth), indent2));
        case STYLE_DOUBLE:
          return '"' + escapeString(string2) + '"';
        default:
          throw new YAMLException2("impossible error: invalid scalar style");
      }
    })();
  }
  function blockHeader(string2, indentPerLevel) {
    const indentIndicator = needIndentIndicator(string2) ? String(indentPerLevel) : "";
    const clip = string2[string2.length - 1] === "\n";
    const keep = clip && (string2[string2.length - 2] === "\n" || string2 === "\n");
    const chomp = keep ? "+" : clip ? "" : "-";
    return indentIndicator + chomp + "\n";
  }
  function dropEndingNewline(string2) {
    return string2[string2.length - 1] === "\n" ? string2.slice(0, -1) : string2;
  }
  function foldString(string2, width) {
    const lineRe = /(\n+)([^\n]*)/g;
    let result = (function() {
      let nextLF = string2.indexOf("\n");
      nextLF = nextLF !== -1 ? nextLF : string2.length;
      lineRe.lastIndex = nextLF;
      return foldLine(string2.slice(0, nextLF), width);
    })();
    let prevMoreIndented = string2[0] === "\n" || string2[0] === " ";
    let moreIndented;
    let match;
    while (match = lineRe.exec(string2)) {
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
  function escapeString(string2) {
    let result = "";
    let char = 0;
    for (let i = 0; i < string2.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string2, i);
      const escapeSeq = ESCAPE_SEQUENCES[char];
      if (!escapeSeq && isPrintable(char)) {
        result += string2[i];
        if (char >= 65536) result += string2[i + 1];
      } else {
        result += escapeSeq || encodeHex(char);
      }
    }
    return result;
  }
  function writeFlowSequence(state, level, object3) {
    let _result = "";
    const _tag = state.tag;
    for (let index = 0, length = object3.length; index < length; index += 1) {
      let value = object3[index];
      if (state.replacer) {
        value = state.replacer.call(object3, String(index), value);
      }
      if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
        if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
        _result += state.dump;
      }
    }
    state.tag = _tag;
    state.dump = "[" + _result + "]";
  }
  function writeBlockSequence(state, level, object3, compact) {
    let _result = "";
    const _tag = state.tag;
    for (let index = 0, length = object3.length; index < length; index += 1) {
      let value = object3[index];
      if (state.replacer) {
        value = state.replacer.call(object3, String(index), value);
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
  function writeFlowMapping(state, level, object3) {
    let _result = "";
    const _tag = state.tag;
    const objectKeyList = Object.keys(object3);
    for (let index = 0, length = objectKeyList.length; index < length; index += 1) {
      let pairBuffer = "";
      if (_result !== "") pairBuffer += ", ";
      if (state.condenseFlow) pairBuffer += '"';
      const objectKey = objectKeyList[index];
      let objectValue = object3[objectKey];
      if (state.replacer) {
        objectValue = state.replacer.call(object3, objectKey, objectValue);
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
  function writeBlockMapping(state, level, object3, compact) {
    let _result = "";
    const _tag = state.tag;
    const objectKeyList = Object.keys(object3);
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
      let objectValue = object3[objectKey];
      if (state.replacer) {
        objectValue = state.replacer.call(object3, objectKey, objectValue);
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
  function detectType(state, object3, explicit) {
    const typeList2 = explicit ? state.explicitTypes : state.implicitTypes;
    for (let index = 0, length = typeList2.length; index < length; index += 1) {
      const type2 = typeList2[index];
      if ((type2.instanceOf || type2.predicate) && (!type2.instanceOf || typeof object3 === "object" && object3 instanceof type2.instanceOf) && (!type2.predicate || type2.predicate(object3))) {
        if (explicit) {
          if (type2.multi && type2.representName) {
            state.tag = type2.representName(object3);
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
            _result = type2.represent(object3, style);
          } else if (_hasOwnProperty.call(type2.represent, style)) {
            _result = type2.represent[style](object3, style);
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
  function writeNode(state, level, object3, block, compact, iskey, isblockseq) {
    state.tag = null;
    state.dump = object3;
    if (!detectType(state, object3, false)) {
      detectType(state, object3, true);
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
      duplicateIndex = state.duplicates.indexOf(object3);
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
  function getDuplicateReferences(object3, state) {
    const objects = [];
    const duplicatesIndexes = [];
    inspectNode(object3, objects, duplicatesIndexes);
    const length = duplicatesIndexes.length;
    for (let index = 0; index < length; index += 1) {
      state.duplicates.push(objects[duplicatesIndexes[index]]);
    }
    state.usedDuplicates = new Array(length);
  }
  function inspectNode(object3, objects, duplicatesIndexes) {
    if (object3 !== null && typeof object3 === "object") {
      const index = objects.indexOf(object3);
      if (index !== -1) {
        if (duplicatesIndexes.indexOf(index) === -1) {
          duplicatesIndexes.push(index);
        }
      } else {
        objects.push(object3);
        if (Array.isArray(object3)) {
          for (let i = 0, length = object3.length; i < length; i += 1) {
            inspectNode(object3[i], objects, duplicatesIndexes);
          }
        } else {
          const objectKeyList = Object.keys(object3);
          for (let i = 0, length = objectKeyList.length; i < length; i += 1) {
            inspectNode(object3[objectKeyList[i]], objects, duplicatesIndexes);
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

// packages/core/dist/trajectory-gates.js
import { createHash } from "node:crypto";
var TRAJECTORY_EVENT_VERSION = "1.0";
var TRAJECTORY_ASSERT_VERSION = "1.0";
function trajectoryEventsSha256(events) {
  return createHash("sha256").update(stableStringify(events)).digest("hex");
}
function serializeTrajectoryEvents(events) {
  return events.map((event) => JSON.stringify(event)).join("\n") + (events.length ? "\n" : "");
}
function deserializeTrajectoryEvents(text) {
  const out = [];
  try {
    for (const line of text.split("\n").filter((entry) => entry.trim())) {
      const event = JSON.parse(line);
      if (validateEvent(event) !== null)
        return null;
      out.push(event);
    }
  } catch {
    return null;
  }
  if (!out.length)
    return null;
  const sequences = out.map((event) => event.seq).sort((a, b) => a - b);
  if (new Set(sequences).size !== out.length || sequences.some((seq2, index) => seq2 !== index + 1))
    return null;
  return out;
}
function evaluateTrajectoryGates(assert, input) {
  const assertions = [];
  const events = [...input].sort((a, b) => a.seq - b.seq);
  const invalid = input.map((event) => ({ event, problem: validateEvent(event) })).find((entry) => entry.problem !== null);
  const sequences = [...input.map((event) => event.seq)].sort((a, b) => a - b);
  const duplicateSeq = new Set(sequences).size !== input.length;
  const nonContiguous = sequences.some((seq2, index) => seq2 !== index + 1);
  if (invalid || duplicateSeq || nonContiguous) {
    assertions.push({
      kind: "evidence",
      status: "ERROR",
      detail: invalid ? `normalized event evidence is invalid at sequence ${String(invalid.event.seq)}: ${invalid.problem}` : duplicateSeq ? "normalized event evidence has duplicate sequence numbers" : "normalized event evidence sequence must be contiguous from 1"
    });
  }
  for (const required of assert.require ?? []) {
    const hits = matching(events, required);
    const min = required.count?.min ?? 1;
    const max = required.count?.max;
    const ok = hits.length >= min && (max === void 0 || hits.length <= max);
    assertions.push({
      kind: "require_event",
      status: ok ? "PASS" : "FAIL",
      detail: ok ? `required event \`${required.event}\` occurred ${hits.length} time(s)` : `required event \`${required.event}\` expected ${bounds(min, max)}, saw ${hits.length}`
    });
  }
  for (const forbidden of assert.forbid ?? []) {
    const hits = matching(events, forbidden);
    assertions.push({
      kind: "forbid_event",
      status: hits.length ? "FAIL" : "PASS",
      detail: hits.length ? `forbidden event \`${forbidden.event}\` occurred at sequence(s) ${hits.map((event) => event.seq).join(", ")}` : `forbidden event \`${forbidden.event}\` did not occur`
    });
  }
  for (const chain of assert.ordered ?? []) {
    let cursor = -Infinity;
    const found = [];
    for (const selector of chain) {
      const next = matching(events, selector).find((event) => event.seq > cursor);
      if (!next)
        break;
      found.push(next);
      cursor = next.seq;
    }
    const ok = found.length === chain.length;
    assertions.push({
      kind: "ordered_events",
      status: ok ? "PASS" : "FAIL",
      detail: ok ? `ordered events occurred at sequences ${found.map((event) => event.seq).join(" < ")}` : `ordered trajectory broke at \`${chain[found.length]?.event ?? "unknown"}\` after sequence ${cursor === -Infinity ? "start" : cursor}`
    });
  }
  for (const correlation of assert.correlate ?? []) {
    const left = selected(events, correlation.left);
    const right = selected(events, correlation.right);
    if (!left.length || !right.length) {
      assertions.push({ kind: "correlation", status: "FAIL", detail: `correlation needs \`${correlation.left.event}\` and \`${correlation.right.event}\`` });
      continue;
    }
    for (const l of left)
      for (const r of right) {
        const checked = compareFields(l, r, correlation.same ?? [], correlation.different ?? []);
        if (checked.error) {
          assertions.push({ kind: "correlation", status: "ERROR", detail: checked.error });
          continue;
        }
        const ordered = correlation.order === void 0 || (correlation.order === "before" ? l.seq < r.seq : l.seq > r.seq);
        assertions.push({
          kind: "correlation",
          status: checked.ok && ordered ? "PASS" : "FAIL",
          detail: checked.ok && ordered ? `\`${correlation.left.event}\` and \`${correlation.right.event}\` satisfy identity/order correlation` : `\`${correlation.left.event}\` and \`${correlation.right.event}\` violate ${!checked.ok ? "identity" : `${correlation.order} ordering`} correlation`
        });
      }
  }
  for (const freshness of assert.freshness ?? []) {
    const subjects = selected(events, freshness.subject);
    if (!subjects.length) {
      assertions.push({ kind: "freshness", status: "FAIL", detail: `freshness subject \`${freshness.subject.event}\` is missing` });
      continue;
    }
    for (const subject of subjects) {
      let floor = -Infinity;
      let failure = null;
      let error = null;
      for (const selector of freshness.after) {
        const candidates = matching(events, selector);
        const correlated = [];
        for (const candidate of candidates) {
          const checked = compareFields(subject, candidate, freshness.same ?? [], []);
          if (checked.error)
            error ??= checked.error;
          else if (checked.ok)
            correlated.push(candidate);
        }
        const anchor = correlated.at(-1);
        if (!anchor)
          failure = `freshness anchor \`${selector.event}\` is missing for the correlated identity`;
        else
          floor = Math.max(floor, anchor.seq);
      }
      assertions.push(error ? { kind: "freshness", status: "ERROR", detail: error } : failure ? { kind: "freshness", status: "FAIL", detail: failure } : subject.seq > floor ? { kind: "freshness", status: "PASS", detail: `\`${freshness.subject.event}\` at ${subject.seq} is newer than freshness floor ${floor}` } : { kind: "freshness", status: "FAIL", detail: `\`${freshness.subject.event}\` at ${subject.seq} is stale; freshness floor is ${floor}` });
    }
  }
  for (const uniqueness of assert.unique ?? []) {
    const hits = matching(events, uniqueness.events);
    for (const field of uniqueness.fields) {
      const values = hits.map((event) => fieldValue(event, field));
      const missing = values.findIndex((value) => value === void 0 || value === null || value === "");
      if (missing >= 0) {
        assertions.push({ kind: "unique", status: "ERROR", detail: `uniqueness field \`${field}\` is missing on \`${uniqueness.events.event}\` at sequence ${hits[missing].seq}` });
      } else {
        const duplicates = values.filter((value, index) => values.findIndex((other) => deepEqual2(value, other)) !== index);
        assertions.push({
          kind: "unique",
          status: duplicates.length ? "FAIL" : "PASS",
          detail: duplicates.length ? `\`${field}\` was reused across independent \`${uniqueness.events.event}\` events` : `\`${field}\` is unique across ${hits.length} event(s)`
        });
      }
    }
  }
  for (const rule of assert.forbid_after ?? []) {
    const anchors = selected(events, rule.anchor);
    if (!anchors.length) {
      assertions.push({
        kind: "forbid_after",
        status: rule.anchor_optional ? "PASS" : "FAIL",
        detail: rule.anchor_optional ? `optional anchor \`${rule.anchor.event}\` did not occur` : `anchor \`${rule.anchor.event}\` is missing`
      });
      continue;
    }
    for (const anchor of anchors) {
      let violations = 0;
      let error = null;
      for (const selector of rule.forbidden) {
        for (const candidate of matching(events, selector).filter((event) => event.seq > anchor.seq)) {
          const checked = compareFields(anchor, candidate, rule.same ?? [], []);
          if (checked.error)
            error ??= checked.error;
          else if (checked.ok)
            violations++;
        }
      }
      assertions.push(error ? { kind: "forbid_after", status: "ERROR", detail: error } : {
        kind: "forbid_after",
        status: violations ? "FAIL" : "PASS",
        detail: violations ? `${violations} forbidden mutation event(s) occurred after \`${rule.anchor.event}\` for the same identity` : `no forbidden mutation followed \`${rule.anchor.event}\``
      });
    }
  }
  for (const approval of assert.approvals ?? []) {
    const grants = selected(events, approval.grant);
    const uses = approval.use.select ? selected(events, approval.use) : matching(events, approval.use);
    if (!grants.length || !uses.length) {
      assertions.push({ kind: "approval", status: "FAIL", detail: "approval grant/use evidence is incomplete" });
      continue;
    }
    for (const grant of grants) {
      const matchingUses = [];
      let error = null;
      let usedBeforeGrant = false;
      const identityFields = [.../* @__PURE__ */ new Set([
        ...approval.same ?? [],
        "approval.id",
        "approval.capability",
        ...approval.scopes ? ["approval.scope"] : [],
        ...approval.sources ? ["approval.source"] : []
      ])];
      for (const use of uses) {
        const checked = compareFields(grant, use, identityFields, []);
        if (checked.error)
          error ??= checked.error;
        else if (checked.ok && use.seq <= grant.seq)
          usedBeforeGrant = true;
        else if (checked.ok)
          matchingUses.push(use);
      }
      const scope = grant.approval?.scope;
      const source = grant.approval?.source;
      if (error) {
        assertions.push({ kind: "approval", status: "ERROR", detail: error });
        continue;
      }
      if (approval.scopes && (!scope || !approval.scopes.includes(scope))) {
        assertions.push({ kind: "approval", status: scope ? "FAIL" : "ERROR", detail: scope ? `approval scope \`${scope}\` is not allowed` : "approval scope is missing" });
        continue;
      }
      if (approval.sources && (!source || !approval.sources.includes(source))) {
        assertions.push({ kind: "approval", status: source ? "FAIL" : "ERROR", detail: source ? `approval source \`${source}\` is not allowed` : "approval source is missing" });
        continue;
      }
      if (usedBeforeGrant) {
        assertions.push({ kind: "approval", status: "FAIL", detail: "approval was used before its grant event" });
        continue;
      }
      if (matchingUses.length === 0) {
        assertions.push({ kind: "approval", status: "FAIL", detail: "no approval use matches the granted scope/identity" });
        continue;
      }
      if (approval.max_uses !== void 0 && matchingUses.length > approval.max_uses) {
        assertions.push({ kind: "approval", status: "FAIL", detail: `approval was used ${matchingUses.length} times (max ${approval.max_uses})` });
        continue;
      }
      if (approval.unexpired) {
        const approved = grant.approval?.approved_at ?? grant.at;
        const expires = grant.approval?.expires_at;
        const timestampsInvalid = !approved || !expires || !validDate(approved) || !validDate(expires) || matchingUses.some((use) => !validDate(use.approval?.used_at ?? use.at));
        if (timestampsInvalid) {
          assertions.push({ kind: "approval", status: "ERROR", detail: "approval grant/expiry/use timestamp is missing or invalid" });
          continue;
        }
        const invalidUse = matchingUses.find((use) => {
          const used = use.approval?.used_at ?? use.at;
          return Date.parse(used) < Date.parse(approved) || Date.parse(used) >= Date.parse(expires);
        });
        if (Date.parse(approved) >= Date.parse(expires) || invalidUse) {
          assertions.push({ kind: "approval", status: "FAIL", detail: "approval was used outside its grant/expiry interval" });
          continue;
        }
      }
      assertions.push({ kind: "approval", status: "PASS", detail: `approval was used ${matchingUses.length} time(s) within declared scope and expiry` });
    }
  }
  for (const coverage of assert.coverage ?? []) {
    const hits = coverage.events ? matching(events, coverage.events) : events;
    const covered = new Set(hits.flatMap((event) => event.requirements ?? []));
    const missing = coverage.requirements.filter((requirement) => !covered.has(requirement));
    assertions.push({
      kind: "coverage",
      status: missing.length ? "FAIL" : "PASS",
      detail: missing.length ? `missing requirement coverage: ${missing.join(", ")}` : `requirement coverage recorded: ${coverage.requirements.join(", ")}`
    });
  }
  return {
    status: assertions.some((result) => result.status === "ERROR") ? "ERROR" : assertions.some((result) => result.status === "FAIL") ? "FAIL" : "PASS",
    event_version: TRAJECTORY_EVENT_VERSION,
    events_sha256: trajectoryEventsSha256(events),
    assertions
  };
}
function parseTrajectoryAssert(raw, ctx) {
  const object3 = asObject2(raw, `${ctx}: \`assert.trajectory\``);
  const allowed = /* @__PURE__ */ new Set(["version", "require", "forbid", "ordered", "correlate", "freshness", "unique", "forbid_after", "approvals", "coverage"]);
  rejectUnknown(object3, allowed, `${ctx}: \`assert.trajectory\``);
  if (object3.version !== TRAJECTORY_ASSERT_VERSION)
    throw new Error(`${ctx}: \`assert.trajectory.version\` must be ${TRAJECTORY_ASSERT_VERSION}`);
  const out = { version: TRAJECTORY_ASSERT_VERSION };
  if (object3.require !== void 0)
    out.require = nonEmptyArray(object3.require, `${ctx}: require`).map((value, index) => parseRequired(value, `${ctx}: require[${index}]`));
  if (object3.forbid !== void 0)
    out.forbid = nonEmptyArray(object3.forbid, `${ctx}: forbid`).map((value, index) => parseSelector(value, `${ctx}: forbid[${index}]`));
  if (object3.ordered !== void 0)
    out.ordered = nonEmptyArray(object3.ordered, `${ctx}: ordered`).map((chain, index) => nonEmptyArray(chain, `${ctx}: ordered[${index}]`).map((value, step) => parseSelector(value, `${ctx}: ordered[${index}][${step}]`)));
  if (object3.correlate !== void 0)
    out.correlate = nonEmptyArray(object3.correlate, `${ctx}: correlate`).map((value, index) => parseCorrelation(value, `${ctx}: correlate[${index}]`));
  if (object3.freshness !== void 0)
    out.freshness = nonEmptyArray(object3.freshness, `${ctx}: freshness`).map((value, index) => parseFreshness(value, `${ctx}: freshness[${index}]`));
  if (object3.unique !== void 0)
    out.unique = nonEmptyArray(object3.unique, `${ctx}: unique`).map((value, index) => parseUnique(value, `${ctx}: unique[${index}]`));
  if (object3.forbid_after !== void 0)
    out.forbid_after = nonEmptyArray(object3.forbid_after, `${ctx}: forbid_after`).map((value, index) => parseForbidAfter(value, `${ctx}: forbid_after[${index}]`));
  if (object3.approvals !== void 0)
    out.approvals = nonEmptyArray(object3.approvals, `${ctx}: approvals`).map((value, index) => parseApproval(value, `${ctx}: approvals[${index}]`));
  if (object3.coverage !== void 0)
    out.coverage = nonEmptyArray(object3.coverage, `${ctx}: coverage`).map((value, index) => parseCoverage(value, `${ctx}: coverage[${index}]`));
  if (Object.keys(out).length === 1)
    throw new Error(`${ctx}: \`assert.trajectory\` declares no assertions`);
  return out;
}
function parseRequired(raw, ctx) {
  const object3 = asObject2(raw, ctx);
  rejectUnknown(object3, /* @__PURE__ */ new Set(["event", "where", "select", "count"]), ctx);
  const out = parseSelector({ event: object3.event, ...object3.where === void 0 ? {} : { where: object3.where }, ...object3.select === void 0 ? {} : { select: object3.select } }, ctx);
  if (object3.count !== void 0)
    out.count = parseCount2(object3.count, `${ctx}.count`);
  return out;
}
function parseSelector(raw, ctx) {
  const object3 = asObject2(raw, ctx);
  rejectUnknown(object3, /* @__PURE__ */ new Set(["event", "where", "select"]), ctx);
  if (typeof object3.event !== "string" || !object3.event.trim())
    throw new Error(`${ctx}.event must be a non-empty string`);
  const out = { event: object3.event };
  if (object3.where !== void 0) {
    const where = asObject2(object3.where, `${ctx}.where`);
    out.where = Object.fromEntries(Object.entries(where).map(([field, value]) => [field, parsePredicate(value, `${ctx}.where.${field}`)]));
  }
  if (object3.select !== void 0) {
    if (!["first", "last", "all"].includes(object3.select))
      throw new Error(`${ctx}.select must be first, last, or all`);
    out.select = object3.select;
  }
  return out;
}
function parseCorrelation(raw, ctx) {
  const object3 = asObject2(raw, ctx);
  rejectUnknown(object3, /* @__PURE__ */ new Set(["left", "right", "same", "different", "order"]), ctx);
  const out = { left: parseSelector(object3.left, `${ctx}.left`), right: parseSelector(object3.right, `${ctx}.right`) };
  if (object3.same !== void 0)
    out.same = stringList(object3.same, `${ctx}.same`);
  if (object3.different !== void 0)
    out.different = stringList(object3.different, `${ctx}.different`);
  if (object3.order !== void 0) {
    if (object3.order !== "before" && object3.order !== "after")
      throw new Error(`${ctx}.order must be before or after`);
    out.order = object3.order;
  }
  if (!out.same?.length && !out.different?.length && !out.order)
    throw new Error(`${ctx} declares no relation`);
  return out;
}
function parseFreshness(raw, ctx) {
  const object3 = asObject2(raw, ctx);
  rejectUnknown(object3, /* @__PURE__ */ new Set(["subject", "after", "same"]), ctx);
  return {
    subject: parseSelector(object3.subject, `${ctx}.subject`),
    after: nonEmptyArray(object3.after, `${ctx}.after`).map((value, index) => parseSelector(value, `${ctx}.after[${index}]`)),
    ...object3.same === void 0 ? {} : { same: stringList(object3.same, `${ctx}.same`) }
  };
}
function parseUnique(raw, ctx) {
  const object3 = asObject2(raw, ctx);
  rejectUnknown(object3, /* @__PURE__ */ new Set(["events", "fields"]), ctx);
  return { events: parseSelector(object3.events, `${ctx}.events`), fields: stringList(object3.fields, `${ctx}.fields`) };
}
function parseForbidAfter(raw, ctx) {
  const object3 = asObject2(raw, ctx);
  rejectUnknown(object3, /* @__PURE__ */ new Set(["anchor", "forbidden", "same", "anchor_optional"]), ctx);
  if (object3.anchor_optional !== void 0 && typeof object3.anchor_optional !== "boolean")
    throw new Error(`${ctx}.anchor_optional must be boolean`);
  return {
    anchor: parseSelector(object3.anchor, `${ctx}.anchor`),
    forbidden: nonEmptyArray(object3.forbidden, `${ctx}.forbidden`).map((value, index) => parseSelector(value, `${ctx}.forbidden[${index}]`)),
    ...object3.same === void 0 ? {} : { same: stringList(object3.same, `${ctx}.same`) },
    ...object3.anchor_optional === void 0 ? {} : { anchor_optional: object3.anchor_optional }
  };
}
function parseApproval(raw, ctx) {
  const object3 = asObject2(raw, ctx);
  rejectUnknown(object3, /* @__PURE__ */ new Set(["grant", "use", "same", "scopes", "sources", "unexpired", "max_uses"]), ctx);
  if (object3.unexpired !== void 0 && typeof object3.unexpired !== "boolean")
    throw new Error(`${ctx}.unexpired must be boolean`);
  if (object3.max_uses !== void 0 && (!Number.isInteger(object3.max_uses) || Number(object3.max_uses) < 1))
    throw new Error(`${ctx}.max_uses must be a positive integer`);
  return {
    grant: parseSelector(object3.grant, `${ctx}.grant`),
    use: parseSelector(object3.use, `${ctx}.use`),
    ...object3.same === void 0 ? {} : { same: stringList(object3.same, `${ctx}.same`) },
    ...object3.scopes === void 0 ? {} : { scopes: stringList(object3.scopes, `${ctx}.scopes`) },
    ...object3.sources === void 0 ? {} : { sources: stringList(object3.sources, `${ctx}.sources`) },
    ...object3.unexpired === void 0 ? {} : { unexpired: object3.unexpired },
    ...object3.max_uses === void 0 ? {} : { max_uses: Number(object3.max_uses) }
  };
}
function parseCoverage(raw, ctx) {
  const object3 = asObject2(raw, ctx);
  rejectUnknown(object3, /* @__PURE__ */ new Set(["requirements", "events"]), ctx);
  return { requirements: stringList(object3.requirements, `${ctx}.requirements`), ...object3.events === void 0 ? {} : { events: parseSelector(object3.events, `${ctx}.events`) } };
}
function parseCount2(raw, ctx) {
  const object3 = asObject2(raw, ctx);
  rejectUnknown(object3, /* @__PURE__ */ new Set(["min", "max"]), ctx);
  const out = {};
  for (const key of ["min", "max"]) {
    if (object3[key] === void 0)
      continue;
    if (!Number.isInteger(object3[key]) || Number(object3[key]) < 0)
      throw new Error(`${ctx}.${key} must be a non-negative integer`);
    out[key] = Number(object3[key]);
  }
  if (out.min !== void 0 && out.max !== void 0 && out.min > out.max)
    throw new Error(`${ctx}.min exceeds max`);
  return out;
}
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
  "execution_id",
  "parent_execution_id",
  "task_from_execution_id",
  "workflow_fact_id",
  "deadline_at",
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
var APPROVAL_KEYS = /* @__PURE__ */ new Set(["id", "capability", "subject", "source", "scope", "approved_at", "expires_at", "used_at"]);
var ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
var SHA256_RE = /^[a-fA-F0-9]{64}$/;
var GIT_SHA_RE = /^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/;
var REFUSAL_RE = /^[A-Z][A-Z0-9_]*$/;
function validateEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event))
    return "event must be an object";
  const object3 = event;
  const unknown = Object.keys(object3).find((key) => !EVENT_KEYS.has(key));
  if (unknown)
    return `unknown field ${unknown}`;
  if (event.event_version !== TRAJECTORY_EVENT_VERSION)
    return `unsupported event_version ${String(event.event_version)}`;
  if (!Number.isInteger(event.seq) || event.seq < 1)
    return "seq must be a positive integer";
  if (typeof event.type !== "string" || !event.type)
    return "type must be a non-empty string";
  if (typeof event.source !== "string" || !event.source)
    return "source must be a non-empty string";
  if (event.at !== void 0 && !validDate(event.at))
    return "at must be an RFC 3339 date-time";
  for (const field of ["run_id", "task_id", "workspace_id", "context_id", "finding_id", "parent_id", "child_id", "execution_id", "task_from_execution_id", "workflow_fact_id"]) {
    if (event[field] !== void 0 && (typeof event[field] !== "string" || !ID_RE.test(event[field])))
      return `${field} is not a valid bounded identifier`;
  }
  if (event.parent_execution_id !== void 0 && event.parent_execution_id !== null && (typeof event.parent_execution_id !== "string" || !ID_RE.test(event.parent_execution_id)))
    return "parent_execution_id is not a valid bounded identifier or null";
  if (event.deadline_at !== void 0 && !validDate(event.deadline_at))
    return "deadline_at must be an RFC 3339 date-time";
  for (const field of ["phase", "tool", "capability"]) {
    if (event[field] !== void 0 && (typeof event[field] !== "string" || !event[field]))
      return `${field} must be a non-empty string`;
  }
  for (const field of ["requested_capabilities", "effective_capabilities", "requirements"]) {
    const values = event[field];
    if (values !== void 0 && (!Array.isArray(values) || values.some((value) => typeof value !== "string" || !value) || new Set(values).size !== values.length)) {
      return `${field} must be an array of unique non-empty strings`;
    }
  }
  if (event.refusal_code !== void 0 && !REFUSAL_RE.test(event.refusal_code))
    return "refusal_code is invalid";
  if (event.exit_code !== void 0 && !Number.isInteger(event.exit_code))
    return "exit_code must be an integer";
  if (event.digests !== void 0) {
    if (!event.digests || typeof event.digests !== "object" || Array.isArray(event.digests))
      return "digests must be an object";
    for (const [key, value] of Object.entries(event.digests)) {
      if (typeof value !== "string")
        return `digests.${key} must be a string`;
      if (["plan", "task", "definition"].includes(key) && !SHA256_RE.test(value))
        return `digests.${key} must be sha256`;
      if (["head", "tree"].includes(key) && !GIT_SHA_RE.test(value))
        return `digests.${key} must be a git object id`;
    }
  }
  if (event.approval !== void 0) {
    if (!event.approval || typeof event.approval !== "object" || Array.isArray(event.approval))
      return "approval must be an object";
    const unknownApproval = Object.keys(event.approval).find((key) => !APPROVAL_KEYS.has(key));
    if (unknownApproval)
      return `approval.${unknownApproval} is unknown`;
    for (const [key, value] of Object.entries(event.approval)) {
      if (typeof value !== "string" || !value)
        return `approval.${key} must be a non-empty string`;
      if (key === "id" && !ID_RE.test(value))
        return "approval.id is invalid";
      if (["approved_at", "expires_at", "used_at"].includes(key) && !validDate(value))
        return `approval.${key} must be an RFC 3339 date-time`;
    }
  }
  if (event.attributes !== void 0 && (!event.attributes || typeof event.attributes !== "object" || Array.isArray(event.attributes)))
    return "attributes must be an object";
  return null;
}
function matching(events, selector) {
  return events.filter((event) => event.type === selector.event && Object.entries(selector.where ?? {}).every(([field, predicate]) => testPredicate(fieldValue(event, field), predicate)));
}
function selected(events, selector) {
  const hits = matching(events, selector);
  if (selector.select === "all")
    return hits;
  return hits.length ? [selector.select === "first" ? hits[0] : hits[hits.length - 1]] : [];
}
function fieldValue(event, field) {
  let current = event;
  for (const part of field.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current) || !Object.hasOwn(current, part))
      return void 0;
    current = current[part];
  }
  return current;
}
function compareFields(left, right, same, different) {
  for (const field of [...same, ...different]) {
    const l = fieldValue(left, field), r = fieldValue(right, field);
    if (l === void 0 || l === null || r === void 0 || r === null)
      return { ok: false, error: `correlation field \`${field}\` is missing at sequence ${l === void 0 || l === null ? left.seq : right.seq}` };
  }
  return { ok: same.every((field) => deepEqual2(fieldValue(left, field), fieldValue(right, field))) && different.every((field) => !deepEqual2(fieldValue(left, field), fieldValue(right, field))) };
}
function deepEqual2(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function validDate(value) {
  if (typeof value !== "string")
    return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value)))
    return false;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59)
    return false;
  return day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}
function bounds(min, max) {
  return max === void 0 ? `at least ${min}` : min === 0 ? `at most ${max}` : `${min}..${max}`;
}
function asObject2(value, ctx) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${ctx} must be a mapping`);
  return value;
}
function nonEmptyArray(value, ctx) {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error(`${ctx} must be a non-empty list`);
  return value;
}
function stringList(value, ctx) {
  const values = nonEmptyArray(value, ctx);
  if (values.some((item) => typeof item !== "string" || !item.trim()))
    throw new Error(`${ctx} must contain non-empty strings`);
  if (new Set(values).size !== values.length)
    throw new Error(`${ctx} must not contain duplicates`);
  return values;
}
function rejectUnknown(object3, allowed, ctx) {
  const unknown = Object.keys(object3).find((key) => !allowed.has(key));
  if (unknown)
    throw new Error(`${ctx}: unknown key \`${unknown}\``);
}
function stableStringify(value) {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "null";
  if (Array.isArray(value))
    return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.entries(value).filter(([, entry]) => entry !== void 0).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
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
function resolveEventSources(env, id, file) {
  const raw = env && typeof env === "object" ? env.event_sources : void 0;
  if (raw === void 0)
    return void 0;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new SpecError(`scenario \`${id}\` env.event_sources must be a non-empty list`, file);
  }
  const allowedAdapters = /* @__PURE__ */ new Set([
    "normalized-v1",
    "principal-assurance-v1",
    "pi-daddy-v1",
    "pi-daddy-ledger-v3"
  ]);
  return raw.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new SpecError(`scenario \`${id}\` env.event_sources[${index}] must be a mapping`, file);
    }
    const source = entry;
    for (const key of Object.keys(source)) {
      if (!["adapter", "path", "required"].includes(key)) {
        throw new SpecError(`scenario \`${id}\` env.event_sources[${index}] has unknown key \`${key}\``, file);
      }
    }
    if (!allowedAdapters.has(source.adapter)) {
      throw new SpecError(`scenario \`${id}\` env.event_sources[${index}].adapter is unsupported`, file);
    }
    if (typeof source.path !== "string" || !source.path.trim()) {
      throw new SpecError(`scenario \`${id}\` env.event_sources[${index}].path must be non-empty`, file);
    }
    const path = source.path.trim();
    if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || path.includes("\\") || path.split("/").some((part) => part === ".." || part === "." || part === "")) {
      throw new SpecError(`scenario \`${id}\` env.event_sources paths must be workspace-relative without traversal (got \`${path}\`)`, file);
    }
    if (source.required !== void 0 && typeof source.required !== "boolean") {
      throw new SpecError(`scenario \`${id}\` env.event_sources[${index}].required must be true or false`, file);
    }
    return {
      adapter: source.adapter,
      path,
      required: source.required !== false
    };
  });
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
    if (rawAssert?.trace !== void 0) {
      scenario.traceAssert = parseTraceAssert(rawAssert.trace, `${file}: scenario \`${id}\``);
    }
    if (rawAssert?.trajectory !== void 0) {
      scenario.trajectoryAssert = parseTrajectoryAssert(rawAssert.trajectory, `${file}: scenario \`${id}\``);
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
    scenario.eventSources = resolveEventSources(s.env, id, file);
    if (scenario.eventSources && !scenario.trajectoryAssert) {
      throw new SpecError(`scenario \`${id}\` declares env.event_sources without assert.trajectory`, file);
    }
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
  const { id, title, critical, mode, turns, checklist, fixture, assert, traceAssert, trajectoryAssert, workspace, remote, systemPromptFile, extensions, eventSources, reps: reps2, passThreshold, covers: _coversIsMetadata, ...restScenario } = s;
  const _scenarioExhaustive = restScenario;
  void _scenarioExhaustive;
  void _coversIsMetadata;
  const { vitest, diff_contains, diff_excludes, post_test, ...restAssert } = assert ?? {};
  const _assertExhaustive = restAssert;
  void _assertExhaustive;
  const hasGates = diff_contains !== void 0 || diff_excludes !== void 0 || traceAssert !== void 0 || trajectoryAssert !== void 0;
  return {
    // `vitest` and the `post_test` PATH are stimulus, not gates: both change what the
    // run executes in the workspace, and neither can be re-evaluated from a saved
    // diff. (`post_test`'s CONTENTS get their own file-path key, hashed separately.)
    // `extensions` is STIMULUS, not a gate — note the asymmetry with `traceAssert`
    // below. Changing which extensions load changes what the model can DO, so the
    // old transcripts describe a different agent and only a re-run can answer.
    // Changing an assertion only changes what we conclude from evidence already on
    // disk, which `regate` can redo for free.
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
      ...extensions ? [extensions] : [],
      // Event-source paths choose which native ledgers are captured. A saved
      // normalized artifact cannot answer for a source that was never collected,
      // so changing this is stimulus and needs a re-run.
      ...eventSources ? [eventSources] : []
    ]),
    rubric: JSON.stringify([id, title, checklist]),
    policy: JSON.stringify([id, critical, reps2 ?? null, passThreshold ?? null]),
    // Same rule as `stimulus` above: conditional, so a needle-gated scenario that
    // declares no trace assertions keeps the digest it was published with.
    gates: hasGates ? JSON.stringify([
      id,
      diff_contains ?? null,
      diff_excludes ?? null,
      ...traceAssert ? [traceAssert] : [],
      ...trajectoryAssert ? [trajectoryAssert] : []
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

// packages/core/dist/arms.js
import { copyFileSync, existsSync as existsSync3, mkdirSync, readdirSync as readdirSync4, readFileSync as readFileSync4, realpathSync, statSync as statSync2 } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute as isAbsolute3, join as join4, resolve as resolve4, sep } from "node:path";
var NONE_ARM = { name: "none", extensions: [], seedSkills: [], requireDefinitions: 0, env: {} };
function realpathOr(p) {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}
function defaultAmbientSkillsDir() {
  return join4(homedir(), ".pi", "agent", "skills");
}
function seedArmDefinitions(arm, skillsRoot, workspaceCwd, opts = {}) {
  if (arm.name === NONE_ARM.name)
    return 0;
  const ambient = opts.ambientSkillsDir ?? defaultAmbientSkillsDir();
  let ambientEntries = [];
  try {
    ambientEntries = readdirSync4(ambient);
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
  const dest = join4(workspaceCwd, ".pi", "skills");
  mkdirSync(dest, { recursive: true });
  const resolvedRoot = realpathOr(resolve4(skillsRoot));
  const seen = /* @__PURE__ */ new Set();
  for (const rel of arm.seedSkills) {
    const src = realpathOr(resolve4(skillsRoot, rel));
    if (src !== resolvedRoot && !src.startsWith(resolvedRoot + sep)) {
      throw new Error(`arm \`${arm.name}\`: seed_skills entry ${JSON.stringify(rel)} resolves to ${src}, which is outside the skills root ${resolvedRoot} \u2014 refusing to seed from outside the corpus`);
    }
    let names;
    try {
      names = readdirSync4(src);
    } catch {
      throw new Error(`arm \`${arm.name}\`: seed_skills names ${src}, which cannot be read \u2014 pi would start with nothing to spawn`);
    }
    for (const name of names) {
      const from = join4(src, name);
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
      copyFileSync(from, join4(dest, name));
    }
  }
  const count = seen.size;
  if (count < arm.requireDefinitions) {
    throw new Error(`arm \`${arm.name}\`: seeded ${count} definition(s) into ${dest} but require_definitions is ${arm.requireDefinitions} \u2014 pi-daddy would have nothing (or too little) to spawn, and the arm would measure nothing while looking green.`);
  }
  return count;
}

// packages/core/dist/results.js
import { mkdirSync as mkdirSync2, readFileSync as readFileSync5, writeFileSync, existsSync as existsSync4, readdirSync as readdirSync5, appendFileSync as appendFileSync2 } from "node:fs";
import { join as join5, relative, sep as sep2 } from "node:path";

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
  for (const v of verdicts) {
    if (v.suspect) {
      suspectCount++;
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
  const ship = validBar && total >= shipBar.total && passed >= shipBar.min_pass && (!shipBar.no_critical_fail || criticalFails === 0) && bSeriesFails === 0 && suspectCount === 0 && errorCount === 0;
  let note = "";
  if (!validBar) {
    note = "invalid ship bar: total/min_pass must be positive integers with min_pass <= total";
  } else if (suspectCount > 0) {
    note = `${suspectCount} suspect: re-judge/resolve`;
  } else if (errorCount > 0) {
    note = `${errorCount} infrastructure error${errorCount === 1 ? "" : "s"}: retry/repair evidence`;
  } else if (criticalFails > 0) {
    note = `gated: ${criticalFails} critical fail${criticalFails === 1 ? "" : "s"}`;
  } else if (bSeriesFails > 0) {
    note = `gated: ${bSeriesFails} B-series fail${bSeriesFails === 1 ? "" : "s"}`;
  }
  return { passed, total, pct, letter, ship, criticalFails, bSeriesFails, suspectCount, errorCount, note };
}

// packages/core/dist/version.js
import { createRequire } from "node:module";
var require2 = createRequire(import.meta.url);
var HARNESS_VERSION = require2("../package.json").version;

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
    ...subject.tool_calls === void 0 ? {} : { tool_calls: subject.tool_calls },
    ...subject.delegated_children === void 0 ? {} : { delegated_children: subject.delegated_children },
    ...subject.max_concurrency === void 0 ? {} : { max_concurrency: subject.max_concurrency }
  };
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
  return join5(skillDir, "tests", "results", `${harness}-${modelSlug(model)}${arm}`, timestampSlug(timestamp2));
}
function transcriptPath(runDir, scenarioId, mode, rep) {
  const base = rep === void 0 ? `${scenarioId}.${mode}` : `${scenarioId}.${mode}.rep${rep}`;
  return join5(runDir, `${base}.txt`);
}
function resultsPath(runDir) {
  return join5(runDir, "results.yaml");
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
    ...draft.arm ? { arm: draft.arm } : {},
    ...draft.partial ? { partial: true } : {},
    ...draft.source_hashes ? { source_hashes: draft.source_hashes } : {},
    effective_grade,
    scenarios: draft.scenarios
  };
}
function writeResults(runDir, draft, ctx) {
  const results = finalizeResults(draft, ctx);
  mkdirSync2(runDir, { recursive: true });
  writeFileSync(resultsPath(runDir), yaml.dump(results, { lineWidth: 100 }), "utf8");
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
  const text = readFileSync5(resultsPath(runDir), "utf8");
  return migrateResults(yaml.load(text));
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
  mkdirSync2(resultsRoot, { recursive: true });
  const giPath = join5(resultsRoot, ".gitignore");
  const existing = existsSync4(giPath) ? readFileSync5(giPath, "utf8") : "";
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
  if (!existsSync4(runDir))
    return [];
  const escapedId = scenarioId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = mode !== void 0 ? new RegExp(`^${escapedId}\\.${mode}(\\.rep\\d+)?\\.txt$`) : null;
  const files = readdirSync5(runDir).filter((f) => matcher ? matcher.test(f) : f.startsWith(`${scenarioId}.`) && f.endsWith(".txt") && !f.endsWith(".judge.txt") && !f.endsWith(".diff.txt"));
  return sortByRep(files);
}
function judgeRawPath(runDir, scenarioId, mode, rep) {
  const base = rep === void 0 ? `${scenarioId}.${mode}` : `${scenarioId}.${mode}.rep${rep}`;
  return join5(runDir, `${base}.judge.txt`);
}
function findJudgeRawFiles(runDir, scenarioId, mode) {
  if (!existsSync4(runDir))
    return [];
  const esc = scenarioId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = mode === void 0 ? new RegExp(`^${esc}\\..*\\.judge\\d*\\.txt$`) : new RegExp(`^${esc}\\.${mode}(\\.rep\\d+)?\\.judge\\d*\\.txt$`);
  return sortByRep(readdirSync5(runDir).filter((f) => re.test(f)));
}
function diffPath(runDir, scenarioId, mode, rep) {
  const base = rep === void 0 ? `${scenarioId}.${mode}` : `${scenarioId}.${mode}.rep${rep}`;
  return join5(runDir, `${base}.diff.txt`);
}
function rebuildScenarioResult(fresh, prior, policy) {
  const { id, judge_verdict, judge_reason, suspect, override: _freshOverride, note: _freshNote, reps: reps2, passes, clean, flakiness, pass_threshold, metrics: freshMetrics, objective: freshObjective, adjudication: freshAdjudication, ...rest } = fresh;
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
  const conflictsWithFreshEvidence = Boolean(pickedAdjudication?.verdict && (objective?.status === "FAIL" || objective?.status === "ERROR" || pass_threshold === 1 && (reps2 ?? 1) > 1 && judge_verdict !== "PASS"));
  const adjudication = conflictsWithFreshEvidence && pickedAdjudication ? { ...pickedAdjudication, state: "unresolved", verdict: void 0 } : pickedAdjudication;
  const unresolved = adjudication?.state === "unresolved";
  const settled = policy.adjudication === "carry" && !conflictsWithFreshEvidence ? adjudication?.verdict : void 0;
  return {
    id,
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
    ...adjudication ? { adjudication } : {}
  };
}
function tracePath(runDir, scenarioId, mode, rep) {
  const base = rep === void 0 ? `${scenarioId}.${mode}` : `${scenarioId}.${mode}.rep${rep}`;
  return join5(runDir, `${base}.trace.jsonl`);
}
function trajectoryPath(runDir, scenarioId, mode, rep) {
  const base = rep === void 0 ? `${scenarioId}.${mode}` : `${scenarioId}.${mode}.rep${rep}`;
  return join5(runDir, `${base}.events.jsonl`);
}
function findTrajectoryFiles(runDir, scenarioId, mode) {
  if (!existsSync4(runDir))
    return [];
  const esc = scenarioId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = mode === void 0 ? new RegExp(`^${esc}\\..*\\.events\\.jsonl$`) : new RegExp(`^${esc}\\.${mode}(\\.rep\\d+)?\\.events\\.jsonl$`);
  return sortByRep(readdirSync5(runDir).filter((f) => re.test(f)));
}
function findDiffFiles(runDir, scenarioId, mode) {
  if (!existsSync4(runDir))
    return [];
  const esc = scenarioId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = mode === void 0 ? new RegExp(`^${esc}\\..*\\.diff\\.txt$`) : new RegExp(`^${esc}\\.${mode}(\\.rep\\d+)?\\.diff\\.txt$`);
  return sortByRep(readdirSync5(runDir).filter((f) => re.test(f)));
}
function findTraceFiles(runDir, scenarioId, mode) {
  if (!existsSync4(runDir))
    return [];
  const esc = scenarioId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = mode === void 0 ? new RegExp(`^${esc}\\..*\\.trace\\.jsonl$`) : new RegExp(`^${esc}\\.${mode}(\\.rep\\d+)?\\.trace\\.jsonl$`);
  return sortByRep(readdirSync5(runDir).filter((f) => re.test(f)));
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
    ...findTraceFiles(runDir, scenarioId),
    ...findTrajectoryFiles(runDir, scenarioId)
  ];
  if (files.length === 0)
    return;
  ensureResultsGitignore(resultsRoot);
  const giPath = join5(resultsRoot, ".gitignore");
  const existingLines = readFileSync5(giPath, "utf8").split("\n");
  const newLines = [];
  for (const file of files) {
    const rel = relative(resultsRoot, join5(runDir, file)).split(sep2).join("/");
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
  return new Promise((resolve15, reject) => {
    const child2 = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let timer;
    if (opts.timeoutMs) {
      timer = setTimeout(() => {
        child2.kill("SIGKILL");
        stderr += `
[skill-harness] killed after ${opts.timeoutMs}ms timeout`;
      }, opts.timeoutMs);
    }
    child2.stdout.on("data", (d) => stdout += d.toString());
    child2.stderr.on("data", (d) => stderr += d.toString());
    child2.on("error", (e) => {
      if (timer)
        clearTimeout(timer);
      reject(e);
    });
    child2.on("close", (code) => {
      if (timer)
        clearTimeout(timer);
      resolve15({ stdout, stderr, code });
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
    eventSources: scenario.eventSources,
    ...opts.armEnv ? { armEnv: opts.armEnv } : {}
  };
  let traces = [];
  let events = [];
  let eventErrors = [];
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
    events = structured.events ?? [];
    eventErrors = structured.eventErrors ?? [];
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
    return finish(parts, gateFailure, gateError, diff, traces, events, eventErrors);
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
        return finish(parts, gateFailure, gateError, diff, traces, events, eventErrors);
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
  return finish(parts, gateFailure, gateError, diff, traces, events, eventErrors);
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
function finish(parts, gateFailure, gateError, diff, traces = [], events = [], eventErrors = []) {
  parts.push("", "=== STAGED DIFF ===");
  parts.push(diff.trim() === "" ? "  (empty \u2014 the model left no staged changes)" : capDiff(diff));
  return { transcript: parts.join("\n"), gateFailure, gateError, diff, traces, events, eventErrors };
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
import { createHash as createHash5 } from "node:crypto";

// packages/core/dist/capture-trace-types.js
var EXECUTION_TRACE_VERSION = 2;
var CAPTURE_SCHEMA_VERSION = 1;

// packages/core/dist/capture.js
import { createHash as createHash4 } from "node:crypto";
import { sep as sep3 } from "node:path";
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
function projectTurns(entries, homeDir) {
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
          // Without `homeDir` this scrubbed secrets but left absolute home paths
          // intact — and these args are what the evidence sidecar records.
          args: redactArgs(b.arguments, homeDir),
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
  /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  // JWT
  // Credentials embedded in a URL — `postgres://user:pass@host/db`. Caught by
  // shape rather than by key name: the key is usually something like `DB_URL`,
  // which no list of secret-sounding names will ever match.
  /\b([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi
];
function redactText(input, homeDir) {
  let out = input;
  out = out.replace(SECRET_VALUE[SECRET_VALUE.length - 1], `$1${REDACTED}@`);
  for (const re of SECRET_VALUE.slice(0, -1))
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
  return createHash4("sha256").update(text, "utf8").digest("hex");
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
  const selected2 = opts.turns.slice(start, end + 1);
  const turns = selected2.map((t) => truncate(redactText(t.user, opts.homeDir)));
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
    // `covers` refs resolve against the SPEC dir, and `target.path` is relative
    // to the skill root — one level up. A subagent path (`.pi/agents/x.md`) is
    // carried the same way; both are instruction files a section walk can read.
    covers: [`../${opts.target.path.split(sep3).join("/")}`],
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
        result: { bytes: 0, sha256: sha2562("") }
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
  const metrics = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_read_tokens: cacheReadTokens,
    cache_write_tokens: cacheWriteTokens,
    cost_usd: cost ?? 0,
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
  const meta = { bytes: Buffer.byteLength(body, "utf8"), sha256: sha2562(body) };
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
function sha2562(text) {
  return createHash5("sha256").update(text, "utf8").digest("hex");
}
function traceSha256(trace) {
  const { trace_sha256: _omit, ...rest } = trace;
  return sha2562(stableStringify2(rest));
}
function stableStringify2(value) {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "null";
  if (Array.isArray(value))
    return `[${value.map(stableStringify2).join(",")}]`;
  const entries = Object.entries(value).filter(([, v]) => v !== void 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify2(v)}`).join(",")}}`;
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
    tool_calls: sum.tool_calls + trace.metrics.tool_calls,
    delegated_children: sum.delegated_children + trace.metrics.delegated_children,
    max_concurrency: Math.max(sum.max_concurrency, trace.metrics.max_concurrency)
  }), {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    cost_usd: 0,
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
  const picked = present.find((o) => o.status === "ERROR") ?? present.find((o) => o.status === "FAIL") ?? present[0];
  if (present.length === 1)
    return picked;
  const eventHashes = present.map((objective) => objective.events_sha256);
  const traceHashes = present.map((objective) => objective.trace_sha256);
  return {
    ...picked,
    ...eventHashes.every((hash) => typeof hash === "string") ? { rep_events_sha256: eventHashes } : {},
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
  if (repCount === 1) {
    const o = outcomes[0];
    return { id, judge_verdict: o.verdict, judge_reason: o.reason, suspect: o.suspect, ...metricsField, override: null, note: "", ...objectiveField };
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
    ...objectiveField
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
    if (targets.length === 0) {
      return prev;
    }
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
    rr.metrics = mergeScenarioMetrics(carry?.metrics, rr.metrics);
    scenarioResults.push(rebuildScenarioResult(rr, carry, { objective: "carry", adjudication: "drop" }));
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

// packages/core/dist/comparison.js
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
  const armEnv = Object.keys(arm.env).length ? Object.fromEntries(Object.entries(arm.env).map(([k, v]) => [k, v.split("<run-dir>").join(runDir)])) : void 0;
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
    let events = [];
    let eventErrors = [];
    let unobservablePaths = false;
    let before = ws ? snapshotPaths(ws.cwd, scenario.workspace) : null;
    if (ws) {
      ctx.armDefinitions.count = seedArmDefinitions(arm, skillsRoot, ws.cwd, { ambientSkillsDir: ctx.ambientSkillsDir });
    }
    let adapterFailure = null;
    if (ws) {
      const needsStructuredEvidence = Boolean(scenario.traceAssert || scenario.trajectoryAssert);
      if (needsStructuredEvidence && !ctx.adapter.runStructured) {
        throw new Error(`scenario \`${scenario.id}\` declares structured objective assertions, but the \`${ctx.adapter.name}\` adapter cannot produce execution traces/events \u2014 the gate would have no evidence to read.`);
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
              ...armEnv ? { armEnv } : {}
            });
            transcript = r.transcript;
            gatePrefix = r.gateFailure;
            infrastructureFailure = r.gateError;
            stagedDiff = r.diff;
            traces = r.traces;
            events = r.events;
            eventErrors = r.eventErrors;
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
              eventSources: scenario.eventSources,
              ...armEnv ? { armEnv } : {}
            };
            if (useStructured) {
              const structured = await ctx.adapter.runStructured({ ...req, scenarioId: scenario.id, rep });
              transcript = structured.transcript;
              traces = structured.traces;
              events = structured.events ?? [];
              eventErrors = structured.eventErrors ?? [];
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
          events = [];
          eventErrors = [];
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
    if ((scenario.traceAssert || scenario.trajectoryAssert) && !adapterFailure) {
      const assertionResults = [];
      let status = "PASS";
      let traceMeta = {};
      let trajectoryMeta = {};
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
      if (scenario.trajectoryAssert) {
        if (events.length > 0) {
          writeFileSync3(trajectoryPath(runDir, scenario.id, mode, repSuffix), serializeTrajectoryEvents(events), "utf8");
        }
        if (eventErrors.length > 0) {
          status = "ERROR";
          assertionResults.push(...eventErrors.map((detail) => ({ kind: "trajectory_evidence", status: "ERROR", detail })));
        } else if (events.length === 0) {
          status = "ERROR";
          assertionResults.push({ kind: "trajectory_evidence", status: "ERROR", detail: "no normalized workflow events were produced" });
        } else {
          const gate = evaluateTrajectoryGates(scenario.trajectoryAssert, events);
          if (gate.status === "ERROR" || gate.status === "FAIL" && status === "PASS")
            status = gate.status;
          assertionResults.push(...gate.assertions);
          trajectoryMeta = { trajectory_version: gate.event_version, events_sha256: gate.events_sha256 };
        }
      }
      objective = { status, ...traceMeta, ...trajectoryMeta, assertions: assertionResults };
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
    let judgeCalls = 0;
    if (objective?.status === "ERROR") {
      verdict = "ERROR";
      reason = gatePrefix ?? "objective evidence missing";
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
      judgeCalls = 1;
    }
    log(`  \u2192 ${scenario.id}${repCount > 1 ? `#${rep}` : ""} ${verdict}${reason ? `: ${reason}` : ""}${suspect ? "  \u26A0 suspect" : ""}`);
    const subject = mergeTraces(traces)?.metrics;
    return {
      verdict,
      reason,
      suspect,
      objective,
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
import { existsSync as existsSync13, readdirSync as readdirSync9, statSync as statSync7 } from "node:fs";
import { join as join17 } from "node:path";

// packages/core/dist/restamp.js
import { createHash as createHash6 } from "node:crypto";
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
import { createHash as createHash7 } from "node:crypto";
import { readFileSync as readFileSync14, renameSync as renameSync3, unlinkSync, writeFileSync as writeFileSync6 } from "node:fs";
import { dirname as dirname5, join as join21 } from "node:path";
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
  return createHash7("sha256").update(text, "utf8").digest("hex");
}
function renderScenarioBlock(scenario) {
  const dumped = yaml.dump({ scenarios: [scenario] }, { lineWidth: -1, noRefs: true });
  return "\n" + dumped.replace(/^scenarios:\n/, "");
}
function appendScenario(opts) {
  const { specPath, scenario, baseSha256 } = opts;
  const current = readFileSync14(specPath, "utf8");
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
  const tmp = join21(dirname5(path), `.${Date.now()}-${process.pid}.specwrite.tmp`);
  try {
    writeFileSync6(tmp, text, "utf8");
    renameSync3(tmp, path);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
    }
    throw err;
  }
}

// packages/core/dist/affected.js
import { existsSync as existsSync16, readFileSync as readFileSync15 } from "node:fs";
import { resolve as resolve10, dirname as dirname6, relative as relative4 } from "node:path";
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
  const changedAbs = new Set(changedFiles.map((f) => resolve10(repoRoot, f)));
  for (const s of scenarios) {
    for (const f of stimulusFiles(s)) {
      const abs = resolve10(specDir, f);
      const hit = [...changedAbs].some((c) => c === abs || c.startsWith(`${abs}/`));
      if (hit)
        add(s.id, { kind: "stimulus-changed", detail: f });
    }
  }
  const sectionsFor = /* @__PURE__ */ new Map();
  const load2 = (abs) => {
    if (sectionsFor.has(abs))
      return sectionsFor.get(abs);
    const parsed = existsSync16(abs) ? parseSections(readFileSync15(abs, "utf8")) : null;
    sectionsFor.set(abs, parsed);
    return parsed;
  };
  const coversIndex = /* @__PURE__ */ new Map();
  for (const s of scenarios) {
    for (const raw of s.covers ?? []) {
      const ref = parseCoversRef(raw);
      const abs = resolve10(specDir, ref.file);
      const key = ref.slug === void 0 ? abs : `${abs}#${ref.slug}`;
      coversIndex.set(key, [...coversIndex.get(key) ?? [], s.id]);
    }
  }
  const skillRoot = dirname6(specDir);
  const isInstructionText = (abs) => abs.startsWith(`${skillRoot}/`) && !abs.startsWith(`${specDir}/`) && /\.(?:md|markdown)$/i.test(abs);
  const unmappedFiles = /* @__PURE__ */ new Set();
  for (const hunk of hunks) {
    const abs = resolve10(repoRoot, hunk.file);
    const referenced = [...coversIndex.keys()].some((k) => k === abs || k.startsWith(`${abs}#`));
    if (!referenced) {
      if (isInstructionText(abs)) {
        return selectAll(`${relative4(repoRoot, abs) || hunk.file} is instruction text that no scenario \`covers\` \u2014 the mapping cannot rule it out`);
      }
      continue;
    }
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
import { existsSync as existsSync17, readFileSync as readFileSync16, writeFileSync as writeFileSync7 } from "node:fs";
import { join as join22 } from "node:path";
function planAdjudication(input) {
  const enabled = new Set(input.enabled ?? ["ambiguous", "contradictory", "non_unanimous", "ship_deciding"]);
  const decisions = [];
  for (const cell of input.cells) {
    const triggers = [];
    if (enabled.has("ambiguous") && (cell.verdict === "JUDGE-AMBIGUOUS" || cell.verdict === "ERROR")) {
      triggers.push("ambiguous");
    }
    if (enabled.has("contradictory") && cell.suspect && cell.verdict !== "JUDGE-AMBIGUOUS" && cell.verdict !== "ERROR") {
      triggers.push("contradictory");
    }
    if (enabled.has("non_unanimous") && isNonUnanimous(cell))
      triggers.push("non_unanimous");
    if (enabled.has("ship_deciding") && flipsShipDecision(cell, input))
      triggers.push("ship_deciding");
    decisions.push({ id: cell.id, triggers });
  }
  const suspectById = new Map(input.cells.map((c) => [c.id, c.suspect]));
  const fired = decisions.filter((d) => d.triggers.length > 0);
  const needsTieBreak = input.tieBreakAvailable ? [] : fired.filter((d) => suspectById.get(d.id)).map((d) => d.id);
  const triggered = fired.map((d) => d.id);
  const perCell = input.tieBreakAvailable ? 2 : 1;
  return { decisions, triggered, needsTieBreak, maxAdditionalCalls: triggered.length * perCell };
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
function boundAdjudicationToRepetitions(result, scenario, adj) {
  const criticalAggregate = (result.reps ?? 1) > 1 && effectiveThreshold(result, scenario) === 1;
  return criticalAggregate && result.judge_verdict !== "PASS" && adj.verdict === "PASS" ? { ...adj, state: "unresolved", verdict: void 0 } : adj;
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
  const cells = cellsFromResults(opts.runDir, opts.results);
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
    if (!adj)
      return s;
    const scenario = byIdScenario.get(s.id);
    const boundedAdj = scenario ? boundAdjudicationToRepetitions(s, scenario, adj) : adj;
    const projected = projectAdjudication(s, boundedAdj);
    if (boundedAdj !== adj) {
      projected.judge_reason = `${adj.judgments.length} judgments on one transcript cannot replace a critical all-repetitions aggregate`;
    }
    const extraCalls = adj.judgments.filter((judgment) => judgment.ordinal > 1).length;
    projected.metrics = mergeScenarioMetrics(s.metrics, {
      wall_time_ms: 0,
      judge_calls: extraCalls,
      judge_rejudge_calls: extraCalls,
      subject_metrics_reps: 0,
      total_reps: s.metrics?.total_reps ?? s.reps ?? 1
    });
    return rebuildScenarioResult(projected, s, { objective: "carry", adjudication: "fresh" });
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
  const transcript = readFileSync16(join22(opts.runDir, files[0]), "utf8");
  const prompt = buildJudgePrompt({
    skill: opts.spec.skill,
    persona: opts.spec.judge_persona,
    scenario: opts.scenario,
    transcript
  });
  const g = await judgeInWorkspace(opts.adapter, opts.judge, prompt, opts.specDir);
  const rep = repIndexOf(files[0]) ?? void 0;
  const base = judgeRawPath(opts.runDir, opts.scenario.id, opts.mode, rep);
  const nth = existsSync17(base.replace(/\.judge\.txt$/, ".judge2.txt")) ? 3 : 2;
  writeFileSync7(base.replace(/\.judge\.txt$/, `.judge${nth}.txt`), g.raw, "utf8");
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
function cellsFromResults(runDir, results) {
  return results.scenarios.map((s) => ({
    id: s.id,
    verdict: s.judge_verdict,
    reason: s.judge_reason,
    suspect: s.suspect,
    repVerdicts: repVerdictsOf(runDir, s, results.mode)
  }));
}
function repVerdictsOf(runDir, s, mode) {
  if (!s.reps || s.reps < 2)
    return void 0;
  const out = [];
  for (let rep = 0; rep < s.reps; rep++) {
    const path = judgeRawPath(runDir, s.id, mode, rep);
    if (!existsSync17(path)) {
      out.push("ERROR");
      continue;
    }
    out.push(parseVerdict(readFileSync16(path, "utf8")).verdict);
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
  const stuck = plan.needsTieBreak.length ? [
    `  ${plan.needsTieBreak.length} of those cannot be SETTLED by this plan: ${plan.needsTieBreak.join(", ")}`,
    "    (their first judgment misfired, so one more judge cannot reach two clean votes \u2014 the call",
    "     buys a second opinion to resolve by hand; add a tie-break judge to settle them outright)"
  ] : [];
  if (plan.triggered.length === 0) {
    return ["adjudication: no cell triggered \u2014 no additional judge calls", ...stuck].join("\n");
  }
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
  return [...lines, ...stuck].join("\n");
}

// packages/core/dist/qualification-config.js
import { execFileSync as execFileSync3 } from "node:child_process";
import { createHash as createHash8 } from "node:crypto";
import { lstatSync, readFileSync as readFileSync17, realpathSync as realpathSync2 } from "node:fs";
import { isAbsolute as isAbsolute7, join as join23 } from "node:path";

// packages/core/dist/qualification-store.js
import { randomBytes } from "node:crypto";
import { closeSync, constants, existsSync as existsSync18, fsyncSync, linkSync, lstatSync as lstatSync2, mkdirSync as mkdirSync5, openSync, readFileSync as readFileSync18, readdirSync as readdirSync11, realpathSync as realpathSync3, renameSync as renameSync4, rmSync as rmSync3, unlinkSync as unlinkSync2, writeFileSync as writeFileSync8 } from "node:fs";
import { dirname as dirname7, extname as extname2, join as join24, resolve as resolve11 } from "node:path";

// packages/core/dist/qualification-runner.js
import { spawn as spawn2 } from "node:child_process";
import { randomBytes as randomBytes2 } from "node:crypto";
import { closeSync as closeSync2, constants as constants2, existsSync as existsSync19, fsyncSync as fsyncSync2, linkSync as linkSync2, lstatSync as lstatSync3, mkdirSync as mkdirSync6, openSync as openSync2, readFileSync as readFileSync19, readdirSync as readdirSync12, realpathSync as realpathSync4, renameSync as renameSync5, rmSync as rmSync4, unlinkSync as unlinkSync3, writeFileSync as writeFileSync9, writeSync } from "node:fs";
import { dirname as dirname8, isAbsolute as isAbsolute8, join as join25 } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { setTimeout as sleep } from "node:timers/promises";

// packages/adapters/dist/pi.js
import { existsSync as existsSync20, mkdtempSync as mkdtempSync2, readFileSync as readFileSync21, statSync as statSync9 } from "node:fs";
import { tmpdir as tmpdir2, homedir as homedir2 } from "node:os";
import { join as join27, resolve as resolve12 } from "node:path";

// packages/adapters/dist/pi-json.js
import { spawn as spawn3 } from "node:child_process";
import { createInterface } from "node:readline";
var SKIPPED_TYPE_RE = /^\s*\{\s*"type"\s*:\s*"(?:message_update|tool_execution_update)"/;
var MAX_STDERR_CHARS = 8e3;
function runPiJson(opts) {
  return new Promise((resolve15, reject) => {
    const child2 = spawn3("pi", opts.args, {
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
      child2.kill("SIGKILL");
      reject(new Error(`pi --mode json timed out after ${opts.timeoutMs}ms`));
    }, opts.timeoutMs);
    const rl = createInterface({ input: child2.stdout, crlfDelay: Infinity });
    rl.on("line", (line) => {
      if (!line.trim())
        return;
      if (SKIPPED_TYPE_RE.test(line))
        return;
      kept.push(line);
      if (providerFailure === null)
        providerFailure = providerFailureFromJsonLine(line);
    });
    child2.stderr.on("data", (chunk) => {
      if (stderr.length < MAX_STDERR_CHARS)
        stderr += chunk.toString("utf8");
    });
    child2.on("error", (err) => {
      if (settled)
        return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child2.on("close", (code) => {
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
      resolve15({ ...parsed, code, stderr: stderr.slice(0, MAX_STDERR_CHARS), providerFailure });
    });
  });
}

// packages/adapters/dist/trajectory.js
import { createHash as createHash9 } from "node:crypto";
import { readFileSync as readFileSync20, readdirSync as readdirSync13 } from "node:fs";
import { join as join26 } from "node:path";

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
  "propertyNames"
]);
var KEYWORD_SHAPES = {
  $ref: { check: (value) => typeof value === "string", expected: "a string" },
  oneOf: { check: (value) => Array.isArray(value) && value.length > 0, expected: "a non-empty array" },
  allOf: { check: (value) => Array.isArray(value) && value.length > 0, expected: "a non-empty array" },
  anyOf: { check: (value) => Array.isArray(value) && value.length > 0, expected: "a non-empty array" },
  if: { check: (value) => isSchemaObject(value), expected: "a schema object" },
  then: { check: (value) => isSchemaObject(value), expected: "a schema object" },
  propertyNames: { check: (value) => isSchemaObject(value), expected: "a schema object" },
  type: { check: (value) => typeof value === "string" || Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === "string"), expected: "a string or array of strings" },
  properties: { check: (value) => isSchemaObject(value), expected: "an object" },
  required: { check: (value) => Array.isArray(value) && value.every((entry) => typeof entry === "string"), expected: "an array of strings" },
  additionalProperties: { check: (value) => typeof value === "boolean" || isSchemaObject(value), expected: "a boolean or a schema object" },
  items: { check: (value) => isSchemaObject(value), expected: "a schema object" },
  enum: { check: (value) => Array.isArray(value) && value.length > 0, expected: "a non-empty array" },
  minLength: { check: (value) => typeof value === "number", expected: "a number" },
  maxLength: { check: (value) => typeof value === "number", expected: "a number" },
  minimum: { check: (value) => typeof value === "number", expected: "a number" },
  pattern: { check: (value) => typeof value === "string", expected: "a string" },
  format: { check: (value) => typeof value === "string", expected: "a string" }
  // `const` may legitimately be any JSON value, including null.
};
var SUPPORTED_FORMATS = /* @__PURE__ */ new Set(["date-time"]);
var SUPPORTED_TYPES = /* @__PURE__ */ new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);
function assertSupportedSchema(schema2, label, path = "#") {
  assertSchemaSupported(schema2, label, path, false);
}
function assertSupportedSchemaV3(schema2, label, path = "#") {
  assertSchemaSupported(schema2, label, path, true);
}
function assertSchemaSupported(schema2, label, path, v3) {
  if (typeof schema2 !== "object" || schema2 === null || Array.isArray(schema2)) {
    throw new Error(`${label} is not a JSON Schema object at ${path}`);
  }
  const node = schema2;
  const supported = v3 ? V3_SUPPORTED_KEYWORDS : SUPPORTED_KEYWORDS;
  for (const keyword of Object.keys(node)) {
    if (!supported.has(keyword)) {
      throw new Error(`${label} uses unsupported JSON Schema keyword \`${keyword}\` at ${path}; the closed-contract evaluator refuses to validate less than the schema declares`);
    }
    const shape = KEYWORD_SHAPES[keyword];
    if (shape && !shape.check(node[keyword])) {
      throw new Error(`${label} declares \`${keyword}\` at ${path} as something other than ${shape.expected}; the closed-contract evaluator refuses to skip a keyword it cannot read`);
    }
  }
  if (node.format !== void 0 && !SUPPORTED_FORMATS.has(String(node.format))) {
    throw new Error(`${label} uses unsupported format \`${String(node.format)}\` at ${path}`);
  }
  for (const type2 of typeList(node)) {
    if (!SUPPORTED_TYPES.has(type2))
      throw new Error(`${label} uses unsupported type \`${type2}\` at ${path}`);
  }
  if (node.$ref !== void 0) {
    if (!/^#\/\$defs\/[A-Za-z0-9_]+$/.test(String(node.$ref))) {
      throw new Error(`${label} uses unsupported $ref \`${String(node.$ref)}\` at ${path}; only #/$defs/<name> is resolvable`);
    }
    const siblings = Object.keys(node).filter((keyword) => keyword !== "$ref" && !ANNOTATION_KEYWORDS.has(keyword));
    if (siblings.length > 0) {
      throw new Error(`${label} combines $ref with ${siblings.map((keyword) => `\`${keyword}\``).join(", ")} at ${path}; the closed-contract evaluator would drop the sibling constraint, so it refuses the schema instead`);
    }
  }
  for (const [name, entry] of Object.entries(object(node.$defs) ?? {}))
    assertSchemaSupported(entry, label, `${path}/$defs/${name}`, v3);
  for (const keyword of ["oneOf", "allOf", "anyOf"]) {
    for (const [index, entry] of (Array.isArray(node[keyword]) ? node[keyword] : []).entries()) {
      assertSchemaSupported(entry, label, `${path}/${keyword}/${index}`, v3);
    }
  }
  for (const [name, entry] of Object.entries(object(node.properties) ?? {}))
    assertSchemaSupported(entry, label, `${path}/properties/${name}`, v3);
  for (const keyword of ["items", "propertyNames", "if", "then"]) {
    if (node[keyword] !== void 0)
      assertSchemaSupported(node[keyword], label, `${path}/${keyword}`, v3);
  }
  if (node.additionalProperties !== void 0 && node.additionalProperties !== false && node.additionalProperties !== true) {
    assertSchemaSupported(node.additionalProperties, label, `${path}/additionalProperties`, v3);
  }
}
function validateClosedSchema(schema2, value, options = {}) {
  return validate(schema2, schema2, value, "", options.knownFieldNames ?? /* @__PURE__ */ new Set());
}
function validateClosedSchemaV3(schema2, value, options = {}) {
  return validate(schema2, schema2, value, "", options.knownFieldNames ?? /* @__PURE__ */ new Set());
}
function declaredPropertyNames(schema2) {
  const names = /* @__PURE__ */ new Set();
  const walk2 = (node) => {
    const current = object(node);
    if (!current)
      return;
    for (const [name, entry] of Object.entries(object(current.properties) ?? {})) {
      names.add(name);
      walk2(entry);
    }
    for (const entry of Object.values(object(current.$defs) ?? {}))
      walk2(entry);
    for (const keyword of ["oneOf", "allOf", "anyOf"]) {
      for (const entry of Array.isArray(current[keyword]) ? current[keyword] : [])
        walk2(entry);
    }
    for (const keyword of ["items", "propertyNames", "if", "then"])
      if (current[keyword] !== void 0)
        walk2(current[keyword]);
    if (current.additionalProperties && typeof current.additionalProperties === "object")
      walk2(current.additionalProperties);
  };
  walk2(schema2);
  return names;
}
function validate(root, schema2, value, path, known) {
  if (schema2.$ref !== void 0) {
    const resolved = resolveRef(root, String(schema2.$ref));
    return validate(root, resolved, value, path, known);
  }
  const violations = [];
  if (Array.isArray(schema2.allOf)) {
    for (const branch of schema2.allOf)
      violations.push(...validate(root, branch, value, path, known));
  }
  if (Array.isArray(schema2.anyOf)) {
    const branches = schema2.anyOf.map((branch) => validate(root, branch, value, path, known));
    if (!branches.some((branch) => branch.length === 0))
      violations.push(...bestBranch(root, schema2.anyOf, branches, value, path));
  }
  if (schema2.if !== void 0 && validate(root, schema2.if, value, path, known).length === 0 && schema2.then !== void 0) {
    violations.push(...validate(root, schema2.then, value, path, known));
  }
  const types2 = typeList(schema2);
  if (types2.length && !types2.some((type2) => matchesType(type2, value))) {
    return [{ path, message: `must be ${describeTypes(types2)}` }];
  }
  if (schema2.const !== void 0 && !sameJson(schema2.const, value)) {
    return [{ path, message: `must be ${JSON.stringify(schema2.const)}` }];
  }
  if (Array.isArray(schema2.enum) && !schema2.enum.some((allowed) => sameJson(allowed, value))) {
    return [{ path, message: `must be one of ${schema2.enum.map((allowed) => stringifyAllowed(allowed)).join(", ")}` }];
  }
  if (Array.isArray(schema2.oneOf)) {
    const branches = schema2.oneOf.map((branch) => validate(root, branch, value, path, known));
    const matched = branches.filter((branch) => branch.length === 0).length;
    if (matched === 0)
      return bestBranch(root, schema2.oneOf, branches, value, path);
    if (matched > 1)
      return [{ path, message: `matches ${matched} of the ${branches.length} allowed shapes and is therefore ambiguous` }];
  }
  if (typeof value === "string")
    violations.push(...validateString(schema2, value, path));
  if (typeof value === "number")
    violations.push(...validateNumber(schema2, value, path));
  if (Array.isArray(value) && schema2.items !== void 0) {
    value.forEach((entry, index) => violations.push(...validate(root, schema2.items, entry, `${path}[${index}]`, known)));
  }
  const record = object(value);
  if (record)
    violations.push(...validateObject(root, schema2, record, path, known));
  return violations;
}
function validateObject(root, schema2, record, path, known) {
  const violations = [];
  const properties = object(schema2.properties) ?? {};
  if (schema2.propertyNames !== void 0) {
    for (const name of Object.keys(record))
      violations.push(...validate(root, schema2.propertyNames, name, path, known));
  }
  for (const name of Array.isArray(schema2.required) ? schema2.required : []) {
    if (!Object.hasOwn(record, name))
      violations.push({ path: child(path, name), message: "is required" });
  }
  for (const [name, entry] of Object.entries(record)) {
    if (entry === void 0)
      continue;
    const propertySchema = Object.hasOwn(properties, name) ? object(properties[name]) : void 0;
    if (propertySchema) {
      violations.push(...validate(root, propertySchema, entry, child(path, name), known));
      continue;
    }
    if (schema2.additionalProperties === false) {
      violations.push({
        path: path || "(top level)",
        message: `carries undeclared field ${known.has(name) ? name : "[REDACTED field name]"}, which the closed contract does not allow`
      });
      continue;
    }
    const extra = typeof schema2.additionalProperties === "object" && schema2.additionalProperties !== null ? schema2.additionalProperties : void 0;
    if (extra)
      violations.push(...validate(root, extra, entry, child(path, name), known));
  }
  return violations;
}
function validateString(schema2, value, path) {
  const violations = [];
  if (typeof schema2.minLength === "number" && value.length < schema2.minLength) {
    violations.push({ path, message: schema2.minLength === 1 ? "must not be empty" : `must be at least ${schema2.minLength} characters` });
  }
  if (typeof schema2.maxLength === "number" && value.length > schema2.maxLength) {
    violations.push({ path, message: `must be at most ${schema2.maxLength} characters` });
  }
  if (typeof schema2.pattern === "string" && !new RegExp(schema2.pattern).test(value)) {
    violations.push({ path, message: `must match ${schema2.pattern}` });
  }
  if (schema2.format === "date-time" && !isRfc3339(value)) {
    violations.push({ path, message: "must be an RFC 3339 date-time" });
  }
  return violations;
}
function validateNumber(schema2, value, path) {
  if (typeof schema2.minimum === "number" && value < schema2.minimum) {
    return [{ path, message: `must be >= ${schema2.minimum}` }];
  }
  return [];
}
function bestBranch(root, schemas, branches, value, path) {
  const discriminated = schemas.map((schema2, index) => ({ schema: schema2, violations: branches[index] })).filter(({ schema: schema2 }) => matchesDiscriminator(root, schema2, value));
  const candidates = discriminated.length === 1 ? [discriminated[0].violations] : branches;
  let best = candidates[0] ?? [];
  for (const branch of candidates)
    if (branch.length < best.length)
      best = branch;
  return best.length ? best : [{ path, message: "does not match any allowed shape" }];
}
function matchesDiscriminator(root, schema2, value) {
  const resolved = schema2.$ref !== void 0 ? resolveRef(root, String(schema2.$ref)) : schema2;
  const record = object(value);
  const properties = object(resolved.properties);
  if (!record || !properties)
    return false;
  const required = new Set(Array.isArray(resolved.required) ? resolved.required : []);
  const consts = Object.entries(properties).filter(([name]) => required.has(name)).map(([name, entry]) => [name, object(entry)?.const]).filter(([, constant]) => constant !== void 0);
  return consts.length > 0 && consts.every(([name, constant]) => sameJson(constant, record[name]));
}
function resolveRef(root, ref) {
  const name = ref.replace("#/$defs/", "");
  const resolved = object((object(root.$defs) ?? {})[name]);
  if (!resolved)
    throw new Error(`unresolvable $ref ${ref} in pinned schema`);
  return resolved;
}
function typeList(schema2) {
  if (typeof schema2.type === "string")
    return [schema2.type];
  if (Array.isArray(schema2.type))
    return schema2.type.map(String);
  return [];
}
function matchesType(type2, value) {
  switch (type2) {
    case "object":
      return object(value) !== void 0;
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    default:
      return false;
  }
}
function describeTypes(types2) {
  const article = (type2) => ["object", "array", "integer"].includes(type2) ? `an ${type2}` : `a ${type2}`;
  if (types2.length === 1)
    return types2[0] === "null" ? "null" : article(types2[0]);
  return types2.map((type2) => type2 === "null" ? "null" : article(type2)).join(" or ");
}
function stringifyAllowed(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}
function child(path, name) {
  const safe = /^[A-Za-z0-9_.:-]{1,64}$/.test(name) && redactText(name) === name ? name : "[REDACTED key]";
  if (safe === "[REDACTED key]")
    return path ? `${path}[REDACTED key]` : "[REDACTED key]";
  if (!path)
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(safe) ? safe : `[${JSON.stringify(safe)}]`;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(safe) ? `${path}.${safe}` : `${path}[${JSON.stringify(safe)}]`;
}
function sameJson(left, right) {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}
function isRfc3339(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match)
    return false;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 60)
    return false;
  if (match[8] !== void 0 && (Number(match[8]) > 23 || Number(match[9]) > 59))
    return false;
  return day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function isSchemaObject(value) {
  return object(value) !== void 0;
}

// packages/adapters/dist/pi-daddy-ledger-v2.js
var PI_DADDY_CONTRACT_COMMIT = "c364a6717e3d5e369ecd3298b9cbb595eb94d9b2";
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
var PI_DADDY_LEDGER_V3_CONTRACT_COMMIT = "591abb4a358bf8a84455486812b83609e2a47e3f";
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
      "description": "Opaque, non-authoritative controller metadata. String and aggregate byte limits are additionally enforced by the runtime and cannot be represented exactly in JSON Schema.",
      "properties": {
        "schema_version": {
          "$ref": "#/$defs/ledgerCorrelationIdentifier"
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
              "type": "object"
            },
            {
              "type": "array"
            },
            {
              "type": "string"
            },
            {
              "type": "number"
            },
            {
              "type": "boolean"
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
function collectTrajectorySources(cwd, sources) {
  const files = walkFiles(cwd);
  const streams = [];
  const errors = [];
  const seenFiles = /* @__PURE__ */ new Set();
  for (const source of sources) {
    const matched = files.filter((file) => matchesGlob(source.path, file));
    if (matched.length === 0) {
      if (source.required)
        errors.push(`required event source ${source.adapter}:${source.path} is missing`);
      continue;
    }
    for (const file of matched.sort()) {
      const sourceFile = `${source.adapter}:${file}`;
      if (seenFiles.has(sourceFile)) {
        errors.push(`event source ${sourceFile} was declared more than once`);
        continue;
      }
      seenFiles.add(sourceFile);
      try {
        const text = readFileSync20(join26(cwd, file), "utf8");
        const normalized = source.adapter === "principal-assurance-v1" ? normalizePrincipalAssuranceLedger(text) : source.adapter === "pi-daddy-v1" ? normalizePiDaddyLegacyLedger(text) : source.adapter === "pi-daddy-ledger-v3" ? normalizePiDaddyLedgerV3(text) : deserializeTrajectoryEvents(text);
        if (!normalized)
          throw new Error("normalized-v1 source is empty, malformed, or unsupported");
        const times = normalized.map((event) => validTime(event.at) ? Date.parse(event.at) : null);
        if (times.every((time) => time !== null)) {
          const highWaterByStream = /* @__PURE__ */ new Map();
          for (let index = 0; index < times.length; index += 1) {
            const stream = source.adapter === "pi-daddy-v1" || source.adapter === "pi-daddy-ledger-v3" ? normalizedPiDaddyStreamKey(normalized[index], index) : "source";
            const highWater = highWaterByStream.get(stream);
            if (highWater !== void 0 && times[index] < highWater && !isAllowedPiDaddyReceiptInversion(source.adapter, normalized, index)) {
              throw new Error("native event timestamps move backwards relative to the source's recorded sequence");
            }
            highWaterByStream.set(stream, Math.max(highWater ?? times[index], times[index]));
          }
        }
        streams.push({ file, adapter: source.adapter, events: normalized });
      } catch (error) {
        errors.push(`${source.adapter}:${file}: ${sanitizePersistedError(error)}`);
      }
    }
  }
  if (streams.length > 1) {
    if (streams.some((stream) => stream.events.some((event) => !validTime(event.at)))) {
      errors.push("multiple native event files cannot be globally ordered because at least one event has no valid `at` timestamp");
    }
    const owners = /* @__PURE__ */ new Map();
    for (const stream of streams)
      for (const event of stream.events) {
        if (!event.at)
          continue;
        const instant = String(Date.parse(event.at));
        const filesAtTime = owners.get(instant) ?? /* @__PURE__ */ new Set();
        filesAtTime.add(stream.file);
        owners.set(instant, filesAtTime);
      }
    if ([...owners.values()].some((filesAtTime) => filesAtTime.size > 1)) {
      errors.push("native event files contain equal timestamps, so strict cross-source order is ambiguous");
    }
    const principalRuns = /* @__PURE__ */ new Map();
    for (const stream of streams.filter((entry) => entry.adapter === "principal-assurance-v1")) {
      for (const runId of new Set(stream.events.map((event) => event.run_id).filter((value) => Boolean(value)))) {
        const prior = principalRuns.get(runId);
        if (prior && prior !== stream.file)
          errors.push(`principal assurance run ${runId} appears in multiple ledger files (${prior}, ${stream.file})`);
        else
          principalRuns.set(runId, stream.file);
      }
    }
  }
  return { events: resequence(streams.flatMap((stream) => stream.events)), errors };
}
function resequence(events) {
  const native = events.map((event, index) => ({
    event,
    index,
    at: validTime(event.at) ? Date.parse(event.at) : null
  }));
  if (native.every((entry) => entry.at !== null))
    native.sort((a, b) => a.at - b.at || a.index - b.index);
  return native.map(({ event }, index) => ({
    ...event,
    seq: index + 1,
    attributes: { native_seq: event.seq, ...event.attributes ?? {} }
  }));
}
function normalizePiTraces(traces) {
  const events = [];
  let seq2 = 1;
  for (const trace of [...traces].sort((a, b) => a.turn - b.turn)) {
    const base = { scenario_id: trace.scenario_id, rep: trace.rep, turn: trace.turn };
    const calls = [...trace.tool_calls].sort((a, b) => a.issueIndex - b.issueIndex);
    for (const call of calls) {
      events.push({
        event_version: TRAJECTORY_EVENT_VERSION,
        seq: seq2++,
        type: "tool_started",
        source: "pi",
        at: call.started_at,
        tool: call.name,
        attributes: { ...base, tool_call_id: call.id, args: call.args, issue_index: call.issueIndex }
      });
    }
    for (const call of calls.filter((item) => item.completionIndex >= 0).sort((a, b) => a.completionIndex - b.completionIndex)) {
      events.push({
        event_version: TRAJECTORY_EVENT_VERSION,
        seq: seq2++,
        type: "tool_completed",
        source: "pi",
        at: call.completed_at,
        tool: call.name,
        attributes: {
          ...base,
          tool_call_id: call.id,
          success: !call.isError,
          issue_index: call.issueIndex,
          completion_index: call.completionIndex,
          result_sha256: call.result.sha256,
          ...call.result.details ? { details: call.result.details } : {}
        }
      });
    }
  }
  return events;
}
function normalizePrincipalAssuranceLedger(text) {
  const records = parseJsonl(text, "principal assurance");
  validatePrincipalIntegrity(records);
  return records.map((record, index) => {
    if (record.schema_version !== "1.0") {
      throw new Error(`unsupported principal assurance schema version ${safeDiagnosticValue(record.schema_version)} at line ${index + 1}; expected "1.0"`);
    }
    if (!Number.isInteger(record.seq) || Number(record.seq) < 1 || typeof record.type !== "string" || typeof record.run_id !== "string") {
      throw new Error(`invalid principal assurance v1 event at line ${index + 1}: seq, type, and run_id are required`);
    }
    const packet = object2(record.packet);
    const definitionDigests = object2(packet?.definition_digests);
    const definition = typeof record.definition_digest === "string" ? record.definition_digest : typeof definitionDigests?.["skill:build"] === "string" ? definitionDigests["skill:build"] : void 0;
    const taskId = string(record.task_id) ?? string(packet?.task_id);
    const workspaceId = string(record.workspace_id) ?? string(packet?.workspace_id);
    const plan = string(record.plan_digest) ?? string(packet?.plan_digest);
    const head = string(record.head_sha);
    const tree = string(record.tree_sha);
    const attributes = without(record, [
      "schema_version",
      "seq",
      "type",
      "at",
      "run_id",
      "task_id",
      "workspace_id",
      "context_id",
      "finding_id",
      "phase",
      "plan_digest",
      "definition_digest",
      "head_sha",
      "tree_sha",
      "exit_code"
    ]);
    return cleanEvent({
      event_version: TRAJECTORY_EVENT_VERSION,
      seq: Number(record.seq),
      type: record.type,
      source: "principal-assurance-v1",
      at: string(record.at),
      run_id: record.run_id,
      task_id: taskId,
      workspace_id: workspaceId,
      context_id: string(record.context_id),
      finding_id: string(record.finding_id),
      phase: string(record.phase),
      exit_code: Number.isInteger(record.exit_code) ? Number(record.exit_code) : void 0,
      digests: anyDefined({ plan, definition, head, tree }),
      requirements: stringArray(record.requirements),
      attributes: sanitizeAttributes(attributes)
    });
  });
}
function normalizePiDaddyLegacyLedger(text) {
  const records = parseJsonl(text, "pi-daddy");
  const explicitV3 = records.findIndex((record) => record.ledgerVersion === 3);
  if (explicitV3 >= 0)
    throw new Error(`pi-daddy-v1 selector does not admit ledgerVersion 3 at line ${explicitV3 + 1}; use pi-daddy-ledger-v3`);
  return normalizePiDaddyLedger(text);
}
function normalizePiDaddyLedgerV3(text) {
  const records = parseJsonl(text, "pi-daddy");
  const wrong = records.findIndex((record) => record.ledgerVersion !== 3);
  if (wrong >= 0)
    throw new Error(`pi-daddy-ledger-v3 requires explicit ledgerVersion 3 at line ${wrong + 1}`);
  return normalizePiDaddyLedger(text);
}
function normalizePiDaddyLedger(text) {
  const records = parseJsonl(text, "pi-daddy");
  validatePiDaddyTimestampOrder(records);
  const out = [];
  let seq2 = 1;
  records.forEach((record, index) => {
    if (record.ledgerVersion !== void 0) {
      if (record.ledgerVersion === 2) {
        requireV2Discriminator(record, index + 1);
        assertPinnedV2Contract(record, index + 1);
        for (const event of normalizePiDaddyV2(record, index))
          out.push({ ...event, seq: seq2++ });
        return;
      }
      if (record.ledgerVersion === 3) {
        requireV3Discriminator(record, index + 1);
        assertPinnedV3Contract(record, index + 1);
        for (const event of normalizePiDaddyV3(record, index))
          out.push({ ...event, seq: seq2++ });
        return;
      }
      throw new Error(`unsupported pi-daddy ledgerVersion ${safeDiagnosticValue(record.ledgerVersion)} at line ${index + 1}; expected 2, 3, or an unversioned 0.17 GrantRecord`);
    }
    if (record.schema_version !== void 0) {
      throw new Error(`pi-daddy schema_version/record_type at line ${index + 1} is not a public pi-daddy ledger format; expected ledgerVersion 2, ledgerVersion 3, or an unversioned 0.17 GrantRecord`);
    }
    if (record.event !== void 0) {
      throw new Error(`pi-daddy event [REDACTED invalid value] at line ${index + 1} is missing explicit ledgerVersion 2 or 3`);
    }
    for (const event of normalizeLegacyGrant(record, index))
      out.push({ ...event, seq: seq2++ });
  });
  return out;
}
var V2_EVENTS = /* @__PURE__ */ new Set(["capability_decision", "workspace_lease", "child_lifecycle", "check_receipt"]);
function requireV2Discriminator(record, line) {
  const nativeEvent = string(record.event);
  if (!nativeEvent || !V2_EVENTS.has(nativeEvent)) {
    throw new Error(`invalid pi-daddy v2 event at line ${line}: event must be capability_decision, workspace_lease, child_lifecycle, or check_receipt`);
  }
  return nativeEvent;
}
var pinnedContractChecked = false;
var pinnedContractFieldNames;
function assertPinnedV2Contract(record, line) {
  if (!pinnedContractChecked) {
    assertSupportedSchema(PI_DADDY_LEDGER_V2_SCHEMA, "pinned pi-daddy ledger v2 schema");
    pinnedContractFieldNames = declaredPropertyNames(PI_DADDY_LEDGER_V2_SCHEMA);
    pinnedContractChecked = true;
  }
  const violations = validateClosedSchema(PI_DADDY_LEDGER_V2_SCHEMA, record, { knownFieldNames: pinnedContractFieldNames });
  if (violations.length === 0)
    return;
  const nativeEvent = string(record.event);
  const label = nativeEvent && V2_EVENTS.has(nativeEvent) ? nativeEvent : "record";
  const [first] = violations;
  const extra = violations.length > 1 ? ` (+${violations.length - 1} more contract violation${violations.length > 2 ? "s" : ""})` : "";
  throw new Error(`invalid pi-daddy v2 ${label} at line ${line}: closed contract violation \u2014 ${first.path ? `${first.path} ` : ""}${first.message}${extra} [pi-daddy ${PI_DADDY_CONTRACT_COMMIT.slice(0, 12)}]`);
}
var V3_EVENTS = /* @__PURE__ */ new Set(["capability_decision", "workspace_lease", "child_lifecycle", "check_receipt", "workflow_fact"]);
function requireV3Discriminator(record, line) {
  const nativeEvent = string(record.event);
  if (!nativeEvent || !V3_EVENTS.has(nativeEvent)) {
    throw new Error(`invalid pi-daddy v3 event at line ${line}: event discriminator is required and must be capability_decision, workspace_lease, child_lifecycle, check_receipt, or workflow_fact`);
  }
  return nativeEvent;
}
var pinnedV3ContractChecked = false;
var pinnedV3ContractFieldNames;
function assertPinnedV3Contract(record, line) {
  if (!pinnedV3ContractChecked) {
    assertSupportedSchemaV3(PI_DADDY_LEDGER_V3_SCHEMA, "pinned pi-daddy ledger v3 schema");
    pinnedV3ContractFieldNames = declaredPropertyNames(PI_DADDY_LEDGER_V3_SCHEMA);
    pinnedV3ContractChecked = true;
  }
  const violations = validateClosedSchemaV3(PI_DADDY_LEDGER_V3_SCHEMA, record, { knownFieldNames: pinnedV3ContractFieldNames });
  if (violations.length === 0)
    return;
  const nativeEvent = string(record.event);
  const label = nativeEvent && V3_EVENTS.has(nativeEvent) ? nativeEvent : "record";
  const [first] = violations;
  const extra = violations.length > 1 ? ` (+${violations.length - 1} more contract violation${violations.length > 2 ? "s" : ""})` : "";
  throw new Error(`invalid pi-daddy v3 ${label} at line ${line}: closed contract violation \u2014 ${first.path ? `${first.path} ` : ""}${first.message}${extra} [pi-daddy ${PI_DADDY_LEDGER_V3_CONTRACT_COMMIT.slice(0, 12)}]`);
}
var V2_LEASE_OUTCOMES = /* @__PURE__ */ new Set([
  "acquired",
  "uncontended",
  "refused",
  "released",
  "released-unrecorded",
  "lost",
  "retained",
  "timeout",
  "recovered"
]);
var V2_LEASE_ACCESS = /* @__PURE__ */ new Set(["read", "write"]);
var V2_RECEIPT_PRIOR_LEASE_OUTCOMES = /* @__PURE__ */ new Set(["acquired", "recovered"]);
var V2_REFUSAL_FIELDS = /* @__PURE__ */ new Set(["code", "message", "details"]);
var V2_REFUSAL_DETAIL_TYPES = /* @__PURE__ */ new Set(["string", "number", "boolean", "null"]);
var V2_LIFECYCLE_STATES = /* @__PURE__ */ new Set(["starting", "completed", "failed"]);
var V2_EXECUTORS = /* @__PURE__ */ new Set(["process", "herdr"]);
var V2_RECEIPT_RELEASE_OUTCOMES = /* @__PURE__ */ new Set(["released", "released-unrecorded", "lost", "timeout"]);
var NORMALIZED_RECEIPT_RELEASE_EVENTS = /* @__PURE__ */ new Set([
  "writer_lease_released",
  "writer_lease_released_unrecorded",
  "writer_lease_lost",
  "writer_lease_timeout"
]);
var V2_CORRELATION_FIELDS = /* @__PURE__ */ new Set([
  "schema_version",
  "run_id",
  "task_id",
  "workspace_id",
  "context_id",
  "phase",
  "assurance",
  "assurance_effective",
  "policy_label",
  "assurance_source",
  "assurance_scope",
  "activated_at",
  "plan_digest",
  "definition_digest",
  "task_digest",
  "base_sha",
  "head_sha",
  "tree_sha",
  "event_seq",
  "last_change_seq",
  "last_authority_seq",
  "check_receipt_id"
]);
var V2_CORRELATION_NUMERIC_FIELDS = /* @__PURE__ */ new Set(["event_seq", "last_change_seq", "last_authority_seq"]);
var V2_APPROVAL_SOURCES = /* @__PURE__ */ new Set(["prompt", "session", "persisted", "inherited"]);
var V2_APPROVAL_SCOPES = /* @__PURE__ */ new Set(["once", "session", "always"]);
var V2_REFUSAL_CODES = new Set(PI_DADDY_LEDGER_V2_SCHEMA.$defs.refusalCode.enum);
var V2_CORRELATION_MAX_BYTES = 32 * 1024;
var V2_CORRELATION_MAX_FIELD_CHARS = 512;
var V2_CORRELATION_MAX_SCOPE_BYTES = 4 * 1024;
function piDaddyStreamKey(record, index) {
  if (record.ledgerVersion === void 0)
    return JSON.stringify(["legacy", string(record.childId) ?? `missing-child:${index}`]);
  if (record.ledgerVersion === 3) {
    return record.event === "workflow_fact" ? JSON.stringify(["v3-fact", string(record.factId) ?? `missing-fact:${index}`]) : JSON.stringify(["v3-execution", string(record.executionId) ?? `missing-execution:${index}`]);
  }
  const correlation = object2(record.correlation);
  return JSON.stringify([
    string(correlation?.run_id) ?? `missing-run:${index}`,
    string(correlation?.task_id) ?? `missing-task:${index}`,
    string(record.workspaceId) ?? string(correlation?.workspace_id) ?? "",
    string(record.childId) ?? `missing-child:${index}`
  ]);
}
function normalizedPiDaddyStreamKey(event, index) {
  if (event.source === "pi-daddy-0.17")
    return JSON.stringify(["legacy", event.child_id ?? `missing-child:${index}`]);
  if (event.source === "pi-daddy-v3") {
    return event.workflow_fact_id ? JSON.stringify(["v3-fact", event.workflow_fact_id]) : JSON.stringify(["v3-execution", event.execution_id ?? `missing-execution:${index}`]);
  }
  const correlation = object2(event.attributes?.correlation);
  return JSON.stringify([
    event.run_id ?? `missing-run:${index}`,
    event.task_id ?? `missing-task:${index}`,
    event.workspace_id ?? string(correlation?.workspace_id) ?? "",
    event.child_id ?? `missing-child:${index}`
  ]);
}
function sameRawCorrelationIdentity(left, right) {
  const leftCorrelation = object2(left.correlation);
  const rightCorrelation = object2(right.correlation);
  return string(leftCorrelation?.run_id) === string(rightCorrelation?.run_id) && string(leftCorrelation?.task_id) === string(rightCorrelation?.task_id);
}
function validatePiDaddyTimestampOrder(records) {
  const highWaterByChild = /* @__PURE__ */ new Map();
  records.forEach((record, index) => {
    const supportedVersion = record.ledgerVersion === 2 || record.ledgerVersion === 3;
    const legacy = record.ledgerVersion === void 0 && record.schema_version === void 0 && record.event === void 0;
    if (!supportedVersion && !legacy)
      return;
    const at = string(record.ts);
    if (!validTime(at))
      throw new Error(`invalid pi-daddy ledger timestamp at line ${index + 1}: ts must be a date-time`);
    const time = Date.parse(at);
    const child2 = piDaddyStreamKey(record, index);
    const highWater = highWaterByChild.get(child2);
    if (highWater !== void 0 && time < highWater && !isRawPiDaddyReceiptInversion(records, index, time)) {
      throw new Error(`pi-daddy ledger timestamp moves backwards at line ${index + 1}`);
    }
    highWaterByChild.set(child2, Math.max(highWater ?? time, time));
  });
}
function isRawPiDaddyReceiptInversion(records, index, receiptTime) {
  const receipt = records[index];
  const release = records[index - 1];
  if (receipt?.ledgerVersion !== 2 && receipt?.ledgerVersion !== 3 || receipt.event !== "check_receipt" || release?.ledgerVersion !== receipt.ledgerVersion || release.event !== "workspace_lease")
    return false;
  if (receipt.childId !== release.childId || receipt.workspaceId !== release.workspaceId || !sameRawCorrelationIdentity(receipt, release) || !V2_RECEIPT_RELEASE_OUTCOMES.has(string(release.outcome) ?? ""))
    return false;
  const previousLease = records.slice(0, index - 1).reverse().find((record) => record.ledgerVersion === receipt.ledgerVersion && record.event === "workspace_lease" && record.childId === receipt.childId && record.workspaceId === receipt.workspaceId && sameRawCorrelationIdentity(receipt, record));
  return Boolean(previousLease && V2_RECEIPT_PRIOR_LEASE_OUTCOMES.has(string(previousLease.outcome) ?? "") && validTime(string(previousLease.ts)) && Date.parse(string(previousLease.ts)) <= receiptTime);
}
function isAllowedPiDaddyReceiptInversion(adapter, events, index) {
  if (adapter !== "pi-daddy-v1" && adapter !== "pi-daddy-ledger-v3")
    return false;
  const receipt = events[index];
  const release = events[index - 1];
  if (receipt?.type !== "check_receipt_recorded" || !NORMALIZED_RECEIPT_RELEASE_EVENTS.has(release?.type))
    return false;
  if (receipt.child_id !== release.child_id || receipt.workspace_id !== release.workspace_id || receipt.run_id !== release.run_id || receipt.task_id !== release.task_id || !validTime(receipt.at))
    return false;
  const receiptTime = Date.parse(receipt.at);
  const previousLease = events.slice(0, index - 1).reverse().find((event) => event.attributes?.native_event === "workspace_lease" && event.child_id === receipt.child_id && event.workspace_id === receipt.workspace_id && event.run_id === receipt.run_id && event.task_id === receipt.task_id);
  return Boolean(previousLease && (/* @__PURE__ */ new Set(["writer_lease_acquired", "writer_lease_recovered"])).has(previousLease.type) && validTime(previousLease.at) && Date.parse(previousLease.at) <= receiptTime);
}
function normalizePiDaddyV2(record, index) {
  const line = index + 1;
  const nativeEvent = requireV2Discriminator(record, line);
  const at = requireV2String(record, "ts", nativeEvent, line);
  const childId = requireV2String(record, "childId", nativeEvent, line);
  const correlation = requireV2Correlation(record, nativeEvent, line);
  const carriesTopWorkspace = nativeEvent === "workspace_lease" || nativeEvent === "check_receipt";
  if (!carriesTopWorkspace && record.workspaceId !== void 0) {
    throw new Error(`invalid pi-daddy v2 ${nativeEvent} at line ${line}: workspaceId is not part of the public variant`);
  }
  const topWorkspace = carriesTopWorkspace ? string(record.workspaceId) : void 0;
  const correlationWorkspace = string(correlation.workspace_id);
  if (topWorkspace && correlationWorkspace && topWorkspace !== correlationWorkspace) {
    throw new Error(`invalid pi-daddy v2 ${nativeEvent} at line ${line}: workspaceId disagrees with correlation.workspace_id`);
  }
  if (nativeEvent !== "capability_decision" && (record.taskDigest !== void 0 || record.definitionDigest !== void 0)) {
    throw new Error(`invalid pi-daddy v2 ${nativeEvent} at line ${line}: taskDigest and definitionDigest belong only to capability_decision`);
  }
  const definition = nativeEvent === "capability_decision" ? object2(record.definitionDigest) : void 0;
  const trustedTask = nativeEvent === "capability_decision" ? string(record.taskDigest) : void 0;
  const trustedDefinition = nativeEvent === "capability_decision" ? string(definition?.sha256) : void 0;
  const common2 = {
    event_version: TRAJECTORY_EVENT_VERSION,
    source: "pi-daddy-v2",
    at,
    run_id: string(correlation.run_id),
    task_id: string(correlation.task_id),
    // correlation.workspace_id is a controller-supplied join label, not proof that
    // pi-daddy resolved or leased that workspace. Only a top-level runtime identity
    // is promoted into the adapter-neutral authoritative-looking field.
    workspace_id: topWorkspace,
    context_id: string(correlation.context_id),
    child_id: childId,
    phase: string(correlation.phase),
    digests: anyDefined({
      task: trustedTask,
      definition: trustedDefinition,
      correlation_plan: string(correlation.plan_digest),
      correlation_task: string(correlation.task_digest),
      correlation_definition: string(correlation.definition_digest),
      correlation_base: string(correlation.base_sha),
      correlation_head: string(correlation.head_sha),
      correlation_tree: string(correlation.tree_sha)
    })
  };
  const commonAttributes = safeAttributes({
    ledger_version: 2,
    native_event: nativeEvent,
    correlation: sanitizeAttributes(correlation),
    event_seq: finiteNumber(correlation.event_seq),
    last_change_seq: finiteNumber(correlation.last_change_seq),
    last_authority_seq: finiteNumber(correlation.last_authority_seq),
    check_receipt_id: string(correlation.check_receipt_id),
    assurance: string(correlation.assurance),
    assurance_effective: string(correlation.assurance_effective),
    policy_label: string(correlation.policy_label),
    assurance_source: string(correlation.assurance_source),
    assurance_scope: correlation.assurance_scope,
    activated_at: string(correlation.activated_at)
  });
  if (nativeEvent === "capability_decision") {
    if (record.definitionDigest !== void 0 && (!definition || !string(definition.name) || !string(definition.source) || !trustedDefinition || !/^[a-fA-F0-9]{64}$/.test(trustedDefinition))) {
      throw new Error(`invalid pi-daddy v2 capability_decision at line ${line}: definitionDigest requires non-empty name, source, and sha256`);
    }
    const parentId = requireV2String(record, "parentId", nativeEvent, line);
    const executor = requireV2Executor(record, nativeEvent, line);
    const taskDigest = requireV2String(record, "taskDigest", nativeEvent, line);
    if (!/^[a-fA-F0-9]{64}$/.test(taskDigest))
      throw new Error(`invalid pi-daddy v2 capability_decision at line ${line}: taskDigest must be sha256`);
    if (!Number.isInteger(record.depth) || typeof record.blocked !== "boolean") {
      throw new Error(`invalid pi-daddy v2 capability_decision at line ${line}: depth and blocked are required`);
    }
    const requested = requireV2StringArray(record, "requested", nativeEvent, line);
    const parentGrant = requireV2StringArray(record, "parentGrant", nativeEvent, line);
    const effective = requireV2StringArray(record, "effective", nativeEvent, line);
    const denied = requireV2StringArray(record, "denied", nativeEvent, line);
    const clipped = requireV2StringArray(record, "clipped", nativeEvent, line);
    const gated = requireV2StringArray(record, "gatedBlocked", nativeEvent, line);
    const approved = optionalV2StringArray(record, "approved", nativeEvent, line);
    const agentType = optionalV2SafeString(record.agentType, "agentType", nativeEvent, line);
    const humanDenied = optionalV2Boolean(record, "humanDenied", nativeEvent, line);
    const refusal = structuredRefusal(record.refusal, nativeEvent, line);
    if (!record.blocked && refusal)
      throw new Error(`invalid pi-daddy v2 capability_decision at line ${line}: an allowed decision cannot carry a refusal`);
    validateCapabilityPartition(requested, effective, denied, clipped, gated, approved, Boolean(record.blocked), line);
    const approvalSource = optionalV2Enum(record.approvalSource, "approvalSource", V2_APPROVAL_SOURCES, nativeEvent, line);
    const approvalSources = optionalV2EnumMap(record.approvalSources, "approvalSources", V2_APPROVAL_SOURCES, nativeEvent, line);
    const approvalScope = optionalV2Enum(record.approvalScope, "approvalScope", V2_APPROVAL_SCOPES, nativeEvent, line);
    const approvalScopes = optionalV2EnumMap(record.approvalScopes, "approvalScopes", V2_APPROVAL_SCOPES, nativeEvent, line);
    const approvalExpiresAt = optionalV2StringMap(record.approvalExpiresAt, "approvalExpiresAt", nativeEvent, line, validTime);
    const approvalUses = optionalV2ApprovalUses(record.approvalUses, nativeEvent, line);
    validateApprovalEvidence(approved ?? [], approvalSource, approvalSources, approvalScopes, approvalExpiresAt, approvalUses, line);
    const normalizedRequested = [...new Set(requested)];
    const attributes = safeAttributes({
      ...commonAttributes,
      depth: record.depth,
      agent_type: agentType,
      native_requested: normalizedRequested.length === requested.length ? void 0 : requested,
      executor,
      task_from: string(record.taskFrom),
      parent_grant: parentGrant,
      denied,
      clipped,
      gated_blocked: gated,
      blocked: record.blocked,
      reason: string(record.reason),
      approved,
      approval_source: approvalSource,
      approval_sources: approvalSources,
      approval_scope: approvalScope,
      approval_scopes: approvalScopes,
      approval_expires_at: approvalExpiresAt,
      approval_uses: approvalUses,
      human_denied: humanDenied,
      gate_outcome: string(record.gateOutcome),
      definition_name: string(definition?.name),
      definition_source: string(definition?.source),
      structured_refusal: refusal
    });
    const base = { ...common2, parent_id: parentId, requested_capabilities: normalizedRequested, effective_capabilities: effective, attributes };
    const refusalCode = string(refusal?.code);
    const events = [
      ...normalizedRequested.map((capability) => ({ ...base, type: "capability_requested", capability }))
    ];
    const sources = approvalSources;
    const scopes = approvalScopes;
    const expiries = approvalExpiresAt;
    const uses = approvalUses;
    for (const capability of approved ?? []) {
      events.push(cleanEvent({
        ...base,
        type: "approval_used",
        capability,
        approval: cleanObject({
          capability,
          subject: approvalSubject(agentType),
          source: string(sources?.[capability]) ?? string(record.approvalSource),
          scope: string(scopes?.[capability]) ?? string(record.approvalScope),
          expires_at: string(expiries?.[capability]),
          used_at: at
        }),
        attributes: safeAttributes({ ...attributes, approval_uses: object2(uses?.[capability]) })
      }));
    }
    const approvedSet = new Set(approved ?? []);
    events.push(...record.blocked ? [] : effective.map((capability) => ({ ...base, type: "capability_granted", capability })), ...[.../* @__PURE__ */ new Set([...denied, ...gated.filter((capability) => !approvedSet.has(capability))])].map((capability) => ({
      ...base,
      type: "capability_refused",
      capability,
      refusal_code: denied.includes(capability) ? "CAPABILITY_ESCALATION" : refusalCode
    })));
    events.push(cleanEvent({
      ...base,
      type: record.blocked ? "child_spawn_refused" : "capability_decision",
      refusal_code: refusalCode
    }));
    return events;
  }
  if (nativeEvent === "workspace_lease") {
    const workspaceId2 = requireV2String(record, "workspaceId", nativeEvent, line);
    requireV2String(record, "root", nativeEvent, line);
    const access = requireV2String(record, "access", nativeEvent, line);
    const outcome = requireV2String(record, "outcome", nativeEvent, line);
    if (!V2_LEASE_ACCESS.has(access) || !V2_LEASE_OUTCOMES.has(outcome)) {
      throw new Error(`invalid pi-daddy v2 workspace_lease at line ${line}: access or outcome is unsupported`);
    }
    if (record.recovered !== void 0 && typeof record.recovered !== "boolean" && record.recovered !== "unknown") {
      throw new Error(`invalid pi-daddy v2 workspace_lease at line ${line}: recovered must be boolean or "unknown"`);
    }
    const refusal = structuredRefusal(record.refusal, nativeEvent, line);
    const type2 = access === "read" ? `workspace_read_${outcome.replaceAll("-", "_")}` : outcome === "refused" && refusal?.code === "WORKSPACE_WRITE_CONFLICT" ? "writer_lease_conflict" : `writer_lease_${outcome.replaceAll("-", "_")}`;
    return [cleanEvent({
      ...common2,
      workspace_id: workspaceId2,
      type: type2,
      refusal_code: string(refusal?.code),
      attributes: safeAttributes({
        ...commonAttributes,
        root: string(record.root),
        access,
        outcome,
        recovered: record.recovered,
        release_reason: string(record.releaseReason),
        structured_refusal: refusal
      })
    })];
  }
  if (nativeEvent === "child_lifecycle") {
    const state = requireV2String(record, "state", nativeEvent, line);
    const executor = requireV2Executor(record, nativeEvent, line);
    if (!V2_LIFECYCLE_STATES.has(state)) {
      throw new Error(`invalid pi-daddy v2 child_lifecycle at line ${line}: state is unsupported`);
    }
    if (record.exitCode !== void 0 && record.exitCode !== null && !Number.isInteger(record.exitCode)) {
      throw new Error(`invalid pi-daddy v2 child_lifecycle at line ${line}: exitCode must be an integer or null`);
    }
    const timedOut = optionalV2Boolean(record, "timedOut", nativeEvent, line);
    const aborted = optionalV2Boolean(record, "aborted", nativeEvent, line);
    const truncated = optionalV2Boolean(record, "truncated", nativeEvent, line);
    const type2 = state === "starting" ? "child_started" : state === "completed" ? "child_completed" : "child_failed";
    return [cleanEvent({
      ...common2,
      type: type2,
      exit_code: Number.isInteger(record.exitCode) ? Number(record.exitCode) : void 0,
      attributes: safeAttributes({
        ...commonAttributes,
        state,
        executor,
        exit_code: record.exitCode,
        signal: record.signal,
        timed_out: timedOut,
        aborted,
        truncated,
        reason: string(record.reason)
      })
    })];
  }
  const workspaceId = requireV2String(record, "workspaceId", nativeEvent, line);
  const receiptId = requireV2String(record, "receiptId", nativeEvent, line);
  if (!/^[a-fA-F0-9]{64}$/.test(receiptId)) {
    throw new Error(`invalid pi-daddy v2 check_receipt at line ${line}: receiptId must be sha256`);
  }
  const checkId = requireV2String(record, "checkId", nativeEvent, line);
  const treeSha = requireV2String(record, "treeSha", nativeEvent, line);
  if (!/^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(treeSha)) {
    throw new Error(`invalid pi-daddy v2 check_receipt at line ${line}: treeSha must be a git object id`);
  }
  return [cleanEvent({
    ...common2,
    workspace_id: workspaceId,
    type: "check_receipt_recorded",
    digests: { ...common2.digests ?? {}, tree: treeSha },
    attributes: safeAttributes({
      ...commonAttributes,
      receipt_id: receiptId,
      check_id: checkId,
      check_receipt_id: string(correlation.check_receipt_id)
    })
  })];
}
function normalizePiDaddyV3(record, index) {
  const line = index + 1;
  const nativeEvent = requireV3Discriminator(record, line);
  const at = requireV3String(record, "ts", nativeEvent, line);
  const correlation = object2(record.correlation) ?? {};
  const correlationDigests = anyDefined({
    correlation_plan: string(correlation.plan_digest),
    correlation_task: string(correlation.task_digest),
    correlation_definition: string(correlation.definition_digest),
    correlation_base: string(correlation.base_sha),
    correlation_head: string(correlation.head_sha),
    correlation_tree: string(correlation.tree_sha)
  });
  const correlationAttributes = safeAttributes({
    ledger_version: 3,
    native_event: nativeEvent,
    correlation: Object.keys(correlation).length ? sanitizeAttributes(correlation) : void 0,
    event_seq: finiteNumber(correlation.event_seq),
    last_change_seq: finiteNumber(correlation.last_change_seq),
    last_authority_seq: finiteNumber(correlation.last_authority_seq),
    check_receipt_id: string(correlation.check_receipt_id),
    assurance: string(correlation.assurance),
    assurance_effective: string(correlation.assurance_effective),
    policy_label: string(correlation.policy_label),
    assurance_source: string(correlation.assurance_source),
    assurance_scope: correlation.assurance_scope,
    activated_at: string(correlation.activated_at)
  });
  if (nativeEvent === "workflow_fact") {
    return [cleanEvent({
      event_version: TRAJECTORY_EVENT_VERSION,
      type: "workflow_fact",
      source: "pi-daddy-v3",
      at,
      run_id: string(correlation.run_id),
      task_id: string(correlation.task_id),
      workspace_id: string(correlation.workspace_id),
      context_id: string(correlation.context_id),
      phase: string(correlation.phase),
      workflow_fact_id: requireV3String(record, "factId", nativeEvent, line),
      digests: correlationDigests,
      attributes: safeAttributes({
        ...correlationAttributes,
        source: string(record.source),
        provenance: string(record.provenance),
        fact_kind: string(record.kind),
        fact_subject: string(record.subject),
        fact_state: string(record.state)
      })
    })];
  }
  const executionId = requireV3String(record, "executionId", nativeEvent, line);
  const parentExecutionId = record.parentExecutionId === null ? null : requireV3String(record, "parentExecutionId", nativeEvent, line);
  if (parentExecutionId === executionId)
    throw new Error(`invalid pi-daddy v3 ${nativeEvent} at line ${line}: an execution cannot be its own parent`);
  const childId = requireV3String(record, "childId", nativeEvent, line);
  const carriesTopWorkspace = nativeEvent === "workspace_lease" || nativeEvent === "check_receipt";
  const topWorkspace = carriesTopWorkspace ? string(record.workspaceId) : void 0;
  const correlationWorkspace = string(correlation.workspace_id);
  if (topWorkspace && correlationWorkspace && topWorkspace !== correlationWorkspace) {
    throw new Error(`invalid pi-daddy v3 ${nativeEvent} at line ${line}: workspaceId disagrees with correlation.workspace_id`);
  }
  const common2 = {
    event_version: TRAJECTORY_EVENT_VERSION,
    source: "pi-daddy-v3",
    at,
    run_id: string(correlation.run_id),
    task_id: string(correlation.task_id),
    workspace_id: topWorkspace,
    context_id: string(correlation.context_id),
    child_id: childId,
    execution_id: executionId,
    parent_execution_id: parentExecutionId,
    phase: string(correlation.phase),
    digests: correlationDigests
  };
  if (nativeEvent === "capability_decision") {
    const requested = record.requested;
    const parentGrant = record.parentGrant;
    const effective = record.effective;
    const denied = record.denied;
    const clipped = record.clipped;
    const gated = record.gatedBlocked;
    const approved = record.approved;
    validateCapabilityPartition(requested, effective, denied, clipped, gated, approved, Boolean(record.blocked), line, 3);
    const approvalSources = object2(record.approvalSources);
    const approvalScopes = object2(record.approvalScopes);
    const approvalExpiresAt = object2(record.approvalExpiresAt);
    const approvalUses = object2(record.approvalUses);
    if (approvalUses && Object.values(approvalUses).some((use) => !object2(use) || !Number.isInteger(use.max) || !Number.isInteger(use.remaining) || use.max < 0 || use.remaining < 0 || use.remaining > use.max))
      throw new Error(`invalid pi-daddy v3 capability_decision at line ${line}: approvalUses requires remaining <= max integer bounds`);
    validateApprovalEvidence(approved ?? [], string(record.approvalSource), approvalSources, approvalScopes, approvalExpiresAt, approvalUses, line, 3);
    const refusal = structuredRefusal(record.refusal, nativeEvent, line, 3);
    if (!record.blocked && refusal)
      throw new Error(`invalid pi-daddy v3 capability_decision at line ${line}: an allowed decision cannot carry a refusal`);
    const definition = object2(record.definitionDigest);
    const taskDigest = requireV3String(record, "taskDigest", nativeEvent, line);
    const trustedDefinition = string(definition?.sha256);
    const normalizedRequested = [...new Set(requested)];
    const attributes = safeAttributes({
      ...correlationAttributes,
      depth: record.depth,
      agent_type: string(record.agentType),
      executor: string(record.executor),
      task_from: string(record.taskFrom),
      parent_grant: parentGrant,
      denied,
      clipped,
      gated_blocked: gated,
      blocked: record.blocked,
      reason: string(record.reason),
      approved,
      approval_source: string(record.approvalSource),
      approval_sources: approvalSources,
      approval_scope: string(record.approvalScope),
      approval_scopes: approvalScopes,
      approval_expires_at: approvalExpiresAt,
      approval_uses: approvalUses,
      human_denied: record.humanDenied,
      gate_outcome: string(record.gateOutcome),
      definition_name: string(definition?.name),
      definition_source: string(definition?.source),
      structured_refusal: refusal
    });
    const base = {
      ...common2,
      parent_id: requireV3String(record, "parentId", nativeEvent, line),
      task_from_execution_id: string(record.taskFromExecutionId),
      requested_capabilities: normalizedRequested,
      effective_capabilities: effective,
      digests: anyDefined({ ...correlationDigests, task: taskDigest, definition: trustedDefinition }),
      attributes
    };
    const refusalCode = string(refusal?.code);
    const events = normalizedRequested.map((capability) => ({ ...base, type: "capability_requested", capability }));
    for (const capability of approved ?? []) {
      events.push(cleanEvent({
        ...base,
        type: "approval_used",
        capability,
        approval: cleanObject({
          capability,
          subject: approvalSubject(record.agentType),
          source: string(approvalSources?.[capability]) ?? string(record.approvalSource),
          scope: string(approvalScopes?.[capability]) ?? string(record.approvalScope),
          expires_at: string(approvalExpiresAt?.[capability]),
          used_at: at
        }),
        attributes: safeAttributes({ ...attributes, approval_uses: object2(approvalUses?.[capability]) })
      }));
    }
    const approvedSet = new Set(approved ?? []);
    if (!record.blocked)
      events.push(...effective.map((capability) => ({ ...base, type: "capability_granted", capability })));
    events.push(...[.../* @__PURE__ */ new Set([...denied, ...gated.filter((capability) => !approvedSet.has(capability))])].map((capability) => ({
      ...base,
      type: "capability_refused",
      capability,
      refusal_code: denied.includes(capability) ? "CAPABILITY_ESCALATION" : refusalCode
    })));
    events.push(cleanEvent({ ...base, type: record.blocked ? "child_spawn_refused" : "capability_decision", refusal_code: refusalCode }));
    return events;
  }
  if (nativeEvent === "workspace_lease") {
    const workspaceId2 = requireV3String(record, "workspaceId", nativeEvent, line);
    const access = requireV3String(record, "access", nativeEvent, line);
    const outcome = requireV3String(record, "outcome", nativeEvent, line);
    const refusal = structuredRefusal(record.refusal, nativeEvent, line, 3);
    const type2 = access === "read" ? `workspace_read_${outcome.replaceAll("-", "_")}` : outcome === "refused" && refusal?.code === "WORKSPACE_WRITE_CONFLICT" ? "writer_lease_conflict" : `writer_lease_${outcome.replaceAll("-", "_")}`;
    return [cleanEvent({
      ...common2,
      workspace_id: workspaceId2,
      type: type2,
      refusal_code: string(refusal?.code),
      attributes: safeAttributes({
        ...correlationAttributes,
        root: string(record.root),
        access,
        outcome,
        recovered: record.recovered,
        release_reason: string(record.releaseReason),
        structured_refusal: refusal
      })
    })];
  }
  if (nativeEvent === "child_lifecycle") {
    const state = requireV3String(record, "state", nativeEvent, line);
    const type2 = state === "starting" ? "child_started" : state === "running" ? "child_running" : state === "completed" ? "child_completed" : "child_failed";
    return [cleanEvent({
      ...common2,
      type: type2,
      deadline_at: string(record.deadlineAt),
      exit_code: Number.isInteger(record.exitCode) ? Number(record.exitCode) : void 0,
      attributes: safeAttributes({
        ...correlationAttributes,
        state,
        executor: string(record.executor),
        exit_code: record.exitCode,
        signal: record.signal,
        timed_out: record.timedOut,
        aborted: record.aborted,
        truncated: record.truncated,
        reason: string(record.reason),
        deadline_at: string(record.deadlineAt),
        herdr_pane_id: string(record.herdrPaneId),
        herdr_agent_name: string(record.herdrAgentName)
      })
    })];
  }
  const workspaceId = requireV3String(record, "workspaceId", nativeEvent, line);
  const receiptId = requireV3String(record, "receiptId", nativeEvent, line);
  const treeSha = requireV3String(record, "treeSha", nativeEvent, line);
  if (!/^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(treeSha)) {
    throw new Error(`invalid pi-daddy v3 check_receipt at line ${line}: treeSha must be a git object id for normalized tree evidence`);
  }
  return [cleanEvent({
    ...common2,
    workspace_id: workspaceId,
    type: "check_receipt_recorded",
    digests: anyDefined({ ...correlationDigests, tree: treeSha }),
    attributes: safeAttributes({
      ...correlationAttributes,
      receipt_id: receiptId,
      check_id: string(record.checkId),
      check_receipt_id: string(correlation.check_receipt_id)
    })
  })];
}
function requireV3String(record, field, event, line) {
  const value = string(record[field]);
  if (!value)
    throw new Error(`invalid pi-daddy v3 ${event} at line ${line}: ${field} is required`);
  if (redactText(value) !== value)
    throw new Error(`invalid pi-daddy v3 ${event} at line ${line}: ${field} contains a sensitive value`);
  return value;
}
function requireV2Correlation(record, event, line) {
  const correlation = object2(record.correlation);
  if (!correlation) {
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: correlation.run_id and correlation.task_id are required for workflow joins`);
  }
  const encoded = JSON.stringify(correlation);
  if (Buffer.byteLength(encoded) > V2_CORRELATION_MAX_BYTES) {
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: correlation exceeds ${V2_CORRELATION_MAX_BYTES} bytes`);
  }
  const undeclared = Object.keys(correlation).filter((key) => !V2_CORRELATION_FIELDS.has(key));
  if (undeclared.length > 0) {
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: correlation carries fields outside the pinned schema 1.0 contract [REDACTED field names]`);
  }
  for (const [key, value] of Object.entries(correlation)) {
    if (value === void 0 || value === null)
      continue;
    if (key === "assurance_scope") {
      const size = Buffer.byteLength(JSON.stringify(value));
      if (size > V2_CORRELATION_MAX_SCOPE_BYTES) {
        throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: correlation assurance_scope exceeds ${V2_CORRELATION_MAX_SCOPE_BYTES} bytes`);
      }
      continue;
    }
    if (V2_CORRELATION_NUMERIC_FIELDS.has(key)) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: correlation ${key} must be a finite number`);
      }
      continue;
    }
    if (typeof value !== "string") {
      throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: correlation ${key} must be a string`);
    }
    if (value.length > V2_CORRELATION_MAX_FIELD_CHARS) {
      throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: correlation ${key} exceeds ${V2_CORRELATION_MAX_FIELD_CHARS} characters`);
    }
    if (redactText(value) !== value) {
      throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: correlation ${key} contains a sensitive value`);
    }
  }
  if (!string(correlation.run_id) || !string(correlation.task_id)) {
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: correlation.run_id and correlation.task_id are required for workflow joins`);
  }
  return Object.fromEntries(Object.entries(correlation).filter(([, value]) => value !== void 0 && value !== null));
}
function requireV2String(record, field, event, line) {
  const value = string(record[field]);
  if (!value)
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: ${field} is required`);
  if (redactText(value) !== value)
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: ${field} contains a sensitive value`);
  return value;
}
function requireV2Executor(record, event, line) {
  const executor = requireV2String(record, "executor", event, line);
  if (!V2_EXECUTORS.has(executor)) {
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: executor must be process or herdr`);
  }
  return executor;
}
function requireV2StringArray(record, field, event, line) {
  const value = stringArray(record[field]);
  if (!value)
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: ${field} must be an array of strings`);
  if (value.some((entry) => redactText(entry) !== entry)) {
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: ${field} contains a sensitive value`);
  }
  return value;
}
function optionalV2StringArray(record, field, event, line) {
  if (record[field] === void 0)
    return void 0;
  return requireV2StringArray(record, field, event, line);
}
function optionalV2SafeString(value, field, event, line) {
  if (value === void 0)
    return void 0;
  const parsed = string(value);
  if (!parsed)
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: ${field} must be a non-empty string`);
  if (redactText(parsed) !== parsed)
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: ${field} contains a sensitive value`);
  return parsed;
}
function optionalV2Enum(value, field, allowed, event, line) {
  if (value === void 0)
    return void 0;
  const parsed = string(value);
  if (!parsed || !allowed.has(parsed)) {
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: ${field} must be one of ${[...allowed].join(", ")}`);
  }
  return parsed;
}
function optionalV2EnumMap(value, field, allowed, event, line) {
  if (value === void 0)
    return void 0;
  const parsed = object2(value);
  if (!parsed)
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: ${field} must be an object`);
  const entries = Object.entries(parsed);
  if (entries.some(([key, entry]) => !key || typeof entry !== "string" || !allowed.has(entry))) {
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: ${field} values must be one of ${[...allowed].join(", ")}`);
  }
  return Object.fromEntries(entries);
}
function optionalV2StringMap(value, field, event, line, validate2 = () => true) {
  if (value === void 0)
    return void 0;
  const parsed = object2(value);
  if (!parsed)
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: ${field} must be an object`);
  const entries = Object.entries(parsed);
  if (entries.some(([key, entry]) => !key || typeof entry !== "string" || !validate2(entry))) {
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: ${field} must map capabilities to valid strings`);
  }
  return Object.fromEntries(entries);
}
function optionalV2ApprovalUses(value, event, line) {
  if (value === void 0)
    return void 0;
  const parsed = object2(value);
  if (!parsed)
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: approvalUses must be an object`);
  const output = {};
  for (const [capability, boundsValue] of Object.entries(parsed)) {
    const bounds2 = object2(boundsValue);
    if (!capability || !bounds2 || !Number.isInteger(bounds2.max) || !Number.isInteger(bounds2.remaining) || Number(bounds2.max) < 0 || Number(bounds2.remaining) < 0 || Number(bounds2.remaining) > Number(bounds2.max)) {
      throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: approvalUses requires integer max/remaining bounds`);
    }
    output[capability] = { max: Number(bounds2.max), remaining: Number(bounds2.remaining) };
  }
  return output;
}
function validateCapabilityPartition(requested, effective, denied, clipped, gated, approved, blocked, line, version = 2) {
  const groups = [effective, denied, clipped, gated];
  if (groups.some((values) => new Set(values).size !== values.length)) {
    throw new Error(`invalid pi-daddy v${version} capability_decision at line ${line}: result capability arrays must not contain duplicates`);
  }
  const requestedSet = new Set(requested);
  if (groups.some((values) => values.some((capability) => !requestedSet.has(capability)))) {
    throw new Error(`invalid pi-daddy v${version} capability_decision at line ${line}: effective, denied, clipped, and gatedBlocked must partition requested`);
  }
  const flattened = groups.flat();
  if (new Set(flattened).size !== flattened.length) {
    throw new Error(`invalid pi-daddy v${version} capability_decision at line ${line}: effective, denied, clipped, and gatedBlocked must be disjoint subsets of requested`);
  }
  if ((approved ?? []).some((capability) => !requestedSet.has(capability) || (blocked ? !effective.includes(capability) && !gated.includes(capability) : !effective.includes(capability)))) {
    throw new Error(`invalid pi-daddy v${version} capability_decision at line ${line}: approved capabilities must be requested and reflected in the resolved decision`);
  }
}
function validateApprovalEvidence(approved, scalarSource, sources, scopes, expiries, uses, line, version = 2) {
  const approvedSet = new Set(approved);
  for (const [field, map2] of [["approvalSources", sources], ["approvalScopes", scopes], ["approvalExpiresAt", expiries], ["approvalUses", uses]]) {
    if (map2 && Object.keys(map2).some((capability) => !approvedSet.has(capability))) {
      throw new Error(`invalid pi-daddy v${version} capability_decision at line ${line}: ${field} keys must be approved capabilities`);
    }
  }
  if (approved.some((capability) => !sources?.[capability] && !scalarSource)) {
    throw new Error(`invalid pi-daddy v${version} capability_decision at line ${line}: each approved capability requires an approval source`);
  }
  if (approved.length === 0 && (scalarSource || sources || scopes || expiries || uses)) {
    throw new Error(`invalid pi-daddy v${version} capability_decision at line ${line}: approval evidence requires approved capabilities`);
  }
}
function optionalV2Boolean(record, field, event, line) {
  const value = record[field];
  if (value === void 0)
    return void 0;
  if (typeof value !== "boolean")
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: ${field} must be boolean`);
  return value;
}
function approvalSubject(value) {
  const agentType = string(value);
  return agentType === void 0 || agentType === "delegate" ? "<delegate>" : agentType;
}
function structuredRefusal(value, event, line, version = 2) {
  if (value === void 0)
    return void 0;
  const parsed = object2(value);
  const code = string(parsed?.code);
  if (!parsed || !code || !string(parsed.message)) {
    throw new Error(`invalid pi-daddy v${version} ${event} at line ${line}: refusal requires code and message`);
  }
  if (!V2_REFUSAL_CODES.has(code)) {
    throw new Error(`invalid pi-daddy v${version} ${event} at line ${line}: refusal has unsupported code ${safeDiagnosticValue(code)}`);
  }
  const unknown = Object.keys(parsed).filter((key) => !V2_REFUSAL_FIELDS.has(key));
  if (unknown.length > 0)
    throw new Error(`invalid pi-daddy v${version} ${event} at line ${line}: refusal carries unsupported fields`);
  const details = parsed.details === void 0 ? void 0 : object2(parsed.details);
  if (parsed.details !== void 0 && (!details || Object.values(details).some((entry) => !V2_REFUSAL_DETAIL_TYPES.has(entry === null ? "null" : typeof entry)))) {
    throw new Error(`invalid pi-daddy v${version} ${event} at line ${line}: refusal.details must contain scalar values`);
  }
  return parsed;
}
function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function normalizeLegacyGrant(record, index) {
  const requiredArrays = ["requested", "parentGrant", "effective", "denied", "clipped", "gatedBlocked"];
  if (typeof record.ts !== "string" || typeof record.parentId !== "string" || typeof record.childId !== "string" || !Number.isInteger(record.depth) || typeof record.blocked !== "boolean" || typeof record.executor !== "string" || requiredArrays.some((field) => !Array.isArray(record[field]) || !record[field].every((value) => typeof value === "string"))) {
    throw new Error(`invalid unversioned pi-daddy grant record at line ${index + 1}; expected the 0.17 GrantRecord shape`);
  }
  const requested = record.requested;
  const effective = record.effective;
  const denied = record.denied;
  const gated = record.gatedBlocked;
  const digest = object2(record.definitionDigest);
  const common2 = {
    event_version: TRAJECTORY_EVENT_VERSION,
    source: "pi-daddy-0.17",
    at: record.ts,
    parent_id: record.parentId,
    child_id: record.childId
  };
  const attributes = sanitizeAttributes({
    native_record: index + 1,
    depth: record.depth,
    agent_type: record.agentType,
    executor: record.executor,
    parent_grant: record.parentGrant,
    clipped: record.clipped,
    gated_blocked: gated,
    gate_outcome: record.gateOutcome,
    human_denied: record.humanDenied === true,
    reason: record.reason,
    definition_name: digest?.name,
    legacy_schema: "pi-daddy-grant-ledger/0.17"
  });
  const refusal = record.blocked ? legacyRefusalCode(record) : void 0;
  const spawn5 = cleanEvent({
    ...common2,
    type: record.blocked ? "child_spawn_refused" : "child_started",
    requested_capabilities: requested,
    effective_capabilities: effective,
    refusal_code: refusal,
    digests: anyDefined({ definition: string(digest?.sha256) }),
    attributes
  });
  const events = [
    ...requested.map((capability) => ({ ...common2, type: "capability_requested", capability, requested_capabilities: requested, effective_capabilities: effective, attributes })),
    ...effective.map((capability) => ({ ...common2, type: "capability_granted", capability, requested_capabilities: requested, effective_capabilities: effective, attributes })),
    ...[.../* @__PURE__ */ new Set([...denied, ...gated])].map((capability) => ({ ...common2, type: "capability_refused", capability, requested_capabilities: requested, effective_capabilities: effective, refusal_code: denied.includes(capability) ? "CAPABILITY_ESCALATION" : refusal, attributes }))
  ];
  const sources = object2(record.approvalSources);
  const scopes = object2(record.approvalScopes);
  for (const capability of stringArray(record.approved) ?? []) {
    events.push(cleanEvent({
      ...common2,
      type: "approval_used",
      capability,
      approval: {
        capability,
        source: string(sources?.[capability]) ?? string(record.approvalSource),
        scope: string(scopes?.[capability]) ?? string(record.approvalScope),
        used_at: record.ts
      },
      attributes
    }));
  }
  events.push(spawn5);
  return events;
}
function legacyRefusalCode(record) {
  const denied = stringArray(record.denied) ?? [];
  const gated = stringArray(record.gatedBlocked) ?? [];
  const reason = string(record.reason) ?? "";
  if (denied.length)
    return "CAPABILITY_ESCALATION";
  if (/declares no `allowed-tools`/i.test(reason))
    return "UNDECLARED_CAPABILITIES";
  if (/unknown capabilit/i.test(reason))
    return "UNKNOWN_CAPABILITY";
  if (/depth limit/i.test(reason))
    return "DEPTH_LIMIT";
  if (/needs a task/i.test(reason))
    return "MISSING_TASK";
  if (/universal capability|cannot narrow/i.test(reason))
    return "NON_NARROWING_GRANT";
  if (gated.length) {
    if (record.humanDenied === true || record.gateOutcome === "declined")
      return "APPROVAL_DECLINED";
    if (record.gateOutcome === "no-ui")
      return "APPROVAL_NO_UI";
    if (record.gateOutcome === "dismissed")
      return "APPROVAL_DISMISSED";
    if (record.gateOutcome === "error")
      return "APPROVAL_ERROR";
    return "APPROVAL_REQUIRED";
  }
  return "LEGACY_UNCLASSIFIED";
}
function validatePrincipalIntegrity(records) {
  let previous = null;
  let previousTime = null;
  let runId = null;
  records.forEach((record, index) => {
    const line = index + 1;
    if (record.schema_version !== "1.0") {
      throw new Error(`unsupported principal assurance schema version ${safeDiagnosticValue(record.schema_version)} at line ${line}; expected "1.0"`);
    }
    if (record.seq !== line)
      throw new Error(`principal assurance integrity failure at line ${line}: sequence mismatch`);
    if (index === 0 && record.type !== "run_initialized")
      throw new Error("principal assurance integrity failure: first event must initialize the run");
    if (typeof record.run_id !== "string" || !record.run_id)
      throw new Error(`principal assurance integrity failure at line ${line}: run_id is missing`);
    if (runId === null)
      runId = record.run_id;
    else if (record.run_id !== runId)
      throw new Error(`principal assurance integrity failure at line ${line}: run_id changed`);
    if (record.prev_digest !== previous)
      throw new Error(`principal assurance integrity failure at line ${line}: previous digest mismatch`);
    if (typeof record.event_digest !== "string" || !/^[a-f0-9]{64}$/i.test(record.event_digest)) {
      throw new Error(`principal assurance integrity failure at line ${line}: event_digest is invalid`);
    }
    const copy = { ...record };
    delete copy.event_digest;
    const expected = createHash9("sha256").update(canonicalJson(copy)).digest("hex");
    if (record.event_digest !== expected)
      throw new Error(`principal assurance integrity failure at line ${line}: event digest mismatch`);
    if (!validTime(typeof record.at === "string" ? record.at : void 0))
      throw new Error(`invalid principal assurance v1 event at line ${line}: at must be a date-time`);
    const at = Date.parse(record.at);
    if (previousTime !== null && at < previousTime)
      throw new Error(`principal assurance integrity failure at line ${line}: timestamp moves backwards`);
    previousTime = at;
    previous = record.event_digest;
  });
}
function canonicalJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("principal assurance event contains a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value))
    return `[${value.map(canonicalJson).join(",")}]`;
  if (!value || typeof value !== "object")
    throw new Error("principal assurance event contains a non-JSON value");
  return `{${Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}
function validTime(value) {
  if (typeof value !== "string")
    return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value)))
    return false;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59)
    return false;
  return day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}
function safeDiagnosticValue(value) {
  if (typeof value === "number" && Number.isFinite(value))
    return String(value);
  if (typeof value === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(value) && redactText(value) === value)
    return JSON.stringify(value);
  return "[REDACTED invalid value]";
}
function sanitizePersistedError(error) {
  const raw = error instanceof Error ? error.message : String(error);
  return redactText(raw).replace(/("?(?:password|passwd|secret|token|api[-_]?key|authorization|credential)"?\s*[:=]\s*"?)[^\s,}"']+/gi, "$1[REDACTED]").slice(0, 1e3);
}
function sanitizeAttributes(value) {
  const redacted = redactArgs(value);
  const sensitiveKey = /(secret|token|password|passphrase|api[_-]?key|authorization|cookie|credential)/i;
  const freeTextKey = /^(request|command|stdout|stderr|output|prompt|content|reason|message|release_reason|diagnostic)$/i;
  const walk2 = (current, key = "") => {
    if (sensitiveKey.test(key))
      return "[REDACTED]";
    if (typeof current === "string" && freeTextKey.test(key)) {
      return `[REDACTED sha256:${createHash9("sha256").update(current).digest("hex")}]`;
    }
    if (Array.isArray(current))
      return current.map((entry) => walk2(entry));
    if (current && typeof current === "object")
      return Object.fromEntries(Object.entries(current).map(([childKey, entry]) => [childKey, walk2(entry, childKey)]));
    return current;
  };
  return walk2(redacted);
}
function parseJsonl(text, label) {
  const lines = text.split("\n").filter((line) => line.trim());
  if (!lines.length)
    throw new Error(`${label} ledger is empty`);
  return lines.map((line, index) => {
    try {
      const value = JSON.parse(line);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("record is not an object");
      return value;
    } catch (error) {
      throw new Error(`${label} ledger line ${index + 1} is invalid JSON [REDACTED parser detail]`);
    }
  });
}
function object2(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function string(value) {
  return typeof value === "string" && value.length ? value : void 0;
}
function stringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : void 0;
}
function anyDefined(value) {
  const defined = cleanObject(value);
  return Object.keys(defined).length > 0 ? defined : void 0;
}
function cleanObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== void 0));
}
function safeAttributes(value) {
  return sanitizeAttributes(cleanObject(value));
}
function cleanEvent(event) {
  return cleanObject(event);
}
function without(record, keys) {
  const omitted = new Set(keys);
  return Object.fromEntries(Object.entries(record).filter(([key, value]) => !omitted.has(key) && value !== void 0));
}
function walkFiles(root, relative6 = "") {
  const out = [];
  let entries;
  try {
    entries = readdirSync13(join26(root, relative6), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = relative6 ? `${relative6}/${entry.name}` : entry.name;
    if (entry.isDirectory())
      out.push(...walkFiles(root, path));
    else if (entry.isFile())
      out.push(path);
  }
  return out;
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
  const abs = resolve12(skillDir);
  const md = join27(abs, "SKILL.md");
  const isDir3 = existsSync20(abs) && statSync9(abs).isDirectory();
  if (!isDir3 || !existsSync20(md)) {
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
      const body = readFileSync21(join27(requireSkillDir(skillDir, mode), "SKILL.md"), "utf8");
      return ["--no-skills", "--append-system-prompt", body];
    }
  }
}
function extensionFlags(extensions) {
  if (!extensions || extensions.length === 0)
    return [];
  return extensions.flatMap((p) => {
    const abs = resolve12(p);
    if (!existsSync20(abs)) {
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
    const flags = req.systemPromptFile ? ["--no-skills", "--append-system-prompt", readFileSync21(req.systemPromptFile, "utf8")] : skillFlags(req.mode, req.skillDir);
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
    const session = mkdtempSync2(join27(tmpdir2(), "sc-pi-session-"));
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
    const flags = req.systemPromptFile ? ["--no-skills", "--append-system-prompt", readFileSync21(req.systemPromptFile, "utf8")] : skillFlags(req.mode, req.skillDir);
    const piVersion = await this.version();
    const total = req.turns.length;
    const traces = [];
    const parts = [];
    const session = total === 1 ? null : mkdtempSync2(join27(tmpdir2(), "sc-pi-session-"));
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
    const native = req.eventSources?.length ? collectTrajectorySources(req.cwd, req.eventSources) : { events: [], errors: [] };
    const piEvents = normalizePiTraces(traces);
    const combined = [...piEvents, ...native.events];
    const chronologyErrors = [];
    if (piEvents.length && native.events.length) {
      if (combined.some((event) => !event.at || !Number.isFinite(Date.parse(event.at)))) {
        chronologyErrors.push("pi/native events cannot be globally ordered because at least one event has no valid `at` timestamp");
      } else {
        const piTimes = new Set(piEvents.map((event) => Date.parse(event.at)));
        if (native.events.some((event) => piTimes.has(Date.parse(event.at)))) {
          chronologyErrors.push("pi/native events contain equal timestamps, so strict cross-source order is ambiguous");
        }
      }
    }
    const eventErrors = [...native.errors, ...chronologyErrors];
    return {
      transcript: withProviderFailure(parts.join("\n"), providerFailure),
      traces,
      events: resequence(combined),
      ...eventErrors.length ? { eventErrors } : {},
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
import { readFileSync as readFileSync22, existsSync as existsSync21 } from "node:fs";
import { join as join28, dirname as dirname9 } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn as spawn4 } from "node:child_process";
var __dirname = dirname9(fileURLToPath(import.meta.url));
function templatePath(assetsDir) {
  if (assetsDir)
    return join28(assetsDir, "report.template.html");
  const candidates = [
    join28(__dirname, "..", "..", "..", "assets", "report.template.html"),
    // packages/cli/{dist,src} -> ../../../assets
    join28(__dirname, "..", "assets", "report.template.html"),
    join28(__dirname, "..", "..", "assets", "report.template.html")
  ];
  for (const c of candidates)
    if (existsSync21(c))
      return c;
  throw new Error("cannot find assets/report.template.html");
}
function gradeScriptPath(assetsDir) {
  return join28(dirname9(templatePath(assetsDir)), "report.grade.js");
}
function readBody(req) {
  return new Promise((resolve15) => {
    let b = "";
    req.on("data", (c) => b += c);
    req.on("end", () => resolve15(b));
  });
}
function findTranscript(runDir, id) {
  const files = findTranscriptFiles(runDir, id);
  if (files.length === 0)
    return null;
  if (files.length === 1)
    return readFileSync22(join28(runDir, files[0]), "utf8");
  return files.map((f) => `===== ${f} =====
${readFileSync22(join28(runDir, f), "utf8")}`).join("\n\n");
}
function findJudgeRaw(runDir, id) {
  const files = findJudgeRawFiles(runDir, id);
  if (files.length === 0)
    return null;
  if (files.length === 1)
    return readFileSync22(join28(runDir, files[0]), "utf8");
  return files.map((f) => `===== ${f} =====
${readFileSync22(join28(runDir, f), "utf8")}`).join("\n\n");
}
async function serveReview(opts) {
  const template = readFileSync22(templatePath(opts.assetsDir), "utf8");
  const gradeScript = readFileSync22(gradeScriptPath(opts.assetsDir), "utf8");
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
        const specPath = join28(opts.skillDir, "tests", "specification.yaml");
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
            specDir: dirname9(specPath),
            threshold,
            mode: results.mode,
            expectedReps: prev.reps ?? 1
          });
          const merged = results.scenarios.map((s) => (
            // Same contract as `grade`, through the same choke point.
            s.id === body.scenarioId ? rebuildScenarioResult({ ...rr, metrics: mergeScenarioMetrics(s.metrics, rr.metrics) }, s, { objective: "carry", adjudication: "drop" }) : s
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
          ensureResultsGitignore(join28(opts.skillDir, "tests", "results"));
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
        const specPath = join28(opts.skillDir, "tests", "specification.yaml");
        const spec = loadSpec(specPath);
        const adapter = opts.adapter ?? getAdapter(results.harness);
        const cells = cellsFromResults(column.runDir, results);
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
            specDir: dirname9(specPath),
            now: () => (/* @__PURE__ */ new Date()).toISOString()
          });
          ensureResultsGitignore(join28(opts.skillDir, "tests", "results"));
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
        const spec = loadSpec(join28(opts.skillDir, "tests", "specification.yaml"));
        writeResults(column.runDir, patched, scoreContextFor(patched, spec));
        ensureResultsGitignore(join28(opts.skillDir, "tests", "results"));
        if (body.override != null) {
          preserveTranscript(join28(opts.skillDir, "tests", "results"), column.runDir, body.scenarioId);
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
  await new Promise((resolve15) => server.listen(opts.port ?? 0, "127.0.0.1", resolve15));
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
    const child2 = spawn4(opener, [url], { stdio: "ignore", detached: true });
    child2.on("error", () => {
    });
    child2.unref();
  } catch {
  }
}

// packages/pi-extension/src/runner.ts
import { existsSync as existsSync22 } from "node:fs";
import { dirname as dirname10, join as join29, resolve as resolve13 } from "node:path";
function resolveSkillDir(cwd, arg) {
  if (arg) {
    const dir2 = resolve13(cwd, arg);
    if (existsSync22(join29(dir2, "tests", "specification.yaml"))) return dir2;
    throw new Error(`no tests/specification.yaml found at ${dir2}`);
  }
  let dir = cwd;
  for (; ; ) {
    if (existsSync22(join29(dir, "tests", "specification.yaml"))) return dir;
    const parent = dirname10(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`no tests/specification.yaml found from ${cwd} upward`);
}
var DEFAULT_MODEL = "fireworks:accounts/fireworks/models/deepseek-v4-pro";
async function runViaExtension(opts) {
  const specPath = join29(opts.skillDir, "tests", "specification.yaml");
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
  const failedTranscripts = verdicts.filter((v) => v.verdict !== "PASS").flatMap((v) => findTranscriptFiles(summary.runDir, v.id, summary.results.mode).map((f) => join29(summary.runDir, f)));
  return {
    skill: summary.results.skill,
    model: summary.results.model,
    grade: { pct: g.pct, letter: g.letter, ship: g.ship },
    scenarios: verdicts.map((v) => ({ id: v.id, verdict: v.verdict, suspect: v.suspect ?? false })),
    failedTranscripts
  };
}

// packages/pi-extension/src/capture-cmd.ts
import { existsSync as existsSync23, mkdirSync as mkdirSync7, writeFileSync as writeFileSync10, readdirSync as readdirSync14, readFileSync as readFileSync23 } from "node:fs";
import { join as join30 } from "node:path";
import { createHash as createHash10 } from "node:crypto";
var CANCELLED = { status: "cancelled", files: [] };
var CAPTURES_GITIGNORE = "# Local review evidence for captured cases \u2014 never commit.\n.local/\n";
async function runCapture(skillDir, ctx) {
  const ui = ctx.ui;
  const now = ctx.now ?? (() => (/* @__PURE__ */ new Date()).toISOString());
  if (ctx.isStreaming()) {
    ui.say("the agent is still streaming \u2014 let it finish, then run capture again");
    return CANCELLED;
  }
  const specPath = join30(skillDir, "tests", "specification.yaml");
  if (!existsSync23(specPath)) {
    ui.say(`${specPath} does not exist \u2014 run \`skill-harness init\` before capturing into this skill`);
    return CANCELLED;
  }
  const baseSha256 = specSha256(readFileSync23(specPath, "utf8"));
  const turns = projectTurns(activeBranch(ctx.sessionEntries()), ctx.homeDir);
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
  const capturesDir = join30(skillDir, "tests", "captures");
  const existingIds = existsSync23(capturesDir) ? readdirSync14(capturesDir).filter((f) => f.endsWith(".yaml")).map((f) => f.replace(/\.yaml$/, "")) : [];
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
  const previewYaml = yaml.dump(capture, { lineWidth: -1, noRefs: true });
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
  writeFileSync10(join30(capturesDir, `${capture.id}.yaml`), yaml.dump(promoted, { lineWidth: -1, noRefs: true }), "utf8");
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
  const skillMd = join30(skillDir, "SKILL.md");
  if (existsSync23(skillMd)) candidates.push({ label: "SKILL.md (this skill)", kind: "skill", path: "SKILL.md", abs: skillMd });
  const agentsDir = join30(ctx.cwd, ".pi", "agents");
  if (existsSync23(agentsDir)) {
    for (const f of readdirSync14(agentsDir).filter((x) => x.endsWith(".md"))) {
      candidates.push({ label: `subagent: ${f}`, kind: "subagent", path: join30(".pi", "agents", f), abs: join30(agentsDir, f) });
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
    content_sha256: createHash10("sha256").update(readFileSync23(chosen.abs, "utf8"), "utf8").digest("hex")
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
function writeCapture(capturesDir, capture, selected2, homeDir) {
  mkdirSync7(join30(capturesDir, ".local"), { recursive: true });
  const gitignore = join30(capturesDir, ".gitignore");
  const existingIgnore = existsSync23(gitignore) ? readFileSync23(gitignore, "utf8") : "";
  if (!existingIgnore.split("\n").some((l) => l.trim() === ".local/" || l.trim() === ".local")) {
    writeFileSync10(gitignore, existingIgnore ? `${existingIgnore.replace(/\n*$/, "\n")}${CAPTURES_GITIGNORE}` : CAPTURES_GITIGNORE, "utf8");
  }
  const casePath = join30(capturesDir, `${capture.id}.yaml`);
  writeFileSync10(casePath, yaml.dump(capture, { lineWidth: -1, noRefs: true }), "utf8");
  const evidencePath = join30(capturesDir, ".local", `${capture.id}.evidence.json`);
  writeFileSync10(
    evidencePath,
    JSON.stringify(
      {
        capture_id: capture.id,
        assistant_excerpt: selected2.map((t) => redactText(t.assistantText, homeDir)).join("\n---\n").slice(0, 4e3),
        tool_calls: selected2.flatMap((t) => t.toolCalls.map((c) => ({ name: c.name, isError: c.isError, args: c.args })))
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
    const runDir = resolve14(ctx.cwd, positional[0] ?? ".");
    const testsDir = dirname11(dirname11(dirname11(runDir)));
    const spec = loadSpec(join31(testsDir, "specification.yaml"));
    const prev = existsSync24(join31(runDir, "results.yaml")) ? readResults(runDir) : null;
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
      // Same construction as the executor, so the dialog's ceiling is the real one.
      cells: cellsFromResults(runDir, results),
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
    const specPath = join31(skillDir, "tests", "specification.yaml");
    const spec = loadSpec(specPath);
    const specDir = dirname11(specPath);
    const report = computeCoverage({
      specDir,
      scenarios: spec.scenarios,
      baseFiles: [relative5(specDir, join31(skillDir, "SKILL.md")).split("\\").join("/")]
    });
    say(ctx, formatCoverage(report, spec.skill), report.broken.length ? "warning" : "info");
    return;
  }
  if (sub === "affected") {
    const skillDir = resolveSkillDir(ctx.cwd, positional[0]);
    const specPath = join31(skillDir, "tests", "specification.yaml");
    const spec = loadSpec(specPath);
    const base = flags.base || "HEAD";
    const rev = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: dirname11(specPath), timeoutMs: 3e4 });
    if (rev.code !== 0) {
      say(ctx, "affected needs a git repository to diff against", "error");
      return;
    }
    const repoRoot = rev.stdout.trim();
    const result = selectAffected({
      scenarios: spec.scenarios,
      specDir: dirname11(specPath),
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
      homeDir: homedir3(),
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
    const spec = loadSpec(join31(skillDir, "tests", "specification.yaml"));
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
  const assetsDir = join32(dirname12(fileURLToPath2(import.meta.url)), "..", "..", "..", "assets");
  registerCommand(pi, assetsDir);
  registerTool(pi);
  pi.on("session_shutdown", async () => {
    closeReview();
  });
}
export {
  index_default as default
};
