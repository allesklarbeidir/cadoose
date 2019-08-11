import async from "async";
import util from "util";
import Promise from "bluebird";
import uuidv4 from "uuid/v4";

import lodashSet from "lodash/set";
import lodashGet from "lodash/get";

import TableBuilder from "express-cassandra/lib/builders/table";
import Schemer from "express-cassandra/lib/validators/schema";
import Parser from "express-cassandra/lib/utils/parser";

import Schema, {ExtendedSchemaDescription} from "../Schema";
import JSONB from "../SpecialTypes/JSONB";

import "harmony-reflect";

const Proxy = global.Proxy;
Proxy.prototype = {};

const cadoose = require("../index").MakeCadoose;

//#region type-def
export type expressCassandraModelType = {
    
    _validators:Object,
    _properties:Object,
    _driver:Object,
    _ready:bool,
    _modified:Object,
    _set_properties: (properties:Object) => void,
    _sync_model_definition: (callback:Function) => void,
    _sync_es_index: (callback:Function) => void,
    _sync_graph: (callback:Function) => void,
    _execute_table_query: (callback:Function) => void,
    get_find_query: (queryObject:Object, options:Object) => {query:string, params:Array<any>},
    get_table_name: () => string,
    get_keyspace_name: () => string,
    is_table_ready: () => bool,
    init: (options:Object, callback:Function) => void,
    syncDB: (callback:Function) => void,
    get_cql_client: (callback:Function) => void,
    get_es_client: () => Object,
    get_gremlin_client: () => Object,
    execute_query: (...args) => void,
    execute_batch: (...args) => void,
    execute_eachRow: (...args) => void,
    _execute_table_eachRow: (query:string, params:Array<any>, options:Object, onReadable:Function, callback:Function) => void,
    eachRow: (queryObject:Object, options:Object, onReadable:Function, callback:Function) => void,
    execute_stream: (...args) => void,
    _execute_table_stream: (query:string, params:Array<any>, options:Object, onReadable:Function, callback:Function) => void,
    stream: (queryObject:Object, options:Object, onReadable:Function, callback:Function) => void,
    _execute_gremlin_query: (script, bindings, callback:Function) => void,
    _execute_gremlin_script: (script, bindings, callback:Function) => void,
    createVertex: (vertexProperties, callback:Function) => void,
    getVertex: (__vertexId, callback:Function) => void,
    getVertex: (__vertexId, callback:Function) => void,
    updateVertex: (__vertexId, vertexProperties, callback:Function) => void,
    deleteVertex: (__vertexId, callback:Function) => void,
    createEdge: (__edgeLabel, __fromVertexId, __toVertexId, edgeProperties, callback:Function) => void,
    getEdge: (__edgeId, callback:Function) => void,
    updateEdge: (__edgeId, edgeProperties, callback:Function) => void,
    deleteEdge: (__edgeId, callback:Function) => void,
    graphQuery: (query, params, callback:Function) => void,
    search: (queryObject, callback:Function) => void,
    find: (queryObject, options, callback:Function) => void,
    findOne: (queryObject, options, callback:Function) => void,
    update: (queryObject, updateValues, options, callback:Function) => void,
    delete: (queryObject, options, callback:Function) => void,
    truncate: (callback:Function) => void,
    get_data_types: () => Array<any>,
    _get_default_value: () => any,
    validate: (propertyName:string, value:any) => any,
    save: (options:Object, callback:Function) => Object,
    delete: (options:Object, callback:Function) => void,
    toJSON: () => Object,
    isModified: () => bool
};
//#endregion


export class Model{

    _model:expressCassandraModelType = {}
    _name:string = ""
    _schema:ExtendedSchemaDescription = {}
    Model:any = null

    static async registerAndSync(name, schema, tablename){
        if(tablename){
            schema.options.table_name = tablename;
        }
        const MyModel = await cadoose().loadSchema(name, schema);
        await MyModel.syncDBAsync();
        
        return MyModel;
    }
    static registerAndSyncDefered(name, schema, tablename){
        if(tablename){
            schema.options.table_name = tablename;
        }
        const MyModel = cadoose().loadSchemaDefered(name, schema, true);
        return MyModel;
    }

    constructor(expressCassandraModel:expressCassandraModelType, schemaSchema:Schema){
        
        if(expressCassandraModel){
            this._model = expressCassandraModel;
    
            this.constructor = this._model;
            this.prototype = this._model.prototype;
            
            this._name = this._model._properties.name;
            this._schema = this._model._properties.schema;
        }

        if(schemaSchema){
            Object.keys(schemaSchema.statics).forEach(k => {
                this[k] = schemaSchema.statics[k];
            });
        }

        this.Model = this;
    }

    /*
        Overrides for express-cassandra methods
    */

    _create_table = (schema, callback) => {
        const properties = this._model._properties;
        const tableName = properties.table_name;
        const rows = [];
        let fieldType;
        Object.keys(schema.fields).forEach((k) => {
            if (schema.fields[k].virtual) {
                return;
            }
            let segment = '';
            fieldType = Schemer.get_field_type(schema, k);
            if (schema.fields[k].typeDef) {
                segment = util.format('"%s" %s%s', k, fieldType, schema.fields[k].typeDef);
            } else {
                segment = util.format('"%s" %s', k, fieldType);
            }

            if (schema.fields[k].static) {
                segment += ' STATIC';
            }

            rows.push(segment);
        });

        const clauses = Parser.get_primary_key_clauses(schema);

        const query = util.format(
            'CREATE TABLE IF NOT EXISTS "%s" (%s , PRIMARY KEY((%s)%s))%s%s;',
            tableName,
            rows.join(' , '),
            clauses.partitionKeyClause,
            clauses.clusteringKeyClause,
            clauses.clusteringOrderClause,
            //### INSERTED SNIPPET FOR SECONDARY-INDEX SUPPORT IN YugaByte YCQL
            (clauses.clusteringOrderClause.length ? " AND " : " WITH ")
            + "transactions = { 'enabled' : true }"
            //### INSERTED SNIPPET FOR SECONDARY-INDEX SUPPORT IN YugaByte YCQL
        );

        this._model._driver.execute_definition_query(query, (err, result) => {
            if (err) {
                callback(err);
                return;
            }
            callback(null, result);
        });
    }
    syncDB = (callback:Function) => {
        const properties = this._model._properties;
        const modelSchema = properties.schema;

        const tableBuilder = new TableBuilder(this._model._driver, properties);

        const afterDBCreate = (err1) => {
            if (err1) {
                callback(err1);
                return;
            }

            const indexingTasks = [];

            // cassandra index create if defined
            if (Array.isArray(modelSchema.indexes)) {
                tableBuilder.createIndexesAsync = Promise.promisify(tableBuilder.create_indexes);
                indexingTasks.push(tableBuilder.createIndexesAsync(modelSchema.indexes));
            }
            // yugabyte ycql UNIQUE index create if defined
            if (Array.isArray(modelSchema.unique)) {
                tableBuilder.createUniqueIndexesAsync = Promise.promisify((unique, callback) => {

                    const _create_index_query = (tableName, idx) => {

                        if(typeof(idx) === "object"){
                            if(Array.isArray(idx.indexed)){
                                idx = idx.indexed;
                            }
                        }
                        
                        idx = [].concat(...[idx]);

                        let query = `CREATE UNIQUE INDEX IF NOT EXISTS "${tableName}_${idx.join("_")}_unique" ON "${tableName}" (${idx.map(c => `"${c}"`).join(", ")})`;

                        return query;
                    };
                    
                    const tableName = properties.table_name;
                    async.eachSeries(unique, (idx, next) => {
                        const query = _create_index_query(tableName, idx);
                        this._model._driver.execute_definition_query(query, function (err, result) {
                            if(err){
                                next(new Error("model.tablecreation.dbuniqueindexcreate", err));
                            }
                            else{
                                next(null, result);
                            }
                        });
                    }, callback);

                });
                indexingTasks.push(tableBuilder.createUniqueIndexesAsync(modelSchema.unique));
            }
            // cassandra custom index create if defined
            if (Array.isArray(modelSchema.custom_indexes)) {
                tableBuilder.createCustomIndexesAsync = Promise.promisify(tableBuilder.create_custom_indexes);
                indexingTasks.push(tableBuilder.createCustomIndexesAsync(modelSchema.custom_indexes));
            }
            if (modelSchema.custom_index) {
                tableBuilder.createCustomIndexAsync = Promise.promisify(tableBuilder.create_custom_indexes);
                indexingTasks.push(tableBuilder.createCustomIndexAsync([modelSchema.custom_index]));
            }
            // materialized view create if defined
            if (modelSchema.materialized_views) {
                tableBuilder.createViewsAsync = Promise.promisify(tableBuilder.create_mviews);
                indexingTasks.push(tableBuilder.createViewsAsync(modelSchema.materialized_views));
            }

            Promise.all(indexingTasks)
            .then(() => {
                // db schema was updated, so callback with true
                callback(null, true);
            })
            .catch((err2) => {
                callback(err2);
            });
        };

        this._create_table(modelSchema, afterDBCreate);

        this._model.syncDB(callback);
    }


    /*
        Mongoose-like API Extensions
        Static Methods
    */

    create = async (...models) => {
        const arr = await Promise.all(models.map(m => {
            const mod = new (cadoose().models[this._name])(m);
            return new Promise(async (resolve, reject) => {
                await mod.saveAsync();
                resolve(mod);
            });
        }));
        if(arr.length === 1){
            return arr[0];
        }
        return arr;
    }

}
export const ModelDummy = new Model();
export const ModelExprCassandraDummy = () => cadoose()._expressCassandra.loadSchema("test_dummy", {
    fields:{
        id: {
            type: "text",
            default: "dummy-id"
        }
    },
    key: ["id"]
});


const _models = {};

class ModelProxy extends Proxy {

    constructor(expressCassandraRawModel, modelSchema){
        super(((rawmodel, schema) => {
            _models[rawmodel._properties.name] = new Model(rawmodel, schema);
            return rawmodel;
        })(expressCassandraRawModel, modelSchema), {
            get: (obj, prop) => {

                const model = _models[obj._properties.name];

                if(model){
                    if(typeof(model[prop]) !== "undefined" || (typeof(obj[prop]) === "undefined" && model[prop])){
                        // console.log(`Hooked :${prop}`);
                        return model[prop];
                    }
                }
                else{
                    throw new Error("ModelProxy for unknown Model called.");
                }

                // console.log(`Original :${prop}`);
                return obj[prop];
            }
        });
    }
}



class ModelInstance {

    _uid = null
    _instance = null

    constructor(uid, instance, modelPrx){
        this._uid = uid;
        this._instance = instance;

        this.constructor = modelPrx;
        this.prototype = modelPrx.prototype;
    }

    /*
        Mongoose-like API Extensions
        Instance Methods
    */
    populate = async (prop) => {
        const instProp = lodashGet(this._instance, prop, null);

        if(!instProp){
            throw new Error(`Property '${prop}' not found.`);
        }
        if(
            prop !== null &&
            (
                !Array.isArray(instProp) &&
                (
                    typeof(instProp) !== "object" ||
                    instProp.constructor !== Object
                )
            )
        ){
            throw new Error(`Property '${prop}' of this Instance does not contain a reference to another Model`);
        }

        const model = cadoose().models[this.constructor._properties.name];
        
        const ref = lodashGet(model._schema.fields, `${prop}.ref`, null);
        if(ref){
            const refschema = ref && cadoose().schemas[ref] || null;
            if(refschema){

                const makeQueryObject = (refObj) => Object.keys(refObj).reduce((o, key) => {
                    let type = lodashGet(refschema.schema, `${key}.type`);
                    type = typeof(type) === "function" ? type : type.constructor;
                    o[key] = type(refObj[key]);
                    return o;
                },{});

                if(Array.isArray(instProp)){

                    const queryObjArr = instProp.map(makeQueryObject);
                    const queryObject = queryObjArr.reduce((o, qryObj) => {
                        Object.keys(qryObj).forEach(k => {
                            if(o.hasOwnProperty(k)){
                                o[k]["$in"].push(qryObj[k]);
                            }
                            else{
                                o[k] = {$in: [qryObj[k]]};
                            }
                        });
                        return o;
                    }, {})

                    const fetchedRefs = await cadoose().models[ref].findAsync({...queryObject});
                    lodashSet(this._instance, prop, fetchedRefs);
                }
                else{
                    const queryObject = makeQueryObject(instProp);

                    const fetchedRef = await cadoose().models[ref].findOneAsync({...queryObject});
                    lodashSet(this._instance, prop, fetchedRef);
                }

            }
            else{
                throw new Error(`Referenced Model not found. Looked for '${ref}'`);
            }
        }
        else{
            throw new Error(`Property '${prop}' not defined in schema.`)
        }
    }

}
const _model_instances = {};
const _model_setter_memory = {};

export const TransformInstanceValues = (instanceValues, modelPrx, fromDB) => {

    const s = modelPrx._schema.fields;

    Object.keys(instanceValues).forEach(k => {
        
        if(s[k] && s[k].type === "set" && instanceValues[k] instanceof Set){
            instanceValues[k] = [...instanceValues[k]];
        }
        else if(s[k] && s[k].type === "set" && (!s[k].asArray && fromDB) && Array.isArray(instanceValues[k])){
            instanceValues[k] = new Set(instanceValues[k]);
        }
        else if(s[k] && s[k].hasOwnProperty("ref") && !fromDB){
            const refschema = cadoose().schemas[s[k].ref];
            if(refschema){
                const refkey = [].concat(...refschema.options.key);
                const makeRefMap = (refObj) => refkey.reduce((pv, cv) => {
                    pv[cv] = String(refObj[cv])
                    return pv;
                }, {});

                if(Array.isArray(instanceValues[k])){
                    instanceValues[k] = instanceValues[k].map(makeRefMap);
                }
                else{
                    instanceValues[k] = makeRefMap(instanceValues[k])
                }
            }
            else{
                throw new Error("Referenced schema NOT found.");
            }
        }

        else if(s[k] && s[k].type === "jsonb" && fromDB){
            instanceValues[k] = new JSONB(instanceValues[k]);
        }

    });

    // if a field is undefinded in instanceValues, set it to >null< to reflect behavior of DB
    Object.keys(s).forEach(k => {
        if(
            typeof s[k] === "object" && s[k].hasOwnProperty("type") &&
            
            !s[k].hasOwnProperty("default") && !s[k].hasOwnProperty("virtual") &&

            lodashGet(instanceValues, k) === undefined
        ){
            lodashSet(instanceValues, k, null);
        }
    });

    return instanceValues;
}

export const BindModelInstance = function(instanceValues, modelPrx){

    const uid = uuidv4();
    const modelInstance = new ModelInstance(uid, this, modelPrx);
    _model_instances[uid] = modelInstance;
    _model_setter_memory[uid] = {};

    Object.defineProperty(this, "__$id", {
        get: function(){
            return uid;
        }
    });

    const s = modelPrx._schema.fields;
    Object.keys(s).forEach(k => {

        if(s[k] && s[k]["__$extras"]){
            const extra = s[k]["__$extras"];

            if(extra["get"] || extra["set"]){

                if(!extra["set"]){
                    Object.defineProperty(modelInstance, k, {
                        enumerable: true,
                        get: extra["get"].bind(this)
                    });
                }
                else if(!extra["get"]){
                    Object.defineProperty(modelInstance, k, {
                        enumerable: true,
                        get: () => {
                            return _model_setter_memory[uid].hasOwnProperty(k) ? _model_setter_memory[uid][k] : undefined;
                        },
                        set: ((value) => {
                            _model_setter_memory[uid][k] = extra["set"].apply(this, [value]);
                        }).bind(this)
                    });
                }
                else{
                    Object.defineProperty(modelInstance, k, {
                        enumerable: true,
                        get: extra["get"].bind(this, _model_setter_memory[uid].hasOwnProperty(k) ? _model_setter_memory[uid][k] : undefined),
                        set: ((value) => {
                            _model_setter_memory[uid][k] = extra["set"].apply(this, [value]);
                        }).bind(this)
                    });
                }

            }

        }
    });
}

export class ModelInstanceProxy extends Proxy {

    constructor(modelInstance){
        super(modelInstance, {
            get: (obj, prop) => {

                const instance = _model_instances[obj["__$id"]];

                if(instance){
                    if(typeof(instance[prop]) !== "undefined" || (typeof(obj[prop]) === "undefined" && instance[prop])){
                        // console.log(`Hooked (Instance) :${prop}`);
                        return instance[prop];
                    }
                }
                else{
                    throw new Error("ModelProxy for unknown Model called.");
                }

                // console.log(`Original (Instance) :${prop}`);
                return obj[prop];
            },
            set: (obj, prop, value) => {

                const instance = _model_instances[obj["__$id"]];

                if(instance){
                    if(
                        typeof(instance[prop]) !== "undefined" || 
                        Object.getOwnPropertyNames(instance).indexOf(prop) !== -1 || 
                        (typeof(obj[prop]) === "undefined" && instance[prop])
                    ){
                        // console.log(`SET Hooked (Instance) :${prop}`);
                        instance[prop] = value;
                        return true;
                    }
                }
                else{
                    throw new Error("ModelProxy for unknown Model called.");
                }

                // console.log(`SET Original (Instance) :${prop}`);
                obj[prop] = value;
                return true;
            }
        });
    }
}

export type FusedModelType = expressCassandraModelType&Model;
const FusedModel:FusedModelType = ModelProxy;

export default FusedModel;