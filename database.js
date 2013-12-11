var sqlite3 = require("sqlite3").verbose();
var moment = require('moment');
var fs = require("fs");

ticketConn = undefined;

module.exports.db=sqliteDB;
module.exports.Client=Client;
module.exports.Device=Device;

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
 	this.id=null;
 	this.macAddress=null;
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
			.run("CREATE TABLE clients (id INTEGER PRIMARY KEY, name TEXT NOT NULL, password TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL, UNIQUE(email));")
			.run("CREATE TABLE devices (id INTEGER PRIMARY KEY, macAddress TEXT NOT NULL, location TEXT NOT NULL);")
			.run("CREATE TABLE clients_devices (id INTEGER PRIMARY KEY, key TEXT NOT NULL, client REFERENCES clients(id), device REFERENCES devices(id));")

			// Insert first data
			//password is MD5 of 'ADMIN' is 73acd9a5972130b75066c82595a1fae3
			.run("INSERT INTO clients (name, password, email, phone, address) VALUES ('ADMIN', '73acd9a5972130b75066c82595a1fae3', 'email@email.com', '00351966233545', 'Portugal');")
			.run("INSERT INTO devices (macAddress, location) VALUES ('60b5fbb39cc81503021976c7aa155e11', 'Portugal');")
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
	ticketConn.get("SELECT * FROM clients WHERE name=?",
		[client.name],
		function(err, row) {
			if( row )
			{
				if (row.pass == pass)
				{
					//TODO Check location of device, add if needed
					callback(err,row );
				}
				else
				{
					//TODO diferent pass, count something
					callback(err,null);
				}
			}
			else
			{
				//TODO no user, something is trying to find it
				callback(err,null );
			}
		});
}