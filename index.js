#!/usr/bin/env node

/* require statements */
const FtpSrv = require("ftp-srv");
const Sqlite3 = require("sqlite3").verbose();
const OS = require("os");
const Bunyan = require("bunyan");
const Stream = require("stream");

/* configuration definitions. Security isn't a concern here. */
const dbfile = "values.db3";
const ftpport = 21;
const ftpuser = "izar";
const ftppass = "IZAR.Center";

/* create database and table */
const db = new Sqlite3.Database(dbfile);
db.serialize(() => {
	db.run(`
		CREATE TABLE IF NOT EXISTS ftpuploads (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			rdysent BOOLEAN DEFAULT 0,
			filename TEXT,
			data BLOB,
			uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`);
});

// Add this function to get local IP
function getLocalIP() {
    const interfaces = OS.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip internal (i.e. 127.0.0.1) and non-IPv4 addresses
            if (!iface.internal && iface.family === 'IPv4') {
                return iface.address;
            }
        }
    }
    return '127.0.0.1'; // Fallback to localhost if no other IP found
}

// Create a custom stream that filters out the metadata
const customStream = new Stream.Writable({
    write: function(chunk, encoding, next) {
        const data = JSON.parse(chunk);
        // Only output the msg, level, and time
		let output = {
			..."time" in data ? {time: data.time} : {},
			..."level" in data ? {level: data.level} : {},
			..."message" in data ? {message: data.message} : {},
			..."msg" in data ? {msg: data.msg} : {},
			...data
		};
		delete output.name;
		delete output.hostname;
		delete output.pid;
		delete output.id;
		delete output.ip;
        console.log(JSON.stringify(output));
        next();
    }
});

const log = Bunyan.createLogger({
	name: "ftp-server",
	level: "trace",
	streams: [{
		level: "trace",
		stream: customStream
	}]
});

const ftpServer = new FtpSrv({
	url: `ftp://0.0.0.0:${ftpport}`,
	anonymous: false,
	pasv_min: 1024,
	pasv_max: 1050,
	log: log
});

ftpServer.on("login", ({ username, password, connection }, resolve, reject) => {
	if (username === ftpuser && password === ftppass) {
		const connectionIP = connection.ip.replace("::ffff:", "");
		connection.server.options.pasv_url = connectionIP;
		
		resolve({ 
			fs: {
				list: () => Promise.resolve([]),
				chdir: () => Promise.resolve('/'),
				cwd: () => Promise.resolve('/'),
				currentDirectory: () => '/',
				get: () => Promise.resolve({
					isDirectory: () => true,
					mode: 0o755,
					size: 0,
					mtime: new Date()
				}),
				write: (path, stream) => new Promise((resolve, reject) => {
					const { Writable } = require('stream');
					let chunks = [];
					let totalSize = 0;
					const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit

					// Create the writable stream first
					const writeStream = new Writable({
						write(chunk, encoding, callback) {
							if(path.endsWith(".rdy")) {
								// Ignore data for .rdy files
								callback();
								return;
							}

							totalSize += chunk.length;
							if (totalSize > MAX_FILE_SIZE) {
								callback(new Error("File too large"));
								return;
							}
							chunks.push(chunk);
							callback();
						}
					});

					if(path.endsWith(".rdy")) {
						writeStream.on("finish", () => {
							const baseFileName = path.slice(0, -4);
							db.run("UPDATE ftpuploads SET rdysent = 1 WHERE filename = ?", [baseFileName], (err) => {
								if (err) {
									console.error(`Database error: ${err.message}`);
									reject(err);
									return;
								}
								console.log(`Marked ${baseFileName} as ready`);
							});
						});
					} else {
						writeStream.on("finish", () => {
							try {
								const buffer = Buffer.concat(chunks);
								
								db.run("INSERT INTO ftpuploads (filename, data) VALUES (?, ?)", 
									[path, buffer], 
									(err) => {
										if (err) {
											console.error(`Database error: ${err.message}`);
											reject(err);
											return;
										}
										console.log(`Stored file: ${path} in database (${buffer.length} bytes)`);
									}
								);
							} catch (err) {
								console.error(`Database error: ${err.message}`);
								reject(err);
							}
						});
					}

					// Return the stream for the FTP server to write to
					resolve({ stream: writeStream });
				}),
				read: () => Promise.reject(new Error("Not implemented")),
				mkdir: () => Promise.reject(new Error("Not implemented")),
				rename: () => Promise.reject(new Error("Not implemented")),
				delete: () => Promise.reject(new Error("Not implemented")),
			},
			permissions: {
				list: true,
				download: false,
				mkdir: false,
				delete: false,
				rename: false,
				upload: true
			}
		});
	} else {
		reject(new Error("Invalid username or password"));
	}
});

ftpServer.listen().then(() => {
	console.log(`FTP server running on port ${ftpport}`);
});
