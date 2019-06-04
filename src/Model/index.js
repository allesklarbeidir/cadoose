import async from "async";
import util from "util";
import Promise from "bluebird";
import uuidv4 from "uuid/v4";

import TableBuilder from "express-cassandra/lib/builders/table";
import Schemer from "express-cassandra/lib/validators/schema";
import Parser from "express-cassandra/lib/utils/parser";

import Schema, {ExtendedSchemaDescription} from "../Schema";

import "harmony-reflect";

const Proxy = global.Proxy;
Proxy.prototype = {};

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

    static async registerAndSync(name, schema){
        const MyModel = await require("../index").MakeCadoose().loadSchema(name, schema);
        await MyModel.syncDBAsync();
        
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

    create_table = (schema, callback) => {
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
            //### INSERTED SNIPPET FOR INDEXES SUPPORT IN YugaByte YCQL
            (clauses.clusteringOrderClause.length ? " AND " : " WITH ")
            + "transactions = { 'enabled' : true }"
            //### INSERTED SNIPPET FOR INDEXES SUPPORT IN YugaByte YCQL
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

        this.create_table(modelSchema, afterDBCreate);

        this._model.syncDB(callback);
    }
    isSuperModel = () => {
        return true;
    }
}
export const ModelDummy = new Model();

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

}
const _model_instances = {};

export const TransformInstanceValues = (instanceValues, modelPrx, fromDB) => {

    const s = modelPrx._schema.fields;

    Object.keys(instanceValues).forEach(k => {
        
        if(s[k] && s[k].type === "set" && instanceValues[k] instanceof Set){
            instanceValues[k] = [...instanceValues[k]];
        }
        else if(s[k] && s[k].type === "set" && (!s[k].asArray && fromDB) && Array.isArray(instanceValues[k])){
            instanceValues[k] = new Set(instanceValues[k]);
        }

    });

    return instanceValues;
}

export const BindModelInstance = function(instanceValues, modelPrx){

    const uid = uuidv4();
    const modelInstance = new ModelInstance(uid, this, modelPrx);
    _model_instances[uid] = modelInstance;

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
                        set: extra["set"].bind(this)
                    });
                }
                else{
                    Object.defineProperty(modelInstance, k, {
                        enumerable: true,
                        get: extra["get"].bind(this),
                        set: extra["set"].bind(this),
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