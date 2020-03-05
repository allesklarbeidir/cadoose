"use strict";Object.defineProperty(exports, "__esModule", { value: true });exports.MakeCadoose = MakeCadoose;Object.defineProperty(exports, "Schema", { enumerable: true, get: function () {return _Schema.default;} });Object.defineProperty(exports, "Model", { enumerable: true, get: function () {return _Model.Model;} });exports.SpecialTypes = exports.CADOOSE = void 0;

var _bluebird = _interopRequireWildcard(require("bluebird"));var _util = _interopRequireDefault(require("util"));
var _expressCassandra2 = _interopRequireDefault(require("express-cassandra"));
var _Schema = _interopRequireDefault(require("./Schema"));
var _Model = _interopRequireWildcard(require("./Model"));
require("harmony-reflect");
var _Map = _interopRequireDefault(require("./SpecialTypes/Map"));
var _JSONB = _interopRequireDefault(require("./SpecialTypes/JSONB"));function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { default: obj };}function _interopRequireWildcard(obj) {if (obj && obj.__esModule) {return obj;} else {var newObj = {};if (obj != null) {for (var key in obj) {if (Object.prototype.hasOwnProperty.call(obj, key)) {var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {};if (desc.get || desc.set) {Object.defineProperty(newObj, key, desc);} else {newObj[key] = obj[key];}}}}newObj.default = obj;return newObj;}}function _possibleConstructorReturn(self, call) {if (call && (typeof call === "object" || typeof call === "function")) {return call;}return _assertThisInitialized(self);}function _assertThisInitialized(self) {if (self === void 0) {throw new ReferenceError("this hasn't been initialised - super() hasn't been called");}return self;}function _getPrototypeOf(o) {_getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf(o) {return o.__proto__ || Object.getPrototypeOf(o);};return _getPrototypeOf(o);}function _inherits(subClass, superClass) {if (typeof superClass !== "function" && superClass !== null) {throw new TypeError("Super expression must either be null or a function");}subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } });if (superClass) _setPrototypeOf(subClass, superClass);}function _setPrototypeOf(o, p) {_setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf(o, p) {o.__proto__ = p;return o;};return _setPrototypeOf(o, p);}function _classCallCheck(instance, Constructor) {if (!(instance instanceof Constructor)) {throw new TypeError("Cannot call a class as a function");}}function _defineProperties(target, props) {for (var i = 0; i < props.length; i++) {var descriptor = props[i];descriptor.enumerable = descriptor.enumerable || false;descriptor.configurable = true;if ("value" in descriptor) descriptor.writable = true;Object.defineProperty(target, descriptor.key, descriptor);}}function _createClass(Constructor, protoProps, staticProps) {if (protoProps) _defineProperties(Constructor.prototype, protoProps);if (staticProps) _defineProperties(Constructor, staticProps);return Constructor;}

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
  ExpressCassandra: _expressCassandra2.default };exports.CADOOSE = CADOOSE;let


Cadoose = /*#__PURE__*/function () {_createClass(Cadoose, [{ key: "udts", get: function ()











    {
      return this.ormOptions["udts"] || {};
    } }, { key: "udfs", get: function ()
    {
      return this.ormOptions["udfs"] || {};
    } }, { key: "udas", get: function ()
    {
      return this.ormOptions["udas"] || {};
    } }]);

  function Cadoose(_expressCassandra, clientOptions, ormOptions) {_classCallCheck(this, Cadoose);this._expressCassandra = null;this._directClient = null;this.models = {};this._defered = {};this.schemas = {};this.clientOptions = {};this.ormOptions = {};
    this._expressCassandra = _expressCassandra;
    this.clientOptions = clientOptions;
    this.ormOptions = ormOptions;

    this._directClient = new cql.Client(clientOptions);
  }_createClass(Cadoose, [{ key: "syncModel", value: function () {var _syncModel = (0, _bluebird.coroutine)(function* (

      model) {
        if (Object.keys(this.models).indexOf(model._name) === -1) {
          this.models[model._name] = model;
        }
        return yield new _bluebird.default((resolve, reject) => {
          model.syncDB((err, res) => {
            if (err) {
              reject(err);
            } else
            {
              resolve(res);
            }
          });
        });
      });function syncModel(_x) {return _syncModel.apply(this, arguments);}return syncModel;}() }, { key: "syncAllModels", value: function () {var _syncAllModels = (0, _bluebird.coroutine)(function* ()
      {
        yield _bluebird.default.all(Object.values(this.models).map(m => {
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
      });function syncAllModels() {return _syncAllModels.apply(this, arguments);}return syncAllModels;}() }, { key: "loadSchema", value: function () {var _loadSchema = (0, _bluebird.coroutine)(function* (

      modelName, modelSchema) {

        this.schemas[modelName] = modelSchema;

        const ModelPrx = new _Model.default(this._expressCassandra.loadSchema(modelName, (yield modelSchema.toExpressCassandra(this._directClient))), modelSchema);

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
        this.models[modelName].__loaded = true;
        return this.models[modelName];
      });function loadSchema(_x2, _x3) {return _loadSchema.apply(this, arguments);}return loadSchema;}() }, { key: "_undeferModel", value: function () {var _undeferModel2 = (0, _bluebird.coroutine)(function* (

      modelName, modelSchema, syncModel, forceSync) {
        const LoadedModel = yield this.loadSchema(modelName, modelSchema);
        this._defered[modelName].loaded = true;

        if (syncModel && (!this._defered[modelName].synced || forceSync)) {
          yield LoadedModel.syncDBAsync();
          this._defered[modelName].synced = true;
        }

        return LoadedModel;
      });function _undeferModel(_x4, _x5, _x6, _x7) {return _undeferModel2.apply(this, arguments);}return _undeferModel;}() }, { key: "loadSchemaDefered", value: function loadSchemaDefered(
    modelName, modelSchema, syncModel) {

      const cadoose = this;

      const ModelFn = function f(instanceValues, fromDB) {
        if (cadoose._defered[modelName].loaded) {
          const LoadedModel = cadoose.models[modelName];
          return new LoadedModel(instanceValues);
        }

        return new _bluebird.default( /*#__PURE__*/function () {var _ref = (0, _bluebird.coroutine)(function* (resolve, reject) {
            const LoadedModel = yield cadoose._undeferModel(modelName, modelSchema, syncModel);
            resolve(new LoadedModel(instanceValues));
          });return function (_x8, _x9) {return _ref.apply(this, arguments);};}());
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

            return new _bluebird.default( /*#__PURE__*/function () {var _ref2 = (0, _bluebird.coroutine)(function* (resolve, reject) {
                const LoadedModel = yield cadoose._undeferModel(modelName, modelSchema, syncModel);

                const prop = LoadedModel[k];

                if (typeof prop === "function") {
                  return prop.bind(LoadedModel);
                }
                resolve(prop);
              });return function (_x10, _x11) {return _ref2.apply(this, arguments);};}());
          } });

      });

      ModelFn.undefer = /*#__PURE__*/function () {var _ref3 = (0, _bluebird.coroutine)(function* (forceSync) {
          const LoadedModel = yield cadoose._undeferModel(modelName, modelSchema, syncModel, forceSync);
          return LoadedModel;
        });return function (_x12) {return _ref3.apply(this, arguments);};}();

      this.models[modelName] = ModelFn;
      this._defered[modelName] = { loaded: false, synced: false };
      return this.models[modelName];
    } }]);return Cadoose;}();


let CADOOSE_INSTANCE = null;let


CadooseProxy = /*#__PURE__*/function (_Proxy) {_inherits(CadooseProxy, _Proxy);

  function CadooseProxy(clientOptions,




  ormOptions)









  {_classCallCheck(this, CadooseProxy);return _possibleConstructorReturn(this, _getPrototypeOf(CadooseProxy).call(this,
    (_expressCassandra => {
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
      } }));

  }return CadooseProxy;}(Proxy);


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