"use strict";Object.defineProperty(exports, "__esModule", { value: true });exports.MakeCadoose = MakeCadoose;Object.defineProperty(exports, "Schema", { enumerable: true, get: function () {return _Schema.default;} });Object.defineProperty(exports, "Model", { enumerable: true, get: function () {return _Model.Model;} });Object.defineProperty(exports, "ProxyModelAPI", { enumerable: true, get: function () {return _API.ProxyModelAPI;} });Object.defineProperty(exports, "ProxyModelJSONRPCBridge", { enumerable: true, get: function () {return _API.ProxyModelJSONRPCBridge;} });Object.defineProperty(exports, "ProxyModelListener", { enumerable: true, get: function () {return _Listener.ProxyModelListener;} });exports.SpecialTypes = exports.CADOOSE = void 0;
var _util = _interopRequireDefault(require("util"));
var _bluebird = _interopRequireDefault(require("bluebird"));
var _expressCassandra2 = _interopRequireDefault(require("express-cassandra"));
var _Schema = _interopRequireDefault(require("./Schema"));
var _Model = _interopRequireWildcard(require("./Model"));
require("harmony-reflect");
var _Map = _interopRequireDefault(require("./SpecialTypes/Map"));
var _JSONB = _interopRequireDefault(require("./SpecialTypes/JSONB"));
var _API = require("./CadooseProxy/API");
var _Listener = require("./CadooseProxy/Listener");function _interopRequireWildcard(obj) {if (obj && obj.__esModule) {return obj;} else {var newObj = {};if (obj != null) {for (var key in obj) {if (Object.prototype.hasOwnProperty.call(obj, key)) {var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {};if (desc.get || desc.set) {Object.defineProperty(newObj, key, desc);} else {newObj[key] = obj[key];}}}}newObj.default = obj;return newObj;}}function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { default: obj };}

const Proxy = global.Proxy;
Proxy.prototype = {};

let dseDriver;
try {
  // eslint-disable-next-line import/no-extraneous-dependencies, import/no-unresolved
  dseDriver = require('dse-driver');
} catch (e) {
  dseDriver = null;
}

const cql = _bluebird.default.promisifyAll(dseDriver || require('cassandra-driver'));

const CADOOSE = {
  ExpressCassandra: _expressCassandra2.default };exports.CADOOSE = CADOOSE;


class Cadoose {











  get udts() {
    return this.ormOptions["udts"] || {};
  }
  get udfs() {
    return this.ormOptions["udfs"] || {};
  }
  get udas() {
    return this.ormOptions["udas"] || {};
  }

  constructor(_expressCassandra, clientOptions, ormOptions) {this._expressCassandra = null;this._directClient = null;this.models = {};this._defered = {};this.schemas = {};this.clientOptions = {};this.ormOptions = {};
    this._expressCassandra = _expressCassandra;
    this.clientOptions = clientOptions;
    this.ormOptions = ormOptions;

    this._directClient = new cql.Client(clientOptions);
  }

  async syncModel(model) {
    if (Object.keys(this.models).indexOf(model._name) === -1) {
      this.models[model._name] = model;
    }
    return await new _bluebird.default((resolve, reject) => {
      model.syncDB((err, res) => {
        if (err) {
          reject(err);
        } else
        {
          resolve(res);
        }
      });
    });
  }
  async syncAllModels() {
    await _bluebird.default.all(Object.values(this.models).map(m => {
      return new _bluebird.default((resolve, reject) => {
        m.syncDB((err, res) => {
          if (err) {
            reject(err);
          } else
          {
            resolve(res);
          }
        });
      });
    }));
  }

  async loadSchema(modelName, modelSchema) {

    this.schemas[modelName] = modelSchema;

    const ModelPrx = new _Model.default(this._expressCassandra.loadSchema(modelName, (await modelSchema.toExpressCassandra(this._directClient))), modelSchema);

    const ModelFn = function f(instanceValues, fromDB) {
      const modelInstance = new ModelPrx((0, _Model.TransformInstanceValues)(instanceValues || {}, ModelPrx, fromDB));
      _Model.BindModelInstance.apply(modelInstance, [instanceValues, ModelPrx]);
      const modelInstanceProxy = new _Model.ModelInstanceProxy(modelInstance);
      return modelInstanceProxy;
    };
    ModelPrx._properties.get_constructor = () => {return function (instanceValues) {return ModelFn(instanceValues, true);};};

    const keys = [...new Set([...Object.keys(ModelPrx), ...Object.keys(_Model.ModelDummy), ...Object.keys(modelSchema.statics)])];
    keys.forEach(k => {
      Object.defineProperty(ModelFn, k, {
        get: function () {
          return ModelPrx[k];
        } });

    });

    this.models[modelName] = ModelFn;
    Object.defineProperty(this.models[modelName], "__loaded", {
      enumerable: false,
      get: function () {
        return true;
      } });

    Object.defineProperty(this.models[modelName], "__proxiedObjectProperties", {
      enumerable: false,
      get: function () {
        return keys;
      } });


    return this.models[modelName];
  }

  async _undeferModel(modelName, modelSchema, syncModel, forceSync) {
    if (
    this._defered[modelName] &&
    this._defered[modelName].loaded === true && (
    this._defered[modelName].synced || !syncModel) &&
    this.models[modelName] &&
    this.models[modelName]["__loaded"] === true)
    {
      return this.models[modelName];
    }


    const LoadedModel = await this.loadSchema(modelName, modelSchema);
    this._defered[modelName].loaded = true;

    if (syncModel && (!this._defered[modelName].synced || forceSync)) {
      await LoadedModel.syncDBAsync();
      this._defered[modelName].synced = true;
    }

    return LoadedModel;
  }
  loadSchemaDefered(modelName, modelSchema, syncModel) {

    const cadoose = this;

    const ModelFn = function f(instanceValues, fromDB) {
      if (cadoose._defered[modelName].loaded) {
        const LoadedModel = cadoose.models[modelName];
        return new LoadedModel(instanceValues);
      }

      return new _bluebird.default(async (resolve, reject) => {
        const LoadedModel = await cadoose._undeferModel(modelName, modelSchema, syncModel);
        resolve(new LoadedModel(instanceValues));
      });
    };

    const keys = [...new Set([...Object.keys((0, _Model.ModelExprCassandraDummy)()), ...Object.keys(_Model.ModelDummy), ...Object.keys(modelSchema.statics)])];
    keys.forEach(k => {
      Object.defineProperty(ModelFn, k, {
        get: function () {
          if (cadoose._defered[modelName].loaded) {
            const LoadedModel = cadoose.models[modelName];

            const prop = LoadedModel[k];

            if (typeof prop === "function") {
              return prop.bind(LoadedModel);
            }
            return prop;
          }

          return new _bluebird.default(async (resolve, reject) => {
            const LoadedModel = await cadoose._undeferModel(modelName, modelSchema, syncModel);

            const prop = LoadedModel[k];

            if (typeof prop === "function") {
              return prop.bind(LoadedModel);
            }
            resolve(prop);
          });
        } });

    });

    ModelFn.undefer = async forceSync => {
      const LoadedModel = await cadoose._undeferModel(modelName, modelSchema, syncModel, forceSync);
      return LoadedModel;
    };

    this.models[modelName] = ModelFn;
    Object.defineProperty(this.models[modelName], "__proxiedObjectProperties", {
      enumerable: false,
      get: function () {
        return keys;
      } });

    this._defered[modelName] = { loaded: false, synced: false };

    return this.models[modelName];
  }}


let CADOOSE_INSTANCE = null;


class CadooseProxy extends Proxy {

  constructor(clientOptions,




  ormOptions)









  {
    super((_expressCassandra => {
      if (CADOOSE_INSTANCE === null) {
        CADOOSE_INSTANCE = new Cadoose(_expressCassandra, clientOptions, ormOptions);
        console.log("INSTANTIATED NEW CADOOSE_INSTANCE");
      }
      return _expressCassandra;
    })(_expressCassandra2.default.createClient({
      clientOptions,
      ormOptions })),
    {
      get: (obj, prop) => {
        if (typeof CADOOSE_INSTANCE[prop] !== "undefined" || typeof obj[prop] === "undefined" && CADOOSE_INSTANCE[prop]) {
          return CADOOSE_INSTANCE[prop];
        }

        return obj[prop];
      } });

  }}


let _CadooseProxy = null;

function MakeCadoose(clientOptions,




ormOptions)








{
  if (clientOptions && ormOptions && !_CadooseProxy) {
    _CadooseProxy = new CadooseProxy(clientOptions, ormOptions);
  }

  if (_CadooseProxy === null) {
    throw new Error("Cadoose is not yet initialized!");
  }
  return _CadooseProxy;
};



const SpecialTypes = {
  Map: _Map.default,
  JSONB: _JSONB.default };exports.SpecialTypes = SpecialTypes;