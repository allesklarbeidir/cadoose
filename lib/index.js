"use strict";Object.defineProperty(exports, "__esModule", { value: true });exports.MakeCadoose = MakeCadoose;Object.defineProperty(exports, "Schema", { enumerable: true, get: function () {return _Schema.default;} });Object.defineProperty(exports, "Model", { enumerable: true, get: function () {return _Model.Model;} });exports.SpecialTypes = exports.CADOOSE = void 0;var _util = _interopRequireDefault(require("util"));
var _bluebird = _interopRequireDefault(require("bluebird"));
var _expressCassandra2 = _interopRequireDefault(require("express-cassandra"));
var _Schema = _interopRequireDefault(require("./Schema"));
var _Model = _interopRequireWildcard(require("./Model"));
require("harmony-reflect");
var _Map = _interopRequireDefault(require("./SpecialTypes/Map"));function _interopRequireWildcard(obj) {if (obj && obj.__esModule) {return obj;} else {var newObj = {};if (obj != null) {for (var key in obj) {if (Object.prototype.hasOwnProperty.call(obj, key)) {var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {};if (desc.get || desc.set) {Object.defineProperty(newObj, key, desc);} else {newObj[key] = obj[key];}}}}newObj.default = obj;return newObj;}}function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { default: obj };}

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

  constructor(_expressCassandra, clientOptions, ormOptions) {this._expressCassandra = null;this._directClient = null;this.models = {};this.clientOptions = {};this.ormOptions = {};
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
    const ModelPrx = new _Model.default(this._expressCassandra.loadSchema(modelName, (await modelSchema.toExpressCassandra(this._directClient))), modelSchema);

    const ModelFn = function f(instanceValues, fromDB) {
      const modelInstance = new ModelPrx((0, _Model.TransformInstanceValues)(instanceValues || {}, ModelPrx, fromDB));
      _Model.BindModelInstance.apply(modelInstance, [instanceValues, ModelPrx]);
      const modelInstanceProxy = new _Model.ModelInstanceProxy(modelInstance);
      return modelInstanceProxy;
    };
    ModelPrx._properties.get_constructor = () => {return function (instanceValues) {return ModelFn(instanceValues, true);};};

    [...new Set([...Object.keys(ModelPrx), ...Object.keys(_Model.ModelDummy), ...Object.keys(modelSchema.statics)])].forEach(k => {
      Object.defineProperty(ModelFn, k, {
        get: function () {
          return ModelPrx[k];
        } });

    });

    this.models[modelName] = ModelFn;
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
  Map: _Map.default };exports.SpecialTypes = SpecialTypes;