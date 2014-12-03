var express = require('express');
var router = express.Router();

/*
 * GET usertags.
 */
router.get('/taglist', function(req, res) {
    var db = req.db;
    var id = req.app.get("userData").userID;
    console.log("in /tags/taglist service for user " + id);
    // id is an ObjectID but we need a string
    db.collection('usertags').findOne({userID: String(req.app.get("userData").userID)}, function (err, items) {
        console.log(items);
        res.json(items);
    });
});

/*
 * POST to addtag
 */
router.post('/addtag', function(req, res) {
    var db = req.db;
    console.log("in addtag POST trying upsert with update: ");
    console.log(req.body.userID);
    //db.collection('usertags').insert(req.body, function(err, result) {
    db.collection('usertags').update({userID: req.body.userID}, req.body, {upsert:true}, function(err, result) {
        if(err === null) {
            console.log("addtag successful")
        }
        res.send(
            (err === null) ? {msg: ''} : {msg: err}   // is msg != "" user will get an alert dialog!
        );
    });
});


/*
 * DELETE to deletetag
 */
router.delete('/deletetag/:id', function(req, res) {
    // var db = req.db;
    // var jotToDelete = req.params.id;
    // db.collection('usertags').removeById(jotToDelete, function(err, result) {
    //     res.send((result === 1) ? {msg: ''} : {msg: 'error: ' + err});
    // });
});

module.exports = router;
