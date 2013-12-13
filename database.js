var sqlite3 = require("sqlite3").verbose();
var moment = require('moment');
var fs = require("fs");

ticketConn = undefined;

module.exports.db=sqliteDB;
module.exports.Client=Client;
module.exports.Device=Device;
module.exports.Product=Product;

/*
 *	CLIENT CLASS
 */ 
 
 function Client(){
 	this.id=null;
 	this.name=null;
 	this.tickets=null;
 	this.nib=null;
 	this.cardType=null;
 	this.validity=null;
 }

/*
 *	Device CLASS
 */ 
 
 function Device(){
 	this.ip=null;
 	this.macAddress=null;
 	this.location=null;
 }

 /*
 *	Product CLASS
 */ 
 
 function Product(){
 	this.name=null;
 	this.description=null;
 	this.id=null;
 }


 /*
  *  FUNCTIONS
  */

 //get time
 function timeNow()
 {
 	return ( new Date() / 1000 ) | 0 ;
 }

 function timestamp(){
 	return moment().format("YYYY-MM-DDTHH:mm:ss");
 }


/*
 *	DATABASE
 */
 
 function sqliteDB(file) 
 {

 	console.log("Opening Database:"+file);
 	var exists = fs.existsSync(file);

 	if( !exists )
 	{
 		console.log("File not found. Creating new Database file: " + file );
 		fs.openSync(file, "w");
 	}

 	ticketConn = new sqlite3.Database(file,function() {
 		ticketConn.run('PRAGMA foreign_keys=on');
 	});

 	if( !exists )
 	{
		// Serialize forces the order of the operations, nothing is parallel
		ticketConn.serialize(function(){

			ticketConn
			.run("BEGIN;")

			// Create tables
			.run("CREATE TABLE clients (clientId INTEGER PRIMARY KEY, name TEXT NOT NULL, password TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL, UNIQUE(email));")
			.run("CREATE TABLE devices (deviceId INTEGER PRIMARY KEY, ip TEXT NOT NULL, macAddress TEXT, location TEXT, UNIQUE(ip));")
			.run("CREATE TABLE products (productId INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, image TEXT);")
			.run("CREATE TABLE clients_products (buyId INTEGER PRIMARY KEY, client REFERENCES clients(clientId), product REFERENCES products(productId), date TEXT NOT NULL, confirmationCode TEXT, cancelationCode TEXT);")
			.run("CREATE TABLE clients_devices (linkId INTEGER PRIMARY KEY, name TEXT, key TEXT, validationKey TEXT, validationTime TEXT, client REFERENCES clients(clientId), device REFERENCES devices(deviceId));")

			// Insert first data
			//password is MD5 of 'ADMIN' is 73acd9a5972130b75066c82595a1fae3
			.run("INSERT INTO clients (name, password, email, phone, address) VALUES ('ADMIN', '73acd9a5972130b75066c82595a1fae3', 'email@email.com', '00351966233545', 'Portugal');")
			.run("INSERT INTO devices (ip) VALUES ('1.1.1.1');")
			.run("INSERT INTO products (name,description) VALUES ('Justin Bieber CD', 'Melhor CD do Mundo'), ('Miley Cyrus', 'Best Hits. Wrecking Ball Included');")
			.run("COMMIT;");
		});
	}
}

sqliteDB.prototype.createClient=function(client, callback)
{
	console.log("adding client to db ", client.name);
	if( typeof callback !== 'function')
		throw new Error('Callback is not a function');
	ticketConn.run("INSERT INTO clients (name, password, email, phone, address) VALUES (?, ?, ?, ?, ?);",
		[client.name, client.password, client.email, client.phone, client.address],
		function(err){
			callback(err, this.lastID, this.changes);
		});
}


sqliteDB.prototype.login=function(client, device, callback)
{
	console.log("login client: ", client.name);	
	if( typeof callback !== 'function')
		throw new Error('Callback is not a function');

	//force insert of device
	ticketConn.run("INSERT INTO devices (ip) VALUES (?);",
		[device.ip],
		function(err){
			//whether error or not, go grab it
			ticketConn.get("SELECT * FROM devices WHERE ip=?",
				[device.ip],
				function(err, row_device) {
					device.id=row_device.deviceId;
					
					ticketConn.get("SELECT * FROM clients WHERE name=?",
						[client.name],
						function(err, row_client) {
							if( row_client )
							{
								console.log('Client Detected: ', row_client.clientId);
								if (row_client.password != client.password)
								{
									console.log('Wrong Password');
									//TODO diferent pass, count something
									callback(err,null,null);
								}
								else
								{
									//client exists
									ticketConn.get("SELECT * FROM devices, clients_devices WHERE devices.ip=? AND clients_devices.client=?",
										[device.ip, row_client.clientId],
										function(err, row2) {
											if( row2 && row2.validationKey==null && row2.validationTime==null)
											{
												console.log('Everything OK');
												var result={};
												result.key=row2.key;
												result.clientId=row_client.clientId;
												//return the key and the Id
												callback(err, result, 'KEY');
											}
											else
											{
												if (!row2)
												{
													console.log('Device Type: ', typeof(device.id), ' Client Type: ' ,typeof(row_client.clientId));
													console.log('Device not linked: ' + Number(device.id));
													//validationkey generation and saving to db
													var randomKey = Math.random().toString(36).substr(2, 5);
													console.log('Random Key: ', randomKey);
													ticketConn.run("INSERT INTO clients_devices (validationKey, validationTime, client, device) VALUES (?, ?, ?, ?);",
														[randomKey, timestamp(), row_client.clientId, device.id],
														function(err){
															row_client.key=randomKey;
															callback(err,row_client,'USER');
														});
												}
												else
												{
													//already exists ticket
													console.log('Resending cellphone. Not linked');
													console.log(randomKey,'-', timestamp(), '-',row_client.clientId, '-',row2.deviceId, '-',row2.linkId);

													//validationkey generation and saving to db
													var randomKey = Math.random().toString(36).substr(2, 5);
													console.log('Random Key: ', randomKey);
													ticketConn.run("UPDATE clients_devices SET validationKey = ?, validationTime = ?, client = ?, device =? WHERE linkId=?;",
														[randomKey, timestamp(), row_client.clientId, Number(device.id), row2.linkId],
														function(err){
															row_client.key=randomKey;
															callback(err,row_client,'USER');
														});
												}
											}
									});
								}
							}
							else
							{
								//TODO no user, something is trying to find it
								callback(err,null,null);
							}
					});
			});
	});
}


sqliteDB.prototype.linkDevice=function(client, device, linkName, validationKey, callback)
{
	console.log("linking device: ", device.ip, ' for client: ', client.id);
	if( typeof callback !== 'function')
		throw new Error('Callback is not a function');

	var time=moment().subtract('minutes',5).format("YYYY-MM-DDTHH:mm:ss");

	ticketConn.get("SELECT * FROM clients, clients_devices, devices WHERE clients.clientId=clients_devices.client AND devices.deviceId=clients_devices.device AND clients.clientId=? AND clients_devices.validationKey=? AND devices.ip = ? AND clients_devices.validationTime>? ",
		[client.id, validationKey, device.ip, time],
		function(err, row_client_devices) {
			if(row_client_devices)
			{
				console.log(row_client_devices);
				//remove validationKey and times
				//assign key for the cookie/token
				var randomKey = Math.random().toString(36);
				ticketConn.run("UPDATE clients_devices SET validationKey = ?, validationTime = ?, name = ?,key = ? WHERE linkId= ?;",
					[null, null, linkName, randomKey, row_client_devices.linkId],
					function(err){
						callback(err, randomKey);
					});

			}
			else
			{
				//no validation key found
				console.log('Wrong Key');
				callback(err,null);
			}

		});

}

sqliteDB.prototype.buyProduct=function(client, device, product, sessionKey, address, callback)
{
	console.log("buying product: ", product.id, ' for client: ', client.id);
	if( typeof callback !== 'function')
		throw new Error('Callback is not a function');

	ticketConn.get("SELECT * FROM clients, clients_devices, devices WHERE clients.clientId=clients_devices.client AND devices.deviceId=clients_devices.device AND clients.clientId=? AND clients_devices.key=? AND devices.ip = ? ",
		[client.id, sessionKey, device.ip],
		function(err, row_client_devices) {
			if(!row_client_devices)
				callback(err, null, null);
			
			else
			{
				var out = {};
				out.message = "";
				var distance = 0;
				if(row_client_devices.address != address)
					distance = 1000;

				if(distance>200 || product.id==1)
				{
					if(distance >200 )
						out.message += 'Addressess don\'t match or too apart. ';
					if(product.id==1)
						out.message += 'Item is suspicious. ';

					out.message+= 'Sending confirmation and cancelation code.';

					//buy product but needs confirmation to send
					out.confirmationCode = Math.random().toString(36).substr(2, 5);
					console.log('confirmationCode: ', out.confirmationCode);
					out.cancelationCode = Math.random().toString(36).substr(2, 5);
					console.log('cancelationCode: ', out.cancelationCode);
					out.email = row_client_devices.email;
														
														
					ticketConn.run("INSERT INTO clients_products (client, product, date, confirmationCode, cancelationCode) VALUES (?,?,?,?,?);",
						[client.id,product.id,timestamp(), out.confirmationCode, out.cancelationCode],
						function(err){
							callback(err,out,'NEED_CONFIRM');
					});
				}
				else
				{
					//buy product
					console.log('inserting product');
					ticketConn.run("INSERT INTO clients_products (client, product, date) VALUES (?,?,?);",
						[client.id,product.id,timestamp()],
						function(err){
							callback(err, this.lastID,'OK');
					});
				}
			}
	});
}

sqliteDB.prototype.confirmBuy=function(client, device, code, sessionKey, callback)
{
	console.log('confirming buy product for client: ', client.id);
	if( typeof callback !== 'function')
		throw new Error('Callback is not a function');

	ticketConn.get("SELECT * FROM clients, clients_devices, devices WHERE clients.clientId=clients_devices.client AND devices.deviceId=clients_devices.device AND clients.clientId=? AND clients_devices.key=? AND devices.ip = ? ",
		[client.id, sessionKey, device.ip],
		function(err, row_client_devices) {
			if(!row_client_devices)
				callback(err, null);
			
			else
			{
				var time=moment().subtract('minutes',5).format("YYYY-MM-DDTHH:mm:ss");

				ticketConn.get("SELECT * FROM clients_products WHERE client = ? AND ((confirmationCode = ? AND date>?) OR cancelationCode = ?) ",
					[client.id, code, time, code],
					function(err,row_product) {
						if(row_product && row_product.confirmationCode == code)
						{
							ticketConn.run("UPDATE clients_products SET cancelationCode = ?, confirmationCode = ? WHERE buyId=?",
								[null, null, row_product.buyId],
								function(err){
									callback(err, 'CONFIRMED');
								});
						}
						else if(row_product && row_product.cancelationCode == code)
						{
							ticketConn.run("DELETE FROM clients_products WHERE buyId=?",
								[row_product.buyId],
								function(err){
									callback(err, 'CANCELED');
								});
						}
						else
						{
							callback(err,null);
							
						}

					});
			}
	});
}