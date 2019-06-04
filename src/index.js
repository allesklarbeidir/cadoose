import util from "util";
import Promise from "bluebird";
import ExpressCassandra from "express-cassandra";
import Schema from "./Schema";
import ModelProxy, {Model, ModelInstanceProxy, ModelDummy, TransformInstanceValues, BindModelInstance, FusedModelType} from "./Model";
import "harmony-reflect";
import Map from "./SpecialTypes/Map";

const Proxy = global.Proxy;
Proxy.prototype = {};

let dseDriver;
try {
  // eslint-disable-next-line import/no-extraneous-dependencies, import/no-unresolved
  dseDriver = require('dse-driver');
} catch (e) {
  dseDriver = null;
}

const cql = Promise.promisifyAll(dseDriver || require('cassandra-driver'));

export const CADOOSE = {
    ExpressCassandra:ExpressCassandra
};

class Cadoose {
    _expressCassandra = null

    _directClient = null

    models:{ [name:string]: FusedModelType } = {}

    clientOptions:{} = {}
    ormOptions:{} = {}

    get udts(){
        return this.ormOptions["udts"] || {};
    }
    get udfs(){
        return this.ormOptions["udfs"] || {};
    }
    get udas(){
        return this.ormOptions["udas"] || {};
    }

    constructor(_expressCassandra:ExpressCassandra, clientOptions, ormOptions){
        this._expressCassandra = _expressCassandra;
        this.clientOptions = clientOptions;
        this.ormOptions = ormOptions;

        this._directClient = new cql.Client(clientOptions);
    }

    async syncModel(model:FusedModelType){
        if(Object.keys(this.models).indexOf(model._name) === -1){
            this.models[model._name] = model;
        }
        return await new Promise((resolve, reject) => {
            model.syncDB((err,res) => {
                if(err){
                    reject(err);
                }
                else{
                    resolve(res);
                }
            });
        });
    }
    async syncAllModels(){
        await Promise.all(Object.values(this.models).map((m:FusedModelType) => {
            return new Promise((resolve, reject) => {
                m.syncDB((err,res) => {
                    if(err){
                        reject(err);
                    }
                    else{
                        resolve(res);
                    }
                });
            }); 
        }));
    }

    async loadSchema(modelName:string, modelSchema:Schema):FusedModelType{
        const ModelPrx = new ModelProxy(this._expressCassandra.loadSchema(modelName, await modelSchema.toExpressCassandra(this._directClient)), modelSchema);

        const ModelFn = function f(instanceValues, fromDB) {
            const modelInstance = new ModelPrx(TransformInstanceValues((instanceValues || {}), ModelPrx, fromDB));
            BindModelInstance.apply(modelInstance, [instanceValues, ModelPrx]);
            const modelInstanceProxy = new ModelInstanceProxy(modelInstance);
            return modelInstanceProxy;
        };
        ModelPrx._properties.get_constructor = () => {return function(instanceValues){ return ModelFn(instanceValues, true); }}

        [...new Set([...Object.keys(ModelPrx), ...Object.keys(ModelDummy), ...Object.keys(modelSchema.statics)])].forEach(k => {
            Object.defineProperty(ModelFn, k, {
                get: function(){
                    return ModelPrx[k];
                }
            });
        });

        this.models[modelName] = ModelFn;
        return this.models[modelName];
    }
}

let CADOOSE_INSTANCE:Cadoose = null;


class CadooseProxy extends Proxy {

    constructor(clientOptions:{
        contactPoints: Array<string>,
        protocolOptions: { port: number },
        keyspace: string,
        queryOptions: {consistency: number}
    }, ormOptions: {
        defaultReplicationStrategy : {
            class: string,
            replication_factor: number
        },
        migration: string,
        udts?:Object,
        udfs?:Object,
        udas?:Object

    }){
        super(((_expressCassandra) => {
            if(CADOOSE_INSTANCE === null){
                CADOOSE_INSTANCE = new Cadoose(_expressCassandra, clientOptions, ormOptions);
            }
            return _expressCassandra;
        })(ExpressCassandra.createClient({
            clientOptions,
            ormOptions
        })), {
            get: (obj, prop) => {
                if(typeof(CADOOSE_INSTANCE[prop]) !== "undefined" || (typeof(obj[prop]) === "undefined" && CADOOSE_INSTANCE[prop])){
                    return CADOOSE_INSTANCE[prop];
                }

                return obj[prop];
            }
        });
    }
}

let _CadooseProxy = null;

function MakeCadoose(clientOptions:{
    contactPoints: Array<string>,
    protocolOptions: { port: number },
    keyspace: string,
    queryOptions: {consistency: number}
}, ormOptions: {
    defaultReplicationStrategy : {
        class: string,
        replication_factor: number
    },
    migration: string,
    udts?:Object,
    udfs?:Object,
    udas?:Object
}){
    if(clientOptions && ormOptions && !_CadooseProxy){
        _CadooseProxy = new CadooseProxy(clientOptions, ormOptions);
    }
    
    if(_CadooseProxy === null){
        throw new Error("Cadoose is not yet initialized!");
    }
    return _CadooseProxy;
};

export {MakeCadoose};

export {Schema, Model}
export const SpecialTypes = {
    Map: Map
}