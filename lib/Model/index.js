"use strict";Object.defineProperty(exports, "__esModule", { value: true });exports.default = exports.ModelInstanceProxy = exports.BindModelInstance = exports.TransformInstanceValues = exports.ModelDummy = exports.Model = void 0;var _async = _interopRequireDefault(require("async"));
var _util = _interopRequireDefault(require("util"));
var _bluebird = _interopRequireDefault(require("bluebird"));
var _v = _interopRequireDefault(require("uuid/v4"));

var _table = _interopRequireDefault(require("express-cassandra/lib/builders/table"));
var _schema = _interopRequireDefault(require("express-cassandra/lib/validators/schema"));
var _parser = _interopRequireDefault(require("express-cassandra/lib/utils/parser"));

var _Schema = _interopRequireWildcard(require("../Schema"));

require("harmony-reflect");function _interopRequireWildcard(obj) {if (obj && obj.__esModule) {return obj;} else {var newObj = {};if (obj != null) {for (var key in obj) {if (Object.prototype.hasOwnProperty.call(obj, key)) {var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {};if (desc.get || desc.set) {Object.defineProperty(newObj, key, desc);} else {newObj[key] = obj[key];}}}}newObj.default = obj;return newObj;}}function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { default: obj };}

const Proxy = global.Proxy;
Proxy.prototype = {};

//#region type-def























































//#endregion


class Model {






  static async registerAndSync(name, schema) {
    const MyModel = await require("../index").MakeCadoose().loadSchema(name, schema);
    await MyModel.syncDBAsync();

    return MyModel;
  }

  constructor(expressCassandraModel, schemaSchema) {this._model = {};this._name = "";this._schema = {};this.Model = null;this.




















    create_table = (schema, callback) => {
      const properties = this._model._properties;
      const tableName = properties.table_name;
      const rows = [];
      let fieldType;
      Object.keys(schema.fields).forEach(k => {
        if (schema.fields[k].virtual) {
          return;
        }
        let segment = '';
        fieldType = _schema.default.get_field_type(schema, k);
        if (schema.fields[k].typeDef) {
          segment = _util.default.format('"%s" %s%s', k, fieldType, schema.fields[k].typeDef);
        } else {
          segment = _util.default.format('"%s" %s', k, fieldType);
        }

        if (schema.fields[k].static) {
          segment += ' STATIC';
        }

        rows.push(segment);
      });

      const clauses = _parser.default.get_primary_key_clauses(schema);

      const query = _util.default.format(
      'CREATE TABLE IF NOT EXISTS "%s" (%s , PRIMARY KEY((%s)%s))%s%s;',
      tableName,
      rows.join(' , '),
      clauses.partitionKeyClause,
      clauses.clusteringKeyClause,
      clauses.clusteringOrderClause,
      //### INSERTED SNIPPET FOR INDEXES SUPPORT IN YugaByte YCQL
      (clauses.clusteringOrderClause.length ? " AND " : " WITH ") +
      "transactions = { 'enabled' : true }"
      //### INSERTED SNIPPET FOR INDEXES SUPPORT IN YugaByte YCQL
      );

      this._model._driver.execute_definition_query(query, (err, result) => {
        if (err) {
          callback(err);
          return;
        }
        callback(null, result);
      });
    };this.
    syncDB = callback => {
      const properties = this._model._properties;
      const modelSchema = properties.schema;

      const tableBuilder = new _table.default(this._model._driver, properties);

      const afterDBCreate = err1 => {
        if (err1) {
          callback(err1);
          return;
        }

        const indexingTasks = [];

        // cassandra index create if defined
        if (Array.isArray(modelSchema.indexes)) {
          tableBuilder.createIndexesAsync = _bluebird.default.promisify(tableBuilder.create_indexes);
          indexingTasks.push(tableBuilder.createIndexesAsync(modelSchema.indexes));
        }
        // cassandra custom index create if defined
        if (Array.isArray(modelSchema.custom_indexes)) {
          tableBuilder.createCustomIndexesAsync = _bluebird.default.promisify(tableBuilder.create_custom_indexes);
          indexingTasks.push(tableBuilder.createCustomIndexesAsync(modelSchema.custom_indexes));
        }
        if (modelSchema.custom_index) {
          tableBuilder.createCustomIndexAsync = _bluebird.default.promisify(tableBuilder.create_custom_indexes);
          indexingTasks.push(tableBuilder.createCustomIndexAsync([modelSchema.custom_index]));
        }
        // materialized view create if defined
        if (modelSchema.materialized_views) {
          tableBuilder.createViewsAsync = _bluebird.default.promisify(tableBuilder.create_mviews);
          indexingTasks.push(tableBuilder.createViewsAsync(modelSchema.materialized_views));
        }

        _bluebird.default.all(indexingTasks).
        then(() => {
          // db schema was updated, so callback with true
          callback(null, true);
        }).
        catch(err2 => {
          callback(err2);
        });
      };

      this.create_table(modelSchema, afterDBCreate);

      this._model.syncDB(callback);
    };this.
    isSuperModel = () => {
      return true;
    };if (expressCassandraModel) {this._model = expressCassandraModel;this.constructor = this._model;this.prototype = this._model.prototype;this._name = this._model._properties.name;this._schema = this._model._properties.schema;}if (schemaSchema) {Object.keys(schemaSchema.statics).forEach(k => {this[k] = schemaSchema.statics[k];});}this.Model = this;}}exports.Model = Model;

const ModelDummy = new Model();exports.ModelDummy = ModelDummy;

const _models = {};

class ModelProxy extends Proxy {

  constructor(expressCassandraRawModel, modelSchema) {
    super(((rawmodel, schema) => {
      _models[rawmodel._properties.name] = new Model(rawmodel, schema);
      return rawmodel;
    })(expressCassandraRawModel, modelSchema), {
      get: (obj, prop) => {

        const model = _models[obj._properties.name];

        if (model) {
          if (typeof model[prop] !== "undefined" || typeof obj[prop] === "undefined" && model[prop]) {
            // console.log(`Hooked :${prop}`);
            return model[prop];
          }
        } else
        {
          throw new Error("ModelProxy for unknown Model called.");
        }

        // console.log(`Original :${prop}`);
        return obj[prop];
      } });

  }}




class ModelInstance {




  constructor(uid, instance, modelPrx) {this._uid = null;this._instance = null;
    this._uid = uid;
    this._instance = instance;

    this.constructor = modelPrx;
    this.prototype = modelPrx.prototype;
  }}


const _model_instances = {};

const TransformInstanceValues = (instanceValues, modelPrx, fromDB) => {

  const s = modelPrx._schema.fields;

  Object.keys(instanceValues).forEach(k => {

    if (s[k] && s[k].type === "set" && instanceValues[k] instanceof Set) {
      instanceValues[k] = [...instanceValues[k]];
    } else
    if (s[k] && s[k].type === "set" && !s[k].asArray && fromDB && Array.isArray(instanceValues[k])) {
      instanceValues[k] = new Set(instanceValues[k]);
    }

  });

  return instanceValues;
};exports.TransformInstanceValues = TransformInstanceValues;

const BindModelInstance = function (instanceValues, modelPrx) {

  const uid = (0, _v.default)();
  const modelInstance = new ModelInstance(uid, this, modelPrx);
  _model_instances[uid] = modelInstance;

  Object.defineProperty(this, "__$id", {
    get: function () {
      return uid;
    } });


  const s = modelPrx._schema.fields;
  Object.keys(s).forEach(k => {

    if (s[k] && s[k]["__$extras"]) {
      const extra = s[k]["__$extras"];

      if (extra["get"] || extra["set"]) {

        if (!extra["set"]) {
          Object.defineProperty(modelInstance, k, {
            enumerable: true,
            get: extra["get"].bind(this) });

        } else
        if (!extra["get"]) {
          Object.defineProperty(modelInstance, k, {
            enumerable: true,
            set: extra["set"].bind(this) });

        } else
        {
          Object.defineProperty(modelInstance, k, {
            enumerable: true,
            get: extra["get"].bind(this),
            set: extra["set"].bind(this) });

        }

      }

    }
  });
};exports.BindModelInstance = BindModelInstance;

class ModelInstanceProxy extends Proxy {

  constructor(modelInstance) {
    super(modelInstance, {
      get: (obj, prop) => {

        const instance = _model_instances[obj["__$id"]];

        if (instance) {
          if (typeof instance[prop] !== "undefined" || typeof obj[prop] === "undefined" && instance[prop]) {
            // console.log(`Hooked (Instance) :${prop}`);
            return instance[prop];
          }
        } else
        {
          throw new Error("ModelProxy for unknown Model called.");
        }

        // console.log(`Original (Instance) :${prop}`);
        return obj[prop];
      },
      set: (obj, prop, value) => {

        const instance = _model_instances[obj["__$id"]];

        if (instance) {
          if (
          typeof instance[prop] !== "undefined" ||
          Object.getOwnPropertyNames(instance).indexOf(prop) !== -1 ||
          typeof obj[prop] === "undefined" && instance[prop])
          {
            // console.log(`SET Hooked (Instance) :${prop}`);
            instance[prop] = value;
            return true;
          }
        } else
        {
          throw new Error("ModelProxy for unknown Model called.");
        }

        // console.log(`SET Original (Instance) :${prop}`);
        obj[prop] = value;
        return true;
      } });

  }}exports.ModelInstanceProxy = ModelInstanceProxy;



const FusedModel = ModelProxy;var _default =

FusedModel;exports.default = _default;