'use strict';

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
const argv = require("./server/args");
const logger = require("./server/logging").logger;

let serviceUrl = "";
let fabricUrl = "";
let headerFile = __dirname + "/assets/templates/header.htm";
let footerFile = __dirname + "/assets/templates/footer.htm";
let header = fs.readFileSync(headerFile, 'utf8');
let footer = fs.readFileSync(footerFile, 'utf8');

/**
 * Watch for header and footer file changes and load them
 */
fs.watchFile(headerFile, (/*curr, prev*/) => {
    logger.debug(headerFile + " file Changed");
    header = fs.readFileSync(headerFile, 'utf8');
});
fs.watchFile(footerFile, (/*curr, prev*/) => {
    logger.debug(footerFile + " file Changed");
    footer = fs.readFileSync(footerFile, 'utf8');
});


/**
 * Define Express Settings
 */
const app = express();
app.use(cors());
app.use(helmet());
app.use(function (req, res, next) {
    res.setHeader("Content-Security-Policy", "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdnjs.com https://apis.google.com https://ajax.googleapis.com https://fonts.googleapis.com https://www.google-analytics.com https://www.googletagmanager.com; object-src 'none'; form-action 'none'; frame-ancestors 'self'; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdnjs.com https://fonts.googleapis.com");
    return next();
});
app.use(bodyParser.json());
app.use(fileUpload());
app.use('/assets', express.static('assets'));
app.use(session({
    store: new sessionStore({logFn: logger.debug}),
    secret: 'NetFoundryZiti',
    retries: 10,
    resave: true,
    saveUninitialized: true,
    ttl: 60000
}));

/**
 * Load configurable settings, or create the settings in place if they have never been defined
 */
if (!fs.existsSync(argv["settings"])) {
    logger.info(`settings directory [${argv["settings"]}] does not exist, creating`);
    fs.mkdirSync(argv["settings"]);
}

let tagsFile = path.join(argv["settings"], "tags.json");
if (!fs.existsSync(tagsFile)) {
    logger.info(`tags file [${tagsFile}] not found, copying default`);
    fs.copyFileSync(__dirname + '/assets/data/tags.json', tagsFile);
}

let settingsFile = path.join(argv["settings"], 'settings.json');
if (!fs.existsSync(settingsFile)) {
    logger.info(`settings file [${settingsFile}] not found, copying default`);
    fs.copyFileSync(__dirname + '/assets/data/settings.json', argv["settings"] + 'settings.json');
}

let resourceDir = path.join(argv["settings"], 'resources');
if (!fs.existsSync(resourceDir)) {
    logger.info(`resources directory [${resourceDir}] does not exist, creating`);
    fs.mkdirSync(resourceDir);
    fse.copySync(__dirname + '/assets/resources/', resourceDir);
}

let pages = JSON.parse(fs.readFileSync(__dirname + '/assets/data/site.json', 'utf8'));

let tags = JSON.parse(fs.readFileSync(tagsFile, 'utf8'));

let settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));

for (let i = 0; i < settings.edgeControllers.length; i++) {
    if (settings.edgeControllers[i].default) {
        serviceUrl = settings.edgeControllers[i].url;
        break;
    }
}

for (let i = 0; i < settings.fabricControllers.length; i++) {
    if (settings.fabricControllers[i].default) {
        fabricUrl = settings.fabricControllers[i].url;
        break;
    }
}

for (let i = 0; i < pages.length; i++) {
    app.get(pages[i].url, function (request, response) {
        let page = pages[0];
        for (let i = 0; i < pages.length; i++) {
            if (pages[i].url === request.url) {
                page = pages[i];
                break;
            }
        }
        if (page.access === "") {
            if (page.url === "/login") request.session.user = null;
            let headerNow = header.split("{{title}}").join(page.title);
            headerNow = headerNow.split("{{auth}}").join("");
            fs.readFile(__dirname + page.page, 'utf8', function (err, data) {
                response.send(headerNow + data + footer);
            });
        } else {
            if (request.session.user == null || request.session.user === "") response.redirect("/login");
            else {
                if (Number(page.access) <= Number(request.session.authorization)) {
                    let headerNow = header.split("{{title}}").join(page.title);
                    headerNow = headerNow.split("{{auth}}").join(" loggedIn");
                    fs.readFile(__dirname + page.page, 'utf8', function (err, data) {
                        response.send(headerNow + data + footer);
                    });
                } else response.redirect('/login');
            }
        }
    });
}

/**
 * Just tests if the user exists as a session or not, would add on to validate roles, etc if the system is expanded to
 * include more well defined authentication structures
 * @param {object} user - The current user session
 */
function hasAccess(user) {
    return (user != null);
}

/**
 * Authentication method, authenticates the user to the provided edge controller defined by url
 */
app.post("/api/login", function (request, response) {
    serviceUrl = request.body.url;
    let params = {
        username: request.body.username,
        password: request.body.password
    };
    logger.debug("Connecting to: " + serviceUrl + "/authenticate?method=password");
    logger.debug("Posting: " + JSON.stringify(params));
    external.post(serviceUrl + "/authenticate?method=password", {
        json: params,
        rejectUnauthorized: false
    }, function (err, res, body) {
        if (err) {
            logger.debug(err);
            let error = "Server Not Accessible";
            if (err.code !== "ECONNREFUSED") response.json({error: err.code});
            response.json({error: error});
        } else {
            if (body.error) {
                response.json({error: body.error.message});
            } else {
                if (body.data.session && body.data.session.token) request.session.user = body.data.session.token;
                else request.session.user = body.data.token;
                logger.debug("Session: " + request.session.user);
                request.session.authorization = 100;
                response.json({success: "Logged In"});
            }
        }
    });
});


app.post('/api/version', function (request, response) {
    if (serviceUrl) {
        external.get(serviceUrl + "/version", {rejectUnauthorized: false}, function (err, res, body) {
            if (err) {
                logger.debug(err);
            } else {
                let data = JSON.parse(body);
                if (data && data.data) response.json({data: data.data});
                else response.json({});
            }
        });
    } else response.json({});
});

app.post("/api/settings", function (request, response) {
    response.json(settings);
});

app.post("/api/controllerSave", function (request, response) {
    let name = request.body.name.trim();
    let url = request.body.url.trim();
    if (url.endsWith('/')) url = url.substr(0, url.length - 1);
    let errors = [];
    if (name.length === 0) errors[errors.length] = "name";
    if (url.length === 0) errors[errors.length] = "url";
    if (errors.length > 0) {
        response.json({errors: errors});
    } else {
        external.get(url + "/version", {rejectUnauthorized: false}, function (err, res, body) {
            if (err) {
                response.json({error: "Edge Controller not Online"});
            } else {
                if (body.error) {
                    response.json({error: "Invalid Edge Controller"});
                } else {
                    let found = false;
                    for (let i = 0; i < settings.edgeControllers.length; i++) {
                        if (settings.edgeControllers[i].url === url) {
                            found = true;
                            settings.edgeControllers[i].name = name;
                            settings.edgeControllers[i].url = url;
                            break;
                        }
                    }
                    if (!found) {
                        let isDefault = false;
                        if (settings.edgeControllers.length === 0) isDefault = true;
                        settings.edgeControllers[settings.edgeControllers.length] = {
                            name: name,
                            url: url,
                            default: isDefault
                        };
                    }
                    fs.writeFileSync(argv["settings"] + '/settings.json', JSON.stringify(settings));
                    response.json(settings);
                }
            }
        });
    }
});

app.delete("/api/server", function (request, response) {
    let user = request.session.user;
    if (hasAccess(user)) {
        let url = request.body.url;
        let edges = [];
        let fabrics = [];
        logger.debug(url);
        for (let i = 0; i < settings.edgeControllers.length; i++) {
            logger.debug(settings.edgeControllers[i].url);
            if (settings.edgeControllers[i].url !== url) {
                edges[edges.length] = settings.edgeControllers[i];
            }
        }
        for (let i = 0; i < settings.fabricControllers.length; i++) {
            logger.debug(settings.fabricControllers[i].url);
            if (settings.fabricControllers[i].url !== url) {
                fabrics[fabrics.length] = settings.fabricControllers[i];
            }
        }
        settings.fabricControllers = fabrics;
        settings.edgeControllers = edges;
        fs.writeFileSync(argv["settings"] + '/settings.json', JSON.stringify(settings));

        response.json(settings);
    }
});

app.post("/api/fabricSave", function (request, response) {
    let name = request.body.name.trim();
    let url = request.body.url.trim();
    if (url.endsWith('/')) url = url.substr(0, url.length - 1);
    let errors = [];
    if (name.length === 0) errors[errors.length] = "name";
    if (url.length === 0) errors[errors.length] = "url";
    if (errors.length > 0) {
        response.json({errors: errors});
    } else {
        let found = false;
        for (let i = 0; i < settings.fabricControllers.length; i++) {
            if (settings.fabricControllers[i].url === url) {
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
        fs.writeFileSync(argv["settings"] + '/settings.json', JSON.stringify(settings));
        response.json(settings);
    }
});

app.post("/api/controller", function (request /*, response*/) {
    serviceUrl = request.body.url;
});

app.post("/api/reset", function (request, response) {
    if (serviceUrl == null || serviceUrl.length === 0) response.json({error: "loggedout"});
    else {
        if (request.body.newpassword !== request.body.confirm) response.json({error: "Password does not match confirmation"});
        else {
            let params = {
                current: request.body.password,
                new: request.body.newpassword
            };
            logger.debug("Connecting to: " + serviceUrl + "/current-identity/updb/password");
            logger.debug("Posting: " + JSON.stringify(params));
            external.put(serviceUrl + "/current-identity/updb/password", {
                json: params,
                rejectUnauthorized: false,
                headers: {"zt-session": request.session.user}
            }, function (err, res, body) {
                if (err) {
                    logger.debug(err);
                    let error = "Server Not Accessible";
                    if (err.code !== "ECONNREFUSED") response.json({error: err.code});
                    response.json({error: error});
                } else {
                    if (body.error) {
                        logger.debug(JSON.stringify(body.error));
                        response.json({error: body.error.message});
                    } else {
                        response.json({success: "Password Updated"});
                    }
                }
            });
        }
    }
});

app.post("/api/tags", function (request, response) {
    response.json(tags);
});

app.post("/api/tagSave", function (request, response) {
    let user = request.session.user;
    tags = request.body.tags;
    if (hasAccess(user)) {
        let data = JSON.stringify(tags);
        fs.writeFileSync(argv["settings"] + '/tags.json', data);
    }
    response.json(tags);
});

app.get('/resource/:resource/:name', function (request, response) {
    let name = request.params.name;
    let resource = request.params.resource;
    response.sendFile(path.resolve(argv["settings"] + '/resources/' + resource + '/' + name));
});

app.post('/api/upload', function (request, response) {
    if (Object.keys(request.files).length === 0) {
        return response.status(400).send("No Files Sent");
    }
    let image = request.files.image;
    let resource = request.body.resource;

    let saveTo = argv["settings"] + '/resources/' + resource + '/' + image.name;
    let fullUrl = '/resource/' + resource + '/' + image.name;

    image.mv(saveTo, function (error) {
        if (error) return response.status(500).send(error);
        else {
            return response.send(fullUrl);
        }
    });
});

function GetResources(type, response) {
    let toReturn = [];
    fs.readdir(argv["settings"] + '/resources/' + type + '/', (err, files) => {
        if (err) response.json({type: type, data: toReturn});
        else {
            files.forEach(file => {
                toReturn[toReturn.length] = "/resource/" + type + "/" + file;
            });
            response.json({type: type, data: toReturn});
        }
    });
}

app.post("/api/resources", function (request, response) {
    let type = request.body.type;
    GetResources(type, response);
});

app.post("/api/delete", function (request, response) {
    let ids = request.body.ids;
    let type = request.body.type;
    let paging = request.body.paging;
    let user = request.session.user;

    let promises = [];

    ids.forEach(function (id) {
        promises.push(ProcessDelete(type, id, user));
    });

    Promise.all(promises).then(function (e) {
        logger.debug("Then: " + e);
        GetItems(type, paging, request, response);
    }).catch(error => {
        logger.debug("Catch: " + error.message);
        response.json({error: error.causeMessage});
    });
});

app.post("/api/subSave", function (request, response) {
    if (serviceUrl == null || serviceUrl.length === 0) response.json({error: "loggedout"});
    else {
        let id = request.body.id;
        let type = request.body.type;
        let doing = request.body.doing;
        let parentType = request.body.parentType;
        let fullType = parentType + "/" + id + "/" + type;
        let url = serviceUrl + "/" + fullType;
        let saveParams = request.body.save;
        let user = request.session.user;
        if (hasAccess(user)) {
            logger.debug(url);
            logger.debug("Saving As: " + doing + " " + JSON.stringify(saveParams));
            external(url, {
                method: doing,
                json: saveParams,
                rejectUnauthorized: false,
                headers: {"zt-session": request.session.user}
            }, function (err, res, body) {
                if (err) {
                    logger.debug(err);
                    response.json({error: err});
                } else {
                    logger.debug(JSON.stringify(body));
                    GetItems(fullType, null, request, response);
                }
            });
        } else {
            response.json({error: "loggedout"});
        }
    }
});

app.post("/api/dataSave", function (request, response) {
    if (serviceUrl == null || serviceUrl.length === 0) response.json({error: "loggedout"});
    else {
        let saveParams = request.body.save;
        logger.debug("Saving: " + JSON.stringify(saveParams));
        let additional = request.body.additional;
        let removal = request.body.removal;
        let type = request.body.type;
        let paging = request.body.paging;
        let method = "POST";
        let id = request.body.id;
        let url = serviceUrl + "/" + type;
        let user = request.session.user;
        if (hasAccess(user)) {
            if (id && id.trim().length > 0) {
                method = "PUT";
                url += "/" + id.trim();
                saveParams.permissions = [];
                logger.debug("removing");
                if (removal) {
                    logger.debug("removing Now");
                    let objects = Object.entries(removal);
                    if (objects.length > 0) {
                        for (let i = 0; i < objects.length; i++) {
                            let params = {};
                            params.ids = objects[i][1];
                            logger.debug("Delete:" + serviceUrl + "/" + type + "/" + id.trim() + "/" + objects[i][0]);
                            logger.debug(JSON.stringify(params));
                            external.delete(serviceUrl + "/" + type + "/" + id.trim() + "/" + objects[i][0], {
                                json: params,
                                rejectUnauthorized: false,
                                headers: {"zt-session": request.session.user}
                            }, function (err, res, body) {
                            });
                        }
                    }
                }
            }
            logger.debug(url);
            logger.debug("Saving As: " + method + " " + JSON.stringify(saveParams));
            external(url, {
                method: method,
                json: saveParams,
                rejectUnauthorized: false,
                headers: {"zt-session": request.session.user}
            }, function (err, res, body) {
                if (err) response.json({error: err});
                else {
                    logger.debug(JSON.stringify(body));
                    if (body.error) {
                        if (body.error.cause && body.error.cause.message) response.json({error: body.error.cause.message});
                        else response.json({error: body.error});
                    } else if (body.data) {
                        if (additional) {
                            let objects = Object.entries(additional);
                            let index = 0;
                            if (objects.length > 0) {
                                if (method === "POST") id = body.data.id;
                                for (let i = 0; i < objects.length; i++) {
                                    logger.debug("Body: " + JSON.stringify(body.data));
                                    logger.debug("Url: " + serviceUrl + "/" + type + "/" + id + "/" + objects[i][0]);
                                    logger.debug("Objects: " + JSON.stringify({ids: objects[i][1]}));
                                    external.put(serviceUrl + "/" + type + "/" + id + "/" + objects[i][0], {
                                        json: {ids: objects[i][1]},
                                        rejectUnauthorized: false,
                                        headers: {"zt-session": user}
                                    }, function (/*err, res, body*/) {
                                        index++;
                                        if (index === objects.length) GetItems(type, paging, request, response);
                                    });
                                }
                            } else GetItems(type, paging, request, response);
                        } else {
                            GetItems(type, paging, request, response);
                        }
                    } else {
                        response.json({error: "Unable to save data"});
                    }
                }
            });
        }
    }
});

function ProcessDelete(type, id, user) {
    return new Promise(function (resolve, reject) {
        logger.debug("Delete: " + serviceUrl + "/" + type + "/" + id);
        external.delete(serviceUrl + "/" + type + "/" + id, {
            json: {},
            rejectUnauthorized: false,
            headers: {"zt-session": user}
        }, function (err, res, body) {
            if (err) {
                logger.debug("Err: " + err);
                reject(err);
            } else {
                logger.debug(JSON.stringify(body));
                if (body.error) reject(body.error);
                else resolve(body.data);
            }
        });
    });
}

app.post("/api/dataFabric", function (request, response) {
    let type = request.body.type;
    fabricUrl = request.body.url;
    GetFabricItems(type, response);
});

function GetFabricItems(type, response) {
    let canCall = false;
    for (let i = 0; i < settings.fabricControllers.length; i++) {
        logger.debug("Fab: " + JSON.stringify(settings.fabricControllers[i]));
        if (settings.fabricControllers[i].url === fabricUrl) {
            canCall = true;
            break;
        }
    }
    if (canCall) {
        logger.debug("Calling Fabric: " + type + " " + fabricUrl + "/ctrl/" + type);
        external.get(fabricUrl + "/ctrl/" + type, {json: {}, rejectUnauthorized: false}, function (err, res, body) {
            if (err) {
                response.json({error: "Unable to connect to fabric"});
            } else {
                if (body.error) {
                    response.json({error: body.error.message});
                } else if (body.data) {
                    response.json(body);
                } else {
                    response.json({error: "Unable to retrieve data"});
                }
            }
        });
    } else {
        fabricUrl = "";
        response.json({data: []});
    }
}

app.post("/api/data", function (request, response) {
    let type = request.body.type;
    let paging = request.body.paging;
    GetItems(type, paging, request, response);
});

function GetItems(type, paging, request, response) {
    let urlFilter = "";
    if (paging != null) {
        if (!paging.filter) {
            paging.filter = "";
        } else {
            if (paging.page !== -1) urlFilter = "?filter=(name contains \"" + paging.filter + "\")&limit=" + paging.total + "&offset=" + ((paging.page - 1) * paging.total) + "&sort=" + paging.sort + " " + paging.order;
        }
    }
    if (serviceUrl == null || serviceUrl.trim().length === 0) response.json({error: "loggedout"});
    else {
        logger.debug(serviceUrl + "/" + type + urlFilter);
        external.get(serviceUrl + "/" + type + urlFilter, {
            json: {},
            rejectUnauthorized: false,
            headers: {"zt-session": request.session.user}
        }, function (err, res, body) {
            if (err) {
                logger.debug("Error: " + JSON.stringify(err));
                response.json({error: err});
            } else {
                if (body.error) {
                    response.json({error: body.error.message});
                } else if (body.data) {
                    logger.debug("Items: " + body.data.length);
                    response.json(body);
                } else {
                    body.data = [];
                    logger.debug(JSON.stringify(body));
                    response.json(body);
                    //response.json( {error: "Unable to retrieve data"} );
                }
            }
        });
    }
}

app.post("/api/dataSubs", function (request, response) {
    let id = request.body.id;
    let type = request.body.type;
    if (request.body.url) {
        let url = request.body.url.href.split("./").join("");
        logger.debug("Calling: " + serviceUrl + "/" + url);
        external.get(serviceUrl + "/" + url + "?limit=99999999&offset=0&sort=name ASC", {
            json: {},
            rejectUnauthorized: false,
            headers: {"zt-session": request.session.user}
        }, function (err, res, body) {
            if (err) response.json({error: err});
            else {
                if (body.error) {
                    if (body.error.cause && body.error.cause.message) response.json({error: body.error.cause.message});
                    else response.json({error: body.error});
                } else if (body.data) {
                    logger.debug(body.data.length);
                    response.json({
                        id: id,
                        type: type,
                        data: body.data
                    });
                } else {
                    logger.debug(JSON.stringify(body));
                    response.json({error: "Unable to retrieve data"});
                }
            }
        });
    } else response.json({error: "Invalid Sub Data Url"});
});

app.post("/api/average", function (request, response) {
    let core = request.body.core;
    let item = request.body.item;
    let readwrite = request.body.readwrite;
    let type = request.body.type;
    let id = request.body.id;
    let source = core;
    if (item.trim().length > 0) source += "." + item;
    if (readwrite.trim().length > 0) source += "." + readwrite;
    source += "." + type;
    logger.debug(source);
    logger.debug(request.body.url);
    let url = new URL(request.body.url);
    let domain = url.hostname;

    const influx = new Influx.InfluxDB({
        host: domain,
        port: 8086,
        database: 'ziti'
    });

    let query = "select MEAN(mean) from \"" + source + "\" WHERE source='" + id + "'";
    logger.debug(query);
    influx.query(query).then(result => {
        let avg = 0;
        if (result.length > 0) avg = result[0].mean;
        response.json({id: id, source: source + ".average", data: avg});
    }).catch(error => {
        logger.debug(error);
        response.json({error: error});
    });
});

app.post("/api/series", function (request, response) {
    let core = request.body.core;
    let item = request.body.item;
    let readwrite = request.body.readwrite;
    let type = request.body.type;
    let id = request.body.id;
    let source = core;
    if (item.trim().length > 0) source += "." + item;
    if (readwrite.trim().length > 0) source += "." + readwrite;
    source += "." + type;
    logger.debug(source);
    logger.debug(request.body.url);
    let url = new URL(request.body.url);
    let domain = url.hostname;

    const influx = new Influx.InfluxDB({
        host: domain,
        port: 8086,
        database: 'ziti'
    });

    let query = "select MEAN(mean) from \"" + source + "\" WHERE source='" + id + "' AND time > now() - 6d GROUP BY time(1d)";
    logger.debug(query);
    influx.query(query).then(result => {
        for (let i = 0; i < result.length; i++) {
            logger.debug(moment(result[i].time).fromNow() + " " + result[i].mean);
        }
        response.json({source: source, data: result});
    }).catch(error => {
        logger.debug(error);
        response.json({error: error});
    });
});

app.post("/api/subdata", function (request, response) {
    let url = request.body.url.split("./").join("");
    let id = request.body.id;
    let type = request.body.type;
    let parentType = request.body.name;
    external.get(url, {
        json: {},
        rejectUnauthorized: false,
        headers: {"zt-session": request.session.user}
    }, function (err, res, body) {
        if (err) response.json({error: err});
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

/***
 * Send a message to NetFoundry to report errors or requst features
 */
app.post("/api/message", function (request, response) {
    let type = request.body.type;
    let from = request.body.from;
    let message = request.body.message;
    let email = request.body.email;

    let params = {
        body: "A " + type + " message was set to you by " + from + " at " + (new Date()) + " with email " + email + ": " + message,
        subject: "NetFoundry Ziti - Message"
    };

    external.post("https://sendmail.netfoundry.io/send", {
        json: params,
        rejectUnauthorized: false
    }, function (err, res, body) {
        if (err) response.json({errors: err});
        else {
            if (body.error) response.json({errors: body.error});
            else response.json({success: "Mail Sent"});
        }
    });
});

/***
 ** Serve App
 ***/


if (argv["key"] && argv["cert"]) {
    logger.info(`starting HTTPS server on port [${argv["port"]}]`);
    try {
        const options = {
            key: fs.readFileSync(argv["key"]),
            cert: fs.readFileSync(argv["cert"])
        };
        logger.debug("TLS initialized on port: " + argv["port"]);
        https.createServer(options, app).listen(argv["port"]);
    } catch (err) {
        logger.debug("ERROR: Could not initialize TLS!");
        logger.debug("");
        throw err;
    }
} else {
    logger.info(`starting server on HTTP on port [${argv["port"]}]`);
    logger.warn("this server is insecure, provide --key/ZC_KEY or --cert/ZC_CERT values to enable HTTPS");
    app.listen(argv["port"], function () {
        logger.info("running on port " + [argv["port"]]);
    });
}