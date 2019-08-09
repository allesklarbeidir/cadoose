// @flow
import {MakeCadoose, CADOOSE, Model as CadooseModel, Schema, SpecialTypes} from "../src";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);
const expect = chai.expect;

const Map = SpecialTypes.Map;
const JSONB = SpecialTypes.JSONB;

const cassandra = MakeCadoose({
        localDataCenter: "datacenter1",
        contactPoints: ["127.0.0.1"],
        protocolOptions: { port: 9042 },
        keyspace: "main",
        queryOptions: {}
    },{
    defaultReplicationStrategy : {
        class: 'SimpleStrategy',
        replication_factor: 1
    },
    migration: 'safe',
});

describe("Cadoose", () => {

    afterEach((done) => {
        Promise.all(Object.keys(cassandra.instance).map(table => new Promise((resolve,reject) => {
                if(cassandra.instance[table]){
                    cassandra.instance[table].execute_query(`DROP TABLE IF EXISTS "${table}"`, null, function(err, res){
                        if(err){
                            reject(err);
                        }
                        else{
                            resolve(res);
                        }
                    });
                }
                else{
                    resolve();
                }
            }))
        ).then(_ => done()).catch(_ => done());
    });


    describe("Two different approaches for registering+syncing a Model in the DB", () => {

        it("Model.registerAndSync being asynchronous, one needs to 'await' the Model", async () => {
            const s = new Schema({
                string: {
                    type: String,
                    primary_key: true
                },
                number: {
                    type: Number,
                },
                bool: {
                    type: Boolean,
                }
            }, {});
            
            const Model = await CadooseModel.registerAndSync("primitives", s);
    
            const a = new Model({
                string: "string",
                number: 100,
                bool: true
            });
            await a.saveAsync();

            const aa = await Model.findOneAsync({string:"string"});

            expect(aa.string).to.be.equal(a.string);
            expect(aa.number).to.be.equal(a.number);
            expect(aa.bool).to.be.equal(a.bool);
        });

        it("Model.registerAndSyncDefered being synchronous, no need to 'await' the Model, but call 'await MyModel.undefer()' or put an extra await in front of any other method being called.", async () => {
            const s = new Schema({
                string: {
                    type: String,
                    primary_key: true
                },
                number: {
                    type: Number,
                },
                bool: {
                    type: Boolean,
                }
            }, {});
            
            const Model = CadooseModel.registerAndSyncDefered("primitives", s);

            await Model.undefer();
    
            const a = new Model({
                string: "string",
                number: 100,
                bool: true
            });
            await a.saveAsync();

            const aa = await Model.findOneAsync({string:"string"});

            expect(aa.string).to.be.equal(a.string);
            expect(aa.number).to.be.equal(a.number);
            expect(aa.bool).to.be.equal(a.bool);
        });

    });

    
    describe("Basic CRUD Operations with Schemas and Models", () => {
        
        describe("Data-Types: Primitive Types (String / Number / Boolean)", () => {

            it("Has all values after saving", async () => {
                const s = new Schema({
                    string: {
                        type: String,
                        primary_key: true
                    },
                    number: {
                        type: Number,
                    },
                    bool: {
                        type: Boolean,
                    }
                }, {});
                
                const Model = await CadooseModel.registerAndSync("primitives", s);
        
                const a = new Model({
                    string: "string",
                    number: 100,
                    bool: true
                });
                await a.saveAsync();

                const aa = await Model.findOneAsync({string:"string"});
    
                expect(aa.string).to.be.equal(a.string);
                expect(aa.number).to.be.equal(a.number);
                expect(aa.bool).to.be.equal(a.bool);
            });

            it("Default values are inserted correctly", async () => {
                const s = new Schema({
                    string: {
                        type: String,
                        primary_key: true,
                        default: "some-default-string"
                    },
                    number: {
                        type: Number,
                        default: 100
                    },
                    bool: {
                        type: Boolean,
                        default: false
                    }
                });

                const Model = await CadooseModel.registerAndSync("primitives", s);

                const a = new Model();
                await a.saveAsync();

                const aa = await Model.findOneAsync({string: "some-default-string"});

                expect(aa.string).to.be.equal("some-default-string");
                expect(aa.number).to.be.equal(100);
                expect(aa.bool).to.be.equal(false);
            });

            it("Unset values (undefined) will be set to >null< to reflect behavior of DB", async () => {
                const s = new Schema({
                    id: {
                        type: String,
                        primary_key: true
                    },
                    necessary_prop: {
                        type: String
                    },
                    unnprops: {
                        prop1: {
                            type: String
                        },
                        prop2: {
                            type: String
                        },
                        unnprops2: {
                            prop3: {
                                type: String
                            }
                        }
                    }
                });

                const Model = CadooseModel.registerAndSyncDefered("undefined_to_null", s);

                await Model.undefer();

                const a = new Model({
                    id: "some-id",
                    necessary_prop: "necessary-prop!"
                });

                expect(a.id).to.be.equal("some-id");
                expect(a.necessary_prop).to.be.equal("necessary-prop!");
                expect(typeof a.unnprops).to.be.equal("object");
                expect(a.unnprops.prop1).to.be.equal(null);
                expect(a.unnprops.prop2).to.be.equal(null);
                expect(typeof a.unnprops.unnprops2).to.be.equal("object");
                expect(a.unnprops.unnprops2.prop3).to.be.equal(null);

                await a.saveAsync();

                const aa = await Model.findOneAsync({id:"some-id"});

                expect(aa.id).to.be.equal("some-id");
                expect(aa.necessary_prop).to.be.equal("necessary-prop!");
                expect(typeof aa.unnprops).to.be.equal("object");
                expect(aa.unnprops.prop1).to.be.equal(null);
                expect(aa.unnprops.prop2).to.be.equal(null);
                expect(typeof aa.unnprops.unnprops2).to.be.equal("object");
                expect(aa.unnprops.unnprops2.prop3).to.be.equal(null);

            });

            describe("Primary-, Clustering-Keys and Secondary Indexes", () => {

                it("Field with 'primary_key' set to true is the primary key", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string"
                        },
                        number: {
                            type: Number,
                            default: 100
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        }
                    });
                    const columnNames = ["string"];
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    await a.saveAsync();
    
                    const query = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='primitives'";
                    const column_types = await new Promise((resolve,reject) => {
                        cassandra.instance["primitives"].execute_query(query, null, function(err, res){
                            if(err){
                                reject(err);
                            }
                            else{
                                resolve(res.rows);
                            }
                        });
                    });
                    
                    column_types.forEach(t => {
                        if(columnNames.indexOf(t.column_name) !== -1){
                            expect(t.kind).to.be.equal("partition_key");
                        }
                    });
                });

                it("Field with 'primary_key' set to true is the primary key (set with options.key = 'column')", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            default: "some-default-string"
                        },
                        number: {
                            type: Number,
                            default: 100
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        }
                    },{
                        key: "string"
                    });
                    const columnNames = ["string"];
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    await a.saveAsync();
    
                    const query = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='primitives'";
                    const column_types = await new Promise((resolve,reject) => {
                        cassandra.instance["primitives"].execute_query(query, null, function(err, res){
                            if(err){
                                reject(err);
                            }
                            else{
                                resolve(res.rows);
                            }
                        });
                    });
                    
                    column_types.forEach(t => {
                        if(columnNames.indexOf(t.column_name) !== -1){
                            expect(t.kind).to.be.equal("partition_key");
                        }
                    });
                });



                it("Multiple fields with 'primary_key' set to true create a compound primary key", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string"
                        },
                        number: {
                            type: Number,
                            primary_key: true,
                            default: 100
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        }
                    });
                    const columnNames = ["string","number"];
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    await a.saveAsync();
    
                    const query = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='primitives'";
                    const column_types = await new Promise((resolve,reject) => {
                        cassandra.instance["primitives"].execute_query(query, null, function(err, res){
                            if(err){
                                reject(err);
                            }
                            else{
                                resolve(res.rows);
                            }
                        });
                    });
                    
                    column_types.forEach(t => {
                        if(columnNames.indexOf(t.column_name) !== -1){
                            expect(t.kind).to.be.equal("partition_key");
                        }
                    });
                });

                it("Multiple fields with 'primary_key' set to true create a compound primary key (set with options.key = [[column1, column2]])", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            default: "some-default-string"
                        },
                        number: {
                            type: Number,
                            default: 100
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        }
                    },{
                        key: [["string","number"]]
                    });
                    const columnNames = ["string","number"];
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    await a.saveAsync();
    
                    const query = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='primitives'";
                    const column_types = await new Promise((resolve,reject) => {
                        cassandra.instance["primitives"].execute_query(query, null, function(err, res){
                            if(err){
                                reject(err);
                            }
                            else{
                                resolve(res.rows);
                            }
                        });
                    });
                    
                    column_types.forEach(t => {
                        if(columnNames.indexOf(t.column_name) !== -1){
                            expect(t.kind).to.be.equal("partition_key");
                        }
                    });
                });



                it("Field with 'clustering_key' set to true should is the clustering key", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string"
                        },
                        number: {
                            type: Number,
                            clustering_key: true,
                            default: 100
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        }
                    });
                    const columnNamesPrimary = ["string"];
                    const columnNamesClustering = ["number"];
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    await a.saveAsync();
    
                    const query = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='primitives'";
                    const column_types = await new Promise((resolve,reject) => {
                        cassandra.instance["primitives"].execute_query(query, null, function(err, res){
                            if(err){
                                reject(err);
                            }
                            else{
                                resolve(res.rows);
                            }
                        });
                    });
                    
                    column_types.forEach(t => {
                        if(columnNamesPrimary.indexOf(t.column_name) !== -1){
                            expect(t.kind).to.be.equal("partition_key");
                        }
                        if(columnNamesClustering.indexOf(t.column_name) !== -1){
                            expect(t.kind).to.be.equal("clustering");
                        }
                    });
                });

                it("Field with 'clustering_key' set to true should is the clustering key (set with options.key = [column1, column2])", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            default: "some-default-string"
                        },
                        number: {
                            type: Number,
                            default: 100
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        }
                    },{
                        key: ["string", "number"]
                    });
                    const columnNamesPrimary = ["string"];
                    const columnNamesClustering = ["number"];
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    await a.saveAsync();
    
                    const query = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='primitives'";
                    const column_types = await new Promise((resolve,reject) => {
                        cassandra.instance["primitives"].execute_query(query, null, function(err, res){
                            if(err){
                                reject(err);
                            }
                            else{
                                resolve(res.rows);
                            }
                        });
                    });
                    
                    column_types.forEach(t => {
                        if(columnNamesPrimary.indexOf(t.column_name) !== -1){
                            expect(t.kind).to.be.equal("partition_key");
                        }
                        if(columnNamesClustering.indexOf(t.column_name) !== -1){
                            expect(t.kind).to.be.equal("clustering");
                        }
                    });
                });



                it("Multiple fields with 'clustering_key' set to true create a compound clustering key", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string"
                        },
                        number: {
                            type: Number,
                            clustering_key: true,
                            default: 100
                        },
                        bool: {
                            type: Boolean,
                            clustering_key: true,
                            default: false
                        },
                        some_prop: {
                            type: String,
                            default: "hallo"
                        }
                    });
                    const columnNamesPrimary = ["string"];
                    const columnNamesClustering = ["number", "bool"];
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    await a.saveAsync();
    
                    const query = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='primitives'";
                    const column_types = await new Promise((resolve,reject) => {
                        cassandra.instance["primitives"].execute_query(query, null, function(err, res){
                            if(err){
                                reject(err);
                            }
                            else{
                                resolve(res.rows);
                            }
                        });
                    });
                    
                    column_types.forEach(t => {
                        if(columnNamesPrimary.indexOf(t.column_name) !== -1){
                            expect(t.kind).to.be.equal("partition_key");
                        }
                        if(columnNamesClustering.indexOf(t.column_name) !== -1){
                            expect(t.kind).to.be.equal("clustering");
                        }
                    });
                });

                it("Multiple fields with 'clustering_key' set to true create a compound clustering key (set with options.key = [[pk], column1, column2])", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            default: "some-default-string"
                        },
                        number: {
                            type: Number,
                            default: 100
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        },
                        some_prop: {
                            type: String,
                            default: "hallo"
                        }
                    },{
                        key: [["string"], "number", "bool"]
                    });
                    const columnNamesPrimary = ["string"];
                    const columnNamesClustering = ["number", "bool"];
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    await a.saveAsync();
    
                    const query = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='primitives'";
                    const column_types = await new Promise((resolve,reject) => {
                        cassandra.instance["primitives"].execute_query(query, null, function(err, res){
                            if(err){
                                reject(err);
                            }
                            else{
                                resolve(res.rows);
                            }
                        });
                    });
                    
                    column_types.forEach(t => {
                        if(columnNamesPrimary.indexOf(t.column_name) !== -1){
                            expect(t.kind).to.be.equal("partition_key");
                        }
                        if(columnNamesClustering.indexOf(t.column_name) !== -1){
                            expect(t.kind).to.be.equal("clustering");
                        }
                    });
                });

                
                it("Multiple fields with 'primary_key' and 'clustering_key' set to true create a compound key with '[[pk_1, pk_2, ...], ck_1, ck_2, ...]'", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string"
                        },
                        number: {
                            type: Number,
                            primary_key: true,
                            default: 100
                        },
                        bool: {
                            type: Boolean,
                            clustering_key: true,
                            default: false
                        },
                        some_prop: {
                            type: String,
                            clustering_key: true,
                            default: "hallo"
                        },
                        some_prop2: {
                            type: String,
                            default: "hallo2"
                        }
                    });
                    const columnNamesPrimary = ["string", "number"];
                    const columnNamesClustering = ["bool", "some_prop"];
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    await a.saveAsync();
    
                    const query = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='primitives'";
                    const column_types = await new Promise((resolve,reject) => {
                        cassandra.instance["primitives"].execute_query(query, null, function(err, res){
                            if(err){
                                reject(err);
                            }
                            else{
                                resolve(res.rows);
                            }
                        });
                    });
                    
                    column_types.forEach(t => {
                        if(columnNamesPrimary.indexOf(t.column_name) !== -1){
                            expect(t.kind).to.be.equal("partition_key");
                        }
                        if(columnNamesClustering.indexOf(t.column_name) !== -1){
                            expect(t.kind).to.be.equal("clustering");
                        }
                    });
                });

                it("Multiple fields with 'primary_key' and 'clustering_key' set to true create a compound key with '[[pk_1, pk_2, ...], ck_1, ck_2, ...]' (set with options.key)", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            default: "some-default-string"
                        },
                        number: {
                            type: Number,
                            default: 100
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        },
                        some_prop: {
                            type: String,
                            default: "hallo"
                        },
                        some_prop2: {
                            type: String,
                            default: "hallo2"
                        }
                    },{
                        key: [["string", "number"], "bool", "some_prop"]
                    });
                    const columnNamesPrimary = ["string", "number"];
                    const columnNamesClustering = ["bool", "some_prop"];
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    await a.saveAsync();
    
                    const query = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='primitives'";
                    const column_types = await new Promise((resolve,reject) => {
                        cassandra.instance["primitives"].execute_query(query, null, function(err, res){
                            if(err){
                                reject(err);
                            }
                            else{
                                resolve(res.rows);
                            }
                        });
                    });
                    
                    column_types.forEach(t => {
                        if(columnNamesPrimary.indexOf(t.column_name) !== -1){
                            expect(t.kind).to.be.equal("partition_key");
                        }
                        if(columnNamesClustering.indexOf(t.column_name) !== -1){
                            expect(t.kind).to.be.equal("clustering");
                        }
                    });
                });



                it("Field with 'secondary_index' set to true is indexed in the Secondary Index", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string"
                        },
                        number: {
                            type: Number,
                            secondary_index: true,
                            default: 100
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        }
                    });
                    const columnNamesKey = ["string"];
                    const columnNamesIndex = ["number"];
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    await a.saveAsync();
    
                    const queryColumns = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='primitives'";
                    const column_types = await new Promise((resolve,reject) => {
                        cassandra.instance["primitives"].execute_query(queryColumns, null, function(err, res){
                            if(err){
                                reject(err);
                            }
                            else{
                                resolve(res.rows);
                            }
                        });
                    });
                    
                    column_types.forEach(t => {
                        if(columnNamesKey.indexOf(t.column_name) !== -1){
                            expect(t.kind).to.be.equal("partition_key");
                        }
                    });

                    const queryIndexes = "SELECT index_name FROM system_schema.indexes WHERE keyspace_name='main' AND table_name='primitives'";
                    const column_indexes = await new Promise((resolve,reject) => {
                        cassandra.instance["primitives"].execute_query(queryIndexes, null, function(err, res){
                            if(err){
                                reject(err);
                            }
                            else{
                                resolve(res.rows);
                            }
                        });
                    });
                    
                    column_indexes.forEach(t => {
                        expect(columnNamesIndex.map(n => `primitives_${n}_idx`).indexOf(t.index_name) !== -1).to.be.equal(true);
                    });
                });

                it("Multiple fields with 'secondary_index' set to true are indexed in the Secondary Index", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string"
                        },
                        number: {
                            type: Number,
                            secondary_index: true,
                            default: 100
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        },
                        some_prop: {
                            type: String,
                            secondary_index: true,
                            default: "testprop"
                        }
                    });
                    const columnNamesKey = ["string"];
                    const columnNamesIndex = ["number","some_prop"];
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    await a.saveAsync();
    
                    const queryColumns = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='primitives'";
                    const column_types = await new Promise((resolve,reject) => {
                        cassandra.instance["primitives"].execute_query(queryColumns, null, function(err, res){
                            if(err){
                                reject(err);
                            }
                            else{
                                resolve(res.rows);
                            }
                        });
                    });
                    
                    column_types.forEach(t => {
                        if(columnNamesKey.indexOf(t.column_name) !== -1){
                            expect(t.kind).to.be.equal("partition_key");
                        }
                    });

                    const queryIndexes = "SELECT index_name FROM system_schema.indexes WHERE keyspace_name='main' AND table_name='primitives'";
                    const column_indexes = await new Promise((resolve,reject) => {
                        cassandra.instance["primitives"].execute_query(queryIndexes, null, function(err, res){
                            if(err){
                                reject(err);
                            }
                            else{
                                resolve(res.rows);
                            }
                        });
                    });
                    
                    column_indexes.forEach(t => {
                        expect(columnNamesIndex.map(n => `primitives_${n}_idx`).indexOf(t.index_name) !== -1).to.be.equal(true);
                    });
                });


                it("Field with 'secondary_index' set to true is indexed in the Secondary Index (set with options.indexes)", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string"
                        },
                        number: {
                            type: Number,
                            default: 100
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        }
                    },{
                        indexes: "number"
                    });
                    const columnNamesKey = ["string"];
                    const columnNamesIndex = ["number"];
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    await a.saveAsync();
    
                    const queryColumns = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='primitives'";
                    const column_types = await new Promise((resolve,reject) => {
                        cassandra.instance["primitives"].execute_query(queryColumns, null, function(err, res){
                            if(err){
                                reject(err);
                            }
                            else{
                                resolve(res.rows);
                            }
                        });
                    });
                    
                    column_types.forEach(t => {
                        if(columnNamesKey.indexOf(t.column_name) !== -1){
                            expect(t.kind).to.be.equal("partition_key");
                        }
                    });

                    const queryIndexes = "SELECT index_name FROM system_schema.indexes WHERE keyspace_name='main' AND table_name='primitives'";
                    const column_indexes = await new Promise((resolve,reject) => {
                        cassandra.instance["primitives"].execute_query(queryIndexes, null, function(err, res){
                            if(err){
                                reject(err);
                            }
                            else{
                                resolve(res.rows);
                            }
                        });
                    });
                    
                    column_indexes.forEach(t => {
                        expect(columnNamesIndex.map(n => `primitives_${n}_idx`).indexOf(t.index_name) !== -1).to.be.equal(true);
                    });
                });
                it("Multiple fields with 'secondary_index' set to true are indexed in the Secondary Index (set with options.indexes)", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string"
                        },
                        number: {
                            type: Number,
                            default: 100
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        },
                        some_prop: {
                            type: String,
                            default: "testprop"
                        }
                    },{
                        indexes: ["number", "some_prop"]
                    });
                    const columnNamesKey = ["string"];
                    const columnNamesIndex = ["number","some_prop"];
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    await a.saveAsync();
    
                    const queryColumns = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='primitives'";
                    const column_types = await new Promise((resolve,reject) => {
                        cassandra.instance["primitives"].execute_query(queryColumns, null, function(err, res){
                            if(err){
                                reject(err);
                            }
                            else{
                                resolve(res.rows);
                            }
                        });
                    });
                    
                    column_types.forEach(t => {
                        if(columnNamesKey.indexOf(t.column_name) !== -1){
                            expect(t.kind).to.be.equal("partition_key");
                        }
                    });

                    const queryIndexes = "SELECT index_name FROM system_schema.indexes WHERE keyspace_name='main' AND table_name='primitives'";
                    const column_indexes = await new Promise((resolve,reject) => {
                        cassandra.instance["primitives"].execute_query(queryIndexes, null, function(err, res){
                            if(err){
                                reject(err);
                            }
                            else{
                                resolve(res.rows);
                            }
                        });
                    });
                    
                    column_indexes.forEach(t => {
                        expect(columnNamesIndex.map(n => `primitives_${n}_idx`).indexOf(t.index_name) !== -1).to.be.equal(true);
                    });
                });

                it("Multiple fields with 'secondary_index' set to true are indexed in the Secondary Index (set with options.indexes + clustering keys set)", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string"
                        },
                        number: {
                            type: Number,
                            clustering_key: true,
                            default: 100
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        },
                        some_prop: {
                            type: String,
                            default: "testprop"
                        }
                    },{
                        indexes: ["number", "some_prop"]
                    });
                    const columnNamesKey = ["string"];
                    const columnNamesCKey = ["number"];
                    const columnNamesIndex = ["number","some_prop"];
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    await a.saveAsync();
    
                    const queryColumns = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='primitives'";
                    const column_types = await new Promise((resolve,reject) => {
                        cassandra.instance["primitives"].execute_query(queryColumns, null, function(err, res){
                            if(err){
                                reject(err);
                            }
                            else{
                                resolve(res.rows);
                            }
                        });
                    });
                    
                    column_types.forEach(t => {
                        if(columnNamesKey.indexOf(t.column_name) !== -1){
                            expect(t.kind).to.be.equal("partition_key");
                        }
                    });
                    column_types.forEach(t => {
                        if(columnNamesCKey.indexOf(t.column_name) !== -1){
                            expect(t.kind).to.be.equal("clustering");
                        }
                    });

                    const queryIndexes = "SELECT index_name FROM system_schema.indexes WHERE keyspace_name='main' AND table_name='primitives'";
                    const column_indexes = await new Promise((resolve,reject) => {
                        cassandra.instance["primitives"].execute_query(queryIndexes, null, function(err, res){
                            if(err){
                                reject(err);
                            }
                            else{
                                resolve(res.rows);
                            }
                        });
                    });
                    
                    column_indexes.forEach(t => {
                        expect(columnNamesIndex.map(n => `primitives_${n}_idx`).indexOf(t.index_name) !== -1).to.be.equal(true);
                    });
                });
            });

            describe("Validation", () => {

                it("Fails if a required field has no value", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string",
                            required: true
                        },
                        number: {
                            type: Number,
                            default: 100,
                            required: true
                        },
                        bool: {
                            type: Boolean,
                            required: true
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    expect(a.saveAsync()).to.eventually.be.rejectedWith(/Required Field/);
                });

                it("Succeeds with 'validate' function: (value) => {return true;}", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string",
                            required: true
                        },
                        number: {
                            type: Number,
                            default: 100,
                            required: true
                        },
                        bool: {
                            type: Boolean,
                            required: true,
                            validate: (value) => {
                                return true;
                            }
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model({
                        bool: true
                    });
                    return expect(a.saveAsync()).to.be.eventually.fulfilled;

                });

                it("Fails with 'validate' function: (value) => {return false;}", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string",
                            required: true
                        },
                        number: {
                            type: Number,
                            default: 100,
                            required: true
                        },
                        bool: {
                            type: Boolean,
                            required: true,
                            validate: (value) => {
                                return false;
                            }
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model({
                        bool: true
                    });
                    return expect(a.saveAsync()).to.be.eventually.rejected;

                });

                it.skip("'validate' function has access to the Model instance", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string",
                            required: true
                        },
                        number: {
                            type: Number,
                            default: 100,
                            required: true
                        },
                        bool: {
                            type: Boolean,
                            required: true,
                            validate: (value, model) => {
                                return typeof(model.string) === "string" && typeof(model.number) === "number" && typeof(model.bool) === "boolean";
                            }
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model({
                        bool: true
                    });
                    return expect(a.saveAsync()).to.be.eventually.fulfilled;

                });

                it("'validate' function has access to the Schema instance", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string",
                            required: true
                        },
                        number: {
                            type: Number,
                            default: 100,
                            required: true
                        },
                        bool: {
                            type: Boolean,
                            required: true,
                            validate: (value, model, schema) => {
                                return schema instanceof Schema;
                            }
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model({
                        bool: true
                    });
                    return expect(a.saveAsync()).to.be.eventually.fulfilled;

                });



                it("Succeeds with a matching RegExp using the 'match' property", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string",
                            required: true,
                            match: /[a-z]+\-[a-z]+\-[a-z]/
                        },
                        number: {
                            type: Number,
                            default: 100,
                            required: true
                        },
                        bool: {
                            type: Boolean,
                            default: false,
                            required: true,
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    return expect(a.saveAsync()).to.be.eventually.fulfilled;

                });

                it("Fails with a NON-matching RegExp using the 'match' property", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string",
                            required: true,
                            match: /[a-z]+\-[a-z]+\-[a-z]/
                        },
                        number: {
                            type: Number,
                            default: 100,
                            required: true
                        },
                        bool: {
                            type: Boolean,
                            default: false,
                            required: true,
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model({
                        string: "MUHAHAHA-NOT:MATCHING"
                    });
                    return expect(a.saveAsync()).to.be.eventually.rejected;

                });



                it("Succeeds with a value contained in the Array in the 'enum' property", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string",
                            required: true,
                        },
                        number: {
                            type: Number,
                            default: 100,
                            required: true,
                            enum: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
                        },
                        bool: {
                            type: Boolean,
                            default: false,
                            required: true,
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    return expect(a.saveAsync()).to.be.eventually.fulfilled;

                });

                it("Fails with a value NOT contained in the Array in the 'enum' property", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string",
                            required: true,
                        },
                        number: {
                            type: Number,
                            default: 100,
                            required: true,
                            enum: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
                        },
                        bool: {
                            type: Boolean,
                            default: false,
                            required: true,
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model({
                        number: 200
                    });
                    return expect(a.saveAsync()).to.be.eventually.rejected;

                });



                it("Succeeds with a value having .length > the 'minlength' property", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string",
                            required: true,
                            minlength: "some-default-string".length -1
                        },
                        number: {
                            type: Number,
                            default: 100,
                            required: true,
                        },
                        bool: {
                            type: Boolean,
                            default: false,
                            required: true,
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    return expect(a.saveAsync()).to.be.eventually.fulfilled;

                });

                it("Succeeds with a value having .length == the 'minlength' property", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string",
                            required: true,
                            minlength: "some-default-string".length
                        },
                        number: {
                            type: Number,
                            default: 100,
                            required: true,
                        },
                        bool: {
                            type: Boolean,
                            default: false,
                            required: true,
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    return expect(a.saveAsync()).to.be.eventually.fulfilled;

                });

                it("Fails with a value having .length < the 'minlength' property", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string",
                            required: true,
                            minlength: "some-default-string".length + 1
                        },
                        number: {
                            type: Number,
                            default: 100,
                            required: true,
                        },
                        bool: {
                            type: Boolean,
                            default: false,
                            required: true,
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    return expect(a.saveAsync()).to.be.eventually.rejected;

                });



                it("Succeeds with a value having .length < the 'maxlength' property", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string",
                            required: true,
                            maxlength: "some-default-string".length + 1
                        },
                        number: {
                            type: Number,
                            default: 100,
                            required: true,
                        },
                        bool: {
                            type: Boolean,
                            default: false,
                            required: true,
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    return expect(a.saveAsync()).to.be.eventually.fulfilled;

                });

                it("Succeeds with a value having .length == the 'maxlength' property", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string",
                            required: true,
                            maxlength: "some-default-string".length
                        },
                        number: {
                            type: Number,
                            default: 100,
                            required: true,
                        },
                        bool: {
                            type: Boolean,
                            default: false,
                            required: true,
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    return expect(a.saveAsync()).to.be.eventually.fulfilled;

                });

                it("Fails with a value having .length > the 'maxlength' property", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string",
                            required: true,
                            maxlength: "some-default-string".length - 1
                        },
                        number: {
                            type: Number,
                            default: 100,
                            required: true,
                        },
                        bool: {
                            type: Boolean,
                            default: false,
                            required: true,
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    return expect(a.saveAsync()).to.be.eventually.rejected;

                });



                it("Succeeds with a value > the 'min' property (Number)", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string",
                            required: true,
                        },
                        number: {
                            type: Number,
                            default: 100,
                            required: true,
                            min: 10
                        },
                        bool: {
                            type: Boolean,
                            default: false,
                            required: true,
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    return expect(a.saveAsync()).to.be.eventually.fulfilled;

                });

                it("Succeeds with a value == the 'min' property (Number)", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string",
                            required: true,
                        },
                        number: {
                            type: Number,
                            default: 100,
                            required: true,
                            min: 100
                        },
                        bool: {
                            type: Boolean,
                            default: false,
                            required: true,
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    return expect(a.saveAsync()).to.be.eventually.fulfilled;

                });

                it("Fails with a value < the 'min' property (Number)", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string",
                            required: true,
                        },
                        number: {
                            type: Number,
                            default: 100,
                            required: true,
                            min: 200
                        },
                        bool: {
                            type: Boolean,
                            default: false,
                            required: true,
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    return expect(a.saveAsync()).to.be.eventually.rejected;

                });



                it("Succeeds with a value < the 'max' property (Number)", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string",
                            required: true,
                        },
                        number: {
                            type: Number,
                            default: 100,
                            required: true,
                            max: 200
                        },
                        bool: {
                            type: Boolean,
                            default: false,
                            required: true,
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    return expect(a.saveAsync()).to.be.eventually.fulfilled;

                });

                it("Succeeds with a value == the 'max' property (Number)", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string",
                            required: true,
                        },
                        number: {
                            type: Number,
                            default: 100,
                            required: true,
                            max: 100
                        },
                        bool: {
                            type: Boolean,
                            default: false,
                            required: true,
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    return expect(a.saveAsync()).to.be.eventually.fulfilled;

                });

                it("Fails with a value > the 'max' property (Number)", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string",
                            required: true,
                        },
                        number: {
                            type: Number,
                            default: 100,
                            required: true,
                            max: 50
                        },
                        bool: {
                            type: Boolean,
                            default: false,
                            required: true,
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    return expect(a.saveAsync()).to.be.eventually.rejected;

                });
            });

            describe("Virtual fields", () => {

                it("Are not saved in the database", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string"
                        },
                        number: {
                            type: Number,
                            default: 100
                        },
                        virtual_number: {
                            type: Number,
                            virtual: true,
                            get: (model, schema) => {
                                return 1;
                            }
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    await a.saveAsync();
    
                    const aa = await Model.findOneAsync({string: "some-default-string"}, { raw: true });
    
                    expect(aa.string).to.be.equal("some-default-string");
                    expect(aa.number).to.be.equal(100);
                    expect(aa.virtual_number).to.be.undefined;
                    expect(aa.bool).to.be.equal(false);
                });


                it("Getter works and has access to the Model instance (using 'this' and 'function(...)')", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string"
                        },
                        number: {
                            type: Number,
                            default: 100
                        },
                        virtual_number: {
                            type: Number,
                            virtual: true,
                            get: function(model, schema){
                                return this.number + this.string.length;
                            }
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    await a.saveAsync();
    
                    const aa = await Model.findOneAsync({string: "some-default-string"});
    
                    expect(aa.string).to.be.equal("some-default-string");
                    expect(aa.number).to.be.equal(100);
                    expect(aa.virtual_number).to.be.equal(aa.number + aa.string.length);
                    expect(aa.bool).to.be.equal(false);
                });

                it("Getter works and has access to the Model instance (using 'model' and '(model, schema) => {...}')", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string"
                        },
                        number: {
                            type: Number,
                            default: 100
                        },
                        virtual_number: {
                            type: Number,
                            virtual: true,
                            get: (model, schema) => {
                                return model.number + model.string.length;
                            }
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    await a.saveAsync();
    
                    const aa = await Model.findOneAsync({string: "some-default-string"});
    
                    expect(aa.string).to.be.equal("some-default-string");
                    expect(aa.number).to.be.equal(100);
                    expect(aa.virtual_number).to.be.equal(aa.number + aa.string.length);
                    expect(aa.bool).to.be.equal(false);
                });

                it("Getter works and has access to the Schema instance (using the 'schema' parameter passed)", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string"
                        },
                        number: {
                            type: Number,
                            default: 100
                        },
                        virtual_number: {
                            type: Number,
                            virtual: true,
                            get: (model, schema) => {
                                return schema;
                            }
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    await a.saveAsync();
    
                    const aa = await Model.findOneAsync({string: "some-default-string"});
    
                    expect(aa.string).to.be.equal("some-default-string");
                    expect(aa.number).to.be.equal(100);
                    expect(aa.virtual_number instanceof Schema).to.be.equal(true);
                    expect(aa.bool).to.be.equal(false);
                });


                it("Setter works, can set Model values and has access to the Model instance (using 'this' and 'function(...)')", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string"
                        },
                        number: {
                            type: Number,
                            default: 100
                        },
                        virtual_number: {
                            type: Number,
                            virtual: true,
                            set: function(value, model, schema){
                                this.number = value * 100;
                            }
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    await a.saveAsync();
    
                    const aa = await Model.findOneAsync({string: "some-default-string"});
    
                    expect(aa.string).to.be.equal("some-default-string");
                    expect(aa.number).to.be.equal(100);
                    aa.virtual_number = 100;
                    expect(aa.number).to.be.equal(100 * 100);
                    expect(aa.bool).to.be.equal(false);
                });

                it("Setter works, can set Model values and has access to the Model instance (using 'model' and '(model, schema) => {...}')", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string"
                        },
                        number: {
                            type: Number,
                            default: 100
                        },
                        virtual_number: {
                            type: Number,
                            virtual: true,
                            set: (value, model, schema) => {
                                model.number = value * 100;
                            }
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    await a.saveAsync();
    
                    const aa = await Model.findOneAsync({string: "some-default-string"});
    
                    expect(aa.string).to.be.equal("some-default-string");
                    expect(aa.number).to.be.equal(100);
                    aa.virtual_number = 100;
                    expect(aa.number).to.be.equal(100 * 100);
                    expect(aa.bool).to.be.equal(false);
                });

                it("Setter works, can set Model values and has access to the Schema instance (using the 'schema' parameter passed)", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string"
                        },
                        number: {
                            type: Number,
                            default: 100
                        },
                        virtual_number: {
                            type: Number,
                            virtual: true,
                            set: (value, model, schema) => {
                                model.number = JSON.stringify(schema.schema).length * value;
                            }
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    await a.saveAsync();
    
                    const aa = await Model.findOneAsync({string: "some-default-string"});
    
                    expect(aa.string).to.be.equal("some-default-string");
                    expect(aa.number).to.be.equal(100);
                    aa.virtual_number = 100;
                    expect(aa.number).to.be.equal(JSON.stringify(s.schema).length * 100);
                    expect(aa.bool).to.be.equal(false);
                });

            });

            describe("Getters and Setter for normal fields (saved in database)", () => {

                it("Are saved in database", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            default: "some-default-string"
                        },
                        number: {
                            type: Number,
                            default: 100
                        },
                        virtual_number: {
                            type: Number,
                            get: function(model, schema){
                                return 1;
                            },
                            default: 123
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        }
                    });
                    s.statics = {
                        hallo:() => {
                            throw new Error("Hallo!");
                        }
                    }
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model();
                    await a.saveAsync();
    
                    const aa = await Model.findOneAsync({string: "some-default-string"}, { raw: true });

                    expect(aa.string).to.be.equal("some-default-string");
                    expect(aa.number).to.be.equal(100);
                    expect(aa.virtual_number).to.be.equal(1);
                    expect(aa.bool).to.be.equal(false);
                });

                it("Getter works and has access to the Model instance (using 'this' and 'function(...)') (attr values set in ModelConstructor, not 'default' prop)", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                        },
                        number: {
                            type: Number,
                        },
                        virtual_number: {
                            type: Number,
                            get: function(model, schema){
                                return this.number + this.string.length;
                            }
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model({
                        string: "some-default-string",
                        number: 100
                    });
                    await a.saveAsync();
    
                    const aa = await Model.findOneAsync({string: "some-default-string"}, { raw: true });
    
                    expect(aa.string).to.be.equal("some-default-string");
                    expect(aa.number).to.be.equal(100);
                    expect(aa.virtual_number).to.be.equal(aa.number + aa.string.length);
                    expect(aa.bool).to.be.equal(false);
                });

                it("Getter works and has access to the Model instance (using 'model' and '(model, schema) => {...}') (attr values set in ModelConstructor, not 'default' prop)", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                        },
                        number: {
                            type: Number,
                        },
                        virtual_number: {
                            type: Number,
                            get: (model, schema) => {
                                return model.number + model.string.length;
                            }
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model({
                        string: "some-default-string",
                        number: 100
                    });
                    await a.saveAsync();
    
                    const aa = await Model.findOneAsync({string: "some-default-string"});
    
                    expect(aa.string).to.be.equal("some-default-string");
                    expect(aa.number).to.be.equal(100);
                    expect(aa.virtual_number).to.be.equal(aa.number + aa.string.length);
                    expect(aa.bool).to.be.equal(false);
                });

                it("Getter works and has access to the Schema instance (using the 'schema' parameter passed) (attr values set in ModelConstructor, not 'default' prop)", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                        },
                        number: {
                            type: Number,
                        },
                        virtual_number: {
                            type: Number,
                            get: (model, schema) => {
                                return 1;
                            }
                        },
                        bool: {
                            type: Boolean,
                            get: (model, schema) => {
                                return schema instanceof Schema;
                            }
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model({
                        string: "some-default-string",
                        number: 100
                    });
                    await a.saveAsync();
    
                    const aa = await Model.findOneAsync({string: "some-default-string"});
    
                    expect(aa.string).to.be.equal("some-default-string");
                    expect(aa.number).to.be.equal(100);
                    expect(aa.virtual_number).to.be.equal(1);
                    expect(aa.bool).to.be.equal(true);
                });


                it("Setter works, can set Model values and has access to the Model instance (using 'this' and 'function(...)') (attr values set in ModelConstructor, not 'default' prop)", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                        },
                        number: {
                            type: Number,
                        },
                        virtual_number: {
                            type: Number,
                            set: function(value, model, schema){
                                this.number = value * 100;
                            }
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model({
                        string: "some-default-string",
                        number: 100
                    });
                    await a.saveAsync();
    
                    const aa = await Model.findOneAsync({string: "some-default-string"});
    
                    expect(aa.string).to.be.equal("some-default-string");
                    expect(aa.number).to.be.equal(100);
                    aa.virtual_number = 100;
                    expect(aa.number).to.be.equal(100 * 100);
                    expect(aa.bool).to.be.equal(false);
                });

                it("Setter works, can set Model values and has access to the Model instance (using 'this' and 'function(...)') (attr values set in ModelConstructor, not 'default' prop)", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                        },
                        number: {
                            type: Number,
                        },
                        virtual_number: {
                            type: Number,
                            set: (value, model, schema) => {
                                model.number = value * 100;
                            }
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model({
                        string: "some-default-string",
                        number: 100
                    });
                    await a.saveAsync();
    
                    const aa = await Model.findOneAsync({string: "some-default-string"});
    
                    expect(aa.string).to.be.equal("some-default-string");
                    expect(aa.number).to.be.equal(100);
                    aa.virtual_number = 100;
                    expect(aa.number).to.be.equal(100 * 100);
                    expect(aa.bool).to.be.equal(false);
                });

                it("Setter works, can set Model values and has access to the Schema instance (using the 'schema' parameter passed) (attr values set in ModelConstructor, not 'default' prop)", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                        },
                        number: {
                            type: Number,
                        },
                        virtual_number: {
                            type: Number,
                            set: (value, model, schema) => {
                                model.number = JSON.stringify(schema.schema).length * value;
                            }
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model({
                        string: "some-default-string",
                        number: 100
                    });
                    await a.saveAsync();
    
                    const aa = await Model.findOneAsync({string: "some-default-string"});
    
                    expect(aa.string).to.be.equal("some-default-string");
                    expect(aa.number).to.be.equal(100);
                    aa.virtual_number = 100;
                    expect(aa.number).to.be.equal(JSON.stringify(s.schema).length * 100);
                    expect(aa.bool).to.be.equal(false);
                });

                it("Setter can return value to transform given value and be saved in database, WORKS ONLY WITH SEPERATE ASSIGNMENT ON MODEL INSTANCE", async () => {

                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                        },
                        number: {
                            type: Number,
                        },
                        virtual_number: {
                            type: Number,
                            set: (value, model, schema) => {
                                return model.number * value;
                            }
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model({
                        string: "some-default-string",
                        number: 100
                    });
                    a.virtual_number = 100;
                    
                    await a.saveAsync();
    
                    const aa = await Model.findOneAsync({string: "some-default-string"}, {raw: true});
    
                    expect(aa.string).to.be.equal("some-default-string");
                    expect(aa.number).to.be.equal(100);
                    expect(aa.virtual_number).to.be.equal(aa.number * 100);
                    expect(aa.bool).to.be.equal(false);

                })
            });

            describe("Transformation functions", () => {

                it("Strings are transformed to lower-case if 'lowercase' prop is set to true (value set in Model-Constructor!! (not default prop))", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            lowercase: true
                        },
                        number: {
                            type: Number,
                            default: 100
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model({
                        string: "SOME-DEFAULT-STRING-TO-LOWER-CASE"
                    });
                    await a.saveAsync();
    
                    const aa = await Model.findOneAsync({string: "SOME-DEFAULT-STRING-TO-LOWER-CASE".toLowerCase()});
    
                    expect(aa.string).to.be.equal("SOME-DEFAULT-STRING-TO-LOWER-CASE".toLowerCase());
                    expect(aa.number).to.be.equal(100);
                    expect(aa.bool).to.be.equal(false);
                });


                it("Strings are transformed to upper-case if 'uppercase' prop is set to true (value set in Model-Constructor!! (not default prop))", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            uppercase: true
                        },
                        number: {
                            type: Number,
                            default: 100
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model({
                        string: "some-default-string-to-upper-case"
                    });
                    await a.saveAsync();
    
                    const aa = await Model.findOneAsync({string: "some-default-string-to-upper-case".toUpperCase()});
    
                    expect(aa.string).to.be.equal("some-default-string-to-upper-case".toUpperCase());
                    expect(aa.number).to.be.equal(100);
                    expect(aa.bool).to.be.equal(false);
                });


                it("Leading and trailing whitespace is trimmed off from Strings if 'trim' prop is set to true (value set in Model-Constructor!! (not default prop))", async () => {
                    const s = new Schema({
                        string: {
                            type: String,
                            primary_key: true,
                            trim: true
                        },
                        number: {
                            type: Number,
                            default: 100
                        },
                        bool: {
                            type: Boolean,
                            default: false
                        }
                    });
    
                    const Model = await CadooseModel.registerAndSync("primitives", s);
    
                    const a = new Model({
                        string: "   some-default-string   "
                    });
                    await a.saveAsync();
    
                    const aa = await Model.findOneAsync({string: "some-default-string"});
    
                    expect(aa.string).to.be.equal("some-default-string");
                    expect(aa.number).to.be.equal(100);
                    expect(aa.bool).to.be.equal(false);
                });

            });

        });
        
        describe("Data-Types: Simple Complex Types", () => {

            describe("#Date", () => {

                it("Is saved in Database and retrieved as (the same) Date (-Object)", async () => {
                    const s = new Schema({
                        key: {
                            type: String,
                            primary_key: true,
                            default: "some-default-id"
                        },
                        date: {
                            type: Date
                        }
                    });

                    const Model = await CadooseModel.registerAndSync("date_type", s);

                    const d = new Date(Date.now() - 24*60*60*1000);

                    const a = new Model({
                        date: d
                    });

                    await a.saveAsync();
        
                    const aa = await Model.findOneAsync({key:"some-default-id"});

                    expect(aa.key).to.be.equal("some-default-id");
                    expect(aa.date && aa.date.getTime()).to.be.equal(d.getTime());

                });

            });

            describe("#Buffer", () => {

                it("Is saved in Database and retrieved as (the same) Buffer (-Object)", async () => {
                    const s = new Schema({
                        key: {
                            type: String,
                            primary_key: true,
                            default: "some-default-id"
                        },
                        buffer: {
                            type: Buffer
                        }
                    });

                    const Model = await CadooseModel.registerAndSync("buffer_type", s);

                    const b = new Buffer("some suuuuper long string buffer read from some file");

                    const a = new Model({
                        buffer: b
                    });

                    await a.saveAsync();
        
                    const aa = await Model.findOneAsync({key:"some-default-id"});

                    expect(aa.key).to.be.equal("some-default-id");
                    expect(aa.buffer && aa.buffer.equals(b)).to.be.equal(true);

                });

            });

            describe("#Array (List)", () => {

                it("Is saved in Database and retrieved as (the same) Array (-Object)", async () => {
                    const s = new Schema({
                        key: {
                            type: String,
                            primary_key: true,
                            default: "some-default-id"
                        },
                        list: {
                            type: Array,
                            of: String
                        }
                    });

                    const Model = await CadooseModel.registerAndSync("array_list_type", s);

                    const l = ["item1", "item2", "item3", "item4", "item5"];

                    const a = new Model({
                        list: l
                    });

                    await a.saveAsync();
        
                    const aa = await Model.findOneAsync({key:"some-default-id"});

                    expect(aa.key).to.be.equal("some-default-id");
                    expect(aa.list.every((v,i)=> v === l[i])).to.be.equal(true);
                });

            });

            describe("#Set (Set and Array)", () => {

                it("Set-Object is saved in Database and retrieved as (the same) Set (-Object)", async () => {
                    const s = new Schema({
                        key: {
                            type: String,
                            primary_key: true,
                            default: "some-default-id"
                        },
                        set: {
                            type: Set,
                            of: String
                        }
                    });

                    const Model = await CadooseModel.registerAndSync("set_type", s);

                    const l = new Set(["item1", "item2", "item3", "item4", "item5"]);
                    const larr = [...l];

                    const a = new Model({
                        set: l
                    });

                    await a.saveAsync();
                    
                    const aa = await Model.findOneAsync({key:"some-default-id"});

                    expect(aa.key).to.be.equal("some-default-id");
                    expect(aa.set instanceof Set).to.be.equal(true);
                    expect([...aa.set].every((v,i)=> v === larr[i])).to.be.equal(true);
                });

                it("Set-Object is saved in Database and retrieved as an Array (-Object) (with 'asArray' prop set to true)", async () => {
                    const s = new Schema({
                        key: {
                            type: String,
                            primary_key: true,
                            default: "some-default-id"
                        },
                        set: {
                            type: Set,
                            of: String,
                            asArray: true
                        }
                    });

                    const Model = await CadooseModel.registerAndSync("set_type", s);

                    const l = new Set(["item1", "item2", "item3", "item4", "item5"]);
                    const larr = [...l];

                    const a = new Model({
                        set: l
                    });

                    await a.saveAsync();
                    
                    const aa = await Model.findOneAsync({key:"some-default-id"});

                    expect(aa.key).to.be.equal("some-default-id");
                    expect(aa.set instanceof Set).to.be.equal(false);
                    expect(aa.set.every((v,i)=> v === larr[i])).to.be.equal(true);
                });

                it("Array is saved in Database and retrieved as a Set (-Object)", async () => {
                    const s = new Schema({
                        key: {
                            type: String,
                            primary_key: true,
                            default: "some-default-id"
                        },
                        set: {
                            type: Set,
                            of: String
                        }
                    });

                    const Model = await CadooseModel.registerAndSync("set_type", s);

                    const l = ["item1", "item2", "item3", "item4", "item5"];

                    const a = new Model({
                        set: l
                    });

                    await a.saveAsync();
                    
                    const aa = await Model.findOneAsync({key:"some-default-id"});

                    expect(aa.key).to.be.equal("some-default-id");
                    expect(aa.set instanceof Set).to.be.equal(true);
                    expect([...aa.set].every((v,i)=> v === l[i])).to.be.equal(true);
                });

                it("Array is saved in Database and retrieved as (the same) Array (-Object) (with 'asArray' prop set to true)", async () => {
                    const s = new Schema({
                        key: {
                            type: String,
                            primary_key: true,
                            default: "some-default-id"
                        },
                        set: {
                            type: Set,
                            of: String,
                            asArray: true
                        }
                    });

                    const Model = await CadooseModel.registerAndSync("set_type", s);

                    const l = ["item1", "item2", "item3", "item4", "item5"];

                    const a = new Model({
                        set: l
                    });

                    await a.saveAsync();
                    
                    const aa = await Model.findOneAsync({key:"some-default-id"});

                    expect(aa.key).to.be.equal("some-default-id");
                    expect(aa.set instanceof Set).to.be.equal(false);
                    expect(aa.set.every((v,i)=> v === l[i])).to.be.equal(true);
                });

            });

            describe("#Map (native cassandra type)", () => {

                it("<text, text> Map (Object) is saved in Database and retrieved as Object", async () => {
                    const s = new Schema({
                        key: {
                            type: String,
                            primary_key: true,
                            default: "some-default-id"
                        },
                        map: {
                            type: Map,
                            of: [String, String]
                        }
                    });

                    const Model = await CadooseModel.registerAndSync("map_type_text_text", s);

                    const map = new Map(String,String).set({
                        prop1: "val1",
                        prop2: "val2",
                        prop3: "val3",
                    });

                    const a = new Model({
                        map: map
                    });

                    await a.saveAsync();
                    
                    const aa = await Model.findOneAsync({key:"some-default-id"});

                    expect(aa.key).to.be.equal("some-default-id");
                    expect(typeof(aa.map)).to.be.equal("object");
                    expect(aa.map.prop1).to.be.equal("val1");
                    expect(aa.map.prop2).to.be.equal("val2");
                    expect(aa.map.prop3).to.be.equal("val3");
                });

                it("<text, float> Map (Object) is saved in Database and retrieved as Object", async () => {
                    const s = new Schema({
                        key: {
                            type: String,
                            primary_key: true,
                            default: "some-default-id"
                        },
                        map: {
                            type: Map,
                            of: [String, Number]
                        }
                    });

                    const Model = await CadooseModel.registerAndSync("map_type_text_float", s);

                    const map = new Map(String, Number).set({
                        prop1: 100,
                        prop2: 200,
                        prop3: 300,
                    });

                    const a = new Model({
                        map: map
                    });

                    await a.saveAsync();
                    
                    const aa = await Model.findOneAsync({key:"some-default-id"});

                    expect(aa.key).to.be.equal("some-default-id");
                    expect(typeof(aa.map)).to.be.equal("object");
                    expect(aa.map.prop1).to.be.equal(100);
                    expect(aa.map.prop2).to.be.equal(200);
                    expect(aa.map.prop3).to.be.equal(300);
                });

                it("<text, boolean> Map (Object) is saved in Database and retrieved as Object", async () => {
                    const s = new Schema({
                        key: {
                            type: String,
                            primary_key: true,
                            default: "some-default-id"
                        },
                        map: {
                            type: Map,
                            of: [String, Boolean]
                        }
                    });

                    const Model = await CadooseModel.registerAndSync("map_type_text_bool", s);

                    const map = new Map(String, Boolean).set({
                        prop1: true,
                        prop2: false,
                        prop3: true,
                    });

                    const a = new Model({
                        map: map
                    });

                    await a.saveAsync();
                    
                    const aa = await Model.findOneAsync({key:"some-default-id"});

                    expect(aa.key).to.be.equal("some-default-id");
                    expect(typeof(aa.map)).to.be.equal("object");
                    expect(aa.map.prop1).to.be.equal(true);
                    expect(aa.map.prop2).to.be.equal(false);
                    expect(aa.map.prop3).to.be.equal(true);
                });

                it("<text, timestamp> Map (Object) is saved in Database and retrieved as Object", async () => {
                    const s = new Schema({
                        key: {
                            type: String,
                            primary_key: true,
                            default: "some-default-id"
                        },
                        map: {
                            type: Map,
                            of: [String, Date]
                        }
                    });

                    const Model = await CadooseModel.registerAndSync("map_type_text_date", s);

                    let d1 = new Date(), d2 = new Date(Date.now() - 24*60*60*1000), d3 = new Date(Date.now() + 24*60*60*1000);

                    const map1 = new Map(String, Date).set({
                        prop1: d1,
                        prop2: d2,
                        prop3: d3,
                    });

                    const a = new Model({
                        map: map1
                    });

                    await a.saveAsync();
                    
                    const aa = await Model.findOneAsync({key:"some-default-id"});

                    expect(aa.key).to.be.equal("some-default-id");
                    expect(typeof(aa.map)).to.be.equal("object");
                    expect(aa.map.prop1.getTime()).to.be.equal(d1.getTime());
                    expect(aa.map.prop2.getTime()).to.be.equal(d2.getTime());
                    expect(aa.map.prop3.getTime()).to.be.equal(d3.getTime());
                });

                it("<text, blob> Map (Object) is saved in Database and retrieved as Object", async () => {
                    const s = new Schema({
                        key: {
                            type: String,
                            primary_key: true,
                            default: "some-default-id"
                        },
                        map: {
                            type: Map,
                            of: [String, Buffer]
                        }
                    });

                    const Model = await CadooseModel.registerAndSync("map_type_text_blob", s);

                    let b1 = new Buffer("b1"), b2 = new Buffer("b2"), b3 = new Buffer("b3");

                    const map1 = new Map(String, Buffer).set({
                        prop1: b1,
                        prop2: b2,
                        prop3: b3,
                    });

                    const a = new Model({
                        map: map1
                    });

                    await a.saveAsync();
                    
                    const aa = await Model.findOneAsync({key:"some-default-id"});

                    expect(aa.key).to.be.equal("some-default-id");
                    expect(typeof(aa.map)).to.be.equal("object");
                    expect(aa.map.prop1 && aa.map.prop1.equals(b1)).to.be.equal(true);
                    expect(aa.map.prop2 && aa.map.prop2.equals(b2)).to.be.equal(true);
                    expect(aa.map.prop3 && aa.map.prop3.equals(b3)).to.be.equal(true);
                });

                it("<text, list<text>> Map (Object) is saved in Database and retrieved as Object", async () => {
                    const s = new Schema({
                        key: {
                            type: String,
                            primary_key: true,
                            default: "some-default-id"
                        },
                        map: {
                            type: Map,
                            of: [String, [String]]
                        }
                    });

                    const Model = await CadooseModel.registerAndSync("map_type_text_list_text", s);

                    const map1 = new Map(String, Buffer).set({
                        prop1: ["list_1"],
                        prop2: ["list_2"],
                        prop3: ["list_3"],
                    });

                    const a = new Model({
                        map: map1
                    });

                    await a.saveAsync();
                    
                    const aa = await Model.findOneAsync({key:"some-default-id"});

                    expect(aa.key).to.be.equal("some-default-id");
                    expect(typeof(aa.map)).to.be.equal("object");
                    expect(aa.map.prop1 && aa.map.prop1.length === 1 && aa.map.prop1[0] === "list_1").to.be.equal(true);
                    expect(aa.map.prop2 && aa.map.prop2.length === 1 && aa.map.prop2[0] === "list_2").to.be.equal(true);
                    expect(aa.map.prop3 && aa.map.prop3.length === 1 && aa.map.prop3[0] === "list_3").to.be.equal(true);
                });

                it.skip("<text, Schema> Map (Object) is saved in Database and retrieved as Object", async () => {})
            });

        });

        describe("Data-Types: Nested Properties", () => {

            it("Nested properties are flattened in the database but retrived as Object with nested properties (one level)", async () => {
                const s = new Schema({
                    id: {
                        type: String,
                        primary_key: true,
                        default: "some-default-id"
                    },
                    info: {
                        name: {
                            type: String,
                        },
                        surname: {
                            type: String,
                        }
                    },
                    some_prop: {
                        type: String
                    }
                });

                const Model = await CadooseModel.registerAndSync("nested_props1", s);

                const a = new Model({
                    info: {
                        name: "TestName",
                        surname: "TestSurname"
                    },
                    some_prop: "somepropsvalue"
                });

                expect(typeof a.info).to.be.equal("object");
                expect(a.info.name).to.be.equal("TestName");
                expect(a.info.surname).to.be.equal("TestSurname");
                expect(a.some_prop).to.be.equal("somepropsvalue");
                
                a.info = {
                    name: "someName",
                    surname: "someSurname"
                };

                expect(typeof a.info).to.be.equal("object");
                expect(a.info.name).to.be.equal("someName");
                expect(a.info.surname).to.be.equal("someSurname");

                await a.saveAsync();

                const aa = await Model.findOneAsync({id: "some-default-id"});

                expect(aa.id).to.be.equal("some-default-id");
                expect(typeof aa.info).to.be.equal("object");
                expect(aa.info.name).to.be.equal("someName");
                expect(aa.info.surname).to.be.equal("someSurname");
                expect(aa.some_prop).to.be.equal("somepropsvalue");

            });

            it("Primary-Keys work on nested properties (one level)", async () => {
                const s = new Schema({
                    info: {
                        name: {
                            type: String,
                            primary_key: true,
                        },
                        surname: {
                            type: String,
                            primary_key: true,
                        }
                    },
                    some_prop: {
                        type: String
                    }
                });
                const columnNames = ["info.name", "info.surname"];

                const Model = await CadooseModel.registerAndSync("nested_props2", s);

                const a = new Model({
                    info: {
                        name: "TestName",
                        surname: "TestSurname"
                    },
                    some_prop: "somepropsvalue"
                });

                expect(typeof a.info).to.be.equal("object");
                expect(a.info.name).to.be.equal("TestName");
                expect(a.info.surname).to.be.equal("TestSurname");
                expect(a.some_prop).to.be.equal("somepropsvalue");
                
                a.info = {
                    name: "someName",
                    surname: "someSurname"
                };

                expect(typeof a.info).to.be.equal("object");
                expect(a.info.name).to.be.equal("someName");
                expect(a.info.surname).to.be.equal("someSurname");

                await a.saveAsync();

                const aa = await Model.findOneAsync({"info.name": "someName", "info.surname": "someSurname"});

                expect(typeof aa.info).to.be.equal("object");
                expect(aa.info.name).to.be.equal("someName");
                expect(aa.info.surname).to.be.equal("someSurname");
                expect(aa.some_prop).to.be.equal("somepropsvalue");

                const query = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='nested_props2'";
                const column_types = await new Promise((resolve,reject) => {
                    cassandra.instance["nested_props2"].execute_query(query, null, function(err, res){
                        if(err){
                            reject(err);
                        }
                        else{
                            resolve(res.rows);
                        }
                    });
                });
                
                column_types.forEach(t => {
                    if(columnNames.indexOf(t.column_name) !== -1){
                        expect(t.kind).to.be.equal("partition_key");
                    }
                });

            });

            it("Primary-Keys + Clustering-Keys work on nested properties (one level)", async () => {
                const s = new Schema({
                    info: {
                        name: {
                            type: String,
                            primary_key: true,
                        },
                        surname: {
                            type: String,
                            primary_key: true,
                        },
                        some_super_prop: {
                            type: String,
                            clustering_key: true
                        }
                    },
                    some_prop: {
                        type: String
                    }
                });
                const columnNamesPK = ["info.name", "info.surname"];
                const columnNamesCK = ["info.some_super_prop"];

                const Model = await CadooseModel.registerAndSync("nested_props3", s);

                const a = new Model({
                    info: {
                        name: "TestName",
                        surname: "TestSurname",
                        some_super_prop: "superPropValue"
                    },
                    some_prop: "somepropsvalue"
                });

                expect(typeof a.info).to.be.equal("object");
                expect(a.info.name).to.be.equal("TestName");
                expect(a.info.surname).to.be.equal("TestSurname");
                expect(a.info.some_super_prop).to.be.equal("superPropValue");
                expect(a.some_prop).to.be.equal("somepropsvalue");
                
                a.info = {
                    name: "someName",
                    surname: "someSurname",
                    some_super_prop: "superPropValue2"
                };

                expect(typeof a.info).to.be.equal("object");
                expect(a.info.name).to.be.equal("someName");
                expect(a.info.surname).to.be.equal("someSurname");
                expect(a.info.some_super_prop).to.be.equal("superPropValue2");

                await a.saveAsync();

                const aa = await Model.findOneAsync({"info.name": "someName", "info.surname": "someSurname", "info.some_super_prop": "superPropValue2"});

                expect(typeof aa.info).to.be.equal("object");
                expect(aa.info.name).to.be.equal("someName");
                expect(aa.info.surname).to.be.equal("someSurname");
                expect(a.info.some_super_prop).to.be.equal("superPropValue2");
                expect(aa.some_prop).to.be.equal("somepropsvalue");


                const query = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='nested_props3'";
                const column_types = await new Promise((resolve,reject) => {
                    cassandra.instance["nested_props3"].execute_query(query, null, function(err, res){
                        if(err){
                            reject(err);
                        }
                        else{
                            resolve(res.rows);
                        }
                    });
                });
                
                column_types.forEach(t => {
                    if(columnNamesPK.indexOf(t.column_name) !== -1){
                        expect(t.kind).to.be.equal("partition_key");
                    }
                    if(columnNamesCK.indexOf(t.column_name) !== -1){
                        expect(t.kind).to.be.equal("clustering");
                    }
                });

            });

            it("Primary-Keys + Clustering-Keys + Secondary Indexes work on nested properties (one level)", async () => {
                const s = new Schema({
                    info: {
                        name: {
                            type: String,
                            primary_key: true,
                        },
                        surname: {
                            type: String,
                            primary_key: true,
                        },
                        some_super_prop: {
                            type: String,
                            clustering_key: true
                        },
                        some_indexed_prop: {
                            type: String,
                            secondary_index: true
                        }
                    },
                    some_prop: {
                        type: String
                    }
                });
                const columnNamesPK = ["info.name", "info.surname"];
                const columnNamesCK = ["info.some_super_prop"];
                const columnNamesIDX = ["infosome_indexed_prop"];

                const Model = await CadooseModel.registerAndSync("nested_props4", s);

                const a = new Model({
                    info: {
                        name: "TestName",
                        surname: "TestSurname",
                        some_super_prop: "superPropValue"
                    },
                    some_prop: "somepropsvalue"
                });

                expect(typeof a.info).to.be.equal("object");
                expect(a.info.name).to.be.equal("TestName");
                expect(a.info.surname).to.be.equal("TestSurname");
                expect(a.info.some_super_prop).to.be.equal("superPropValue");
                expect(a.some_prop).to.be.equal("somepropsvalue");
                
                a.info = {
                    name: "someName",
                    surname: "someSurname",
                    some_super_prop: "superPropValue2"
                };

                expect(typeof a.info).to.be.equal("object");
                expect(a.info.name).to.be.equal("someName");
                expect(a.info.surname).to.be.equal("someSurname");
                expect(a.info.some_super_prop).to.be.equal("superPropValue2");

                await a.saveAsync();

                const aa = await Model.findOneAsync({"info.name": "someName", "info.surname": "someSurname", "info.some_super_prop": "superPropValue2"});

                expect(typeof aa.info).to.be.equal("object");
                expect(aa.info.name).to.be.equal("someName");
                expect(aa.info.surname).to.be.equal("someSurname");
                expect(a.info.some_super_prop).to.be.equal("superPropValue2");
                expect(aa.some_prop).to.be.equal("somepropsvalue");


                const query = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='nested_props4'";
                const column_types = await new Promise((resolve,reject) => {
                    cassandra.instance["nested_props4"].execute_query(query, null, function(err, res){
                        if(err){
                            reject(err);
                        }
                        else{
                            resolve(res.rows);
                        }
                    });
                });
                
                column_types.forEach(t => {
                    if(columnNamesPK.indexOf(t.column_name) !== -1){
                        expect(t.kind).to.be.equal("partition_key");
                    }
                    if(columnNamesCK.indexOf(t.column_name) !== -1){
                        expect(t.kind).to.be.equal("clustering");
                    }
                });


                const queryIndexes = "SELECT index_name FROM system_schema.indexes WHERE keyspace_name='main' AND table_name='nested_props4'";
                const column_indexes = await new Promise((resolve,reject) => {
                    cassandra.instance["nested_props4"].execute_query(queryIndexes, null, function(err, res){
                        if(err){
                            reject(err);
                        }
                        else{
                            resolve(res.rows);
                        }
                    });
                });
                
                column_indexes.forEach(t => {
                    expect(columnNamesIDX.map(n => `nested_props4_${n}_idx`).indexOf(t.index_name) !== -1).to.be.equal(true);
                });
            });


            it("Nested properties are flattened in the database but retrived as Object with nested properties (two levels)", async () => {
                const s = new Schema({
                    id: {
                        type: String,
                        primary_key: true,
                        default: "some-default-id"
                    },
                    info: {
                        subinfo: {
                            name: {
                                type: String,
                            },
                            surname: {
                                type: String,
                            }
                        },
                        infoname: {
                            type: String
                        }
                    },
                    some_prop: {
                        type: String
                    }
                });

                const Model = await CadooseModel.registerAndSync("nested_props5", s);

                const a = new Model({
                    info: {
                        subinfo: {
                            name: "TestName",
                            surname: "TestSurname"
                        },
                        infoname: "testInfoname"
                    },
                    some_prop: "somepropsvalue"
                });

                expect(typeof a.info).to.be.equal("object");
                expect(typeof a.info.subinfo).to.be.equal("object");
                expect(a.info.subinfo.name).to.be.equal("TestName");
                expect(a.info.subinfo.surname).to.be.equal("TestSurname");
                expect(a.info.infoname).to.be.equal("testInfoname");
                expect(a.some_prop).to.be.equal("somepropsvalue");
                
                a.info = {
                    subinfo: {
                        name: "someName",
                        surname: "someSurname"
                    },
                    infoname: "someInfoname"
                }

                expect(typeof a.info).to.be.equal("object");
                expect(typeof a.info.subinfo).to.be.equal("object");
                expect(a.info.subinfo.name).to.be.equal("someName");
                expect(a.info.subinfo.surname).to.be.equal("someSurname");
                expect(a.info.infoname).to.be.equal("someInfoname");

                await a.saveAsync();

                const aa = await Model.findOneAsync({id: "some-default-id"});

                expect(aa.id).to.be.equal("some-default-id");
                expect(typeof aa.info).to.be.equal("object");
                expect(typeof aa.info.subinfo).to.be.equal("object");
                expect(aa.info.subinfo.name).to.be.equal("someName");
                expect(aa.info.subinfo.surname).to.be.equal("someSurname");
                expect(aa.info.infoname).to.be.equal("someInfoname");
                expect(aa.some_prop).to.be.equal("somepropsvalue");

            });

            it("Primary-Keys work on nested properties (two levels)", async () => {
                const s = new Schema({
                    info: {
                        subinfo:{
                            name: {
                                type: String,
                                primary_key: true,
                            },
                            surname: {
                                type: String,
                                primary_key: true,
                            }
                        },
                        infoname: {
                            type: String
                        }
                    },
                    some_prop: {
                        type: String
                    }
                });
                const columnNames = ["info.subinfo.name", "info.subinfo.surname"];

                const Model = await CadooseModel.registerAndSync("nested_props6", s);

                const a = new Model({
                    info: {
                        subinfo: {
                            name: "TestName",
                            surname: "TestSurname"
                        },
                        infoname: "testInfoname"
                    },
                    some_prop: "somepropsvalue"
                });

                expect(typeof a.info).to.be.equal("object");
                expect(typeof a.info.subinfo).to.be.equal("object");
                expect(a.info.subinfo.name).to.be.equal("TestName");
                expect(a.info.subinfo.surname).to.be.equal("TestSurname");
                expect(a.info.infoname).to.be.equal("testInfoname");
                expect(a.some_prop).to.be.equal("somepropsvalue");
                
                a.info = {
                    subinfo: {
                        name: "someName",
                        surname: "someSurname"
                    },
                    infoname: "someInfoname"
                }

                expect(typeof a.info).to.be.equal("object");
                expect(typeof a.info.subinfo).to.be.equal("object");
                expect(a.info.subinfo.name).to.be.equal("someName");
                expect(a.info.subinfo.surname).to.be.equal("someSurname");
                expect(a.info.infoname).to.be.equal("someInfoname");

                await a.saveAsync();

                const aa = await Model.findOneAsync({"info.subinfo.name": "someName", "info.subinfo.surname": "someSurname"});

                expect(typeof aa.info).to.be.equal("object");
                expect(typeof aa.info.subinfo).to.be.equal("object");
                expect(aa.info.subinfo.name).to.be.equal("someName");
                expect(aa.info.subinfo.surname).to.be.equal("someSurname");
                expect(aa.info.infoname).to.be.equal("someInfoname");
                expect(aa.some_prop).to.be.equal("somepropsvalue");

                const query = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='nested_props6'";
                const column_types = await new Promise((resolve,reject) => {
                    cassandra.instance["nested_props6"].execute_query(query, null, function(err, res){
                        if(err){
                            reject(err);
                        }
                        else{
                            resolve(res.rows);
                        }
                    });
                });
                
                column_types.forEach(t => {
                    if(columnNames.indexOf(t.column_name) !== -1){
                        expect(t.kind).to.be.equal("partition_key");
                    }
                });

            });

            it("Primary-Keys + Clustering-Keys work on nested properties (two levels)", async () => {
                const s = new Schema({
                    info: {
                        subinfo: {
                            name: {
                                type: String,
                                primary_key: true,
                            },
                            surname: {
                                type: String,
                                primary_key: true,
                            },
                            some_super_prop: {
                                type: String,
                                clustering_key: true
                            }
                        },
                        infoname: {
                            type: String
                        }
                    },
                    some_prop: {
                        type: String
                    }
                });
                const columnNamesPK = ["info.subinfo.name", "info.subinfo.surname"];
                const columnNamesCK = ["info.subinfo.some_super_prop"];

                const Model = await CadooseModel.registerAndSync("nested_props7", s);

                const a = new Model({
                    info: {
                        subinfo: {
                            name: "TestName",
                            surname: "TestSurname",
                            some_super_prop: "superPropValue"
                        },
                        infoname: "testInfoname"
                    },
                    some_prop: "somepropsvalue"
                });

                expect(typeof a.info).to.be.equal("object");
                expect(typeof a.info.subinfo).to.be.equal("object");
                expect(a.info.subinfo.name).to.be.equal("TestName");
                expect(a.info.subinfo.surname).to.be.equal("TestSurname");
                expect(a.info.subinfo.some_super_prop).to.be.equal("superPropValue");
                expect(a.info.infoname).to.be.equal("testInfoname");
                expect(a.some_prop).to.be.equal("somepropsvalue");
                
                a.info = {
                    subinfo: {
                        name: "someName",
                        surname: "someSurname",
                        some_super_prop: "superPropValue2"
                    },
                    infoname: "someInfoname"
                };

                expect(typeof a.info).to.be.equal("object");
                expect(typeof a.info.subinfo).to.be.equal("object");
                expect(a.info.subinfo.name).to.be.equal("someName");
                expect(a.info.subinfo.surname).to.be.equal("someSurname");
                expect(a.info.subinfo.some_super_prop).to.be.equal("superPropValue2");
                expect(a.info.infoname).to.be.equal("someInfoname");

                await a.saveAsync();

                const aa = await Model.findOneAsync({"info.subinfo.name": "someName", "info.subinfo.surname": "someSurname", "info.subinfo.some_super_prop": "superPropValue2"});

                expect(typeof aa.info).to.be.equal("object");
                expect(typeof aa.info.subinfo).to.be.equal("object");
                expect(aa.info.subinfo.name).to.be.equal("someName");
                expect(aa.info.subinfo.surname).to.be.equal("someSurname");
                expect(aa.info.subinfo.some_super_prop).to.be.equal("superPropValue2");
                expect(aa.info.infoname).to.be.equal("someInfoname");
                expect(aa.some_prop).to.be.equal("somepropsvalue");


                const query = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='nested_props7'";
                const column_types = await new Promise((resolve,reject) => {
                    cassandra.instance["nested_props7"].execute_query(query, null, function(err, res){
                        if(err){
                            reject(err);
                        }
                        else{
                            resolve(res.rows);
                        }
                    });
                });
                
                column_types.forEach(t => {
                    if(columnNamesPK.indexOf(t.column_name) !== -1){
                        expect(t.kind).to.be.equal("partition_key");
                    }
                    if(columnNamesCK.indexOf(t.column_name) !== -1){
                        expect(t.kind).to.be.equal("clustering");
                    }
                });

            });

            it("Primary-Keys + Clustering-Keys + Secondary Indexes work on nested properties (two levels)", async () => {
                const s = new Schema({
                    info: {
                        subinfo:{
                            name: {
                                type: String,
                                primary_key: true,
                            },
                            surname: {
                                type: String,
                                primary_key: true,
                            },
                            some_super_prop: {
                                type: String,
                                clustering_key: true
                            },
                            some_indexed_prop: {
                                type: String,
                                secondary_index: true
                            }
                        },
                        infoname: {
                            type: String
                        }
                    },
                    some_prop: {
                        type: String
                    }
                });
                const columnNamesPK = ["info.subinfo.name", "info.subinfo.surname"];
                const columnNamesCK = ["info.subinfo.some_super_prop"];
                const columnNamesIDX = ["infosubinfosome_indexed_prop"];

                const Model = await CadooseModel.registerAndSync("nested_props8", s);

                const a = new Model({
                    info: { 
                        subinfo: {
                            name: "TestName",
                            surname: "TestSurname",
                            some_super_prop: "superPropValue",
                            some_indexed_prop: "testIndexedProp"
                        },
                        infoname: "testInfoname"
                    },
                    some_prop: "somepropsvalue"
                });

                expect(typeof a.info).to.be.equal("object");
                expect(typeof a.info.subinfo).to.be.equal("object");
                expect(a.info.subinfo.name).to.be.equal("TestName");
                expect(a.info.subinfo.surname).to.be.equal("TestSurname");
                expect(a.info.subinfo.some_super_prop).to.be.equal("superPropValue");
                expect(a.info.subinfo.some_indexed_prop).to.be.equal("testIndexedProp");
                expect(a.info.infoname).to.be.equal("testInfoname");
                expect(a.some_prop).to.be.equal("somepropsvalue");
                
                a.info = {
                    subinfo:{
                        name: "someName",
                        surname: "someSurname",
                        some_super_prop: "superPropValue2",
                        some_indexed_prop: "someIndexedProp"
                    },
                    infoname: "someInfoname"
                };

                expect(typeof a.info).to.be.equal("object");
                expect(typeof a.info.subinfo).to.be.equal("object");
                expect(a.info.subinfo.name).to.be.equal("someName");
                expect(a.info.subinfo.surname).to.be.equal("someSurname");
                expect(a.info.subinfo.some_super_prop).to.be.equal("superPropValue2");
                expect(a.info.subinfo.some_indexed_prop).to.be.equal("someIndexedProp");
                expect(a.info.infoname).to.be.equal("someInfoname");

                await a.saveAsync();

                const aa = await Model.findOneAsync({"info.subinfo.name": "someName", "info.subinfo.surname": "someSurname", "info.subinfo.some_super_prop": "superPropValue2"});

                expect(typeof aa.info).to.be.equal("object");
                expect(typeof aa.info.subinfo).to.be.equal("object");
                expect(aa.info.subinfo.name).to.be.equal("someName");
                expect(aa.info.subinfo.surname).to.be.equal("someSurname");
                expect(aa.info.subinfo.some_super_prop).to.be.equal("superPropValue2");
                expect(aa.info.subinfo.some_indexed_prop).to.be.equal("someIndexedProp");
                expect(aa.info.infoname).to.be.equal("someInfoname");
                expect(aa.some_prop).to.be.equal("somepropsvalue");


                const query = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='nested_props8'";
                const column_types = await new Promise((resolve,reject) => {
                    cassandra.instance["nested_props8"].execute_query(query, null, function(err, res){
                        if(err){
                            reject(err);
                        }
                        else{
                            resolve(res.rows);
                        }
                    });
                });
                
                column_types.forEach(t => {
                    if(columnNamesPK.indexOf(t.column_name) !== -1){
                        expect(t.kind).to.be.equal("partition_key");
                    }
                    if(columnNamesCK.indexOf(t.column_name) !== -1){
                        expect(t.kind).to.be.equal("clustering");
                    }
                });


                const queryIndexes = "SELECT index_name FROM system_schema.indexes WHERE keyspace_name='main' AND table_name='nested_props8'";
                const column_indexes = await new Promise((resolve,reject) => {
                    cassandra.instance["nested_props8"].execute_query(queryIndexes, null, function(err, res){
                        if(err){
                            reject(err);
                        }
                        else{
                            resolve(res.rows);
                        }
                    });
                });
                
                column_indexes.forEach(t => {
                    expect(columnNamesIDX.map(n => `nested_props8_${n}_idx`).indexOf(t.index_name) !== -1).to.be.equal(true);
                });
            });

        });

        describe("Data Types: Nested Schemas", () => {

            it("Nested Schemas are flattened in the database but retrived as Object with nested properties (one level)", async () => {
                const infoSchema = new Schema({
                    name: {
                        type: String
                    },
                    surname: {
                        type: String
                    }
                });
                const s = new Schema({
                    id: {
                        type: String,
                        primary_key: true,
                        default: "some-default-id"
                    },
                    info: infoSchema,
                    some_prop: {
                        type: String
                    }
                },{name:"nested_props1"});

                const Model = await CadooseModel.registerAndSync("nested_props1", s);

                const a = new Model({
                    info: {
                        name: "TestName",
                        surname: "TestSurname"
                    },
                    some_prop: "somepropsvalue"
                });

                expect(typeof a.info).to.be.equal("object");
                expect(a.info.name).to.be.equal("TestName");
                expect(a.info.surname).to.be.equal("TestSurname");
                expect(a.some_prop).to.be.equal("somepropsvalue");
                
                a.info = {
                    name: "someName",
                    surname: "someSurname"
                };

                expect(typeof a.info).to.be.equal("object");
                expect(a.info.name).to.be.equal("someName");
                expect(a.info.surname).to.be.equal("someSurname");

                await a.saveAsync();

                const aa = await Model.findOneAsync({id: "some-default-id"});

                expect(aa.id).to.be.equal("some-default-id");
                expect(typeof aa.info).to.be.equal("object");
                expect(aa.info.name).to.be.equal("someName");
                expect(aa.info.surname).to.be.equal("someSurname");
                expect(aa.some_prop).to.be.equal("somepropsvalue");

            });

            it("Primary-Keys work on nested Schemas (one level)", async () => {
                const infoSchema = new Schema({
                    name: {
                        type: String,
                        primary_key: true,
                    },
                    surname: {
                        type: String,
                        primary_key: true,
                    }
                });
                const s = new Schema({
                    info: infoSchema,
                    some_prop: {
                        type: String
                    }
                });
                const columnNames = ["info.name", "info.surname"];

                const Model = await CadooseModel.registerAndSync("nested_props2", s);

                const a = new Model({
                    info: {
                        name: "TestName",
                        surname: "TestSurname"
                    },
                    some_prop: "somepropsvalue"
                });

                expect(typeof a.info).to.be.equal("object");
                expect(a.info.name).to.be.equal("TestName");
                expect(a.info.surname).to.be.equal("TestSurname");
                expect(a.some_prop).to.be.equal("somepropsvalue");
                
                a.info = {
                    name: "someName",
                    surname: "someSurname"
                };

                expect(typeof a.info).to.be.equal("object");
                expect(a.info.name).to.be.equal("someName");
                expect(a.info.surname).to.be.equal("someSurname");

                await a.saveAsync();

                const aa = await Model.findOneAsync({"info.name": "someName", "info.surname": "someSurname"});

                expect(typeof aa.info).to.be.equal("object");
                expect(aa.info.name).to.be.equal("someName");
                expect(aa.info.surname).to.be.equal("someSurname");
                expect(aa.some_prop).to.be.equal("somepropsvalue");

                const query = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='nested_props2'";
                const column_types = await new Promise((resolve,reject) => {
                    cassandra.instance["nested_props2"].execute_query(query, null, function(err, res){
                        if(err){
                            reject(err);
                        }
                        else{
                            resolve(res.rows);
                        }
                    });
                });
                
                column_types.forEach(t => {
                    if(columnNames.indexOf(t.column_name) !== -1){
                        expect(t.kind).to.be.equal("partition_key");
                    }
                });

            });

            it("Primary-Keys + Clustering-Keys work on nested Schemas (one level)", async () => {
                const infoSchema = new Schema({
                    name: {
                        type: String,
                        primary_key: true,
                    },
                    surname: {
                        type: String,
                        primary_key: true,
                    },
                    some_super_prop: {
                        type: String,
                        clustering_key: true
                    }
                });
                const s = new Schema({
                    info: infoSchema,
                    some_prop: {
                        type: String
                    }
                });
                const columnNamesPK = ["info.name", "info.surname"];
                const columnNamesCK = ["info.some_super_prop"];

                const Model = await CadooseModel.registerAndSync("nested_props3", s);

                const a = new Model({
                    info: {
                        name: "TestName",
                        surname: "TestSurname",
                        some_super_prop: "superPropValue"
                    },
                    some_prop: "somepropsvalue"
                });

                expect(typeof a.info).to.be.equal("object");
                expect(a.info.name).to.be.equal("TestName");
                expect(a.info.surname).to.be.equal("TestSurname");
                expect(a.info.some_super_prop).to.be.equal("superPropValue");
                expect(a.some_prop).to.be.equal("somepropsvalue");
                
                a.info = {
                    name: "someName",
                    surname: "someSurname",
                    some_super_prop: "superPropValue2"
                };

                expect(typeof a.info).to.be.equal("object");
                expect(a.info.name).to.be.equal("someName");
                expect(a.info.surname).to.be.equal("someSurname");
                expect(a.info.some_super_prop).to.be.equal("superPropValue2");

                await a.saveAsync();

                const aa = await Model.findOneAsync({"info.name": "someName", "info.surname": "someSurname", "info.some_super_prop": "superPropValue2"});

                expect(typeof aa.info).to.be.equal("object");
                expect(aa.info.name).to.be.equal("someName");
                expect(aa.info.surname).to.be.equal("someSurname");
                expect(a.info.some_super_prop).to.be.equal("superPropValue2");
                expect(aa.some_prop).to.be.equal("somepropsvalue");


                const query = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='nested_props3'";
                const column_types = await new Promise((resolve,reject) => {
                    cassandra.instance["nested_props3"].execute_query(query, null, function(err, res){
                        if(err){
                            reject(err);
                        }
                        else{
                            resolve(res.rows);
                        }
                    });
                });
                
                column_types.forEach(t => {
                    if(columnNamesPK.indexOf(t.column_name) !== -1){
                        expect(t.kind).to.be.equal("partition_key");
                    }
                    if(columnNamesCK.indexOf(t.column_name) !== -1){
                        expect(t.kind).to.be.equal("clustering");
                    }
                });

            });

            it("Primary-Keys + Clustering-Keys + Secondary Indexes work on nested Schemas (one level)", async () => {
                const infoSchema = new Schema({
                    name: {
                        type: String,
                        primary_key: true,
                    },
                    surname: {
                        type: String,
                        primary_key: true,
                    },
                    some_super_prop: {
                        type: String,
                        clustering_key: true
                    },
                    some_indexed_prop: {
                        type: String,
                        secondary_index: true
                    }
                });
                const s = new Schema({
                    info: infoSchema,
                    some_prop: {
                        type: String
                    }
                });
                const columnNamesPK = ["info.name", "info.surname"];
                const columnNamesCK = ["info.some_super_prop"];
                const columnNamesIDX = ["infosome_indexed_prop"];

                const Model = await CadooseModel.registerAndSync("nested_props4", s);

                const a = new Model({
                    info: {
                        name: "TestName",
                        surname: "TestSurname",
                        some_super_prop: "superPropValue"
                    },
                    some_prop: "somepropsvalue"
                });

                expect(typeof a.info).to.be.equal("object");
                expect(a.info.name).to.be.equal("TestName");
                expect(a.info.surname).to.be.equal("TestSurname");
                expect(a.info.some_super_prop).to.be.equal("superPropValue");
                expect(a.some_prop).to.be.equal("somepropsvalue");
                
                a.info = {
                    name: "someName",
                    surname: "someSurname",
                    some_super_prop: "superPropValue2"
                };

                expect(typeof a.info).to.be.equal("object");
                expect(a.info.name).to.be.equal("someName");
                expect(a.info.surname).to.be.equal("someSurname");
                expect(a.info.some_super_prop).to.be.equal("superPropValue2");

                await a.saveAsync();

                const aa = await Model.findOneAsync({"info.name": "someName", "info.surname": "someSurname", "info.some_super_prop": "superPropValue2"});

                expect(typeof aa.info).to.be.equal("object");
                expect(aa.info.name).to.be.equal("someName");
                expect(aa.info.surname).to.be.equal("someSurname");
                expect(a.info.some_super_prop).to.be.equal("superPropValue2");
                expect(aa.some_prop).to.be.equal("somepropsvalue");


                const query = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='nested_props4'";
                const column_types = await new Promise((resolve,reject) => {
                    cassandra.instance["nested_props4"].execute_query(query, null, function(err, res){
                        if(err){
                            reject(err);
                        }
                        else{
                            resolve(res.rows);
                        }
                    });
                });
                
                column_types.forEach(t => {
                    if(columnNamesPK.indexOf(t.column_name) !== -1){
                        expect(t.kind).to.be.equal("partition_key");
                    }
                    if(columnNamesCK.indexOf(t.column_name) !== -1){
                        expect(t.kind).to.be.equal("clustering");
                    }
                });


                const queryIndexes = "SELECT index_name FROM system_schema.indexes WHERE keyspace_name='main' AND table_name='nested_props4'";
                const column_indexes = await new Promise((resolve,reject) => {
                    cassandra.instance["nested_props4"].execute_query(queryIndexes, null, function(err, res){
                        if(err){
                            reject(err);
                        }
                        else{
                            resolve(res.rows);
                        }
                    });
                });
                
                column_indexes.forEach(t => {
                    expect(columnNamesIDX.map(n => `nested_props4_${n}_idx`).indexOf(t.index_name) !== -1).to.be.equal(true);
                });
            });


            it("Nested Schemas are flattened in the database but retrived as Object with nested Schemas (two levels)", async () => {
                const subInfoSchema = new Schema({
                    name: {
                        type: String,
                    },
                    surname: {
                        type: String,
                    }
                });
                const infoSchema = new Schema({
                    subinfo: subInfoSchema,
                    infoname: {
                        type: String
                    }
                });
                const s = new Schema({
                    id: {
                        type: String,
                        primary_key: true,
                        default: "some-default-id"
                    },
                    info: infoSchema,
                    some_prop: {
                        type: String
                    }
                });

                const Model = await CadooseModel.registerAndSync("nested_props5", s);

                const a = new Model({
                    info: {
                        subinfo: {
                            name: "TestName",
                            surname: "TestSurname"
                        },
                        infoname: "testInfoname"
                    },
                    some_prop: "somepropsvalue"
                });

                expect(typeof a.info).to.be.equal("object");
                expect(typeof a.info.subinfo).to.be.equal("object");
                expect(a.info.subinfo.name).to.be.equal("TestName");
                expect(a.info.subinfo.surname).to.be.equal("TestSurname");
                expect(a.info.infoname).to.be.equal("testInfoname");
                expect(a.some_prop).to.be.equal("somepropsvalue");
                
                a.info = {
                    subinfo: {
                        name: "someName",
                        surname: "someSurname"
                    },
                    infoname: "someInfoname"
                }

                expect(typeof a.info).to.be.equal("object");
                expect(typeof a.info.subinfo).to.be.equal("object");
                expect(a.info.subinfo.name).to.be.equal("someName");
                expect(a.info.subinfo.surname).to.be.equal("someSurname");
                expect(a.info.infoname).to.be.equal("someInfoname");

                await a.saveAsync();

                const aa = await Model.findOneAsync({id: "some-default-id"});

                expect(aa.id).to.be.equal("some-default-id");
                expect(typeof aa.info).to.be.equal("object");
                expect(typeof aa.info.subinfo).to.be.equal("object");
                expect(aa.info.subinfo.name).to.be.equal("someName");
                expect(aa.info.subinfo.surname).to.be.equal("someSurname");
                expect(aa.info.infoname).to.be.equal("someInfoname");
                expect(aa.some_prop).to.be.equal("somepropsvalue");

            });

            it("Primary-Keys work on nested Schemas (two levels)", async () => {
                const subInfoSchema = new Schema({
                    name: {
                        type: String,
                        primary_key: true,
                    },
                    surname: {
                        type: String,
                        primary_key: true,
                    }
                });
                const infoSchema = new Schema({
                    subinfo: subInfoSchema,
                    infoname: {
                        type: String
                    }
                });
                const s = new Schema({
                    info: infoSchema,
                    some_prop: {
                        type: String
                    }
                });
                const columnNames = ["info.subinfo.name", "info.subinfo.surname"];

                const Model = await CadooseModel.registerAndSync("nested_props6", s);

                const a = new Model({
                    info: {
                        subinfo: {
                            name: "TestName",
                            surname: "TestSurname"
                        },
                        infoname: "testInfoname"
                    },
                    some_prop: "somepropsvalue"
                });

                expect(typeof a.info).to.be.equal("object");
                expect(typeof a.info.subinfo).to.be.equal("object");
                expect(a.info.subinfo.name).to.be.equal("TestName");
                expect(a.info.subinfo.surname).to.be.equal("TestSurname");
                expect(a.info.infoname).to.be.equal("testInfoname");
                expect(a.some_prop).to.be.equal("somepropsvalue");
                
                a.info = {
                    subinfo: {
                        name: "someName",
                        surname: "someSurname"
                    },
                    infoname: "someInfoname"
                }

                expect(typeof a.info).to.be.equal("object");
                expect(typeof a.info.subinfo).to.be.equal("object");
                expect(a.info.subinfo.name).to.be.equal("someName");
                expect(a.info.subinfo.surname).to.be.equal("someSurname");
                expect(a.info.infoname).to.be.equal("someInfoname");

                await a.saveAsync();

                const aa = await Model.findOneAsync({"info.subinfo.name": "someName", "info.subinfo.surname": "someSurname"});

                expect(typeof aa.info).to.be.equal("object");
                expect(typeof aa.info.subinfo).to.be.equal("object");
                expect(aa.info.subinfo.name).to.be.equal("someName");
                expect(aa.info.subinfo.surname).to.be.equal("someSurname");
                expect(aa.info.infoname).to.be.equal("someInfoname");
                expect(aa.some_prop).to.be.equal("somepropsvalue");

                const query = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='nested_props6'";
                const column_types = await new Promise((resolve,reject) => {
                    cassandra.instance["nested_props6"].execute_query(query, null, function(err, res){
                        if(err){
                            reject(err);
                        }
                        else{
                            resolve(res.rows);
                        }
                    });
                });
                
                column_types.forEach(t => {
                    if(columnNames.indexOf(t.column_name) !== -1){
                        expect(t.kind).to.be.equal("partition_key");
                    }
                });

            });

            it("Primary-Keys + Clustering-Keys work on nested Schemas (two levels)", async () => {
                const subInfoSchema = new Schema({
                    name: {
                        type: String,
                        primary_key: true,
                    },
                    surname: {
                        type: String,
                        primary_key: true,
                    },
                    some_super_prop: {
                        type: String,
                        clustering_key: true
                    }
                });
                const infoSchema = new Schema({
                    subinfo: subInfoSchema,
                    infoname: {
                        type: String
                    }
                });
                const s = new Schema({
                    info: infoSchema,
                    some_prop: {
                        type: String
                    }
                });
                const columnNamesPK = ["info.subinfo.name", "info.subinfo.surname"];
                const columnNamesCK = ["info.subinfo.some_super_prop"];

                const Model = await CadooseModel.registerAndSync("nested_props7", s);

                const a = new Model({
                    info: {
                        subinfo: {
                            name: "TestName",
                            surname: "TestSurname",
                            some_super_prop: "superPropValue"
                        },
                        infoname: "testInfoname"
                    },
                    some_prop: "somepropsvalue"
                });

                expect(typeof a.info).to.be.equal("object");
                expect(typeof a.info.subinfo).to.be.equal("object");
                expect(a.info.subinfo.name).to.be.equal("TestName");
                expect(a.info.subinfo.surname).to.be.equal("TestSurname");
                expect(a.info.subinfo.some_super_prop).to.be.equal("superPropValue");
                expect(a.info.infoname).to.be.equal("testInfoname");
                expect(a.some_prop).to.be.equal("somepropsvalue");
                
                a.info = {
                    subinfo: {
                        name: "someName",
                        surname: "someSurname",
                        some_super_prop: "superPropValue2"
                    },
                    infoname: "someInfoname"
                };

                expect(typeof a.info).to.be.equal("object");
                expect(typeof a.info.subinfo).to.be.equal("object");
                expect(a.info.subinfo.name).to.be.equal("someName");
                expect(a.info.subinfo.surname).to.be.equal("someSurname");
                expect(a.info.subinfo.some_super_prop).to.be.equal("superPropValue2");
                expect(a.info.infoname).to.be.equal("someInfoname");

                await a.saveAsync();

                const aa = await Model.findOneAsync({"info.subinfo.name": "someName", "info.subinfo.surname": "someSurname", "info.subinfo.some_super_prop": "superPropValue2"});

                expect(typeof aa.info).to.be.equal("object");
                expect(typeof aa.info.subinfo).to.be.equal("object");
                expect(aa.info.subinfo.name).to.be.equal("someName");
                expect(aa.info.subinfo.surname).to.be.equal("someSurname");
                expect(aa.info.subinfo.some_super_prop).to.be.equal("superPropValue2");
                expect(aa.info.infoname).to.be.equal("someInfoname");
                expect(aa.some_prop).to.be.equal("somepropsvalue");


                const query = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='nested_props7'";
                const column_types = await new Promise((resolve,reject) => {
                    cassandra.instance["nested_props7"].execute_query(query, null, function(err, res){
                        if(err){
                            reject(err);
                        }
                        else{
                            resolve(res.rows);
                        }
                    });
                });
                
                column_types.forEach(t => {
                    if(columnNamesPK.indexOf(t.column_name) !== -1){
                        expect(t.kind).to.be.equal("partition_key");
                    }
                    if(columnNamesCK.indexOf(t.column_name) !== -1){
                        expect(t.kind).to.be.equal("clustering");
                    }
                });

            });

            it("Primary-Keys + Clustering-Keys + Secondary Indexes work on nested Schemas (two levels)", async () => {
                const subInfoSchema = new Schema({
                    name: {
                        type: String,
                        primary_key: true,
                    },
                    surname: {
                        type: String,
                        primary_key: true,
                    },
                    some_super_prop: {
                        type: String,
                        clustering_key: true
                    },
                    some_indexed_prop: {
                        type: String,
                        secondary_index: true
                    }
                });
                const infoSchema = new Schema({
                    subinfo: subInfoSchema,
                    infoname: {
                        type: String
                    }
                });
                const s = new Schema({
                    info: infoSchema,
                    some_prop: {
                        type: String
                    }
                });
                const columnNamesPK = ["info.subinfo.name", "info.subinfo.surname"];
                const columnNamesCK = ["info.subinfo.some_super_prop"];
                const columnNamesIDX = ["infosubinfosome_indexed_prop"];

                const Model = await CadooseModel.registerAndSync("nested_props8", s);

                const a = new Model({
                    info: { 
                        subinfo: {
                            name: "TestName",
                            surname: "TestSurname",
                            some_super_prop: "superPropValue",
                            some_indexed_prop: "testIndexedProp"
                        },
                        infoname: "testInfoname"
                    },
                    some_prop: "somepropsvalue"
                });

                expect(typeof a.info).to.be.equal("object");
                expect(typeof a.info.subinfo).to.be.equal("object");
                expect(a.info.subinfo.name).to.be.equal("TestName");
                expect(a.info.subinfo.surname).to.be.equal("TestSurname");
                expect(a.info.subinfo.some_super_prop).to.be.equal("superPropValue");
                expect(a.info.subinfo.some_indexed_prop).to.be.equal("testIndexedProp");
                expect(a.info.infoname).to.be.equal("testInfoname");
                expect(a.some_prop).to.be.equal("somepropsvalue");
                
                a.info = {
                    subinfo:{
                        name: "someName",
                        surname: "someSurname",
                        some_super_prop: "superPropValue2",
                        some_indexed_prop: "someIndexedProp"
                    },
                    infoname: "someInfoname"
                };

                expect(typeof a.info).to.be.equal("object");
                expect(typeof a.info.subinfo).to.be.equal("object");
                expect(a.info.subinfo.name).to.be.equal("someName");
                expect(a.info.subinfo.surname).to.be.equal("someSurname");
                expect(a.info.subinfo.some_super_prop).to.be.equal("superPropValue2");
                expect(a.info.subinfo.some_indexed_prop).to.be.equal("someIndexedProp");
                expect(a.info.infoname).to.be.equal("someInfoname");

                await a.saveAsync();

                const aa = await Model.findOneAsync({"info.subinfo.name": "someName", "info.subinfo.surname": "someSurname", "info.subinfo.some_super_prop": "superPropValue2"});

                expect(typeof aa.info).to.be.equal("object");
                expect(typeof aa.info.subinfo).to.be.equal("object");
                expect(aa.info.subinfo.name).to.be.equal("someName");
                expect(aa.info.subinfo.surname).to.be.equal("someSurname");
                expect(aa.info.subinfo.some_super_prop).to.be.equal("superPropValue2");
                expect(aa.info.subinfo.some_indexed_prop).to.be.equal("someIndexedProp");
                expect(aa.info.infoname).to.be.equal("someInfoname");
                expect(aa.some_prop).to.be.equal("somepropsvalue");


                const query = "SELECT column_name, kind FROM system_schema.columns WHERE keyspace_name='main' AND table_name='nested_props8'";
                const column_types = await new Promise((resolve,reject) => {
                    cassandra.instance["nested_props8"].execute_query(query, null, function(err, res){
                        if(err){
                            reject(err);
                        }
                        else{
                            resolve(res.rows);
                        }
                    });
                });
                
                column_types.forEach(t => {
                    if(columnNamesPK.indexOf(t.column_name) !== -1){
                        expect(t.kind).to.be.equal("partition_key");
                    }
                    if(columnNamesCK.indexOf(t.column_name) !== -1){
                        expect(t.kind).to.be.equal("clustering");
                    }
                });


                const queryIndexes = "SELECT index_name FROM system_schema.indexes WHERE keyspace_name='main' AND table_name='nested_props8'";
                const column_indexes = await new Promise((resolve,reject) => {
                    cassandra.instance["nested_props8"].execute_query(queryIndexes, null, function(err, res){
                        if(err){
                            reject(err);
                        }
                        else{
                            resolve(res.rows);
                        }
                    });
                });
                
                column_indexes.forEach(t => {
                    expect(columnNamesIDX.map(n => `nested_props8_${n}_idx`).indexOf(t.index_name) !== -1).to.be.equal(true);
                });
            });


            it.skip("Nested Schemas are validated", async () => {
            });

        });

        describe("Data Types: Arrays (Lists) / Arrays (Sets) / Maps of Schemas", () => {

            it("Array Literal with Schema inside creates UDT for Schema and defines List with frozen udt", async () => {
                const websocket = new Schema({
                    socket_id: {
                        type: String
                    },
                    connection_type: {
                        type: String
                    }
                },{
                    name: "websocket"
                });

                const user = new Schema({
                    id: {
                        type: String,
                        primary_key: true
                    },
                    connections: [websocket]
                });

                const Model = await CadooseModel.registerAndSync("schema_in_array", user);

                const l = [
                    {
                        socket_id: "1234567890",
                        connection_type: "desktop"
                    }
                ];

                const a = new Model({
                    id: "some-id",
                    connections: l
                });

                await a.saveAsync();

                const aa = await Model.findOneAsync({id: "some-id"});

                expect(aa.id).to.be.equal("some-id");
                expect(Array.isArray(aa.connections)).to.be.equal(true);
                expect(aa.connections.every((v,i)=> v.socket_id === l[i].socket_id && v.connection_type === l[i].connection_type)).to.be.equal(true);
            });

            it("Nested Schema (in Array Literal) gets validated", async () => {
                const websocket = new Schema({
                    socket_id: {
                        type: String,
                        validate: (value) => {
                            return value.length === 10;
                        }
                    },
                    connection_type: {
                        type: String,
                        enum: ["web", "desktop", "mobile"]
                    }
                },{
                    name: "websocket"
                });

                const user = new Schema({
                    id: {
                        type: String,
                        primary_key: true
                    },
                    connections: [websocket]
                });

                const Model = await CadooseModel.registerAndSync("schema_in_set", user);

                let l = [
                    {
                        socket_id: "1234567890-invalid-id",
                        connection_type: "desktop"
                    }
                ];

                let a = new Model({
                    id: "some-id",
                    connections: l
                });

                let l2 = [
                    {
                        socket_id: "1234567890",
                        connection_type: "desktop-invalid-type"
                    }
                ];

                let a2 = new Model({
                    id: "some-id",
                    connections: l2
                });

                return expect(new Promise(async (resolve, reject) => {

                    try{
                        await a.saveAsync()
                    }
                    catch(er){
                        try{
                            await a2.saveAsync();
                        }
                        catch(_){
                            reject();
                        }
                    }

                    resolve();

                })).to.be.eventually.rejected;

            });



            it("Set Literal with Schema inside creates UDT for schema and defines List with frozen udt", async () => {
                const websocket = new Schema({
                    socket_id: {
                        type: String
                    },
                    connection_type: {
                        type: String
                    }
                },{
                    name: "websocket"
                });

                const user = new Schema({
                    id: {
                        type: String,
                        primary_key: true
                    },
                    connections: new Set([websocket])
                });

                const Model = await CadooseModel.registerAndSync("schema_in_set", user);

                const l = [
                    {
                        socket_id: "1234567890",
                        connection_type: "desktop"
                    }
                ];

                const a = new Model({
                    id: "some-id",
                    connections: new Set(l)
                });

                await a.saveAsync();

                const aa = await Model.findOneAsync({id: "some-id"});

                expect(aa.id).to.be.equal("some-id");
                expect(aa.connections instanceof Set).to.be.equal(true);
                expect([...aa.connections].every((v,i)=> v.socket_id === l[i].socket_id && v.connection_type === l[i].connection_type)).to.be.equal(true);
            });

            it("Nested Schema (in Set Literal) gets validated", async () => {
                const websocket = new Schema({
                    socket_id: {
                        type: String,
                        validate: (value) => {
                            return value.length === 10;
                        }
                    },
                    connection_type: {
                        type: String,
                        enum: ["web", "desktop", "mobile"]
                    }
                },{
                    name: "websocket"
                });

                const user = new Schema({
                    id: {
                        type: String,
                        primary_key: true
                    },
                    connections: new Set([websocket])
                });

                const Model = await CadooseModel.registerAndSync("schema_in_set", user);

                const l = [
                    {
                        socket_id: "1234567890-invalid-id",
                        connection_type: "desktop"
                    }
                ];

                const a = new Model({
                    id: "some-id",
                    connections: new Set(l)
                });

                const l2 = [
                    {
                        socket_id: "1234567890",
                        connection_type: "desktop-invalid-type"
                    }
                ];

                const a2 = new Model({
                    id: "some-id",
                    connections: new Set(l2)
                });

                return expect(new Promise(async (resolve, reject) => {

                    try{
                        await a.saveAsync()
                    }
                    catch(er){
                        try{
                            await a2.saveAsync();
                        }
                        catch(_){
                            reject();
                        }
                    }

                    resolve();

                })).to.be.eventually.rejected;
            });

        });

    });
    
    describe("Special Queries", () => {

        it("SELECT IN Query, WORKS ONLY IF THERE IS NO 'consistency' OPTION SET IN 'queryOptions' IN THE CADOOSE CONSTRUCTOR CALL.", async () => {

            const s = new Schema({
                id: {
                    type: Number,
                    primary_key: true
                },
                value: {
                    type: String                    
                }
            });

            const Model = await CadooseModel.registerAndSync("select_in_tests", s);

            const rnd = [];

            const saveQueries = [1,2,3,4,5,6,7,8,9].map(v => {
                const r = Math.random();
                rnd.push(r);
                const a = new Model({
                    id: v,
                    value: `id: ${v}, value: ${r}`
                });
                return a.save({return_query: true});
            });
            await MakeCadoose().doBatchAsync(saveQueries);

            const arr = await Model.findAsync({id: {$in: [1,2,3,4,999] } });

            expect(arr.length).to.be.equal(4);
            arr.forEach((aa, i) => {
                expect(aa.id).to.be.equal(i+1);
                expect(aa.value).to.be.equal(`id: ${i+1}, value: ${rnd[i]}`);                
            });
            
        });

    });

    describe("Model Methods", () => {

        describe("User-defined Model Instance-Methods and Static-Methods", () => {

            it("Instance Methods work and have access to Model-Instance via 'this'", async () => {
                const s = new Schema({
                    string: {
                        type: String,
                        primary_key: true
                    },
                    number: {
                        type: Number,
                    },
                    bool: {
                        type: Boolean,
                    }
                }, {});
                s.methods = {
                    instanceMethod1(){
                        return this.string+" from instance method!";
                    }
                }
                
                const Model = await CadooseModel.registerAndSync("primitives", s);
        
                const a = new Model({
                    string: "string",
                    number: 100,
                    bool: true
                });
                await a.saveAsync();
        
                const aa = await Model.findOneAsync({string:"string"});
    
                expect(aa.string).to.be.equal(a.string);
                expect(aa.number).to.be.equal(a.number);
                expect(aa.bool).to.be.equal(a.bool);

                expect(aa.instanceMethod1()).to.be.equal("string from instance method!");
            });

            it("Static Methods work", async () => {
                const s = new Schema({
                    string: {
                        type: String,
                        primary_key: true
                    },
                    number: {
                        type: Number,
                    },
                    bool: {
                        type: Boolean,
                    }
                }, {});
                s.statics = {
                    staticMethod1(){
                        return "hello from static method!";
                    }
                }
                
                const Model = await CadooseModel.registerAndSync("primitives", s);
        
                const a = new Model({
                    string: "string",
                    number: 100,
                    bool: true
                });
                await a.saveAsync();
        
                const aa = await Model.findOneAsync({string:"string"});
    
                expect(aa.string).to.be.equal(a.string);
                expect(aa.number).to.be.equal(a.number);
                expect(aa.bool).to.be.equal(a.bool);

                expect(Model.staticMethod1()).to.be.equal("hello from static method!");
            });

        });

        describe("Mongoose-like API extensions", () => {

            describe("#Model.create", () => {

                    it("Call with single model prop-map creates and saves *and returns* one model-instance", async () => {
                        const s = new Schema({
                            string: {
                                type: String,
                                primary_key: true
                            },
                            number: {
                                type: Number,
                            },
                            bool: {
                                type: Boolean,
                            }
                        }, {});
                        
                        const Model = await CadooseModel.registerAndSync("primitives", s);
                
                        const a = await Model.create({
                            string: "string",
                            number: 100,
                            bool: true
                        });

                        expect(a && a.string === "string").to.be.equal(true);
                        expect(a && a.number === 100).to.be.equal(true);
                        expect(a && a.bool === true).to.be.equal(true);

                        const aa = await Model.findOneAsync({string:"string"});
            
                        expect(aa.string).to.be.equal("string");
                        expect(aa.number).to.be.equal(100);
                        expect(aa.bool).to.be.equal(true);
                    });

                    it("Call with multiple model prop-maps creates and saves *and returns* multiple model-instance", async () => {
                        const s = new Schema({
                            string: {
                                type: String,
                                primary_key: true
                            },
                            number: {
                                type: Number,
                            },
                            bool: {
                                type: Boolean,
                            }
                        }, {});
                        
                        const Model = await CadooseModel.registerAndSync("primitives", s);
                
                        const arr = await Model.create({
                            string: "string",
                            number: 100,
                            bool: true
                        },{
                            string: "string-2",
                            number: 100,
                            bool: true
                        });

                        expect(Array.isArray(arr)).to.be.equal(true);
                        expect(arr.length).to.be.equal(2);
                        
                        expect(arr[0].string).to.be.equal("string");
                        expect(arr[1].string).to.be.equal("string-2");

                        expect(arr[0].number).to.be.equal(100);
                        expect(arr[1].number).to.be.equal(100);

                        expect(arr[0].bool).to.be.equal(true);
                        expect(arr[1].bool).to.be.equal(true);

                        const aa = await Model.findOneAsync({string:"string"});
                        const aa2 = await Model.findOneAsync({string:"string-2"});
            
                        expect(aa.string).to.be.equal("string");
                        expect(aa.number).to.be.equal(100);
                        expect(aa.bool).to.be.equal(true);

                        expect(aa2.string).to.be.equal("string-2");
                        expect(aa2.number).to.be.equal(100);
                        expect(aa2.bool).to.be.equal(true);
                    });

            });

        });

    });


    describe("YugaByte YCQL features", () => {


        describe("JSONB Datatype", () => {

            it("Inserts and retrieves Objects as JSONB-Documents into the DB", async () => {

                const s = new Schema({
                    key: {
                        type: String,
                        primary_key: true
                    },
                    doc: {
                        type: "jsonb"
                    }
                });

                const Model = await CadooseModel.registerAndSync("jsonb_tests", s);

                const someGenericObject = {
                    attr0: 0,
                    attr1: 1,
                    nested: {
                        attr0: "nested.attr0",
                        attr1: true,
                        attr2: [
                            "nested.attr2[0]",
                            "nested.attr2[1]",
                            "nested.attr2[2]",
                        ],
                        nested: {
                            attr0: new Date(),
                            attr1: "nested.nested.attr1"
                        }
                    }
                };

                const a = new Model({
                    key: "some-id",
                    doc: new JSONB(someGenericObject)
                });

                expect(typeof(a.doc)).to.be.equal("object");
                expect(JSON.stringify(a.doc)).to.be.equal(JSON.stringify(someGenericObject));

                await a.saveAsync();

                const aa = await Model.findOneAsync({key: "some-id"});

                expect(typeof(aa.doc)).to.be.equal("object");
                expect(JSON.stringify(aa.doc)).to.be.equal(JSON.stringify(someGenericObject));
            });

            it("SELECT query with condition on JSONB-Attribute returns correct row", async () => {

                const s = new Schema({
                    key: {
                        type: String,
                        primary_key: true
                    },
                    clusterkey: {
                        type: Number,
                        clustering_key: true
                    },
                    doc: {
                        type: "jsonb"
                    }
                });

                const Model = await CadooseModel.registerAndSync("jsonb_tests", s);

                const obj1 = {
                    meta: {
                        time: {
                            passed: 1
                        }
                    },
                    stuff: {
                        someAttr: "lalala"
                    }
                };
                const obj2 = {
                    meta: {
                        time: {
                            passed: 7
                        }
                    },
                    log: {
                        messages: ["some message", "next message"]
                    }
                };

                await Promise.all([obj1, obj2].map(o => {
                    const a = new Model({
                        key: "some-id",
                        clusterkey: Math.random(),
                        doc: new JSONB(o)
                    });
    
                    return a.saveAsync();
                }));

                const aa = await Model.findOneAsync({key: "some-id", [JSONB.path("doc").meta.time.passed]: "7"});

                expect(typeof(aa.doc)).to.be.equal("object");
                expect(aa.doc).to.have.nested.property("meta");
                expect(aa.doc).to.have.nested.property("meta.time");
                expect(aa.doc).to.have.nested.property("meta.time.passed");
                expect(aa.doc.meta.time.passed).to.be.equal(7);
            });

        });


    })

});