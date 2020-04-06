ZT Username Password DB (UPDB) Authenticator
------------------------------

## Controller Configuration
In the edge controller configuration, ensure that the zt-http listener receives an instance of this authenticator.

```
//Register middleware
require('@netfoundry/zt-http-authenticator-bus')(app, {
    authenticators: [
        require('@netfoundry/zt-authenticator-updb')(sessionApi, controllerConfig.authenticators.updb),
        ...
    ]
});
``` 

### Configuration

When instantiating a zt-authenticator-updb the following configuration object should be passed to it.

```
{
  "db": {
    "url": "mongodb://localhost:27017/zac"
}
```

## User Configuration
The following set of MongoDb commands can be used to create a user with the updb password of admin/admin. If you have 
generated a key set to use for identification, you can supply the fingerprint for the "cert" authenticator.

```
use zac

adminIdentity = {
    "name": "Default Admin",
    "type": "User",
    "authenticators": {
      "updb": {
        "username": "admin",
        "password": "c7ad44cbad762a5da0a452f9e854fdc1e0e7a52a38015f23f3eab1d80b931dd472634dfac71cd34ebc35d16ab7fb8a90c81f975113d6c7538dc69dd8de9077ec"
      }
    },
    "isDefaultAdmin": true,
    "isAdmin": true,
    "permissions": []
  };


db.identities.insert(adminIdentity);
```

