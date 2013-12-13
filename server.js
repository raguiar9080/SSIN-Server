var express = require('express');
var app = express();
var	dbLib = require('./database');
var	db = new dbLib.db('database.db');
var fs = require('fs');
var exec = require('child_process').exec;
var child;
var	port = 81;	// Default


//configuration
app.configure(function() {
	app.use(express.bodyParser());
	app.use(express.cookieParser("mykey"));

	app.use(function (req, res, next) {
		res.setHeader('Server', 'MobilePayment');

		return next();
	});

	app.enable('trust proxy');
	app.disable('x-powered-by');

	app.use('/', app.router);
});

var args = process.argv.splice(2),
p = null;
if (args.length > 0) {
	p = parseInt(args[0]);
	if( p )
		port = p ;

	p = null;
}
console.log('Listening on port: ' + port)
app.listen(port);

/**************************************************************************************************************************************
***************************************************************************************************************************************
***************************************************************************************************************************************
 READING HTML HARD CODED FILES
 **************************************************************************************************************************************
 **************************************************************************************************************************************
 *************************************************************************************************************************************/

var html_index;
fs.readFile('./html/index.html', "binary", function (err, data) {
    if (err) {
        throw err;
    }
    html_index = data;
});

var html_register;
fs.readFile('./html/register.html', "binary", function (err, data) {
    if (err) {
        throw err;
    }
    html_register = data;
});

var html_login;
fs.readFile('./html/login.html', "binary", function (err, data) {
    if (err) {
        throw err;
    }
    html_login = data;
});

var html_link;
fs.readFile('./html/link.html', "binary", function (err, data) {
    if (err) {
        throw err;
    }
    html_link = data;
});

var html_buy;
fs.readFile('./html/buy.html', "binary", function (err, data) {
    if (err) {
        throw err;
    }
    html_buy = data;
});

var html_verify;
fs.readFile('./html/verify.html', "binary", function (err, data) {
    if (err) {
        throw err;
    }
    html_verify = data;
});



/**************************************************************************************************************************************
***************************************************************************************************************************************
***************************************************************************************************************************************
 FUNCTIONS
 **************************************************************************************************************************************
 **************************************************************************************************************************************
 *************************************************************************************************************************************/


//responds with a premade page with home button and content is server response
function respondToJSON(req, res, out, statusCode) {
	var towrite = '<HTML><HEAD><TITLE>SSIN</TITLE></HEAD><BODY><a style="font-size:large;" href="http://localhost:81/">Home</a><p style="font-size:large;">' + JSON.stringify( out ) + '</p></BODY></HTML>';
	res.writeHeader(200);
	res.write( towrite , "binary");
	res.end();
}

//responds with the static html pages loaded before
function respond(req, res, out, statusCode) {
	res.writeHeader(200);
	res.write( out , "binary");
	res.end();
}

/**************************************************************************************************************************************
***************************************************************************************************************************************
***************************************************************************************************************************************
 ROUTES
 **************************************************************************************************************************************
 **************************************************************************************************************************************
 *************************************************************************************************************************************/

//Main Page
app.get('/', function(req, res) {
	respond( req, res, html_index, 400);
});


//Register Static
app.get('/register.html', function (req,res) {
	respond( req, res, html_register, 400);
});

//Register REST
app.post('/client/create',function (req,res) {
	console.log('Method: ' + req.path + " [" + req.method + "]");
	
	var client = new dbLib.Client();
	if( !req.body.name || !req.body.password ||  !req.body.email || !req.body.address ||!req.body.phone)
		respondToJSON( req, res,  {error: 'Bad request'}, 400 );
	else
	{
		client.name = req.body.name;
		client.password=req.body.password;
		client.email=req.body.email;
		client.address = req.body.address;
		client.phone = req.body.phone;
		db.createClient(client, function(err, lastID, row) {
			var out = {};
			var code;

			if( err )
			{
				code = 500;
				out.id = -1;
				out.error = 'Impossible to add client';
				console.log('Error adding client: ' + err);
			}
			else
			{
				code = 200;
				out.id = lastID;
				out.name=row.name;
				console.log('Added new client: ' + lastID + ' ' + client.name);
			}

			respondToJSON( req, res, out, code );

		});
	}
});



//Login Static
app.get('/login.html', function (req,res) {
	respond( req, res, html_login, 400);
});

//Login REST
app.post('/client/login',function (req,res) {
	console.log('Method: ' + req.path + " [" + req.method + "]");
	console.log('IP: ' + req.connection.remoteAddress);

	if(!req.body.name ||!req.body.password)
		respondToJSON( req, res, {error: 'Bad request'}, 400 );
	else
	{
		var client = new dbLib.Client();
		var device = new dbLib.Device();
		client.name=req.body.name;
		client.password=req.body.password;

		if(!req.signedCookies.clientId)
		{
			//device doesnt have cookie to identify it stored.
			//generate a key to add the machine to the server
			var randomKey = Math.random().toString(36);
			device.identifier=randomKey;			
		}
		else
		{
			//device has cookie with identifier, simply retrieve
			device.identifier=req.signedCookies.deviceId;
		}

		db.login(client, device, function(err,row, result) {
			var out = {};
			var code;

			if( err ) {
				code = 500;
				out.id = -1;
				out.error = 'Impossible to find client. Possible DB Error.';
				console.log('Error login client: ' + err);
			}
			else {
				code = 200;
				if (!row)
				{
					out.id = -1;
					out.error = 'Wrong user or password';	
					console.log('Fail login');
				}
				else
				{
					out = row;
					if(result=='KEY')
					{
						//login was completely sucessfull, device was already linked. 
						//Returned sessionkey/token, client identifier and device identifier
						console.log('Logged in key : ' + out.key);

						//both this cookies have lifetime to improve unwanted access on idle computers
						res.cookie('sessionKey', out.key, { maxAge: 18000, signed: true });
						res.cookie('clientId', out.clientId, { maxAge: 18000, signed: true });

						//doesnt need to be forced the lifetime. Let the browser decide
						res.cookie('deviceId', device.identifier, {signed: true});
					}
					else
					{
						//Device not linked to account. Need to validate via cellphone,
						//Email used here due to reasons explicit in report
						//Returned client identifier and device identifier
						console.log('Sending to cellphone');
						var commandlinecommand = 'mailsend.exe -to ' + out.email +' -from r.aguiar9080@gmail.com  -ssl -smtp smtp.gmail.com -port 465 -sub "TOKEN" -M "' + out.key + '" +cc +bc -q -auth-plain -user "r.aguiar9080" -pass "d80Szh4312365413"';
						child = exec(commandlinecommand,
						  function (error, stdout, stderr) {
						    console.log('stdout: ' + stdout);
						    console.log('stderr: ' + stderr);
						    if (error !== null) {
						      console.log('exec error: ' + error);
						    }
						});

						//set cookies explained above
						res.cookie('clientId', out.clientId, { maxAge: 18000, signed: true });
						res.cookie('deviceId', device.identifier, {signed: true});
						
						out="CONFIRMATION CODE SENT TO CELLPHONE/EMAIL";
					}
				}
			}

			respondToJSON( req, res, out, code );

		});
	}
});

//Link Static
app.get('/link.html', function (req,res) {
	respond( req, res, html_link, 400);
});

//Link REST
app.post('/device/link',function (req,res) {
	console.log('Method: ' + req.path + " [" + req.method + "]");
	console.log('IP: ' + req.connection.remoteAddress);

	if(!req.body.nameLink ||!req.body.validationKey || !req.signedCookies.clientId || !req.signedCookies.deviceId)
		respondToJSON( req, res, {error: 'Bad request. No Login?'}, 400 );
	else
	{
		var client = new dbLib.Client();
		var device = new dbLib.Device();
		device.identifier=req.signedCookies.deviceId;
		client.id=req.signedCookies.clientId;
			
		var linkName = req.body.nameLink;
		var validationKey = req.body.validationKey;


		db.linkDevice(client, device, linkName, validationKey, function(err,row) {
			var out = {};
			var code;

			if( err ) {
				code = 500;
				out.id = -1;
				out.error = 'Impossible to find device. Possible DB Error.';
				console.log('Error login client: ' + err);
			}
			else {
				code = 200;
				if (!row)
				{
					out.id = -1;
					out.error = 'Wrong key or expired. Try login again.';
					console.log('Fail link');
				}
				else
				{
					out = row;
					//login was completely sucessfull, returned key/token
					console.log('Logged in key : ' + row);
					res.cookie('sessionKey', row, { maxAge: 18000, signed: true });
				}
			}

			respondToJSON( req, res, out, code );

		});
	}
});


app.get('/buy.html', function (req,res) {
	respond( req, res, html_buy, 400);
});

app.post('/product/buy',function (req,res) {
	console.log('Method: ' + req.path + " [" + req.method + "]");
	console.log('IP: ' + req.connection.remoteAddress);

	//need for all the cookies
	if(!req.body.product || !req.body.address || !req.signedCookies.sessionKey || !req.signedCookies.clientId || !req.signedCookies.deviceId)
		respondToJSON( req, res, {error: 'Bad request. No Login?'}, 400 );
	else
	{
		var client = new dbLib.Client();
		var device = new dbLib.Device();
		var product = new dbLib.Product();
		device.identifier=req.signedCookies.deviceId;
		client.id=req.signedCookies.clientId;
		product.id=req.body.product;
		var sessionKey = req.signedCookies.sessionKey;
		var address = req.body.address;

		db.buyProduct(client, device, product, sessionKey, address, function(err,row,result) {
			var out = {};
			var code;
			if( err ) {
				code = 500;
				out.id = -1;
				out.error = 'Impossible to buy product. Possible DB Error.';
				console.log('Error buy product: ' + err);
			}
			else {
				code = 200;
				if (!row && !result)
				{
					out.id = -1;
					out.error = 'Wrong key or expired. Try login again.';
					console.log('Fail buy');
				}
				else
				{
					out = row;
					if(result=='NEED_CONFIRM')
					{
						//Something fishy was detected. Buy is on hold. Validation by cell/email code needee
						console.log('Buy needs confirmation');

						var commandlinecommand = 'mailsend.exe -to ' + out.email +' -from r.aguiar9080@gmail.com  -ssl -smtp smtp.gmail.com -port 465 -sub "TOKEN" -M "CONFIRM: ' + out.confirmationCode + '  -  CANCEL: ' + out.cancelationCode + '" +cc +bc -q -auth-plain -user "r.aguiar9080" -pass "d80Szh4312365413"';

						child = exec(commandlinecommand,
						  function (error, stdout, stderr) {
						    console.log('stdout: ' + stdout);
						    console.log('stderr: ' + stderr);
						    if (error !== null) {
						      console.log('exec error: ' + error);
						    }
						});
						out = {};
						out = row.message + 'Needing cellphone/email confirmation';
					}
					else
					{
						out = row;
						//buy was completely sucessfull. No anomalities detected
						console.log('Buy sucessfull : ' + out);
					}
				}
			}

			respondToJSON( req, res, out, code );

		});
	}
});

app.get('/verify.html', function (req,res) {
	respond( req, res, html_verify, 400);
});

app.post('/product/verify',function (req,res) {
	console.log('Method: ' + req.path + " [" + req.method + "]");
	console.log('IP: ' + req.connection.remoteAddress);

	if(!req.body.code || !req.signedCookies.sessionKey || !req.signedCookies.clientId|| !req.signedCookies.deviceId)
		respondToJSON( req, res, {error: 'Bad request. No Login?'}, 400 );
	else
	{
		var client = new dbLib.Client();
		var device = new dbLib.Device();
		device.identifier=req.signedCookies.deviceId;
		client.id=req.signedCookies.clientId;
		var sessionKey = req.signedCookies.sessionKey;
		var code = req.body.code;

		db.confirmBuy(client, device, code, sessionKey, function(err,row) {
			var out = {};
			var code;
			if( err ) {
				code = 500;
				out.id = -1;
				out.error = 'Impossible to verify code. Possible DB Error.';
				console.log('Error verifying product: ' + err);
			}
			else {
				code = 200;
				if (!row)
				{
					out.id = -1;
					out.error = 'Wrong key or expired. Try login again.';
					console.log('Fail buy');
				}
				else
				{
					out=row;
					console.log('Operation sucessfull : ' + out);
					
				}
			}

			respondToJSON( req, res, out, code );

		});
	}
});




app.all('*', function (req, res) {
	console.log('Pedido não encontrado: ' + req.path + " [" + req.method + "]");

	respondToJSON( req, res, { error: 'Página não encontrada'}, 404 );
});
