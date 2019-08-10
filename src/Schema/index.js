// @flow

import lodashSet from "lodash/set";
import lodashGet from "lodash/get";

import UDTBuilder from "express-cassandra/lib/builders/udt";

import "harmony-reflect";
import Map from "../SpecialTypes/Map";

const Proxy = global.Proxy;
Proxy.prototype = {};

const cadoose = require("../index").MakeCadoose;

//#region Type Definitions
export type possibleValuesTypes = String|Number|Boolean|Array<*>|Set<*>|Date|Object|Buffer|Schema;
export type possibleValueTypesCassandraPlainText = "ascii" | "bigint" | "blob" | "boolean" | "counter" | "date" | "decimal" | "double" | "float" | "inet" | "int" | "list" | "map" | "set" | "smallint" | "text" | "time" | "timestamp" | "timeuuid" | "tinyint" | "uuid" | "varchar" | "varint" | "frozen";
export type possibleValuesValues = string|number|bool|[]|typeof(Set)|Date|Object|Buffer|Schema;

export type SchemaFieldDescription = {

    type:possibleValuesTypes|possibleValueTypesCassandraPlainText,
    of?:possibleValuesTypes,
    asArray?:bool,
    
    required?:bool,
    
    default?:possibleValuesValues|(model:Model, schema:Schema) => possibleValuesValues,
    validate?:(value:possibleValuesValues|Model, model:Model, schema:Schema) => bool,
    get?:(model:Model, schema:Schema) => possibleValuesValues|Model,
    set?:(value:possibleValuesValues|Model, model:Model, schema:Schema) => void,
    virtual?:bool,

    primary_key?:bool,
    clustering_key?:bool,
    secondary_index?:bool,
    // unique?:Boolean, // would need setting key accordingly (complicated in generic cases?)

    lowercase?:bool,
    uppercase?:bool,
    trim?:bool,
    match?:RegExp,
    enum?:Array<*>,
    minlength?:number,
    maxlength?:number,

    min?:number|Date|() => number|Date,
    max?:number|Date|() => number|Date,
};

export type SchemaDescription = {
    [field_name:string]: SchemaFieldDescription
};
export type NestedSchemaDescription = {
    [field_name:string]: SchemaDescription
};
export type ExtendedSchemaDescription = SchemaDescription | NestedSchemaDescription;

export type SchemaOptions = {
    name?:String,
    table_name?:String,
    key?:Array<String|Array<String>>,
    clustering_order?:{
        [key:string]: "asc"|"desc"
    },
    indexes?:Array<string>,

    expressCassandraOpts?: Object
};
//#endregion

class Schema {

    schema:ExtendedSchemaDescription = {}
    options:SchemaOptions = {}

    methods:{
        [name:string]: Function
    } = {}

    statics:{
        [name:string]: Function
    } = {}

    constructor(schema:ExtendedSchemaDescription, options:SchemaOptions){
        this.schema = schema || {};
        this.options = options || {};
        this.options.name = this.options.name || this.options.table_name || null;

        this.getSchemaDescription = this.getSchemaDescription.bind(this);
        this.getSchemaUDTDescription = this.getSchemaUDTDescription.bind(this);
        this.createOrGetUDT = this.createOrGetUDT.bind(this);

        this.toExpressCassandra = this.toExpressCassandra.bind(this);
    }

    static primitiveToCassandra(primitiveType:String|Number|Boolean|Date|Buffer|string):"text"|"float"|"boolean"|"timestamp"|"blob"|null{

        if(typeof(primitiveType) === "string" && ["set","list","map"].indexOf(primitiveType) === -1){
            return primitiveType;
        }
    
        switch(primitiveType){
            case String:
                return "text";
            case Number:
                return "float";
            case Boolean:
                return "boolean";
            case Date:
                return "timestamp";
            case Buffer:
                return "blob";
        }
    
        return null;
    }
    static async simpleComplexToCassandra(simpleType:Array|Set|Class<Map>|"map", ofType:String|Number|Boolean|Date|Buffer|string):"list"|"set"|"map"|null{

        if(simpleType.__proto__ && simpleType.__proto__.name === "Proxy" && simpleType.name === "Map"){
            if(!Array.isArray(ofType) || ! ofType.length === 2){
                throw new Error("When using 'Map' as field-type, 'of'-Property of field must be set with an Array containing the exact two Types for map<type1, type2>.");
            }
            return new Promise(async (resolve, reject) => {

                const keyType = ofType[0];
                const valType = ofType[1];

                const makeTypeDef = (str) => `<${str}>`;

                if(valType.constructor && valType.constructor.name === "Schema"){
                    const udt = await valType.createOrGetUDT();
                    resolve({
                        type: "map",
                        typeDef: makeTypeDef(`${Schema.primitiveToCassandra(keyType)},${udt}`)
                    });
                }
                else{
                    const primVal = Schema.primitiveToCassandra(valType);
                    if(primVal){
                        resolve({
                            type: "map",
                            typeDef: makeTypeDef(`${Schema.primitiveToCassandra(keyType)},${primVal}`)
                        });
                    }
                    else{
                        if(Array.isArray(valType)){
                            const scomValOfType = valType[0];

                            const simpCompType = await Schema.simpleComplexToCassandra(Array, scomValOfType);
                            if(simpCompType){
                                resolve({
                                    type: "map",
                                    typeDef: makeTypeDef(`${Schema.primitiveToCassandra(keyType)},frozen<${simpCompType.type}${simpCompType.typeDef}>`)
                                });
                            }
                            else{
                                reject();
                            }
                        }
                        else{
                            const simpCompVal = await Schema.simpleComplexToCassandra(valType);
                            if(simpCompVal){
                                resolve({
                                    type: "map",
                                    typeDef: makeTypeDef(`${Schema.primitiveToCassandra(keyType)},${simpCompVal}`)
                                });
                            }
                            else{
                                reject();
                            }

                        }
                    }
                }

            });
        }

        if(typeof(ofType) !== "string"){
            switch(ofType){
                case String:
                case Number:
                case Boolean:
                case Date:
                case Buffer:
                    break;
                default:
                    return null;
            }
        }

        switch(simpleType){
            case Array:
            case "list":
                return {
                    type: "list",
                    typeDef: `<${Schema.primitiveToCassandra(ofType)}>`
                };
            case Set:
            case "set":
                return {
                    type: "set",
                    typeDef: `<${Schema.primitiveToCassandra(ofType)}>`
                };
            case "map":
                return {
                    type: "map",
                    typeDef: `<${Schema.primitiveToCassandra(ofType)}>`
                };
        }

        return null;

    }



    getSchemaDescription(){
        const ret = {};
        const traverse = (o, key, _returnValue) => {
            if(o[key] && typeof o[key] === "object" && o[key].constructor === Schema){
                if(_returnValue){
                    return o[key].getSchemaDescription();
                }
                else{
                    ret[key] = o[key].getSchemaDescription();
                }
            }
            else if(o[key] && typeof o[key] === "object" && o[key].constructor === Object){
                if(o[key].hasOwnProperty("type")){
                    if(_returnValue){
                        return o[key];
                    }
                    else{
                        ret[key] = o[key];
                    }
                }
                else{
                    if(_returnValue){
                        let anchor = {}
                        Object.keys(o[key]).forEach(_k => {
                            anchor[_k] = traverse(o[key], _k, true);
                        });
                        return anchor;
                    }
                    else{
                        ret[key] = {};
                        Object.keys(o[key]).forEach(_k => {
                            ret[key][_k] = traverse(o[key], _k, true);
                        });
                    }
                }
            }
            else{
                if(_returnValue){
                    return o[key];
                }
                else{
                    ret[key] = o[key];
                }
            }
        };
        Object.keys(this.schema).forEach(k => {
            traverse(this.schema, k);
        });
        return ret;
    }
    async getSchemaUDTDescription(){
        const desc = this.getSchemaDescription();

        let fields = {};

        const traverse = async (sf, _k, _key, _subkeyarr) => {

            if(sf[_k] && typeof sf[_k] === "object" && sf[_k].constructor === Object && !sf[_k].hasOwnProperty("virtual")){
                if(sf[_k].hasOwnProperty("type")){
                    let type = Schema.primitiveToCassandra(sf[_k].type);

                    if(!type){
                        const complexType = await Schema.simpleComplexToCassandra(sf[_k].type, sf[_k].of);
                        if(!complexType){
                            throw new Error("Could not decode Type.");
                        }

                        type = `frozen<${complexType.type + complexType.typeDef}>`;
                    }

                    fields[_key] = type
                }
                else{
                    const subkeys = _subkeyarr || [];
                    
                    const sf_karr = Object.keys(sf[_k]);
                    for(let i = 0; i < sf_karr.length; i++){
                        const sf_k = sf_karr[i];
                        await traverse(sf[_k], sf_k, `${_key}.${sf_k}`, subkeys);
                    }

                }
            }
        };

        const desc_karr = Object.keys(desc);
        for(let i = 0; i < desc_karr.length; i++){
            const k = desc_karr[i];
            await traverse(desc, k, k);
        }

        return fields;
    }
    async createOrGetUDT(_client){
        if(!this.options.name || typeof this.options.name !== "string"){
            throw new Error("For creating a User-definded-type in the database a name is required. Set it with the 'options.name' property.");
        }

        const name = `${this.options.name}_udt`;

        const thisUDT = await this.getSchemaUDTDescription();
        
        const udtBuilder = new UDTBuilder(_client);

        const existentUDT = await new Promise((resolve, reject) => {
            udtBuilder.get_udt(name, _client.keyspace, (err, res) => {
                if(err){
                    reject(err);
                }
                else{
                    resolve(res);
                }
            });
        });

        if(existentUDT){
            for(let i = 0; i < existentUDT.field_names.length; i++){
                const exudt = {
                    name: existentUDT.field_names[i],
                    type: existentUDT.field_types[i]
                };

                if(!thisUDT.hasOwnProperty(exudt.name) || thisUDT[exudt.name] !== exudt.type){
                    throw new Error(`UDT with name '${name}' already exists, but does not match current Schema-UDT.`);
                }
            }

            return `frozen<${existentUDT.type_name}>`;
        }

        await new Promise((resolve, reject) => {
            udtBuilder.create_udt(name, thisUDT, (err) => {
                if(err){
                    reject(err)
                }
                else{
                    resolve();
                }
            });
        });

        return `frozen<${name}>`;
        
    }

    _addFlags(sf, cf){
        if(sf.asArray){
            cf.asArray = true;
        }
        if(sf.required){
            cf.rule = cf.rule || {};
            cf.rule.required = sf.required;
        }
    }
    _addDefault(sf, cf, thisschema){
        if(sf.default || sf.default === false){
            if(typeof(sf.default) === "function"){
                cf.default = ((sf) => {
                    const sf_default = sf.default;
                    const sf_schema = thisschema;
                    return function(){
                        return sf_default(this, sf_schema);
                    };
                })(sf);
            }
            else{
                cf.default = sf.default;
            }
        }
    }
    _addValidators(sf, cf, thisschema){
        const validatorFns = [];

        if(sf.match){
            validatorFns.push(
                ((sf) => {
                    const sf_match = sf.match;
                    return function(value){
                        return sf_match.test(value);
                    }
                })(sf)
            );
        }

        if(sf.enum && sf.enum.length){
            validatorFns.push(
                ((sf) => {
                    const sf_enum = sf.enum;
                    return function(value){
                        return sf_enum.indexOf(value) !== -1;
                    }
                })(sf)
            );
        }

        if(sf.minlength || sf.minlength === 0){
            validatorFns.push(
                ((sf) => {
                    const sf_minlength = sf.minlength;
                    return function(value){
                        return value.length >= sf_minlength;
                    }
                })(sf)
            );
        }

        if(sf.maxlength || sf.maxlength === 0){
            validatorFns.push(
                ((sf) => {
                    const sf_maxlength = sf.maxlength;
                    return function(value){
                        return value.length <= sf_maxlength;
                    }
                })(sf)
            );
        }

        if(sf.min || sf.min === 0){
            validatorFns.push(
                ((sf) => {
                    const sf_min = sf.min;
                    return function(value){
                        if(typeof(sf_min) === "function"){
                            return value >= sf_min();
                        }
                        else{
                            return value >= sf_min;
                        }
                    }
                })(sf)
            );
        }

        if(sf.max || sf.max === 0){
            validatorFns.push(
                ((sf) => {
                    const sf_max = sf.max;
                    return function(value){
                        if(typeof(sf_max) === "function"){
                            return value <= sf_max();
                        }
                        else{
                            return value <= sf_max;
                        }
                    }
                })(sf)
            );
        }

        if(sf.validate){
            validatorFns.push(
                ((sf) => {
                    const sf_validate = sf.validate;
                    const sf_schema = thisschema;
                    return function(value){
                        return sf_validate(value, this, sf_schema);
                    }
                })(sf)
            );
        }


        //######
        // Transformation Functions injected as "always-true"-validators, as soon as Model is accessable from validator function.
        //######


        if(validatorFns.length){
            cf.rule = cf.rule || {};
            cf.rule.validator = ((_validatorFns) => {
                const __validatorFns = _validatorFns;

                return function(value){
                    let res = true;
                    for(let i = 0; i < _validatorFns.length; i++){
                        res = res && _validatorFns[i].bind(this)(value);
                        if(!res){
                            return res;
                        }
                    }
                    return res;
                }
            })(validatorFns);
            cf.rule.message = "Validation failed."; // TODO: give specific error instead of generic
        }
    }
    _addGetterSetter(sf, cf, thisschema){
        // Getter and Setter for fields like normal getters and setter, not making the whole field virtual
        // and non existent in the database. Mongoose allows this. If 'virtual' is set, then make it really just virtual
        // using express-cassandra feature
        if(sf.get){
            let anchor = sf.virtual ? "virtual" : "__$extras";

            cf[anchor] = cf[anchor] || {};
            cf[anchor].get = ((sf) => {
                const sf_get = sf.get;
                const sf_schema = thisschema;
                return function(_value_from_setter){
                    return sf_get.bind(this)(this, sf_schema, _value_from_setter);
                }
            })(sf);
        }
        if(sf.set){
            let anchor = sf.virtual ? "virtual" : "__$extras";

            cf[anchor] = cf[anchor] || {};
            cf[anchor].set = ((sf) => {
                const sf_set = sf.set;
                const sf_schema = thisschema;

                if(anchor === "virtual"){
                    return function(value){
                        sf_set.bind(this)(value, this, sf_schema);
                    }
                }
                else{
                    return function(value){
                        return sf_set.bind(this)(value, this, sf_schema);
                    }
                }

            })(sf);
        }
    }
    _addTransformations(sf, k, before_save, before_update){
        if(sf.lowercase){
            const applyLowercase = ((_k) => {
                const __k = _k;
                return function(instance, options){
                    if(instance && instance[__k] && instance[__k].toLowerCase && typeof(instance[__k].toLowerCase) === "function"){
                        instance[__k] = instance[__k].toLowerCase();
                    }
                }
            })(k);
            before_save.push(applyLowercase);
            before_update.push(applyLowercase);
        }
        if(sf.uppercase){
            const applyUppercase = ((_k) => {
                const __k = _k;
                return function(instance, options){
                    if(instance && instance[__k] && instance[__k].toUpperCase && typeof(instance[__k].toUpperCase) === "function"){
                        instance[__k] = instance[__k].toUpperCase();
                    }
                }
            })(k);
            before_save.push(applyUppercase);
            before_update.push(applyUppercase);
        }
        if(sf.trim){
            const applyTrim = ((_k) => {
                const __k = _k;
                return function(instance, options){
                    if(instance && instance[__k] && instance[__k].trim && typeof(instance[__k].trim) === "function"){
                        instance[__k] = instance[__k].trim();
                    }
                }
            })(k);
            before_save.push(applyTrim);
            before_update.push(applyTrim);
        }
    }
    _addKeysIndexes(sf, k, primary_key, clustering_key, secondary_index){
        if(sf.primary_key){
            primary_key.push(k);
        }
        if(sf.clustering_key){
            clustering_key.push(k);
        }
        if(sf.secondary_index){
            secondary_index.push(k);
        }
    }

    async toExpressCassandra(_client, fieldsOnly){
        const thisschema = this;

        let fields = {};

        const primary_key = [];
        const clustering_key = [];
        const secondary_index = [];

        const before_save = [];
        const before_update = [];

        const methods = this.methods;

        const schemaDesc = this.getSchemaDescription();

        const schemaDesc_karr = Object.keys(schemaDesc);
        for(let i = 0; i < schemaDesc_karr.length; i++){
            const k = schemaDesc_karr[i];

            const makeField = async (field, key) => {
                const sfPrimitiveType = Schema.primitiveToCassandra(field.type);
                const sfSimpleComplexType = await Schema.simpleComplexToCassandra(field.type, field.of);

                let cf = {};

                if(sfPrimitiveType){
                    cf = {
                        type: sfPrimitiveType
                    };
                }
                else if(sfSimpleComplexType){
                    cf = {
                        ...sfSimpleComplexType
                    };
                }

                this._addFlags(field, cf);
                this._addDefault(field, cf, thisschema);
                this._addValidators(field, cf, thisschema);
                this._addGetterSetter(field, cf, thisschema);
                this._addTransformations(field, key, before_save, before_update);
                this._addKeysIndexes(field, key, primary_key, clustering_key, secondary_index);

                return cf;
            };

            const traverse = async (sf, _k, _key, _subkeyarr) => {

                if(sf[_k] && typeof sf[_k] === "object" && sf[_k].constructor === Object){
                    if(sf[_k].hasOwnProperty("type")){
                        const cf = await makeField(sf[_k], _key);
                        fields[_key] = cf;

                        if(_subkeyarr){
                            _subkeyarr.push(_key);
                        }
                    }
                    else if(sf[_k].hasOwnProperty("ref") && typeof(sf[_k].ref) === "string"){
                        let refschema = cadoose().schemas[sf[_k].ref];
                        if(refschema){
                            const refkey = [].concat(...refschema.options.key);

                            const cf = await makeField({
                                type: Map,
                                of: [String, String],
                                validate: ((__refkey) => {
                                    const _rkey = __refkey;
                                    return (value, model, schema) => {
                                        return value && Object.keys(value).length === _rkey.length && Object.keys(value).map(vk => {
                                            return _rkey.indexOf(vk) !== -1
                                        }).filter(Boolean).length === _rkey.length;
                                    }
                                })(refkey)
                            }, _key);

                            fields[_key] = cf;
                            fields[_key].ref = sf[_k].ref;

                            if(_subkeyarr){
                                _subkeyarr.push(_key);
                            }
                        }
                        else{
                            throw new Error("Referenced Schema NOT FOUND!");
                        }
                    }
                    else{
                        const subkeys = _subkeyarr || [];
                        
                        const sf_karr = Object.keys(sf[_k]);
                        for(let i = 0; i < sf_karr.length; i++){
                            const sf_k = sf_karr[i];
                            await traverse(sf[_k], sf_k, `${_key}.${sf_k}`, subkeys);
                        }

                        fields[_key] = {
                            type: "map", // dummy prop
                            typeDef: "<text, text>", // dummy prop
                            virtual: {
                                get: ((_subkeys) => {
                                    const _sarr = _subkeys;
                                    return function(){
                                        const o = {};
                                        _sarr.forEach(sk => {
                                            lodashSet(o, sk.substr(sk.indexOf(".")+1), this[sk]);
                                        });
                                        return o;
                                    }
                                })(subkeys),
                                set: ((_subkeys) => {
                                    const _sarr = _subkeys;
                                    return function(value){
                                        _sarr.forEach(sk => {
                                            this[sk] = lodashGet(value, sk.substr(sk.indexOf(".")+1))
                                        });
                                    }
                                })(subkeys)
                            },
                        };
                    }
                }
                else if(
                    sf[_k] && typeof sf[_k] === "object" &&
                    (sf[_k].constructor === Array || sf[_k].constructor === Set)
                ){
                    const sarr = [...sf[_k]];
                    if(
                        sarr.length === 1 &&
                        typeof sarr[0] === "object" && sarr[0].constructor === Object &&
                        sarr[0].hasOwnProperty("ref") && typeof(sarr[0].ref) === "string"
                    ){
                        let refschema = cadoose().schemas[sarr[0].ref];
                        if(refschema){
                            const refkey = [].concat(...refschema.options.key);

                            fields[_key] = {
                                type: sf[_k].constructor === Array ? "list" : "set",
                                typeDef: "<frozen<map<text,text>>>",
                                rule:{
                                    validator: ((__refkey) => {
                                        const _rkey = __refkey;
                                        return (value) => {

                                            let vals = value || [];
                                            vals = [...vals];
        
                                            for(let i = 0; i < vals.length; i++){
                                                const v = vals[i];

                                                const OK = v && Object.keys(v).length === _rkey.length && Object.keys(v).map(vk => {
                                                    return _rkey.indexOf(vk) !== -1
                                                }).filter(Boolean).length === _rkey.length;

                                                if(!OK){
                                                    return false
                                                }
                                            }

                                            return true;

                                            return value && Object.keys(value).length === _rkey.length && Object.keys(value).map(vk => {
                                                return _rkey.indexOf(vk) !== -1
                                            }).filter(Boolean).length === _rkey.length;
                                        }
                                    })(refkey),
                                    message: "One or more items are no valid references to the referenced Model."
                                }

                            };
                            fields[_key].ref = sarr[0].ref;

                            if(_subkeyarr){
                                _subkeyarr.push(_key);
                            }
                        }
                        else{
                            throw new Error("Referenced Schema NOT FOUND!");
                        }
                    }
                }
                else if(
                    sf[_k] && typeof sf[_k] === "object" &&
                    sf[_k].constructor === Array && sf[_k].length === 1 &&
                    typeof sf[_k][0] === "object" && sf[_k][0].constructor === Schema){

                        const exprCassObj = await sf[_k][0].toExpressCassandra(_client);

                        fields[_key] = {
                            type: "list",
                            typeDef: `<${await sf[_k][0].createOrGetUDT(_client)}>`,
                            rule:{
                                validator: (value) => {
                                    const vals = value || [];

                                    for(let i = 0; i < vals.length; i++){
                                        const v = vals[i];

                                        const fields_karr = Object.keys(exprCassObj.fields);
                                        for(let i = 0; i < fields_karr.length; i++){
                                            const k = fields_karr[i];
                                            if(v[k]){

                                                const cf = exprCassObj.fields[k];
                                                if(cf.rule && cf.rule.validator){
                                                    if(!cf.rule.validator(v[k])){
                                                        return false;
                                                    }
                                                }

                                            }
                                        }
                                    }

                                    return true;
                                },
                                message: "One or more items have failed in validation"
                            }
                        };
                }
                else if(
                    sf[_k] && typeof sf[_k] === "object" &&
                    sf[_k].constructor === Set){
                        const sarr = [...sf[_k]];
                        if(sarr.length === 1 && typeof sarr[0] === "object" && sarr[0].constructor === Schema){

                            const exprCassObj = await sarr[0].toExpressCassandra(_client);

                            fields[_key] = {
                                type: "set",
                                typeDef: `<${await sarr[0].createOrGetUDT(_client)}>`,
                                rule:{
                                    validator: (value) => {
                                        let vals = value || [];
                                        vals = [...vals];
    
                                        for(let i = 0; i < vals.length; i++){
                                            const v = vals[i];
    
                                            const fields_karr = Object.keys(exprCassObj.fields);
                                            for(let i = 0; i < fields_karr.length; i++){
                                                const k = fields_karr[i];
                                                if(v[k]){
    
                                                    const cf = exprCassObj.fields[k];
                                                    if(cf.rule && cf.rule.validator){
                                                        if(!cf.rule.validator(v[k])){
                                                            return false;
                                                        }
                                                    }
    
                                                }
                                            }
                                        }
    
                                        return true;
                                    },
                                    message: "One or more items have failed in validation"
                                }
                            };
                        }
                }
            };

            await traverse(schemaDesc, k, k);
        }

        let key = [];
        if(this.options.key){
            if(Array.isArray(this.options.key) && this.options.key.length){
                key = this.options.key;
            }
            else if(typeof(this.options.key) === "string"){
                key = [this.options.key];
            }
        }
        else{
            if(primary_key.length === 0 && clustering_key.length !== 0){
                throw new Error("Must have PRIMARY KEY if using CLUSTERING KEYs.");
            }

            if(primary_key.length === 1){
                key.push(primary_key[0]);
            }
            else{
                key.push(primary_key);
            }

            if(clustering_key.length){
                key = [...key, ...clustering_key];
            }
        }


        let indexes = [];
        if(this.options.indexes){
            if(Array.isArray(this.options.indexes) && this.options.indexes.length){
                indexes = this.options.indexes;
            }
            else if(typeof(this.options.indexes) === "string"){
                indexes = [this.options.indexes];
            }
        }
        else{
            indexes = secondary_index;
        }

        this.options.key = key;
        this.options.indexes = indexes;

        return {
            table_name: this.options.table_name,

            fields,
            
            key,
            indexes,
            
            methods,

            before_save: before_save.length ? ((_before_save) => {
                const before_save_fns = _before_save;
                return function (instance, options) {
                    (before_save_fns || []).forEach(fn => {
                        fn(instance, options);
                    });
                    return true;
                }
            })(before_save) : undefined,

            before_update: before_update.length ? ((_before_update) => {
                const before_update_fns = _before_update;
                return function (instance, options) {
                    (before_update_fns || []).forEach(fn => {
                        fn(instance, options);
                    });
                    return true;
                }
            })(before_update) : undefined,
            

            ...(this.options.expressCassandraOpts || {})
        };
    }
}

export default Schema;