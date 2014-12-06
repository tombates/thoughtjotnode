var express = require('express');
var stormpath = require('express-stormpath');
var router = express.Router();

/*
 * GET userjots.
 */
router.get('/jotlist', stormpath.loginRequired, function(req, res) {
    console.log("in /jots/jotlist service");
    var db = req.db;

    // new stuff trying to Stormpaths user.customData approach
    req.user.getCustomData(function(err, data) {
        console.log("getCustomData returned:");
        console.log(data.userSession.userID);

        //var collectionName = "userjots_" + req.app.get("userData").userID;
        var collectionName = "userjots_" + data.userSession.userID;

        db.collection(collectionName).find().toArray(function (err, items) {
            console.log(items.length);
            res.json(items);
        });
    });
});

/*
 * POST to addjot
 */
router.post('/addjot', stormpath.loginRequired, function(req, res) {
    var db = req.db;

    req.user.getCustomData(function(err, data) {
        //var collectionName = "userjots_" + req.app.get("userData").userID;
        var collectionName = "userjots_" + data.userSession.userID;

        db.collection(collectionName).insert(req.body, function(err, result) {
            res.send(
                (err === null) ? {msg: ''} : {msg: err}
            );
        });
    });
});

/*
 * POST to editjot
 */
router.post('/editjot', stormpath.loginRequired, function(req, res) {
    console.log("in /jots/editjot service");
    var db = req.db;

    req.user.getCustomData(function(err, data) {
        //var collectionName = "userjots_" + req.app.get("userData").userID;
        var collectionName = "userjots_" + data.userSession.userID;

        db.collection(collectionName).update({commonKeyTS: req.body.commonKeyTS}, req.body, {upsert:true}, function(err, result) {
            res.send(
                (err === null) ? {msg: ''} : {msg: err}
            );
        });
    });
});

/*
 * DELETE to deletejot - deletes a single jot
 */
router.delete('/deletejot/:id', stormpath.loginRequired, function(req, res) {
    console.log("in /jots/deletejot/");
    var db = req.db;

    req.user.getCustomData(function(err, data) {
        //var collectionName = "userjots_" + req.app.get("userData").userID;
        var collectionName = "userjots_" + data.userSession.userID;

        var jotToDelete = req.params.id.slice(1);
        console.log(jotToDelete);
        db.collection(collectionName).remove({"commonKeyTS": jotToDelete}, function(err, result) {
            res.send((result === 1) ? {msg: ''} : {msg: 'error: ' + err});
        });
    });
});

module.exports = router;
