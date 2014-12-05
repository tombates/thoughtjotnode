var express = require('express');
var path = require('path');
var stormpath = require('express-stormpath');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var mongo = require('mongoskin');

// Get access to our database, depending on where it is

// ---next line is for testing locally
//var db = mongo.db("mongodb://localhost:27017/ThoughtJotNode", {native_parser:true});

// ---next line if for running on heroku with MongloLab
var db = mongo.db(process.env.MONGOLAB_URI, {native_parser:true});

// ---lesson: even though MONGOLAB_URI is exactly the below it will not work on heroku, I assume for security reasons
//var db = mongo.db("mongodb://heroku_app32162654:mlab13!@ds051720.mongolab.com:51720/heroku_app32162654", {native_parser:true});

var routes = require('./routes/index');
var users = require('./routes/users');
var jots = require('./routes/jots');
var tags = require('./routes/tags');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(stormpath.init(app, {
    apiKeyId: '12E8R9E2R3C1CEF7AQIIMY04K',
    apiKeySecret: 'RytK1PXMIq+Yq07N6f79OxTLUdINSEZhZ0ER0F/+neI',
    application: 'https://api.stormpath.com/v1/applications/1Hn0y3HWQEYH3gS34O2iSc',
    secretKey: 'jdygewinLjfLLIDE78jgneSDFHJG290jwelo25'
}));
// Make our db accessible to our router
app.use(function(req, res, next) {
    req.db = db;
    next();
});

app.use('/', routes);
app.use('/users', users);
app.use('/jots', jots);
app.use('/tags', tags);
//app.use('/services', services);
//app.use('/secrets', secrets);

//DEBUG - let's take a look at app.locals - i'd like to see app.locals in particular
// turns out the only key in app.locals is settings
// var app_local_keys = [];
// for(var key in app.locals.settings) {
//     console.log(key);
//     console.log("    " + app.locals.settings[key]);
//     //app_local_keys.push(key);
// }

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers

// login experimentation to see how this Stormpath stuff works
//app.get('/index', stormpath.loginRequired, function(req, res) {
//  console.log("in app.get Stormpath auth callback: LOGGED IN");
//  res.send("If you're seeing this page, you must be logged in!");
//});

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});


module.exports = app;
