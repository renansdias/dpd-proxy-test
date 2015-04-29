var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var fs = require('fs');
var path = require('path');
var http = require('http');
var methodOverride = require('method-override');

var RESOURCES = 'resources';
var CONFIG_FILE = 'config.json';

var initiate = function(options) {
	/*
	 * The options object above has a property called "resourcesDirectory".
	 * The resources directory is the directory in which we'll store config.json
	 * files for EACH collection in our database. So say a database has 3 collections:
	 * people, cars and companies. The tree structure of the resources folder will
	 * be as follows:
	 *
	   resources
	   |______ people
	   |	   |______ config.json
	   |
	   |______ cars
	   |	   |______ config.json
	   |
	   |______ companies
	  		   |______ config.json
	 *
	 * Each config.json will be as follows:
	 *
	  {
	    "type": "Collection",
	    "properties": {
	        "name": {
	            "name": "name",
	            "type": "string",
	            "typeLabel": "string",
	            "required": false,
	            "id": "name",
	            "order": 0
	        },
	        "foundation_year": {
	            "name": "foundation_year",
	            "type": "number",
	            "typeLabel": "number",
	            "required": false,
	            "id": "foundation_year",
	            "order": 1
	    }
	  }
	*/
	var resourcesDirectory = options.resourcesDirectory;

	// ****************************
	//    M I D D L E W A R E S
	// ****************************
	
	// Allows our API to get the JSON body of the HTTP request
	app.use(bodyParser.json());

	// Allows us to use app.put and app.delete
	app.use(methodOverride('_method'));

	// ****************************
	//  	   R O U T E S
	// ****************************

	/*
	 * Creates the folder for the given collection and its config.json file.
	 * Also note that at this point, the resources folder
	 * should exist, so we won't bother creating it.
	 *
	 * Request body should be as follows:
	 *
	 {
		"type": "Collection",
		"id": "<collection name>",
		"properties": {
			"<property name>": {
				"name": "<property name>",
				"type": "<property type>",
				"typeLabel": "<property type>",
				"required": true | false,
				"id": "<property name>"
			},
			{...}
		}
	 }
	 *
	 * And yes, <property name> should appear 3 times per property (that's just how DPD works).
	 *
	 * Test: {"type": "Collection", "id": "companies", "properties": {"name": {"name": "name", "type": "string", "typeLabel": "string", "required": false, "id": "name"}, "foundation_year": {"name": "foundation_year", "type": "number", "typeLabel": "number", "required": false, "id": "foundation_year"}, "city": {"name": "city", "type": "string", "typeLabel": "string", "required": false, "id": "city"}}}
	 */
	app.post('/resources', function(req, res) {
		var collection = req.body.id;
		var type = req.body.type;
		var properties = req.body.properties;
		var folderName = collection + '_' + new Date().getTime().toString();
		
		// Checks if the folder can be created inside the resources folder.
		if (!fs.existsSync(path.join(resourcesDirectory, folderName))) {
			// If it doesn't exist yet, create it.
			fs.mkdirSync(path.join(resourcesDirectory, folderName));

			// Each of the properties needs to have an "order" key that indicates
			// its position in the collection (?). So since this endpoint creates
			// a new collection with new properties, we'll insert this order key by ourselves.
			var k = 0;
			for (var propertyName in properties) {
				properties[propertyName].order = k++;
			}

			var config = {
				type: type,
				properties: properties
			};

			fs.writeFile(path.join(resourcesDirectory, folderName, CONFIG_FILE), JSON.stringify(config, null, 4), function(err) {
				if (err) res.JSON(err);

				res.status(201).json({"status": "Ok", "collectionId": folderName});
			});
		} else {
			res.status(500).json({
				error: "The folder could not be created"
			});
		}
	});

	/**
	 * Changes the name of the given collections.
	 * 
	 * Payload example:
	 {
		"collections": {
			"<old collection name>": "<new collection name>",
			"<old collection name>": "<new collection name>",
			...
		}
	 }
	 */
	app.put('/resources', function(req, res) {

		// For each collection, we'll need to:
		// 
		// 1 - load the config.json file,
		// 2 - append an "id" property whose value will be the new collection,
		// 3 - call the endpoint /__resources/<old collection name> on DPD server.

		for (oldCollection in req.body.collections) {
			// First step will be to load the old collection's config.json file.
			var p = path.join(resourcesDirectory, oldCollection, CONFIG_FILE);
			var config = JSON.parse(fs.readFileSync(p, 'utf8'));

			// Then, we'll append an "id": <new collection name>
			config.id = req.body.collections[oldCollection];

			// Then call the endpoint /__resources/<old collection name>
			var options = {
				hostname: 'localhost',
				port: 3123,
				path: path.join('/__resources', oldCollection),
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					'dpd-ssh-key': 'iaushdiausdh'
				}
			};

			proxyRequestToDeployd(config, options, function(chunk) {
				res.status(201).json(JSON.parse(chunk));
			});
		}
	});

	/**
	 * Updates the config.json file adding a property to the collection
	 * Note that it won't be necessary to send the "order" since this code
	 * is already calculating it for us.
	 *
	 * Request body:
	 {
		"<property name>": {
			"name": "<property name>",
			"type": "<property type>",
			"typeLabel": "<property type>",
			"required": true | false,
			"id": "<property name>"
		}
	 }
	 */
	app.put('/resources/:collection', function(req, res) {
		var p = path.join(resourcesDirectory, req.params.collection, CONFIG_FILE);
		var config = JSON.parse(fs.readFileSync(p, 'utf8'));
		var body = req.body;
		var property = Object.keys(body)[0];

		if (typeof config.properties === 'undefined') {
			body[property].order = 0;

			config.properties = {};
		} else {
			var maxOrder = 0;

			for (var key in config.properties) {
				if (config.properties[key].order > maxOrder) {
					maxOrder = config.properties[key].order;
				}
			}

			body[property].order = ++maxOrder;
		}

		config.properties[property] = body[property];

		fs.writeFile(p, JSON.stringify(config, null, 4), function(err) {
			if (err) res.status(500).json(err);

			res.json({status: "Ok"});
		});
	});

	/**
	 * Adds a document in the collection. Note that this document should not exist because
	 * this endpoint sends back the document's _id.
	 *
	 {
		"<property name>": "<property value>",
		"<property name>": "<property value>",
		"<property name>": "<property value>",
		...
	 }
	 */
	app.post('/:collection', function(req, res) {
		var options = {
			hostname: 'localhost',
			port: 3123,
			path: '/' + req.params.collection,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			}
		};

		var proxyRequest = http.request(options, function(response) {
			console.log(response);
			console.log('STATUS: ' + response.statusCode);
			console.log('HEADERS: ' + JSON.stringify(response.headers));
			response.setEncoding('utf8');

			response.on('data', function (chunk) {
				console.log('BODY: ' + chunk);

				res.status(201).json(JSON.parse(chunk));
			});
		});

		proxyRequest.on('error', function(e) {
			console.log('Problem wih request: ' + e.message);
		});

		proxyRequest.write(JSON.stringify(req.body));
		proxyRequest.end();
	});

	/**
	 * Renames property of a given collection.
	 * Example request body:
	 *
	 {
		"properties": {
			"<old property name>": "<new property name>",
			"<old property name>": "<new property name>",
			...
		}
	 }
	 */
	app.put('/:collection/rename', function(req, res) {
		var p = path.join(resourcesDirectory, req.params.collection, CONFIG_FILE);
		var config = JSON.parse(fs.readFileSync(p, 'utf8'));

		var options = {
			hostname: 'localhost',
			port: 3123,
			path: path.join('/', req.params.collection, 'rename'),
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			}
		};

		/*
		 * First we'll make a request to the deployd server
		 * asking it to rename the property on our mongodb database.
		 */
		var proxyRequest = http.request(options, function(response) {
			console.log(response);
			console.log('STATUS: ' + response.statusCode);
			console.log('HEADERS: ' + JSON.stringify(response.headers));
			response.setEncoding('utf8');

			response.on('data', function (chunk) {
				console.log('BODY: ' + chunk);

				// At this point, the properties had their names changed
				// in our database. What we need to do now is to
				// change the config.json file to mirror those changes.

				// Walking through the req.body object
				// {"<old property>": "<new property>", ...}
				
				for (var oldKey in req.body.properties) {
					var newKey = req.body.properties[oldKey];
					var newProperty = {
						"name": newKey,
						"type": config.properties[oldKey].type,
						"typeLabel": config.properties[oldKey].typeLabel,
						"required": config.properties[oldKey].required,
						"id": newKey,
						"order": config.properties[oldKey].order
					}

					delete config.properties[oldKey];
					config.properties[newKey] = newProperty;
				}

				fs.writeFile(p, JSON.stringify(config, null, 4), function(err) {
					if (err) res.status(500).json(err);

					res.status(200).json({"status": "Ok"});
				});			
			});
		});

		proxyRequest.on('error', function(e) {
			console.log('Problem wih request: ' + e.message);
		});

		proxyRequest.write(JSON.stringify(req.body));
		proxyRequest.end();

		// // Walking through the req.body object
		// // {"<old property>": "<new property>", ...}
		// for (var oldKey in req.body) {
		// 	var newKey = req.body[oldKey];
		// 	var newProperty = {
		// 		"name": newKey,
		// 		"type": config.properties[oldKey].type,
		// 		"typeLabel": config.properties[oldKey].typeLabel,
		// 		"required": config.properties[oldKey].required,
		// 		"id": newKey,
		// 		"order": config.properties[oldKey].order
		// 	}

		// 	delete config.properties[oldKey];
		// 	config.properties[newKey] = newProperty;
		// }

		// fs.writeFile(p, JSON.stringify(config, null, 4), function(err) {
		// 	if (err) res.status(500).json(err);

		// 	res.status(200).json({"status": "Ok"});
		// });
	});

	/**
	 * Updates a document by inserting a new property
	 * 
	 * Request body:
	 {
		"<new property name>": "<property value>",
		...
	 }
	 *
	 * NOTE: in order to add a new property to a document, this
	 * property should've been registered in the config.json file.
	 */
	app.put('/:collection/:documentId([a-zA-Z0-9]+$)', function(req, res) {
		var options = {
			hostname: 'localhost',
			port: 3123,
			path: path.join('/', req.params.collection, req.params.documentId),
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json'
			}
		};

		var proxyRequest = http.request(options, function(response) {
			// console.log(response);
			// console.log('STATUS: ' + response.statusCode);
			// console.log('HEADERS: ' + JSON.stringify(response.headers));
			response.setEncoding('utf8');

			response.on('data', function (chunk) {
				console.log('BODY: ' + chunk);

				res.status(200).json(JSON.parse(chunk));
			});
		});

		proxyRequest.on('error', function(e) {
			console.log('Problem wih request: ' + e.message);
		});

		proxyRequest.write(JSON.stringify(req.body));
		proxyRequest.end();
	});

	// Servers
	var createDeploydServer = require('../deployd');

	createDeploydServer({
		port: 3123,
		env: 'development'
	});
		
	app.listen(options.port, function() {
		console.log('Server is running on port ' + options.port);
	});
}

function proxyRequestToDeployd(body, options, responseCallback) {
	var proxyRequest = http.request(options, function(response) {
		// console.log(response);
		// console.log('STATUS: ' + response.statusCode);
		// console.log('HEADERS: ' + JSON.stringify(response.headers));
		response.setEncoding('utf8');

		response.on('data', function (chunk) {
			console.log('BODY: ' + chunk);

			responseCallback(chunk);
		});
	});

	proxyRequest.on('error', function(e) {
		console.log('Problem wih request: ' + e.message);
	});

	proxyRequest.write(JSON.stringify(body));
	proxyRequest.end();
}

module.exports = initiate;