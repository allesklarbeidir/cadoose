import type {FusedModelType} from "../Model";

import {ModelDummy, ModelExprCassandraDummy} from "../Model";
import {JSONRPCServer} from "json-rpc-2.0";

function getAllPropertyNames (obj) {
    const proto     = Object.getPrototypeOf(obj);
    const inherited = (proto) ? getAllPropertyNames(proto) : [];
    return [...new Set(Object.getOwnPropertyNames(obj).concat(inherited))];
}
let dummyModelInstance = null;
let instanceDefaultProperties = null;

class ProxyModelListener {

    constructor(_modelName:string, _model:FusedModelType<*>){

        this.server = new JSONRPCServer();
        
        this.modelName = _modelName
        this.model = _model;

        if(dummyModelInstance === null){
            dummyModelInstance = new (ModelExprCassandraDummy())({id:"id"});
            instanceDefaultProperties = getAllPropertyNames(dummyModelInstance);
        }

        [...new Set([
            ...this.model["__proxiedObjectProperties"],
            ...instanceDefaultProperties
        ])].forEach(k => {

            this.server.addMethod(k, ({
                modelName,
                instanceValues,
                args
            }) => {
                if(modelName === this.modelName){
                    
                    if(instanceValues !== null){
                        const proxymodelInstance = new this.model(instanceValues);

                        return new Promise((resolve, reject) => {
                            try{
                                resolve(proxymodelInstance[k].apply(proxymodelInstance, args));
                            }
                            catch(err){
                                reject(err);
                            }
                        });
                    }
                    else{

                        return new Promise((resolve, reject) => {
                            try{
                                const r = this.model[k].apply(this.model, args);
                                resolve(r);
                            }
                            catch(err){
                                reject(err);
                            }
                        });

                    }

                }
                else{

                    return Promise.reject(new Error("Model-Name from ProxyModel-Request does not match this ProxyModel-Listener."));

                }
            })

        });

    }


    async receive(jsonRPCRequest){
        return await this.server.receive(jsonRPCRequest);
    }

}



export {ProxyModelListener}
