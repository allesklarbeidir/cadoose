# Cadoose

A [mongoose](https://mongoosejs.com/)-like wrapper for Cassandra (and YugaByte YCQL).

If you've ever used MongoDB and Mongoose, you know how convenient it is to model and develop an architecture using these tools. I was used to MongoDB and Mongoose but then switched to YugaByte YCQL (Cassandra-API) and missed mongoose. Unfortunately there don't seem to be any library for Cassandra which implements the same or at least very similar API. That's why I created **cadoose**. However, to not rewrite everything from scratch, I'm using [express-cassandra](https://github.com/masumsoft/express-cassandra) as a backend. 

Cadoose is a wrapper around express-cassandra which implements the Mongoose-API (only the Schema / Model parts until now) and will be extended with more features in the future. The goal is to make the code look mostly the same regardless of which database is running in the background (either MongoDB or Cassandra) and thus the transition from MongoDB to Cassandra (or YugaByte YCQL) as smooth as possible.

**This is a very early release and it is not yet tested in production. Use with caution!**

## Usage
The modelling works exactly as in mongoose, the query functions work as in express-cassandra.

Init a connection:

In mongoose:
```js
import mongoose from "mongoose";

const config = { /* Connection Settings.... */ };
const connectionString = .....;
mongoose.connect(connectionString);
```

In cadoose:
```js
import {MakeCadoose, CADOOSE} from  "cadoose";
const cassandra = MakeCadoose({
	    contactPoints: ["127.0.0.1"],
		protocolOptions: { port:  9042 },
		keyspace:  "main",
		queryOptions: {consistency:  CADOOSE.ExpressCassandra.consistencies.one}
	},{
	defaultReplicationStrategy : {
		class:  'SimpleStrategy',
		replication_factor:  1
	},
	migration:  'safe',
});
```

Register a Model:

In mongoose:
```js
import  mongoose, {Schema} from  "mongoose";

const WebsocketSchema = new Schema({
	socket_id: {
		type: String
	},
	connection_type: {
		type: String
	}
});

const UserSchema = new Schema({
	_id: {
		type: mongoose.SchemaTypes.ObjectId,
	},
	connections: [WebsocketSchema]
});

const User = mongoose.model("user", user);
```

In cadoose:
```js
import {Schema, Model} from "cadoose";

const WebsocketSchema = new Schema({
	socket_id: {
		type: String
	},
	connection_type: {
		type: String
	}
},{
	name: "websocket"
});

const UserSchema = new Schema({
	id: {
		type: String,
		primary_key: true
	},
	connections: [WebsocketSchema]
});

const User = await Model.registerAndSync("users", user);

```

**Note: Using the above way of registering + syncing a Model with the DB, you'll need to await the Promise which is returned by the asynchronous 'registerAndSync' method.**

This is unhandy if you want to declare a Model in an ES6 module and then export the Model because you'd be exporting a Promise. To avoid this please use the 'registerAndSyncDefered' method for registering + syncing a Model with the DB. Example below:

```js
import {Schema, Model} from "cadoose";

const WebsocketSchema = new Schema({
	socket_id: {
		type: String
	},
	connection_type: {
		type: String
	}
},{
	name: "websocket"
});

const UserSchema = new Schema({
	id: {
		type: String,
		primary_key: true
	},
	connections: [WebsocketSchema]
});

const User = Model.registerAndSyncDefered("user", user);

export default User; 

/* User is now a defered Model which will only init a connection
   on the first call to a function or the constructor (initializing 
   Model-Instance). However, since the first thing that needs to be done
   is still registering + syncing with the DB (which is asynchronous)
   you have to await the constructor or the function you want to call.

   Example:

   import User from "./User";

   async someAsyncFunction_For_Example_In_ExpressJS(){
	   
	   const bob = await new User({id:"bob"});
	   // do normal stuff now, it's not defered any more

	   // or

	   const bob = await (await User.findOneAsync)({id:"bob"});
	   // do normal stuff now, it's not defered any more

	   // or

	   await User.undefer();
	   // do normal stuff now, it's not defered any more

	   // for example:
	   const bob = await User.findOneAsync({id:"bob});

   }
*/
```

Eventhough this may look like a strange pattern, it's much more likely that one will be able to execute actual application logic which uses the Model defined in another ES6 module in an asynchronous function. And since one would use the asynchronous functions anyways, it the best place to init the Model asynchronously.

This also keeps Models which are not used in a code execution from sending requests to the DB. For example in a AWS Lambda environment a function might be called which only uses one Model. Now, if Models are imported but not used in the called function, the DB is not hit with queries for the unused Models.


Although you'll be able to use most of mongoose's features like nested Schemas (as well in Arrays as shown above) and also nested properties as if cassandra were a document-based database, this is translated to a cassandra compatible representation and then saved to the database. After retrieving an item you again have he full convenience of accessing your Model's properties even if they are nested properties.

I encourage you to read and learn about cassandra because you'll need to set your 'primary_key' and 'clustering_key' and 'secondary_index' properties in the Schema properly and with cassandra specific considerations in mind.  


## Limitations & Caveats

Cadoose is being developed for YugaByte YCQL right now. It should work for pure Cassandra but it's only tested on YugaByte. In the future releases I will make the YugaByte specific options and adaptions an opt-in and not the default. 

**This is a very early release and it is not yet tested in production. Use with caution!**

## Tests

Cadoose is covered by 92 passing tests.
All features have unit tests. If you want to see an example and play around with it please download the repo and run some tests. I didn't have time to write a documentation yet.

## Contribute

Please feel free to open a pull request and discuss features and issues!

## Thanks

Special thanks go to @masumsoft for creating 'express-cassandra' and the creators of 'mongoose'
