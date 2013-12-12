var express = require('express');
var app = express();
var	dbLib = require('./database');
var	db = new dbLib.db('database.db');
var fs = require('fs');
var	port = 81;	// Default

//configuration
app.configure(function() {
	app.use(express.bodyParser());
	app.use(express.cookieParser("asd"));

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


var html_index;
fs.readFile('./html/index.html', "binary", function (err, data) {
    if (err) {
        throw err;
    }
    html_index = data;
});


/*
FUNCTIONS
*/

function respondToJSON(req, res, out, statusCode) {
	var size;

	out = JSON.stringify( out );
	size = Buffer.byteLength( out, 'UTF-8' );

	res.writeHead( statusCode,
		{ 'Content-Type': 'application/json; charset=utf-8',
		'Content-Length': size} );

	res.write( out );
	res.end();
}

function respond(req, res, out, statusCode) {
	res.writeHeader(200);
	res.write( out , "binary");
	res.end();
}

/*
ROUTES
*/

app.get('/', function(req, res) {
	respond( req, res, html_index, 400);
});

app.post('/client/create',function (req,res) {
	console.log('Method: ' + req.path + " [" + req.method + "]");
	
	var client = new dbLib.Client();
	if( !req.body.name || !req.body.password ||  !req.body.email || !req.body.address ||!req.body.phone)
	{
		var out = {};
		out.error = "Bad request";
		respondToJSON( req, res, out, 400 );
		
	}
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

//LOG ACCOUNT
//POST PARAMS: name string,password string
//RETURN JSON {id:<clientid>}
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
		device.ip=req.connection.remoteAddress;

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
						//login was completely sucessfull, returned key/token
						console.log('Logged in key : ' + row);
						res.cookie('sessionkey', row, { maxAge: 900000, signed: true });
					}
					else
					{
						//need to validate via cellphone, returned my data
						console.log('Sending to cellphone');
						//TODO save user id
					}
				}
			}

			respondToJSON( req, res, out, code );

		});
	}
});

//LOG ACCOUNT
//POST PARAMS: name string,password string
//RETURN JSON {id:<clientid>}
app.post('/device/link',function (req,res) {
	console.log('Method: ' + req.path + " [" + req.method + "]");
	console.log('IP: ' + req.connection.remoteAddress);

	if(!req.body.nameLink ||!req.body.validationKey || !req.body.user)
		respondToJSON( req, res, {error: 'Bad request'}, 400 );


		var client = new dbLib.Client();
		var device = new dbLib.Device();
		device.ip=req.connection.remoteAddress;
		client.id=req.body.user;
		
	var linkName = req.body.nameLink;
	var validationKey = req.body.validationKey;
	var linkName = req.body.nameLink;



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
				out.error = 'Wrong key or userid';
				
				console.log('Fail link');
			}
			else
			{
				out = row;
				//login was completely sucessfull, returned key/token
				console.log('Logged in key : ' + row);
				res.cookie('sessionkey', row, { maxAge: 900000, signed: true });
			}
		}

		respondToJSON( req, res, out, code );

	});
});




app.all('*', function (req, res) {
	console.log('Pedido não encontrado: ' + req.path + " [" + req.method + "]");

	respondToJSON( req, res, { error: 'Página não encontrada'}, 404 );
});
