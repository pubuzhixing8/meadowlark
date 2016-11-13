var http = require('http');
var express = require('express');
var fortune = require('./lib/fortune.js');
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
           startServer.close();
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
// app.use(require('cookie-parser')(credentials.cookieSecret));
// // app.use(require('express-session')());

// var MongoSessionStore = require('session-mongoose')(require('connect'));
// var sessionStore = new MongoSessionStore({url:credentials.mongo.connectionString})
// app.use(require('express-session')({store:sessionStore}));


// flash message middleware
app.use(function(req, res, next){
	// if there's a flash message, transfer
	// it to the context, then clear it
	res.locals.flash = req.session.flash;
	delete req.session.flash;
	next();
});
app.use(express.static(__dirname+'/pubulic'));
app.get('/contest/vacation-photo',function(req,res){
    var now = new Date();
    res.render('/contest/vacation-photo',{
        year:now.getFullYear(),month:now.getMonth()
    });
});
app.post('/contest/vaction-photo/:year/:month',function(req,res){
   var form = new formidable.IncomingForm();
   form.parse(req,function(err,fields,files){
       if(err){  
           return res.redirect(303,'/error');
       }
       console.log('received fields:');
       console.log(fields);
       console.log('received files:');
       console.log(files);
       res.redirect(303,'/thank-you');
   }); 
});
app.get('/newsletter',function(req,res){
   //
   res.render('newsletter',{csrf:'CSRF token goes here'}); 
});

app.post('/process',function(req,res){
    // console.log('Form (from querystring):'+req.query.form);
    // console.log('CSRF token (from hidden from hield):'+req.body._csrf);
    // console.log('Name (from visible from field):'+req.body.name);
    // console.log('Email (from visible from field):'+req.body.email);
    // res.redirect(303,'/thank-you');
    if(req.xhr || req.accepts('json,html') === 'json'){
        res.send({success:true});
    }
    else{
        res.redirect(303,'/thank-you');
    }
});
app.use(function(req,res,next){
    res.locals.showTests = app.get('env') !== '' && req.query.test === '1';
    next();
});
app.get('/',function(req,res) {
    // res.type('text/plain');
    // res.send('Meadowlark Travel');
    res.render('home');
});

app.get('/about',function(req,res) {
    // res.type('text/plain');
    // res.send('About Meadowlark Travel');
    res.render('about',{fortune:fortune.getFortune(),
    pageTestScript:'/qa/tests-about.js'    
    });
});
app.get('tours/hood-river',function(req,res){
    res.render('tours/hood-river');
});
app.get('tours/request-group-rate',function(req,res){
   res.render('tours/request-group-rate'); 
});

function convertFromUSD(value, currency){
    switch(currency){
    	case 'USD': return value * 1;
        case 'GBP': return value * 0.6;
        case 'BTC': return value * 0.0023707918444761;
        default: return NaN;
    }
}
app.get('/vacations', function(req, res){
    Vacation.find({ available: true }, function(err, vacations){
        console.log(vacations.length);
    	var currency = req.session.currency || 'USD';
        var context = {
            currency: currency,
            vacations: vacations.map(function(vacation){
                return {
                    sku: vacation.sku,
                    name: vacation.name,
                    description: vacation.description,
                    inSeason: vacation.inSeason,
                    price: convertFromUSD(vacation.priceInCents/100,currency),
                }
            })
        };
        switch(currency){
	    	case 'USD': context.currencyUSD = 'selected'; break;
	        case 'GBP': context.currencyGBP = 'selected'; break;
	        case 'BTC': context.currencyBTC = 'selected'; break;
	    }
        res.render('vacations', context);
    });
});

var cartValidation = require('./lib/cartValidation.js');
app.use(cartValidation.checkWaivers);
app.use(cartValidation.checkGuestCounts);

app.get('/cart/add', function(req, res, next){
	var cart = req.session.cart || (req.session.cart = { items: [] });
	Vacation.findOne({ sku: req.query.sku }, function(err, vacation){
		if(err) return next(err);
		if(!vacation) return next(new Error('Unknown vacation SKU: ' + req.query.sku));
		cart.items.push({
			vacation: vacation,
			guests: req.body.guests || 1,
		});
		res.redirect(303, '/cart');
	});
});
app.post('/cart/add', function(req, res, next){
	var cart = req.session.cart || (req.session.cart = { items: [] });
	Vacation.findOne({ sku: req.body.sku }, function(err, vacation){
		if(err) return next(err);
		if(!vacation) return next(new Error('Unknown vacation SKU: ' + req.body.sku));
		cart.items.push({
			vacation: vacation,
			guests: req.body.guests || 1,
		});
		res.redirect(303, '/cart');
	});
});
app.get('/cart', function(req, res, next){
	var cart = req.session.cart;
	if(!cart) next();
	res.render('cart', { cart: cart });
});
app.get('/cart/checkout', function(req, res, next){
	var cart = req.session.cart;
	if(!cart) next();
	res.render('cart-checkout');
});
app.get('/cart/thank-you', function(req, res){
	res.render('cart-thank-you', { cart: req.session.cart });
});
app.get('/email/cart/thank-you', function(req, res){
	res.render('email/cart-thank-you', { cart: req.session.cart, layout: null });
});
app.post('/cart/checkout', function(req, res,next){
	var cart = req.session.cart;
	if(!cart) next(new Error('Cart does not exist.'));
	var name = req.body.name || '', email = req.body.email || '';
	// input validation
	if(!email.match(VALID_EMAIL_REGEX)) return res.next(new Error('Invalid email address.'));
	// assign a random cart ID; normally we would use a database ID here
	cart.number = Math.random().toString().replace(/^0\.0*/, '');
	cart.billing = {
		name: name,
		email: email,
	};
    res.render('email/cart-thank-you', 
    	{ layout: null, cart: cart }, function(err,html){
	        if( err ) console.log('error in email template');
	        // emailService.send(cart.billing.email,
	        // 	'Thank you for booking your trip with Meadowlark Travel!',
	        // 	html);
	    }
    );
    res.render('cart-thank-you', { cart: cart });
});

app.get('/notify-me-when-in-season', function(req, res){
    res.render('notify-me-when-in-season', { sku: req.query.sku });
});

app.post('/notify-me-when-in-season', function(req, res){
    VacationInSeasonListener.update(
        { email: req.body.email }, 
        { $push: { skus: req.body.sku } },
        { upsert: true },
	    function(err){
	        if(err) {
	        	console.error(err.stack);
	            req.session.flash = {
	                type: 'danger',
	                intro: 'Ooops!',
	                message: 'There was an error processing your request.',
	            };
	            return res.redirect(303, '/vacations');
	        }
	        req.session.flash = {
	            type: 'success',
	            intro: 'Thank you!',
	            message: 'You will be notified when this vacation is in season.',
	        };
	        return res.redirect(303, '/vacations');
	    }
	);
});
app.get('/set-currency/:currency', function(req,res){
    req.session.currency = req.params.currency;
    return res.redirect(303, '/vacations');
});
//定制404页面
app.use(function(req,res,next){
//    res.type('text/plain');
//    res.status(404);
//    res.end('404 - Not Found'); 
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

function startServer(){
    app.listen(app.get('port'),function(){
        console.log('Express started in '+app.get('env')+' mode on http://localhost:'+app.get('port') + '; press Ctrl -C to terminate.');
    });
};
if(require.main == module){
    startServer();
}else{
    module.exports = startServer;
}

