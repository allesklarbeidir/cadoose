"use strict";Object.defineProperty(exports, "__esModule", { value: true });exports.default = void 0;require("core-js/modules/es7.symbol.async-iterator");var _util = _interopRequireDefault(require("util"));
require("harmony-reflect");function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { default: obj };}

const Proxy = global.Proxy;
Proxy.prototype = {};

class JSONBPathBuilder extends Proxy {

  static build(path, asJSON) {
    const pathArr = Array.isArray(path) ? path : [path];
    const root = pathArr[0];

    const pathString = `"${root}"${
    pathArr.length === 2 ?

    asJSON ? `->'${pathArr[1]}'` : `->>'${pathArr[1]}'` :



    `->${pathArr.slice(1, pathArr.length - 1).map(p => `'${p}'`).join("->")}` + (


    asJSON ?
    `->'${pathArr[pathArr.length - 1]}'` :

    `->>'${pathArr[pathArr.length - 1]}'`)


    }`;

    return pathString;
  }

  constructor(path, asJSON) {
    super(((path, asJSON) => {

      const pathArr = Array.isArray(path) ? path : [path];
      const asJSONFlag = asJSON;

      const obj = {};
      Object.defineProperty(obj, "__$pathArr", {
        get: () => {
          return pathArr;
        } });

      Object.defineProperty(obj, "__$asJSON", {
        get: () => {
          return asJSONFlag;
        } });

      obj[_util.default.inspect.custom] = function () {
        return JSONBPathBuilder.build(pathArr, asJSON);
      };
      obj["toString"] = function () {
        return JSONBPathBuilder.build(pathArr, asJSON);
      };
      obj[Symbol.toPrimitive] = function () {
        return JSONBPathBuilder.build(pathArr, asJSON);
      };

      return obj;

    })(path, asJSON), {
      get: (obj, prop) => {
        if (!obj[prop]) {
          obj["__$pathArr"].push(prop);
          return new JSONBPathBuilder(obj["__$pathArr"], obj["__$asJSON"]);
        }

        return obj[prop];
      },
      set: (obj, prop, value) => {
        return false;
      } });

  }}



class JSONB extends Proxy {

  static path(fieldName, asJSON) {
    return new JSONBPathBuilder(fieldName, asJSON);
  }

  constructor(obj) {
    super((obj => {

      return obj;

    })(obj), {
      get: (obj, prop) => {
        if (prop === "__$isJSONB") {
          return true;
        }
        return obj[prop];
      },
      set: (obj, prop, value) => {
        obj[prop] = value;
        return true;
      } });

  }}var _default =



JSONB;exports.default = _default;