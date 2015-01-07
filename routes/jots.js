var express = require('express');
var stormpath = require('express-stormpath');
var router = express.Router();

MS_ONE_DAY = 86400000;            // milliseconds in one day = 24 * 60 * 60 * 1000
/*
 * GET userjots.
 *
 * The page parameter should be of the form NatM where N is the page requested
 * and M is the desired number of results per page.
 *       
 */
//router.get('/jotlist', stormpath.loginRequired, function(req, res) {
router.get('/jotlist/:page', stormpath.loginRequired, function(req, res) {
    console.log("in /jots/jotlist service");
    var db = req.db;

    // new stuff - moving filtering to server
    var filterObject = (req.query.endDate === undefined) ? undefined : req.query;
    var flip = -1;    // default to newest first
    var params = req.params.page.slice(1).split("at");    // grab the NatM string
    var pageRequested = Number(params[0]);
    var perPage = Number(params[1]);

    // new stuff trying to Stormpaths user.customData approach
    req.user.getCustomData(function(err, data) {
        console.log("getCustomData returned:");
        console.log(data.userSession.userID);

        //var collectionName = "userjots_" + req.app.get("userData").userID;
        var collectionName = "userjots_" + data.userSession.userID;

        //db.collection(collectionName).find().toArray(function (err, items) {

        // from http://mongodb.github.io/node-mongodb-native/api-generated/cursor.html:
        // callback (function) – This will be called after executing this
        // method successfully. The first parameter will contain the Error
        // object if an error occured, or null otherwise. The second parameter
        // will contain an array of BSON deserialized objects as a result of the query.
        db.collection(collectionName).find().toArray(function (err, jots) {
            
            ///////// filter code brought over from client-side tjdb.js /////////
            /////////   Change to a query within the find() call above once this is working so we finally
            /////////   stop getting all the jots from the db regardless of the filter AND handle err

            // Note that filterObject booleans, etc. will have been converted to strings!
            var statsHeader = {};
//            statsHeader["jotsFound"] = jots.length;

            if(filterObject !== undefined) {
                flip = (filterObject.filterOrder === "newfirst") ? -1 : 1;
                var filteredJots = [];
                var tagChecking = filterObject.filterOnTags === "true" && filterObject.filterTags !== undefined;
                var dateChecking = filterObject.filterOnDate === "true";    // the client will have validated the date(s)

                // If the user is filtering on both tags and date range we take this as an AND operation: a displayed
                // jot must be in the date range AND must be tagged with the tags (Which might be AND or OR mode).
                if(dateChecking || tagChecking) {
                    var dateHit;

                    for(var i = 0; i < jots.length; i++) {
                        var jot = jots[i];
                        if(dateChecking) {
                            dateHit = inDateRange(jot, filterObject);
                            if(dateHit) {
                                if(tagChecking) {
                                    if(containsTags(jot, filterObject))
                                        filteredJots.push(jot);   // date and tag filtering
                                }
                                else    // only date filtering
                                    filteredJots.push(jot);
                            }
                        }
                        else if(tagChecking && containsTags(jot, filterObject)) {
                            filteredJots.push(jot);    // only tag filtering
                        }
                    }
                    jots = filteredJots;
                }
            }

            if(jots.length > 0) {
                jots.sort(function(a,b) {
                    return flip * (a.commonKeyTS - b.commonKeyTS);
                });
            }
            
            statsHeader["jotsFound"] = jots.length;
            ////////////////////////////////////////////////////////////////////////

            // add a header "jot" that really indicates the filter and pagination status and gives the urls
            // for prev and next pages if any + number of pages total under the filter + total jots
            // matching the filter
            // ?and possibly the filter as sent?

            var pageJots = paginate(jots, pageRequested, perPage, statsHeader);    
            statsHeader["jotsReturned"] = pageJots.length;
            pageJots.unshift(statsHeader);    // add header to front of jots array

            console.log(pageJots.length - 1);
            res.json(pageJots);
        });
    });
});

/*
*  Takes an array of objects and treating the array as blocks of perPage elements returns a subarray of
*  min(pages, pageN) where pages = ceiling(jots/perPage) and the returned array is either perPage long
*  or jots.length modulo perPage long.
*/
paginate = function(jots, pageN, perPage, stats) {
    //TODO assert pageN and perPage are valid and both > 0 and maybe some higher min for perPage

    var result = [];
    var pagesFull = Math.floor(jots.length / perPage);
    var pagesPartial = (jots.length % perPage === 0) ? 0 : 1;
    stats["pagesTotal"] = pagesFull + pagesPartial;
    var returnPage = Math.min(stats["pagesTotal"], pageN);
    stats["pageReturned"] = returnPage;

    // set up the prev and next urls: the page number is 1 based
    var prev = 0, next = 0;    // 0 indicates no prev or next
    if(returnPage > 1)
        prev = returnPage - 1;
        
    if(returnPage < stats["pagesTotal"])
        next = returnPage + 1;

    stats["prevPageUrl"] = "/jots/jotlist/:" + String(prev) + "at" + String(perPage);
    stats["nextPageUrl"] = "/jots/jotlist/:" + String(next) + "at" + String(perPage);

    var first = Math.max(0, returnPage - 1) * perPage;
    var count = (returnPage * perPage <= jots.length) ? perPage : jots.length % perPage;
    //var count = ((first + 1) * perPage <= jots.length - 1) ? perPage : jots.length - pagesFull * perPage;

    return jots.slice(first, first + count);
}

/* Returns true if a jot meets the current tag filter criteria, false otherwise. */
containsTags = function(jot, filterObject) {

    // Allow a search for untagged jots, meaning if there are no tags selected
    // to check jots against we will return true only for untagged jots

    if(filterObject.filterTags === null || filterObject.filterTags.length === 0) {
        if(jot.tagList == "")
            return true;
        else
            return false;
    }
    // On the other hand, if we do have tags to search against and the jot has no tags it can't match
    if(jot.tagList == "") {
        return false;
    }

    var tagsInJot = jot.tagList.split(/,\s*/);
    var present = -1;
    for(var i = 0; i < filterObject.filterTags.length; i++) {

        present = tagsInJot.indexOf(filterObject.filterTags[i]);
        if(filterObject.filterOnTagsOr) {
            if(present != -1)
                return true;
            if(i == filterObject.filterTags.length - 1)
                return false;
        }
        else if(filterObject.filterOnTagsAnd) {
            if(present == -1)
                return false;
        }
    }
    return true;
}

/*
*  Returns true if a jot's create date is in the date filter range currently specified. This should not be called
*  until validDateRange() returns true.
*
*  Will treat end date < start date in a friendly way - i.e., as if they were in correct order. This is done directly
*  here and not by altering the filterObject fields.
*/
inDateRange = function(jot, filterObject) {

    var target = jot.commonKeyTS;
    var start = filterObject.startMS === "NaN" ? NaN : Number(filterObject.startMS);
    var end = filterObject.endMS === "NaN" ? NaN : Number(filterObject.endMS);

    // deal with having only one date
    if(isNaN(start))
        start = end - (MS_ONE_DAY - 1);
    else if(isNaN(end))
        end = start + (MS_ONE_DAY - 1);

    // Correct locally for reversed start and end without altering the filterObject fields.
    if(start > end) {
        end = end - (MS_ONE_DAY - 1);
        start = start + (MS_ONE_DAY - 1);
        var t = start;
        start = end;
        end = t;
    }

    // the real test but we allow reversed order of dates just to be friendly
    if((target >= start) && (target <= end))
        return true;
    else
        return false;
}

/*
 * POST to addjot
 */
//router.post('/addjot', stormpath.loginRequired, function(req, res) {
router.post('/addjot', function(req, res) {
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
        var jotToEdit = Number(req.body.commonKeyTS);
        db.collection(collectionName).update({commonKeyTS: jotToEdit}, req.body, {upsert:true}, function(err, result) {
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
        jotToDelete = Number(jotToDelete);
        console.log(jotToDelete);
        db.collection(collectionName).remove({"commonKeyTS": jotToDelete}, function(err, result) {
            res.send((result === 1) ? {msg: ''} : {msg: 'error: ' + err});
        });
    });
});

module.exports = router;
