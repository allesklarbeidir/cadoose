# Cadoose

A [mongoose](https://mongoosejs.com/)-like wrapper for Cassandra (and YugaByte YCQL).

If you've ever used MongoDB and Mongoose, you know how convenient it is to model and develop an architecture using these tools. I was used to MongoDB and Mongoose but then switched to YugaByte YCQL (Cassandra-API) and missed mongoose. Unfortunately there don't seem to be any library for Cassandra which implements the same or at least very similar API. That's why I created **cadoose**. However, to not rewrite everything from scratch, I'm using [express-cassandra](https://github.com/masumsoft/express-cassandra) as a backend. 

Cadoose is a wrapper around express-cassandra which implements the Mongoose-API (only the Schema / Model parts until now) and will be extended with more features in the future. The goal is to make the code look mostly the same regardless of which database is running in the background (either MongoDB or Cassandra) and thus the transition from MongoDB to Cassandra (or YugaByte YCQL) as smooth as possible.

**This is a very early release and it is not yet tested in production. Use with caution!**

## Usage
The modelling works exactly as in mongoose, the query functions work as in express-cassandra.

Init a connection:

In mongoose:
```
import mongoose from "mongoose";

const config = { /* Connection Settings.... */ };
const connectionString = .....;
mongoose.connect(connectionString);
```

In cadoose:
```
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
```
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
```
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

const User = await Model.registerAndSync("user", user);

```

Although you'll be able to use most of mongoose's features like nested Schemas (as well in Arrays as shown above) and also nested properties as if cassandra were a document-based database, this is translated to a cassandra compatible representation and then saved to the database. After retrieving an Item you again have he full convenience of accessing your Model's properties even if they are nested properties.

I encourage you to read and learn about cassandra because you'll need to set your 'primary_key' and 'clustering_key' and 'secondary_index' properties in the Schema properly and with cassandra specific considerations in mind.  


## Limitations & Caveats

Cadoose is being developed for YugaByte YCQL right now. It should work for pure Cassandra but it's only tested on YugaByte. In the future releases I will make the YugaByte specific options and adaptions an opt-in and not the default. 

**This is a very early release and it is not yet tested in production. Use with caution!**

## Tests

Cadoose is covered by 88 passing tests.
All features have unit tests. If you want to see an example and play around with it please download the repo and run some tests. I didn't have time to write a documentation yet.

## Contribute

Please feel free to open a pull request and discuss features and issues!

## Thanks

Special thanks go to @masumsoft for creating 'express-cassandra' and the creators of 'mongoose'
