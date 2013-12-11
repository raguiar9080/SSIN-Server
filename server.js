	var express = require('express');
	var app = express();
	var	dbLib = require('./database');
	var	db = new dbLib.db('database.db');
	var	port = 81;	// Default

	//configuration
	app.configure(function() {
		app.use(express.bodyParser());
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


	/*
	ROUTES
	*/

	app.get('/', function(req, res) {
		res.send('MAIN PAGE');
	});

	app.all('*', function (req, res) {
		console.log('Pedido não encontrado: ' + req.path + " [" + req.method + "]");

		respondToJSON( req, res, { error: 'Página não encontrada'}, 404 );
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
		
		if(!req.body.name ||!req.body.password)
			respondToJSON( req, res, {error: 'Bad request'}, 400 );
		else
		{
			var client = new dbLib.Client();
			client.name=req.body.name;
			client.password=req.body.password;

			db.login(client, function(err,row) {
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
						out.id=row.id;
						console.log('Logged in : ' + out.name);
					}
				}

				respondToJSON( req, res, out, code );

			});
		}

	});