const express = require('express');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const session = require('express-session');
const sessionStore = require('session-file-store')(session);
const fileUpload = require('express-fileupload');
const bodyParser = require('body-parser');
const cors = require('cors');
const external = require('request');
const moment = require("moment");
const Influx = require('influx');
const helmet = require('helmet');
const https = require("https");

/**
 * Command line Launch Settings
 */
const port = process.env.PORT||1408;
const portTLS = process.env.PORTTLS||8443;
const settingsPath = process.env.SETTINGS || '/../ziti/';

var serviceUrl = "";
var fabricUrl = "";
var headerFile = __dirname+"/assets/templates/header.htm";
var footerFile = __dirname+"/assets/templates/footer.htm";
var header = fs.readFileSync(headerFile, 'utf8');
var footer = fs.readFileSync(footerFile, 'utf8');

var emailVerificationHeaderFile = __dirname+"/assets/templates/email-verification-header.htm";
var emailVerificationHeader = fs.readFileSync(emailVerificationHeaderFile, 'utf8');

const version = require('./package.json').version;

let ArgumentParser = require('argparse').ArgumentParser;

let parser = new ArgumentParser({
	version: version,
	addHelp: true,
	description: 'An example controller node using a default implementation.'
  });
  
  parser.addArgument(['-c', '--config'], {
	required: true,
	help: 'The configuration file to load',
	dest: 'config'
  });
  
  parser.addArgument(['--verbose'], {
	action: 'append',
	nargs: 0,
	required: false,
	help: 'Default log output shows fatal/error/warn/info. Specifying this switch once adds debug and twice adds trace.',
	dest: 'verbosity'
  });
  
  parser.addArgument(['-p', '--pretty'], {
	nargs: 0,
	required: false,
	help: 'Changes console output to be a human readable stream',
	dest: 'pretty'
  });
  
  parser.addArgument(['-s', '--source'], {
	nargs: 0,
	required: false,
	help: 'Adds source file and line number to log output',
	dest: 'source'
  });
  
  
  let args = parser.parseArgs();
  if(!fs.existsSync(args.config)) {
	logger.error('\nInvalid configuration file supplied\n');
	process.exit(1);
  }
  
  let loggerConfig = {
	level: 'info',
	streams: [],
	src: false,
  };
  
  if(args.verbosity) {
	if(args.verbosity.length === 1) {
	  loggerConfig.level = 'debug';
	} else {
	  loggerConfig.level = 'trace';
	}
  }
  
  if(args.pretty) {
	let PrettyStream = require('bunyan-prettystream');
	let prettyStdOut = new PrettyStream();
	prettyStdOut.pipe(process.stdout);
	loggerConfig.streams.push({
	  level: loggerConfig.level,
	  type: 'raw',
	  stream: prettyStdOut
	});
  } else {
	loggerConfig.streams.push({
	  level: loggerConfig.level,
	  stream: process.stdout
	});
  }
  
  loggerConfig.src = !!args.source;
  
  const logger = require('@netfoundry/zt-logger')(loggerConfig);
  
  logger.info(`Starting with config file: ${args.config}`);
  
/**
 * Watch for header and footer file changes and load them
 */
fs.watchFile(headerFile, (curr, prev) => {
	logger.info(headerFile+" file Changed");
	header = fs.readFileSync(headerFile, 'utf8');
});
fs.watchFile(footerFile, (curr, prev) => {
	logger.info(footerFile+" file Changed");
	footer = fs.readFileSync(footerFile, 'utf8');
});

var errors = {
	access: "You Do Not Have Access To Perform This Operations",
	invalidServer: "Invalid Edge Controller"
}

/**
 * Define Express Settings
 */
const app = express();
app.use(cors());
app.use(helmet());
app.use(function(req, res, next) {
    res.setHeader("Content-Security-Policy", "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdnjs.com https://apis.google.com https://ajax.googleapis.com https://fonts.googleapis.com https://www.google-analytics.com https://www.googletagmanager.com; object-src 'none'; form-action 'none'; frame-ancestors 'self'; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdnjs.com https://fonts.googleapis.com");
    return next();
});
app.use(bodyParser.json());
app.use(fileUpload());
app.use('/assets', express.static('assets'));
app.use(session({store: new sessionStore, secret: 'NetFoundryZiti', retries: 10, resave: true, saveUninitialized:true, ttl: 60000 }));

/**
 * Load configurable settings, or create the settings in place if they have never been defined
 */
if (!fs.existsSync(__dirname+settingsPath)) {
	fs.mkdirSync(__dirname+settingsPath);
}
if (!fs.existsSync(__dirname+settingsPath+'tags.json')) {
	fs.copyFileSync(__dirname+'/assets/data/tags.json', __dirname+settingsPath+'tags.json');
}
if (!fs.existsSync(__dirname+settingsPath+'settings.json')) {
	fs.copyFileSync(__dirname+'/assets/data/settings.json', __dirname+settingsPath+'settings.json');
}
if (!fs.existsSync(__dirname+settingsPath+'/resources')) {
	fs.mkdirSync(__dirname+settingsPath+'/resources');
	fse.copySync(__dirname+'/assets/resources/',__dirname+settingsPath+'/resources/');
}
var pages = JSON.parse(fs.readFileSync(__dirname+'/assets/data/site.json', 'utf8'));
var tags = JSON.parse(fs.readFileSync(__dirname+settingsPath+'tags.json', 'utf8'));
var settings = JSON.parse(fs.readFileSync(__dirname+settingsPath+'settings.json', 'utf8'));

for (var i=0; i<settings.edgeControllers.length; i++) {
	if (settings.edgeControllers[i].default) {
		serviceUrl = settings.edgeControllers[i].url;
		break;
	}
}

for (var i=0; i<settings.fabricControllers.length; i++) {
	if (settings.fabricControllers[i].default) {
		fabricUrl = settings.fabricControllers[i].url;
		break;
	}
}

/**
 * Setup static pages from configuration files defined in /data/site.json
 */
for (var i=0; i<pages.length; i++) {
	app.get(pages[i].url, function(request, response) {
		var page = pages[0];
		for (var i=0; i<pages.length; i++) {
			if (pages[i].url==request.url) {
				page = pages[i];
				break;
			}
		}
		if (page.access=="") {
			if (page.url=="/login") request.session.user = null;
			var headerNow = header.split("{{title}}").join(page.title);
			headerNow = headerNow.split("{{auth}}").join("");
			fs.readFile(__dirname+"/html"+page.page, 'utf8', function(err, data) {
				response.send(headerNow+data+footer);
			});
		} else {
			if (request.session.user==null||request.session.user=="") response.redirect("/login");
			else {
				if (Number(page.access)<=Number(request.session.authorization)) {
					var headerNow = header.split("{{title}}").join(page.title);
					headerNow = headerNow.split("{{auth}}").join(" loggedIn");
					fs.readFile(__dirname+"/html"+page.page, 'utf8', function(err, data) {
						response.send(headerNow+data+footer);
					});
				} else response.redirect('/login');
			}
		}
	});
}



/**------------- Authentication Section -------------**/



/**
 * Just tests if the user exists as a session or not, would add on to validate roles, etc if the system is expanded to 
 * include more well defined authentication structures
 * @param {The current user session} user 
 */
function hasAccess(user) {
	return (user!=null);
}

/**
 * Authentication method, authenticates the user to the provided edge controller defined by url
 */
app.post("/api/login", function(request, response) {
	var urlToSet = request.body.url;
	if (!IsServerDefined(urlToSet)) response.json({error: errors.invalidServer });
	else {
		serviceUrl = urlToSet;
		var params = {
			username: request.body.username,
			password: request.body.password
		}
		logger.info("Connecting to: "+serviceUrl+"/authenticate?method=password");
		logger.info("Posting: "+JSON.stringify(params));
		external.post(serviceUrl+"/authenticate?method=password", {json: params, rejectUnauthorized: false }, function(err, res, body) {
			if (err) {
				logger.error(err);
				var error = "Server Not Accessible";
				if (err.code!="ECONNREFUSED") response.json( {error: err.code} );
				response.json( {error: error} );
			} else {
				if (body.error) response.json( {error:body.error.message} );
				else {
					if (body.data&&body.data.token) {
						request.session.user = body.data.token;
						logger.info("Session: "+request.session.user);
						request.session.authorization = 100;
						response.json( {success: "Logged In"} );
					} else response.json( {error: "Invalid Account"} );
				}
			}
		});
	}
});

/**
 * Returned the version of the edge-controller server
 */
app.post('/api/version', function(request, response) {
	if (serviceUrl) {
		external.get(serviceUrl+"/version", {rejectUnauthorized: false}, function(err, res, body) {
			if (err) logger.error(err);
			else {
				 var data = JSON.parse(body);
				 if (data&&data.data) response.json( {data: data.data} );
				 else response.json({});
			}
		});
	} else response.json({});
});

/**
 * Reset the current users password
 */
app.post("/api/reset", function(request, response) {
	if (serviceUrl==null||serviceUrl.length==0) response.json({error:"loggedout"});
	else {
		if (request.body.newpassword!=request.body.confirm) response.json({error: "Password does not match confirmation"});
		else {
			var params = {
				current: request.body.password,
				new: request.body.newpassword
			}
			logger.info("Connecting to: "+serviceUrl+"/current-identity/updb/password");
			logger.info("Posting: "+JSON.stringify(params));
			external.put(serviceUrl+"/current-identity/updb/password", {json: params, rejectUnauthorized: false, headers: { "zt-session": request.session.user }}, function(err, res, body) {
				if (err) {
					logger.error(err);
					var error = "Server Not Accessible";
					if (err.code!="ECONNREFUSED") response.json( {error: err.code} );
					response.json( {error: error} );
				} else {
					if (body.error) {
						logger.info(JSON.stringify(body.error));
						response.json( {error: body.error.message} );
					} else response.json( {success: "Password Updated"} );
				}
			});
		}
	}
});



/**------------- Server Settings Section -------------**/



/**
 * Tests whether the service url exists in the system to prevent hitting unknown server sources
 * 
 * @param {The Url to check if it exists in the configuration} url 
 */
function IsServerDefined(url) {
	for (var i=0; i<settings.edgeControllers.length; i++) {
		if (settings.edgeControllers[i].url==url) return true;
	}
	return false;
}

/**
 * Returns the current system settings
 */
app.post("/api/settings", function(request, response) {
	response.json(settings);
});

/**
 * Save controller information to the settings file if the server exists
 */
app.post("/api/controllerSave", function(request, response) {
	var name = request.body.name.trim();
	var url = request.body.url.trim();
	if (url.endsWith('/')) url = url.substr(0, url.length-1);
	var errors = [];
	if (name.length==0) errors[errors.length] = "name";
	if (url.length==0) errors[errors.length] = "url";
	if (errors.length>0) {
		response.json({ errors: errors });
	} else {
		external.get(url+"/version", {rejectUnauthorized: false}, function(err, res, body) {
			if (err) response.json( {error: "Edge Controller not Online"} );
			else {
				if (body.error) response.json( {error: "Invalid Edge Controller"} );
				else {
					var found = false;
					for (var i=0; i<settings.edgeControllers.length; i++) {
						if (settings.edgeControllers[i].url==url) {
							found = true;
							settings.edgeControllers[i].name = name;
							settings.edgeControllers[i].url = url;
							break;
						}
					}
					if (!found) {
						var isDefault = false;
						if (settings.edgeControllers.length==0) isDefault = true;
						settings.edgeControllers[settings.edgeControllers.length] = {
							name: name,
							url: url,
							default: isDefault
						};
					}
					fs.writeFileSync(__dirname+settingsPath+'/settings.json', JSON.stringify(settings));
					response.json(settings);
				}
			}
		});		
	}
});

/**
 * Save fabric controller information to the settings file if the server exists
 */
app.post("/api/fabricSave", function(request, response) {
	var name = request.body.name.trim();
	var url = request.body.url.trim();
	if (url.endsWith('/')) url = url.substr(0, url.length-1);
	var errors = [];
	if (name.length==0) errors[errors.length] = "name";
	if (url.length==0) errors[errors.length] = "url";
	if (errors.length>0) response.json({ errors: errors });
	else {
		var found = false;
		for (var i=0; i<settings.fabricControllers.length; i++) {
			if (settings.fabricControllers[i].url==url) {
				found = true;
				settings.fabricControllers[i] = {
					name: name,
					url: url
				};
				break;
			}
		}
		if (!found) {
			settings.fabricControllers[settings.fabricControllers.length] = {
				name: name,
				url: url
			};
		}
		fs.writeFileSync(__dirname+settingsPath+'/settings.json', JSON.stringify(settings));
		response.json(settings);
	}
});

/**
 * Remove the server definition (fabric or edge controller) from the settings
 * based on the passed in url parameter
 */
app.delete("/api/server", function(request, response) {
	var user = request.session.user;
	if (hasAccess(user)) {
		var url = request.body.url;
		var edges = [];
		var fabrics = [];
		logger.info(url);
		for (var i=0; i<settings.edgeControllers.length; i++) {
			logger.info(settings.edgeControllers[i].url);
			if (settings.edgeControllers[i].url!=url) {
				edges[edges.length] = settings.edgeControllers[i];
			}
		}
		for (var i=0; i<settings.fabricControllers.length; i++) {
			logger.info(settings.fabricControllers[i].url);
			if (settings.fabricControllers[i].url!=url) {
				fabrics[fabrics.length] = settings.fabricControllers[i];
			}
		}
		settings.fabricControllers = fabrics;
		settings.edgeControllers = edges;
		fs.writeFileSync(__dirname+settingsPath+'/settings.json', JSON.stringify(settings));

		response.json(settings);
	}
});

/**
 * Set the current controller to use
 */
app.post("/api/controller", function(request, response) {
	var urlToSet = request.body.url;
	if (!IsServerDefined(urlToSet)) response.json({error: errors.invalidServer });
	else serviceUrl = urlToSet;
});




/**------------- Server Search Section -------------**/




/**
 * Get the data from the edge controller based on the type of object and the 
 * defined search parameters
 */
app.post("/api/data", function(request, response) {
	var type = request.body.type;
	var paging = request.body.paging;
	GetItems(type, paging, request, response);
});

/**
 * Get the data from the edge controller
 * 
 * @param {The type of object to search for (identity, router, gateway, etc)} type 
 * @param {Paging request parameters (see edge controller API docs)} paging 
 * @param {The server request object} request 
 * @param {The server response object} response 
 */
function GetItems(type, paging, request, response) {
	var urlFilter = "";
	if (paging!=null) {
		if (!paging.filter) paging.filter = "";
		if (paging.page!=-1) urlFilter = "?filter=(name contains \""+paging.filter+"\")&limit="+paging.total+"&offset="+((paging.page-1)*paging.total)+"&sort="+paging.sort+" "+paging.order;
	}
	if (paging.params) {
		for (var key in paging.params) {
			urlFilter += ((urlFilter.length==0)?"?":"&")+key+"="+paging.params[key];
		}
	}
	if (serviceUrl==null||serviceUrl.trim().length==0) response.json({error:"loggedout"});
	else {
		logger.info("Calling: "+serviceUrl+"/"+type+urlFilter);
		external.get(serviceUrl+"/"+type+urlFilter, {json: {}, rejectUnauthorized: false, headers: { "zt-session": request.session.user } }, function(err, res, body) {
			if (err) {
				logger.error("Error: "+JSON.stringify(err));
				response.json({ error: err });
			} else {
				if (body.error) response.json( {error: body.error.message} );
				else if (body.data) {
					logger.info("Items: "+body.data.length);
					logger.info("Results: "+JSON.stringify(body.data));
					response.json( body );
				} else {
					body.data = [];
					response.json( body );
				}
			}
		});
	}
}

/**
 * Get all of the sub objects associated with a parent objects, like all of the services defined in an AppWAN
 */
app.post("/api/dataSubs", function(request, response) {
	var id = request.body.id;
	var type = request.body.type;
	if (request.body.url) {
		var url = request.body.url.href.split("./").join("");
		logger.info("Calling: "+serviceUrl+"/"+url);
		external.get(serviceUrl+"/"+url+"?limit=99999999&offset=0&sort=name ASC", {json: {}, rejectUnauthorized: false, headers: { "zt-session": request.session.user } }, function(err, res, body) {
			if (err) response.json({ error: err });
			else {
				if (body.error) {
					if (body.error.cause&&body.error.cause.message) response.json( {error: body.error.cause.message} );
					else response.json( {error: body.error} );
				} else if (body.data) {
					logger.info(body.data.length);
					response.json({
						id: id,
						type: type,
						data: body.data
					});
				} else {
					logger.info(JSON.stringify(body));
					response.json( {error: "Unable to retrieve data"} );
				}
			}
		});
	} else response.json( {error: "Invalid Sub Data Url"});
});

/**
 * Get the data directly from a provided link from the json _links returned from
 * the edge controller parent data call.
 */
app.post("/api/subdata", function(request, response) {
	var url = request.body.url.split("./").join("");
	var id = request.body.id;
	var type = request.body.type;
	var parentType = request.body.name;
	external.get(url, {json: {}, rejectUnauthorized: false, headers: { "zt-session": request.session.user } }, function(err, res, body) {
		if (err) response.json({ error: err });
		else {
			response.json({ 
				id: id,
				parent: parentType,
				type: type,
				data: body.data
			});
		}
	});
});

/**
 * Get the data from a fabrice controller based on the type of object
 */
app.post("/api/dataFabric", function(request, response) {
	var type = request.body.type;
	fabricUrl = request.body.url;
	GetFabricItems(type, response);
});

/**
 * Get the data from the fabric controller
 * 
 * @param {The type of data to get from the controller (e.g. links, routers, etc)} type 
 * @param {The server response object} response 
 */
function GetFabricItems(type, response) {
	var canCall = false; 
	for (var i=0; i<settings.fabricControllers.length; i++) {
		if (settings.fabricControllers[i].url==fabricUrl) {
			canCall = true;
			break;
		}
	}
	if (canCall) {
		logger.info("Calling Fabric: "+type+" "+fabricUrl+"/ctrl/"+type);
		external.get(fabricUrl+"/ctrl/"+type, { json: {}, rejectUnauthorized: false }, function(err, res, body) {
			if (err) response.json({ error: "Unable to connect to fabric" });
			else {
				if (body.error) response.json( {error: body.error.message} );
				else if (body.data) response.json( body );
				else response.json( {error: "Unable to retrieve data"} );
			}
		});
	} else {
		fabricUrl = "";
		response.json({ data: [] });
	}
}




/**------------- Data Save Section -------------**/




/**
 * Save the object to the edge controller based on the provided type and passed in JSON 
 * parameters. If it exists, do an update, if not do a create operation.
 */
app.post("/api/dataSave", function(request, response) {
	if (serviceUrl==null||serviceUrl.length==0) response.json({error:"loggedout"});
	else {
		var saveParams = request.body.save;
		var additional = request.body.additional;
		var removal = request.body.removal;
		var type = request.body.type;
		var paging = request.body.paging;
		var method = "POST";
		var id = request.body.id;
		var url = serviceUrl+"/"+type;
		var user = request.session.user;
		if (hasAccess(user)) {
			if (id&&id.trim().length>0) {
				method = "PUT";
				url += "/"+id.trim();
				if (removal) {
					var objects = Object.entries(removal);
					if (objects.length>0) {
						for (var i=0; i<objects.length; i++) {
							var params = {};
							params.ids = objects[i][1];
							logger.info("Delete:"+serviceUrl+"/"+type+"/"+id.trim()+"/"+objects[i][0]);
							logger.info(JSON.stringify(params));
							external.delete(serviceUrl+"/"+type+"/"+id.trim()+"/"+objects[i][0], {json: params, rejectUnauthorized: false, headers: { "zt-session": request.session.user } }, function(err, res, body) {});
						}
					}
				}
			}
			logger.info("Calling: "+url);
			logger.info("Saving As: "+method+" "+JSON.stringify(saveParams));
			external(url, {method: method, json: saveParams, rejectUnauthorized: false, headers: { "zt-session": request.session.user } }, function(err, res, body) {
				if (err) response.json({ error: err });
				else {
					logger.info(JSON.stringify(body));
					if (body.error) {
						if (body.error.cause&&body.error.cause.message) response.json( {error: body.error.cause.message} );
						else response.json( {error: body.error} );
					} else if (body.data) {
						if (additional) {
							var objects = Object.entries(additional);
							var index = 0;
							if (objects.length>0) {
								if (method=="POST") id = body.data.id;
								for (var i=0; i<objects.length; i++) {
									logger.info("Body: "+JSON.stringify(body.data));
									logger.info("Url: "+serviceUrl+"/"+type+"/"+id+"/"+objects[i][0]);
									logger.info("Objects: "+JSON.stringify({ ids: objects[i][1] }));
									external.put(serviceUrl+"/"+type+"/"+id+"/"+objects[i][0], {json: { ids: objects[i][1] }, rejectUnauthorized: false, headers: { "zt-session": user } }, function(err, res, body) {
										index++;
										if (index==objects.length) GetItems(type, paging, request, response);
									});
								}
							} else GetItems(type, paging, request, response);
						} else GetItems(type, paging, request, response);
					} else response.json( {error: "Unable to save data"} );
				}	
			});
		}
	}
});

/**
 * Save the data associated to one object to the parent object
 */
app.post("/api/subSave", function(request, response) {
	if (serviceUrl==null||serviceUrl.length==0) response.json({error:"loggedout"});
	else {
		var id = request.body.id;
		var type = request.body.type;
		var doing = request.body.doing;
		var parentType = request.body.parentType;
		var fullType = parentType+"/"+id+"/"+type;
		var url = serviceUrl+"/"+fullType;
		var saveParams = request.body.save;
		var user = request.session.user;
		if (hasAccess(user)) {
			logger.info(url);
			logger.info("Saving As: "+doing+" "+JSON.stringify(saveParams));
			external(url, {method: doing, json: saveParams, rejectUnauthorized: false, headers: { "zt-session": request.session.user } }, function(err, res, body) {
				if (err) {
					logger.error(err);
					response.json({ error: err });
				} else {
					logger.info(JSON.stringify(body));
					GetItems(fullType, null, request, response);
				}
			});
		} else response.json({error:"loggedout"});
	}
});

app.post("/api/verify", function(request, response) {
	if (serviceUrl==null||serviceUrl.length==0) response.json({error:"loggedout"});
	else {
		var id = request.body.id;
		var cert = request.body.cert;
		var url = serviceUrl+"/cas/"+id+"/verify";
		var user = request.session.user;
		if (hasAccess(user)) {
			logger.info(url);
			logger.info("Verifying As: "+url+" "+cert);
			external(url, {method: "POST", body: cert, rejectUnauthorized: false, headers: { "zt-session": request.session.user } }, function(err, res, body) {
				logger.info("Body:"+body);
				var result = JSON.parse(body);
				if (err) {
					logger.error(err);
					response.json({ error: err });
				} else {
					if (result.error) response.json( {error: result.error.message} );
					else {
						logger.info(JSON.stringify(body));
						response.json({ success: "Certificate Verified"});
					}
				}
			});
		} else response.json({error:"loggedout"});

	}
});




/**------------- Data Deletion Section -------------**/




/**
 * Delete the specified list of objects from edhe controller, and return the remaining 
 * list while retaining the last search filter properties.
 */
app.post("/api/delete", function(request, response) {
	var ids = request.body.ids;
	var type = request.body.type;
	var paging = request.body.paging;
	var user = request.session.user;

	var promises = [];

	ids.forEach(function(id) {
		promises.push(ProcessDelete(type, id, user));
	});
	
	Promise.all(promises).then(function(e) {
		GetItems(type, paging, request, response);
	}).catch(error => { 
		logger.error("Catch: "+error.message);
		response.json({error: error.causeMessage});
	});
});

/**
 * Create the promise required to delete a specific object from the edge controller
 * 
 * @param {The type of object being deleted} type 
 * @param {The id of the object to delete} id 
 * @param {The specified user token deleting the object} user 
 */
function ProcessDelete(type, id, user) {
	return new Promise(function(resolve, reject) {
		logger.info("Delete: "+serviceUrl+"/"+type+"/"+id)
		external.delete(serviceUrl+"/"+type+"/"+id, {json: {}, rejectUnauthorized: false, headers: { "zt-session": user } }, function(err, res, body) {
			if (err) {
				logger.error("Err: "+err);
				reject(err);
			} else {
				logger.info(JSON.stringify(body));
				if (body.error) reject(body.error);
				else resolve(body.data);
			}
		});
	});
}



/**------------- Customized ZAC only resources Section -------------**/




/**
 * Get the specified resource and send it back to the client. Generally icons and custom images
 */
app.get('/resource/:resource/:name', function(request, response) {
    var name = request.params.name;
	var resource = request.params.resource;
	response.sendFile(path.resolve(__dirname+settingsPath+'/resources/'+resource+'/'+name));
});

/**
 * Save the customized resource to the system in their specific folder defined by the type of
 * resource being sent. Profile Images, Identity Images, Icons, etc
 */
app.post('/api/upload', function(request, response) {
	if (Object.keys(request.files).length == 0) return response.status(400).send("No Files Sent");

	var image = request.files.image;
	var resource = request.body.resource;
	var saveTo = __dirname+settingsPath+'/resources/'+resource+'/'+image.name;
	var fullUrl = '/resource/'+resource+'/'+image.name;
	
	image.mv(saveTo, function(error) {
		if (error) return response.status(500).send(error);
		else return response.send(fullUrl);
	});
});

/**
 * Get the list of all resources defined for a specific type
 */
app.post("/api/resources", function(request, response) {
	var type = request.body.type;
	GetResources(type, response);
});

/**
 * Returns the list of all resources defined for a specific type
 * 
 * @param {The Type of Resource (e.g. image, icon, etc)} type 
 * @param {*} response 
 */
function GetResources(type, response) {
	var toReturn = [];
	fs.readdir(__dirname+settingsPath+'/resources/'+type+'/', (err, files) => {
		if (err) response.json({ type: type, data: toReturn });
		else {
			files.forEach(file => {
				toReturn[toReturn.length] = "/resource/"+type+"/"+file;
			});
			response.json({ type: type, data: toReturn });
		}
	});	
}



/**------------- ZAC only specified tag Section -------------**/



/**
 * Get the current well defined list of tags that ZAC uses to display
 * UI defined tag definitions.
 */
app.post("/api/tags", function(request, response) {
	response.json(tags);
});

/**
 * Save the current tag data to the system.
 */
app.post("/api/tagSave", function(request, response) {
	var user = request.session.user;
	tags = request.body.tags;
	if (hasAccess(user)) {
		let data = JSON.stringify(tags);  
		fs.writeFileSync(__dirname+settingsPath+'/tags.json', data);
	}
	response.json(tags);
});




/**------------- Fabric Series Data Funcations -------------**/


/**
 * Get the averages from the series data in the system influx DB
 */
app.post("/api/average", function(request, response) {
	var core = request.body.core;
	var item = request.body.item;
	var readwrite = request.body.readwrite;
	var type = request.body.type;
	var id = request.body.id;
	var source = core;
	if (item.trim().length>0) source +="."+item;
	if (readwrite.trim().length>0) source +="."+readwrite;
	source +="."+type;
	var url = new URL(request.body.url);
	domain = url.hostname;
	
	const influx = new Influx.InfluxDB({
		host: domain,
		port: 8086,
		database: 'ziti'
	});

	var query = "select MEAN(mean) from \""+source+"\" WHERE source='"+id+"'";
	logger.info(query);
	influx.query(query).then(result => {
		var avg = 0;
		if (result.length>0) avg = result[0].mean;
		response.json({ id: id, source: source+".average", data: avg });
	}).catch(error => {
		logger.error(error);
		response.json({ error: error });
	});
});



/**
 * Get the mean value from the series data in the system influx DB
 */
app.post("/api/series", function(request, response) {
	var core = request.body.core;
	var item = request.body.item;
	var readwrite = request.body.readwrite;
	var type = request.body.type;
	var id = request.body.id;
	var source = core;
	if (item.trim().length>0) source +="."+item;
	if (readwrite.trim().length>0) source +="."+readwrite;
	source +="."+type;
	var url = new URL(request.body.url);
	domain = url.hostname;
	
	const influx = new Influx.InfluxDB({
		host: domain,
		port: 8086,
		database: 'ziti'
	});

	var query = "select MEAN(mean) from \""+source+"\" WHERE source='"+id+"' AND time > now() - 6d GROUP BY time(1d)";
	logger.info(query);
	influx.query(query).then(result => {
		for (var i=0; i<result.length; i++) {
			logger.info(moment(result[i].time).fromNow()+" "+result[i].mean);
		}
		response.json({ source: source, data: result });
	}).catch(error => {
		logger.error(error);
		response.json({ error: error });
	});
});




/**------------- System Application Funcations -------------**/



/***
 * Send a message to NetFoundry to report errors or request features
 */
app.post("/api/message", function(request, response) {
	var type = request.body.type;
	var from = request.body.from;
	var message = request.body.message;
	var email = request.body.email;

	var params = {
		body: "A "+type+" message was set to you by "+from+" at "+(new Date())+" with email "+email+": "+message,
		subject: "NetFoundry Ziti - Message"
	};

	external.post("https://sendmail.netfoundry.io/send", {json: params, rejectUnauthorized: false }, function(err, res, body) {
		if (err) response.json({ errors: err });
		else {
			if (body.error) response.json({ errors: body.error });
			else response.json({ success: "Mail Sent" });
		}
	});
});



/**------------- Enrollment Email Verification Funcations -------------**/



/**
 * Get the specified resource and send it back to the client. Generally icons and custom images
 */
app.get('/email-verification/:secret', function(request, response) {
	let secret = request.params.secret;
	let headerNow = emailVerificationHeader.split("{{title}}").join("Email Verification");
	headerNow = headerNow.split("{{auth}}").join("");
	const enrollControllerConfig = require('config.json')(args.config);
	fs.readFile(__dirname+"/html/email-verification.htm", 'utf8', function(err, data) {
		data = data.replace(/\$enrollmentHost/g, enrollControllerConfig.externalHost.enrollment.hostname);
		response.send(headerNow+data);
	});
});

app.get('/email-verification-complete', function(request, response) {
	let headerNow = emailVerificationHeader.split("{{title}}").join("Email Verification");
	headerNow = headerNow.split("{{auth}}").join("");
	logger.info("enrollControllerConfig: %o", enrollControllerConfig.externalHost.enrollment);
	fs.readFile(__dirname+"/html/email-verification-complete.htm", 'utf8', function(err, data) {
		response.send(headerNow+data);
	});
});


/**------------- Serve the Express Application -------------**/



/**
 * Serve the current app on the defined port
 */
app.listen(port, function() {
	logger.info(`Ziti Admin Console running on port ${port}`);
});

/**
 * If certificates are defined, setup an https redirection service
 */
if (fs.existsSync("./server.key")&&fs.existsSync("./server.chain.pem")) {
    logger.info("Initializing TLS");
	try {
		const options = {
			key: fs.readFileSync("./server.key"),
			cert: fs.readFileSync("./server.chain.pem")
		};
		logger.info("TLS initialized on port: " + portTLS);
		https.createServer(options, app).listen(portTLS);
	} catch(err) {
		logger.error("ERROR: Could not initialize TLS!");
		throw err;
	}
}

const enrollControllerConfig = require('config.json')(args.config);
require('@netfoundry/zt-enroll-controller')(enrollControllerConfig).then((enrollController)=>{
	enrollController.listen();
}).catch(err=>{
  logger.fatal(err);
  process.exit(1);
});