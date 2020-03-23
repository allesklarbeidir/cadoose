"use strict";Object.defineProperty(exports, "__esModule", { value: true });exports.ProxyModelJSONRPCBridge = exports.ProxyModelAPI = void 0;var _util = _interopRequireDefault(require("util"));
require("harmony-reflect");

var _jsonRpc = require("json-rpc-2.0");
var _get = _interopRequireDefault(require("lodash/get"));function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { default: obj };}

const Proxy = global.Proxy;
Proxy.prototype = {};


class ProxyModelAPI extends Proxy {

  constructor(modelName, modelSchema, bridgeHandler, instanceObj) {
    super(((modelname, schema, bridge, instObj) => {
      const _modelname = modelname;
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

          return new ProxyModelAPI(_modelname, _schema, _bridgeHandler, this);
        }
      }, _instObj || {});

      Object.defineProperty(obj, "__$modelName", {
        enumerable: false,
        get: () => {
          return _modelname;
        } });


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
            let ret = null;
            Object.keys(_schemaDesc).forEach(k => {
              if (this.hasOwnProperty(k)) {
                if (ret == null) {
                  ret = {
                    [k]: this[k] };

                } else
                {
                  ret[k] = this[k];
                }
              }
            });
            return ret;
          };
        } });


      return obj;

    })(modelName, modelSchema, bridgeHandler, instanceObj), {
      get: (obj, prop) => {
        if (prop === "prototype" || prop === "hasOwnProperty") {
          return obj[prop];
        } else
        if (obj["__$schemaDesc"].hasOwnProperty(prop)) {
          return obj[prop];
        } else
        {
          const bridge = obj["__$functionBridge"];
          const ret = bridge(obj["__$modelName"], prop, obj["__$getInstanceValues"]());
          // console.log(ret.toString());
          return ret;
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



const ProxyModelJSONRPCBridge = (

  jsonrpcTransmission

) => {

  const client = new _jsonRpc.JSONRPCClient(
  async jsonRPCRequest => {
    const jsonrpcResponse = await jsonrpcTransmission(jsonRPCRequest);
    return client.receive(jsonrpcResponse);
  });


  return (modelName, prop, instanceValues) => {
    return async (...args) => {
      return await client.request(prop, { modelName, instanceValues, args });
    };
  };

};exports.ProxyModelJSONRPCBridge = ProxyModelJSONRPCBridge;