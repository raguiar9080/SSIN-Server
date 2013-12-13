var sqlite3 = require("sqlite3").verbose();
var moment = require('moment');
var fs = require("fs");

ticketConn = undefined;

module.exports.db=sqliteDB;
module.exports.Client=Client;
module.exports.Device=Device;
module.exports.Product=Product;

/*
 *	Client CLASS
 */ 
 
 function Client(){
 	this.id=null;
 	this.name=null;
 }

/*
 *	Device CLASS
 */ 
 
 function Device(){
 	this.id=null;
 	this.identifier=null;
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
 
 //initialize database file, creates if needed
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
			.run("CREATE TABLE clients (clientId INTEGER PRIMARY KEY, name TEXT NOT NULL, password TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL, UNIQUE(name));")
			.run("CREATE TABLE devices (deviceId INTEGER PRIMARY KEY, identifier TEXT NOT NULL, UNIQUE(identifier));")
			.run("CREATE TABLE products (productId INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL);")
			.run("CREATE TABLE clients_products (buyId INTEGER PRIMARY KEY, client REFERENCES clients(clientId), product REFERENCES products(productId), date TEXT NOT NULL, confirmationCode TEXT, cancelationCode TEXT);")
			.run("CREATE TABLE clients_devices (linkId INTEGER PRIMARY KEY, name TEXT, key TEXT, validationKey TEXT, validationTime TEXT, client REFERENCES clients(clientId), device REFERENCES devices(deviceId));")

			// Insert first data
			//passwords are saved as plaintext. This is not the focus here. We needed to encrypt client side before sending
			.run("INSERT INTO clients (name, password, email, phone, address) VALUES ('ADMIN', 'ADMIN', 'email@email.com', '00351966233545', 'Portugal');")
			.run("INSERT INTO products (name,description) VALUES ('Justin Bieber CD', 'Melhor CD do Mundo'), ('Miley Cyrus', 'Best Hits. Wrecking Ball Included');")
			.run("COMMIT;");
		});
	}
}

sqliteDB.prototype.createClient=function(client, callback)
{
	console.log("Adding client to db ", client.name);
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

	//Try to insert the device
	ticketConn.run("INSERT INTO devices (identifier) VALUES (?);",
		[device.identifier],
		function(err){

			//Whether sucess or not(already present) go grab it
			ticketConn.get("SELECT * FROM devices WHERE identifier=?",
				[device.identifier],
				function(err, row_device) {

					device.id=row_device.deviceId;
					
					//Grab the user
					ticketConn.get("SELECT * FROM clients WHERE name=?",
						[client.name],
						function(err, row_client) {

							if( row_client )
							{
								console.log('Client Detected: ', row_client.clientId);
								if (row_client.password != client.password)
								{
									console.log('Wrong Password');
									//In this case we could log a possible attacker trying to access this account
									//Above a number of attemps notify user. This is not implemented
									callback(err,null,null);
								}
								else
								{
									//Client validated sucessfully
									ticketConn.get("SELECT * FROM devices, clients_devices WHERE devices.identifier=? AND clients_devices.client=?",
										[device.identifier, row_client.clientId],
										function(err, row2) {
											if( row2 && row2.validationKey==null && row2.validationTime==null)
											{
												//Device was linked to account. Just confirm and send the cookies that expire(sessionKey and clientId) again
												console.log('Everything OK');
												var result={};
												result.key=row2.key;
												result.clientId=row_client.clientId;
												callback(err, result, 'KEY');
											}
											else
											{
												//Device not linked. We need to send codes via cell/email
												if (!row2)
												{
													console.log('Device not linked: ' + Number(device.id));
													
													//Validationkey generation and saving to db
													var randomKey = Math.random().toString(36).substr(2, 5);
													console.log('Random Key: ', randomKey);
													//Insertion of current time allows the validationKey the possibility of expiring
													ticketConn.run("INSERT INTO clients_devices (validationKey, validationTime, client, device) VALUES (?, ?, ?, ?);",
														[randomKey, timestamp(), row_client.clientId, device.id],
														function(err){
															row_client.key=randomKey;
															callback(err,row_client,'USER');
														});
												}
												else
												{
													//Login was sucessfull but link was already found. Could be an expired validationkey by now
													//Just send a new code and update on db
													console.log('Resending cellphone.');

													//Validationkey generation and saving to db
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
								//user not found
								callback(err,null,null);
					});
			});
	});
}


sqliteDB.prototype.linkDevice=function(client, device, linkName, validationKey, callback)
{
	console.log("linking device: ", device.identifier, ' for client: ', client.id);
	if( typeof callback !== 'function')
		throw new Error('Callback is not a function');

	//subtract 5 minutes from current time
	//compare with date of token generation to see if it has expired
	var time=moment().subtract('minutes',5).format("YYYY-MM-DDTHH:mm:ss");

	ticketConn.get("SELECT * FROM clients, clients_devices, devices WHERE clients.clientId=clients_devices.client AND devices.deviceId=clients_devices.device AND clients.clientId=? AND clients_devices.validationKey=? AND devices.identifier = ? AND clients_devices.validationTime>? ",
		[client.id, validationKey, device.identifier, time],
		function(err, row_client_devices) {
			if(row_client_devices)
			{
				//Success. Erase cell tokens and correspondent times. Also insert and return the sessionkey
				console.log(row_client_devices);
				var randomKey = Math.random().toString(36);
				ticketConn.run("UPDATE clients_devices SET validationKey = ?, validationTime = ?, name = ?,key = ? WHERE linkId= ?;",
					[null, null, linkName, randomKey, row_client_devices.linkId],
					function(err){
						callback(err, randomKey);
					});

			}
			else
			{
				//Wrong validation key
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

	// just checking if the device is linked to account and sessionKey is correct
	ticketConn.get("SELECT * FROM clients, clients_devices, devices WHERE clients.clientId=clients_devices.client AND devices.deviceId=clients_devices.device AND clients.clientId=? AND clients_devices.key=? AND devices.identifier = ? ",
		[client.id, sessionKey, device.identifier],
		function(err, row_client_devices) {
			if(!row_client_devices)
				callback(err, null, null);
			
			else
			{
				var out = {};
				out.message = "";

				//In here we should check to see if the address are too far from one another
				//This would need aproval of purchases from different countries or too distante addresses.
				//In our case we just check to see if the address is the same
				var distance = 0;
				if(row_client_devices.address != address)
					distance = 1;

				//If a possible anomality has been detected. We check if the id is equal to one and marked
				//as suspicous if such. In a real world cenario, a more mature solution would be needed
				//by checking the bought history and search patterns.
				if(distance==1 || product.id==1)
				{
					if(distance ==1 )
						out.message += 'Addressess don\'t match or too apart. ';
					if(product.id==1)
						out.message += 'Item is suspicious. ';

					//Buying product but needs confirmation to send
					//We send both confirmation and cancelation codes for easy cancelation in case of unwanted access
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
					//No suspicous activity detected. Just Buy the product
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

	ticketConn.get("SELECT * FROM clients, clients_devices, devices WHERE clients.clientId=clients_devices.client AND devices.deviceId=clients_devices.device AND clients.clientId=? AND clients_devices.key=? AND devices.identifier = ? ",
		[client.id, sessionKey, device.identifier],
		function(err, row_client_devices) {
			if(!row_client_devices)
				callback(err, null);
			
			else
			{
				var time=moment().subtract('minutes',5).format("YYYY-MM-DDTHH:mm:ss");

				//Check if the code received exists on the database for the current client.
				//Confirmation code, only the confirmation code, has an expiration time to prevent multiple atempts
				ticketConn.get("SELECT * FROM clients_products WHERE client = ? AND ((confirmationCode = ? AND date>?) OR cancelationCode = ?) ",
					[client.id, code, time, code],
					function(err,row_product) {
						if(row_product && row_product.confirmationCode == code)
						{
							//Confirm Buying
							ticketConn.run("UPDATE clients_products SET cancelationCode = ?, confirmationCode = ? WHERE buyId=?",
								[null, null, row_product.buyId],
								function(err){
									callback(err, 'CONFIRMED');
								});
						}
						else if(row_product && row_product.cancelationCode == code)
						{
							//Cancel Buying
							ticketConn.run("DELETE FROM clients_products WHERE buyId=?",
								[row_product.buyId],
								function(err){
									callback(err, 'CANCELED');
								});
						}
						else
						{
							//Possible guessing/attack on the codes. Some measure could be taken
							callback(err,null);
							
						}

					});
			}
	});
}