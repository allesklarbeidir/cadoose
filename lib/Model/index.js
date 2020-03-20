"use strict";Object.defineProperty(exports, "__esModule", { value: true });exports.default = exports.ModelInstanceProxy = exports.BindModelInstance = exports.TransformInstanceValues = exports.ModelExprCassandraDummy = exports.ModelDummy = exports.Model = void 0;var _async = _interopRequireDefault(require("async"));
var _util = _interopRequireDefault(require("util"));
var _bluebird = _interopRequireDefault(require("bluebird"));
var _v = _interopRequireDefault(require("uuid/v4"));

var _set = _interopRequireDefault(require("lodash/set"));
var _get = _interopRequireDefault(require("lodash/get"));

var _table = _interopRequireDefault(require("express-cassandra/lib/builders/table"));
var _schema = _interopRequireDefault(require("express-cassandra/lib/validators/schema"));
var _parser = _interopRequireDefault(require("express-cassandra/lib/utils/parser"));

var _Schema = _interopRequireWildcard(require("../Schema"));
var _JSONB = _interopRequireDefault(require("../SpecialTypes/JSONB"));

require("harmony-reflect");function _interopRequireWildcard(obj) {if (obj && obj.__esModule) {return obj;} else {var newObj = {};if (obj != null) {for (var key in obj) {if (Object.prototype.hasOwnProperty.call(obj, key)) {var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {};if (desc.get || desc.set) {Object.defineProperty(newObj, key, desc);} else {newObj[key] = obj[key];}}}}newObj.default = obj;return newObj;}}function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { default: obj };}

const Proxy = global.Proxy;
Proxy.prototype = {};

const cadoose = require("../index").MakeCadoose;

//#region type-def



























































//#endregion


class Model {






  static async registerAndSync(name, schema, tablename) {
    if (tablename) {
      schema.options.table_name = tablename;
    }
    const MyModel = await cadoose().loadSchema(name, schema);
    await MyModel.syncDBAsync();

    return MyModel;
  }
  static registerAndSyncDefered(name, schema, tablename) {
    if (tablename) {
      schema.options.table_name = tablename;
    }
    const MyModel = cadoose().loadSchemaDefered(name, schema, true);
    return MyModel;
  }

  constructor(expressCassandraModel, schemaSchema) {this._model = {};this._name = "";this._schema = {};this.Model = null;this.
























    _create_table = (schema, callback) => {
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
      //### INSERTED SNIPPET FOR SECONDARY-INDEX SUPPORT IN YugaByte YCQL
      (clauses.clusteringOrderClause.length ? " AND " : " WITH ") +
      "transactions = { 'enabled' : true }"
      //### INSERTED SNIPPET FOR SECONDARY-INDEX SUPPORT IN YugaByte YCQL
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
        if (Array.isArray(modelSchema.indexes) || Array.isArray(modelSchema.ycql_indexes)) {
          tableBuilder.createIndexesAsync = _bluebird.default.promisify((indexes, callback) => {
            if (indexes.map(idx => typeof idx === "string").filter(Boolean).length === indexes.length) {
              return tableBuilder.create_indexes(indexes, callback);
            } else
            {
              // yugabyte ycql compound secondary index and 'includes' option for fast retrieval

              const _create_index_query = (tableName, idx) => {

                let include = [];
                let clustering_order = null;

                if (typeof idx === "object") {
                  if (Array.isArray(idx.include)) {
                    include = idx.include;
                  }
                  if (idx.clustering_order) {
                    clustering_order = idx.clustering_order;
                  }

                  if (Array.isArray(idx.indexed)) {
                    idx = idx.indexed;
                  }
                }

                idx = [].concat(...[idx]);

                let query = _util.default.format('CREATE INDEX IF NOT EXISTS "%s" ON "%s" (%s) %s %s',
                `${tableName}_${idx.join("_")}_idx`,
                tableName,
                idx.map(c => `"${c}"`).join(", "),
                include.length > 0 ? `INCLUDE (${include.map(c => `"${c}"`).join(", ")})` : "",
                clustering_order ?
                `WITH CLUSTERING ORDER BY (${Object.keys(clustering_order).map(k => `"${k}" ${clustering_order[k].toUpperCase()}`).join(", ")})` :

                "");


                return query;
              };

              const tableName = properties.table_name;
              _async.default.eachSeries(indexes, (idx, next) => {
                const query = _create_index_query(tableName, idx);
                this._model._driver.execute_definition_query(query, function (err, result) {
                  if (err) {
                    next(new Error("model.tablecreation.dbycqlindexcreate", err));
                  } else
                  {
                    next(null, result);
                  }
                });
              }, callback);
            }
          });
          indexingTasks.push(tableBuilder.createIndexesAsync([...(modelSchema.indexes || []), ...(modelSchema.ycql_indexes || [])]));
        }
        // yugabyte ycql UNIQUE index create if defined
        if (Array.isArray(modelSchema.unique)) {
          tableBuilder.createUniqueIndexesAsync = _bluebird.default.promisify((unique, callback) => {

            const _create_index_query = (tableName, idx) => {

              if (typeof idx === "object") {
                if (Array.isArray(idx.indexed)) {
                  idx = idx.indexed;
                }
              }

              idx = [].concat(...[idx]);

              let query = `CREATE UNIQUE INDEX IF NOT EXISTS "${tableName}_${idx.join("_")}_unique" ON "${tableName}" (${idx.map(c => `"${c}"`).join(", ")})`;

              return query;
            };

            const tableName = properties.table_name;
            _async.default.eachSeries(unique, (idx, next) => {
              const query = _create_index_query(tableName, idx);
              this._model._driver.execute_definition_query(query, function (err, result) {
                if (err) {
                  next(new Error("model.tablecreation.dbuniqueindexcreate", err));
                } else
                {
                  next(null, result);
                }
              });
            }, callback);

          });
          indexingTasks.push(tableBuilder.createUniqueIndexesAsync(modelSchema.unique));
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

      this._create_table(modelSchema, afterDBCreate);

      this._model.syncDB(callback);
    };this.







    create = async (...models) => {
      const arr = await _bluebird.default.all(models.map(m => {
        const mod = new (cadoose().models[this._name])(m);
        return new _bluebird.default(async (resolve, reject) => {
          await mod.saveAsync();
          resolve(mod);
        });
      }));
      if (arr.length === 1) {
        return arr[0];
      }
      return arr;
    };if (expressCassandraModel) {this._model = expressCassandraModel;this.constructor = this._model;this.prototype = this._model.prototype;this._name = this._model._properties.name;this._schema = this._model._properties.schema;}if (schemaSchema) {Object.keys(schemaSchema.statics).forEach(k => {this[k] = schemaSchema.statics[k];});}this.Model = this;} /*
                                                                                                                                                                                                                                                                                                                                                                      Overrides for express-cassandra methods
                                                                                                                                                                                                                                                                                                                                                                  */}exports.Model = Model;
const ModelDummy = new Model();exports.ModelDummy = ModelDummy;
const ModelExprCassandraDummy = () => cadoose()._expressCassandra.loadSchema("test_dummy", {
  fields: {
    id: {
      type: "text",
      default: "dummy-id" } },


  key: ["id"] });exports.ModelExprCassandraDummy = ModelExprCassandraDummy;



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




  constructor(uid, instance, modelPrx) {this._uid = null;this._instance = null;this.











    populate = async prop => {
      const instProp = (0, _get.default)(this._instance, prop, null);

      if (!instProp) {
        throw new Error(`Property '${prop}' not found.`);
      }
      if (
      prop !== null &&

      !Array.isArray(instProp) && (

      typeof instProp !== "object" ||
      instProp.constructor !== Object))


      {
        throw new Error(`Property '${prop}' of this Instance does not contain a reference to another Model`);
      }

      const model = cadoose().models[this.constructor._properties.name];

      // const ref = lodashGet(model._schema.fields, `${prop}.ref`, null);
      const ref = model._schema.fields[prop] && model._schema.fields[prop].ref || null;
      if (ref) {
        const refschema = ref && cadoose().schemas[ref] || null;
        if (refschema) {

          const makeQueryObject = refObj => Object.keys(refObj).reduce((o, key) => {
            let type = (0, _get.default)(refschema.schema, `${key}.type`);
            type = typeof type === "function" ? type : type.constructor;
            o[key] = type(refObj[key]);
            return o;
          }, {});

          if (Array.isArray(instProp)) {

            const queryObjArr = instProp.map(makeQueryObject);
            const queryObject = queryObjArr.reduce((o, qryObj) => {
              Object.keys(qryObj).forEach(k => {
                if (o.hasOwnProperty(k)) {
                  o[k]["$in"].push(qryObj[k]);
                } else
                {
                  o[k] = { $in: [qryObj[k]] };
                }
              });
              return o;
            }, {});

            const fetchedRefs = await cadoose().models[ref].findAsync({ ...queryObject });
            (0, _set.default)(this._instance, prop, fetchedRefs);
          } else
          {
            const queryObject = makeQueryObject(instProp);

            const fetchedRef = await cadoose().models[ref].findOneAsync({ ...queryObject });
            (0, _set.default)(this._instance, prop, fetchedRef);
          }

        } else
        {
          throw new Error(`Referenced Model not found. Looked for '${ref}'`);
        }
      } else
      {
        throw new Error(`Property '${prop}' not defined in schema.`);
      }
    };this._uid = uid;this._instance = instance;this.constructor = modelPrx;this.prototype = modelPrx.prototype;} /*
                                                                                                                      Mongoose-like API Extensions
                                                                                                                      Instance Methods
                                                                                                                  */}const _model_instances = {};
const _model_setter_memory = {};

const TransformInstanceValues = (instanceValues, modelPrx, fromDB) => {

  const s = modelPrx._schema.fields;

  Object.keys(s).forEach(k => {

    if ((0, _get.default)(instanceValues, k, null) !== null) {

      if (s[k] && s[k].type === "set" && instanceValues[k] instanceof Set) {
        instanceValues[k] = [...instanceValues[k]];
      } else
      if (s[k] && s[k].type === "set" && !s[k].asArray && fromDB && Array.isArray(instanceValues[k])) {
        instanceValues[k] = new Set(instanceValues[k]);
      } else
      if (s[k] && s[k].hasOwnProperty("ref") && !fromDB) {
        const refschema = cadoose().schemas[s[k].ref];
        if (refschema) {
          const refkey = [].concat(...(Array.isArray(refschema.options.key) ? refschema.options.key : [refschema.options.key]));
          const makeRefMap = refObj => refkey.reduce((pv, cv) => {
            pv[cv] = String(refObj[cv]);
            return pv;
          }, {});

          if (Array.isArray((0, _get.default)(instanceValues, k))) {
            instanceValues[k] = (0, _get.default)(instanceValues, k).map(makeRefMap);
          } else
          {
            instanceValues[k] = makeRefMap((0, _get.default)(instanceValues, k));
          }
        } else
        {
          throw new Error("Referenced schema NOT found.");
        }
      } else

      if (s[k] && s[k].type === "jsonb" && fromDB) {
        instanceValues[k] = new _JSONB.default(instanceValues[k]);
      }

    }


  });

  // if a field is undefinded in instanceValues, set it to >null< to reflect behavior of DB
  Object.keys(s).forEach(k => {
    if (
    typeof s[k] === "object" && s[k].hasOwnProperty("type") &&

    !s[k].hasOwnProperty("default") && !s[k].hasOwnProperty("virtual") &&

    (0, _get.default)(instanceValues, k) === undefined)
    {
      (0, _set.default)(instanceValues, k, null);
    }
  });

  return instanceValues;
};exports.TransformInstanceValues = TransformInstanceValues;

const BindModelInstance = function (instanceValues, modelPrx) {

  const uid = (0, _v.default)();
  const modelInstance = new ModelInstance(uid, this, modelPrx);
  //_model_instances[uid] = modelInstance;
  _model_setter_memory[uid] = {};

  Object.defineProperty(this, "__$id", {
    get: function () {
      //return uid;
      return modelInstance;
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
            get: () => {
              return _model_setter_memory[uid].hasOwnProperty(k) ? _model_setter_memory[uid][k] : undefined;
            },
            set: (value => {
              _model_setter_memory[uid][k] = extra["set"].apply(this, [value]);
            }).bind(this) });

        } else
        {
          Object.defineProperty(modelInstance, k, {
            enumerable: true,
            get: extra["get"].bind(this, _model_setter_memory[uid].hasOwnProperty(k) ? _model_setter_memory[uid][k] : undefined),
            set: (value => {
              _model_setter_memory[uid][k] = extra["set"].apply(this, [value]);
            }).bind(this) });

        }

      }

    }
  });
};exports.BindModelInstance = BindModelInstance;

class ModelInstanceProxy extends Proxy {

  constructor(modelInstance) {
    super(modelInstance, {
      get: (obj, prop) => {

        // const instance = _model_instances[obj["__$id"]];
        const instance = obj["__$id"];

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

        // const instance = _model_instances[obj["__$id"]];
        const instance = obj["__$id"];

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