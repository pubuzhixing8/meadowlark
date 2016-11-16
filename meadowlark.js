var http = require('http');
var express = require('express');
var formidable = require('formidable');
var credentials = require('./credentials.js');
var fs = require('fs');
var dataDir = __dirname + '/data';
var vacationPhotoDir = dataDir + '/vacation-photo';
var mongoose = require('mongoose');
var opts = {
    server:{
        socketOptions:{keepAlive:1}
    }    
};
var VacationInSeasonListener = require('./models/vacationInSeasonListener.js');
var VALID_EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
var app = express();
var MongoSessionStore = require('session-mongoose')(require('connect'));
var sessionStore = new MongoSessionStore({ url: credentials.mongo.development.connectionString });

app.use(require('cookie-parser')(credentials.cookieSecret));
app.use(require('express-session')({ store: sessionStore }));

switch(app.get('env')){
    case 'development':
        mongoose.connect(credentials.mongo.development.connectionString,opts);
        break;
    case 'production':
        mongoose.connect(credentials.mongo.production.connectionString,opts);
        break;
    default:
    throw new Error('Unknown execution environment：'+app.get('env'));
}
var Vacation = require('./models/vacation.js');
// initialize vacations
Vacation.find(function(err, vacations){
    // console.log(vacations.length);
    if(vacations.length) return;

    new Vacation({
        name: 'Hood River Day Trip',
        slug: 'hood-river-day-trip',
        category: 'Day Trip',
        sku: 'HR199',
        description: 'Spend a day sailing on the Columbia and ' + 
            'enjoying craft beers in Hood River!',
        priceInCents: 9995,
        tags: ['day trip', 'hood river', 'sailing', 'windsurfing', 'breweries'],
        inSeason: true,
        maximumGuests: 16,
        available: true,
        packagesSold: 0,
        requiresWaiver: false,
    }).save();

    new Vacation({
        name: 'Oregon Coast Getaway',
        slug: 'oregon-coast-getaway',
        category: 'Weekend Getaway',
        sku: 'OC39',
        description: 'Enjoy the ocean air and quaint coastal towns!',
        priceInCents: 269995,
        tags: ['weekend getaway', 'oregon coast', 'beachcombing'],
        inSeason: false,
        maximumGuests: 8,
        available: true,
        packagesSold: 0,
        requiresWaiver: false,
    }).save();

    new Vacation({
        name: 'Rock Climbing in Bend',
        slug: 'rock-climbing-in-bend',
        category: 'Adventure',
        sku: 'B99',
        description: 'Experience the thrill of rock climbing in the high desert.',
        priceInCents: 289995,
        tags: ['weekend getaway', 'bend', 'high desert', 'rock climbing', 'hiking', 'skiing'],
        inSeason: true,
        requiresWaiver: true,
        maximumGuests: 4,
        available: false,
        packagesSold: 0,
        notes: 'The tour guide is currently recovering from a skiing accident.',
    }).save();
});
app.use(express.static(__dirname+'/pubulic'));
fs.existsSync(dataDir) || fs.mkdirSync(dataDir);
fs.existsSync(vacationPhotoDir) || fs.mkdirSync(vacationPhotoDir);



//设置handlebars视图引擎
var handlebars = require('express3-handlebars')
                        .create({defaultLayout:'main',
                    helpers:{
                        section:function(name,options){
                            if(!this._sections){
                                this._sections = {};
                            }
                            this._sections[name] = options.fn(this);
                            return null;
                        }
                    }});
app.engine('handlebars',handlebars.engine);
app.set('view engine','handlebars');
app.set('port',process.env.PORT || 3000);
app.use(function(req,res,next){
    //为请求创建一个域
    var domain = require('domain').create();
    //处理这个域中的错误
    domain.on('error',function(err){
       console.error('DOMAIN ERROR CAUGHT\n',err.stack);
       try{
           //5s秒内进行故障保护关机
           setTimeout(function(){
               console.error('Failsafe shutdowm.');
               process.exit(1);
           },5000);
           //从集群中断开
           var worker = require('cluster').worker;
           if(worker) worker.disconnect();
           //停止接收新请求
           server.close();
           try{
               next(err);
           }catch(err){
               //如果Express错误路由失效，尝试返回普通文本响应
               console.error('Express error machanism failed.\n',err.stack);
               res.statusCode= 500;
               res.setHeader('content-type','text/plain');
               res.end('Server error.');
           }
       } catch(err){
           console.error('Unable to send 500 response.\n',err.stack);
       }
    });
    domain.add(req);
    domain.add(res);
    //执行该域中剩余的请求链
    domain.run(next);
});
// logging
switch(app.get('env')){
    case 'development':
    	// compact, colorful dev logging
    	app.use(require('morgan')('dev'));
        break;
    case 'production':
        // module 'express-logger' supports daily log rotation
        app.use(require('express-logger')({ path: __dirname + '/log/requests.log'}));
        break;
}
app.use(function(req,res,next){
    var cluster = require('cluster');
    if(cluster.isWorker){
        console.log('Worker %d received request',cluster.worker.id);
    }
    next();
});
app.use(require('body-parser')());
// flash message middleware
app.use(function(req, res, next){
	res.locals.flash = req.session.flash;
	delete req.session.flash;
	next();
});


app.use(function(req,res,next){
    res.locals.showTests = app.get('env') !== '' && req.query.test === '1';
    next();
});

// var cartValidation = require('./lib/cartValidation.js');
// app.use(cartValidation.checkWaivers);
// app.use(cartValidation.checkGuestCounts);
require('./routes.js')(app);
//定制404页面
app.use(function(req,res,next){
    res.status(404);
    res.render('404');
});

//定制 500 页面
app.use(function(err,req,res,next) {
    console.error(err.stack);
    //res.type('text/plain');
    res.status(500);
    //res.send('500 - Server Error');
    res.render('500');
});
var server;
function startServer(){
    server = app.listen(app.get('port'),function(){
        console.log('Express started in '+app.get('env')+' mode on http://localhost:'+app.get('port') + '; press Ctrl -C to terminate.');
    });
};
if(require.main == module){
    startServer();
}else{
    module.exports = startServer;
}

