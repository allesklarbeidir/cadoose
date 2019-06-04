import "harmony-reflect";
import Schema from "../Schema";

const Proxy = global.Proxy;
Proxy.prototype = {};

class Map extends Proxy{

    keyType:String
    valType:String|Number|Boolean|Buffer|Schema
    
    constructor(keyType, valType){
        super((() => {

            if(typeof keyType() !== "string"){
                throw new Error("Can only use 'string'-typed keys.");
            }

            let o = {};
            
            Object.defineProperty(o, "__$keyType", {
                get: function(){
                    return keyType.name;
                }
            });
            Object.defineProperty(o, "__$valType", {
                get: function(){
                    return valType.name;
                }
            });
            Object.defineProperty(o, "set", {
                get: function(){
                    return function(val){
                        if(Object.keys(val).filter(v => typeof(v) !== o["__$keyType"]) > 0){
                            throw new Error("Not all keys have the correct type.");
                        }
                        if(Object.values(val).filter(v => typeof(v) !== o["__$valType"]) > 0){
                            throw new Error("Not all values have the correct type.");
                        }
                        o = {
                            ...val
                        };
                        return o;
                    }
                }
            });

            return o;
            
        })(),{
            get: (obj, prop) => {
                return obj[prop];
            },
            set: (obj, prop, value) => {
                if(value !== null && (value).__proto__.constructor.name !== obj["__$keyType"]){
                    throw new Error("Wrong Key-Type");
                }
                else{
                    obj[prop] = value;
                    return true;
                }
            }
        });
    }

}

export default Map;