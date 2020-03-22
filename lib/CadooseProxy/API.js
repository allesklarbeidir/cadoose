"use strict";Object.defineProperty(exports, "__esModule", { value: true });exports.ProxyModelAPI = void 0;var _util = _interopRequireDefault(require("util"));
require("harmony-reflect");

var _get = _interopRequireDefault(require("lodash/get"));function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { default: obj };}





const Proxy = global.Proxy;
Proxy.prototype = {};


class ProxyModelAPI extends Proxy {

  constructor(modelSchema, bridgeHandler, instanceObj) {
    super(((schema, bridge, instObj) => {
      const _schema = schema;
      const _schemaDesc = _schema.getSchemaDescription();

      const _bridgeHandler = bridge;;
      const _instObj = instObj;

      const obj = Object.assign(function (instVals) {
        if (typeof instVals === "object") {
          Object.keys(_schemaDesc).forEach(k => {
            if (instVals.hasOwnProperty(k)) {
              this[k] = instVals[k];
            }
          });

          return new ProxyModelAPI(_schema, _bridgeHandler, this);
        }
      }, _instObj || {});

      Object.defineProperty(obj, "__$schemaDesc", {
        enumerable: false,
        get: () => {
          return _schemaDesc;
        } });


      Object.defineProperty(obj, "__$functionBridge", {
        enumerable: false,
        get: () => {
          return _bridgeHandler;
        } });


      Object.defineProperty(obj, "__$getInstanceValues", {
        enumerable: false,
        get: () => {
          return () => {
            const ret = {};
            Object.keys(_schemaDesc).forEach(k => {
              if (this.hasOwnProperty(k)) {
                ret[k] = this[k];
              }
            });
            return ret;
          };
        } });


      return obj;

    })(modelSchema, bridgeHandler, instanceObj), {
      get: (obj, prop) => {
        if (prop === "prototype" || prop === "hasOwnProperty") {
          return obj[prop];
        } else
        if (obj["__$schemaDesc"].hasOwnProperty(prop)) {
          return obj[prop];
        } else
        {
          const bridge = obj["__$functionBridge"];
          return bridge(prop, obj["__$getInstanceValues"]());
        }
        // else if(prop.substring(prop.length-5) === "Async"){
        //     return async (...args) => {
        //         console.log(`${prop}(...${args})`);
        //         return args;
        //     };
        // }
        // else{
        //     return (...args) => {
        //         console.log(`${prop}(...${args})`);
        //         return args;
        //     };
        // }
      },
      set: (obj, prop, value) => {
        console.log(`set prop: ${prop} = ${value}`);
        obj[prop] = value;
        return true;
      } });

  }}exports.ProxyModelAPI = ProxyModelAPI;