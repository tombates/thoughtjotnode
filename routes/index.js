var express = require('express');
var stormpath = require('express-stormpath');
var router = express.Router();
var authorized = false;

// we never get here - stormpath "steals" it???
router.get('/logout', function(req, res) {
    console.log("in logout");
    authorized = false;
});

/* GET home page. */
//router.get(/^\/(?!logout)$/, stormpath.loginRequired, function(req, res) {
router.get('/', stormpath.loginRequired, function(req, res) {
//router.get('/', function(req, res) {
    console.log("in index.js router.get(/)...");
    authorized = true;
    var db = req.db;
    //DEBUG: just to see what the fields are in user are since express docs are not great on this issue
    //for(key in res.locals.user) {
    //    console.log("user." + key + " : " + res.locals.user[key]);
    //}

    var resData = {hdrtitle: 'Thought Jot',
                   userGivenName: res.locals.user.givenName,
                   userSurName: res.locals.user.surname,
                   userEmail: res.locals.user.email,
                   userStatus: authorized
                  };

    // Get user's _id from users collection, or create a user entry and a jot collection for them if they're new
    // TODO really want to store the _id with Stormpath so we can get back with login

    // Create the allusers collection if we don't have one
    var users = db.collection("allusers");
    console.log("find(allusers) returned: " + users);
    // Instead I made the collection manually
    // if(users === undefined || users == "") {
    //     db.createCollection("allusers", {capped: true, autoIndexedId: true, size: 100000, max: 100});
    // }

    // Get user's _id (or add them) so we can find (or create) their jots collection
    var thisUser = db.collection("allusers").findOne({gName: res.locals.user.givenName,
                                    sName:res.locals.user.surname,
                                    email:res.locals.user.email}, function(err, result) {
        console.log("thisUser is " + result);
        if(result === undefined || result === null) {
            console.log("inserting new user into allusers");
            var real = resData.userEmail === "noone@nowhere.com" ? false : true;
            db.collection("allusers").insert({gName: res.locals.user.givenName,
                                    mName: res.locals.user.middleName,
                                    sName: res.locals.user.surname,
                                    email: res.locals.user.email,
                                    isreal: real}, function(errI, resultI) {
                                        if(errI) throw errI;

                                        // find the _id for the new user
                                        console.log("looking up _id for newly added user");
                                        thisUser = db.collection("allusers").findOne({gName: res.locals.user.givenName,
                                                                                      sName:res.locals.user.surname,
                                                                                      email:res.locals.user.email}, function(err, resultAdd) {
                                            console.log("USER CREATED, user _id = " + resultAdd._id);
                                            resData.userID = resultAdd._id;
                                            console.log(resData);
                                            res.render('index', {data: resData});
                                        });
                                    });
        }
        else {    // user already exists
            console.log("USER EXISTED, user _id = " + result._id);
            resData.userID = result._id;
            console.log(resData);

            // does their jot collection exist?
            // var userjotcollection = db.collection("jots_" + result._id);
            // if(userjotcollection === null || userjotcollection === undefined) {
            //     console.log("no userjotcollection for this user")
            // }
            // else
            //     console.log("userjotcollection table: " + JSON.stringify(userjotcollection));
            req.app.set("userData", resData);
            res.render('index', {data: resData});
        }
    });

    //res.render('index', { locals: {authData: resData}});
    //res.render('index', {data: resData});
});

module.exports = router;
