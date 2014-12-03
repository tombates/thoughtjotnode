var express = require('express');
var router = express.Router();

/*
 * GET userjots.
 */
router.get('/jotlist', function(req, res) {
    console.log("in /jots/jotlist service");
    var db = req.db;
    var collectionName = "userjots_" + req.app.get("userData").userID;

    db.collection(collectionName).find().toArray(function (err, items) {
        console.log(items.length);
        res.json(items);
    });
});

/*
 * POST to addjot
 */
router.post('/addjot', function(req, res) {
    var db = req.db;
    var collectionName = "userjots_" + req.app.get("userData").userID;

    //db.collection('userjots').insert(req.body, function(err, result) {
    db.collection(collectionName).insert(req.body, function(err, result) {
        res.send(
            (err === null) ? {msg: ''} : {msg: err}
        );
    });

});

/*
 * POST to editjot
 */
router.post('/editjot', function(req, res) {
    console.log("in /jots/editjot service");
    var db = req.db;
    var collectionName = "userjots_" + req.app.get("userData").userID;

    db.collection(collectionName).update({commonKeyTS: req.body.commonKeyTS}, req.body, {upsert:true}, function(err, result) {
        res.send(
            (err === null) ? {msg: ''} : {msg: err}
        );
    });

});

/*
 * DELETE to deletejot - deletes a single jot
 */
router.delete('/deletejot/:id', function(req, res) {
    console.log("in /jots/deletejot/");
    var db = req.db;
    var collectionName = "userjots_" + req.app.get("userData").userID;

    var jotToDelete = req.params.id.slice(1);
    console.log(jotToDelete);
    db.collection(collectionName).remove({"commonKeyTS": jotToDelete}, function(err, result) {
        res.send((result === 1) ? {msg: ''} : {msg: 'error: ' + err});
    });
});

module.exports = router;
