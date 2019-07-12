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

    static async registerAndSync(name, schema){
        const MyModel = await cadoose().loadSchema(name, schema);
        await MyModel.syncDBAsync();
        
        return MyModel;
    }
    static registerAndSyncDefered(name, schema){
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

    // No overrides here, because this branch is meant to be for cassandra only.
    // Overrides and changes to the database-side will mostly be in the 'yugabyte-ycql' branch from now on. 

    /*
        Mongoose-like API Extensions
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