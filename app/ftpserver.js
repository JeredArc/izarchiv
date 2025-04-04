import { storeFile } from './db.js';
import { formatDate } from './utils.js';
import { ftpconfig, saveUploadsInFilesystem, uploadDirPath } from './settings.js';
import FtpSrv from 'ftp-srv';
import { Writable, Readable } from 'stream';
import fs from 'fs';
import path from 'path';
import { ftpAboutText } from './translations-german.js';
import os from 'os';

const MAX_FILE_SIZE = 50 * 1024 * 1024; /* 50MB limit */
// const IDLE_TIMEOUT = 600000; // 10 minutes
const IDLE_TIMEOUT = 30000; // 30 seconds
const NOOP_INTERVAL = 10000; // 60 seconds
const FTP_LOG_FILE = 'ftp.log';

export default function startFtpServer(db) {
	// Create a write stream for FTP logging
	const ftpLogStream = FTP_LOG_FILE && fs.createWriteStream(FTP_LOG_FILE, { flags: 'a' }); // 'a' for append mode
	
	function logFtp(message) {
		if(!ftpLogStream) return;
		const timestamp = new Date().toISOString();
		ftpLogStream.write(`${timestamp} ${message}\n`);
	}

	// Create uploads directory if it doesn't exist and if filesystem saving is enabled
	if (saveUploadsInFilesystem && !fs.existsSync(uploadDirPath)) {
		fs.mkdirSync(uploadDirPath, { recursive: true });
	}

	const serverIP = Object.values(os.networkInterfaces()).flat().find(iface => iface.family === 'IPv4' && !iface.internal)?.address || '';
	if(!serverIP) console.warn('Server has no external IPv4 address, PASV will not work!');

	const ftpServer = new FtpSrv({
		url: `ftp://${ftpconfig.host}:${ftpconfig.port}`,
		anonymous: false,
		pasv_min: ftpconfig.pasv_min,
		pasv_max: ftpconfig.pasv_max,
		pasv_url: serverIP,
		timeout: IDLE_TIMEOUT,
	});

	// Log all FTP commands
	ftpServer.on('connect', ({connection, id}) => {
		const ip = connection.ip;
		logFtp(`New connection from ${ip} (ID: ${id})`);
		console.log(`FTP connection established from ${ip}`);

		// Log all raw commands and responses
		connection.commandSocket.on('data', (data) => {
			logFtp(`[${ip}] Client: ${data.toString().trim()}`);
		});
		const originalWrite = connection.commandSocket.write;
		connection.commandSocket.write = function(...args) {
			logFtp(`[${ip}] Server: ${args[0].toString().trim()}`);
			return originalWrite.call(this, ...args);
		};

		connection.on('RNTO', (err, fileName) => {
			logFtp(`[${ip}] RNTO "${fileName}": ${err ? `Error: ${err}` : `OK`}`);
		});
	
		connection.on('STOR', (err, fileName) => {
			logFtp(`[${ip}] STOR "${fileName}": ${err ? `Error: ${err}` : `OK`}`);
		});
	
		connection.on('RETR', (err, filePath) => {
			logFtp(`[${ip}] RETR "${filePath}": ${err ? `Error: ${err}` : `OK`}`);
		});	
	});

	// Log disconnections
	ftpServer.on('disconnect', ({connection, id}) => {
		logFtp(`[${connection.ip}] Client disconnected (ID: ${id})`);
		console.log(`[${connection.ip}] FTP client disconnected`);
	});

	ftpServer.on('server-error', (err) => {
		logFtp(`FTP server error: ${JSON.stringify(err)}`);
	});

	ftpServer.on('client-error', (err) => {
		logFtp(`FTP client error: ${JSON.stringify(err)}`);
	});



	ftpServer.on("login", ({ username, password, connection }, resolve, reject) => {
		if (username === ftpconfig.user && password === ftpconfig.pass) {
			console.log(`[${connection.ip}] FTP login successful as "${username}"`);

			let files = new Map([
				['/', {
					directory: true,
					mode: 0o755,
					mtime: new Date(),
				}],
				['/_about.txt', {
					content: ftpAboutText,
					mtime: new Date(),
					contentType: 'text/plain',
					directory: false,
					mode: 0o644,
					size: ftpAboutText.length,
				}]
			]);

			const makeStat = (filePath, fileObj) => ({
				isDirectory: () => fileObj.directory,
				name: filePath.slice(filePath.lastIndexOf('/') + 1),
				type: fileObj.directory ? 'd' : 'f',
				size: fileObj.size,
				mtime: fileObj.mtime,
				mode: fileObj.mode,
			});

			let cwd = '/';
			const normalizePath = (path) => {
				if(!path) return cwd;
				path = path.replace(/(\/+|^)\.?$/, '/');
				if(!path.startsWith('/')) path = cwd + path;
				return path;
			}

			resolve({
				fs: {
					get cwd() { return cwd; },
					currentDirectory: () => cwd,
					async get(fileName) {
						let path = normalizePath(fileName);
						if (files.has(path)) {
							return makeStat(path, files.get(path));
						}
						throw new Error(`File "${path}" not found`);
					},
					async list(path) {
						path = normalizePath(path);
						let result = Array.from(files.entries())
						.filter(([filePath, fileObj]) => filePath.length > path.length && filePath.startsWith(path) && !filePath.slice(path.length, filePath.length - 1).includes('/'))
						.map(([filePath, fileObj]) => makeStat(filePath, fileObj));
						return result;
					},
					async chdir(path) {
						path ||= '/';
						path = normalizePath(path);
						if (files.has(path) && files.get(path).directory) {
							cwd = path;
							return cwd;
						}
						else if (files.has(path + '/') && files.get(path + '/').directory) {
							cwd = path + '/';
							return cwd;
						}
						else {
							throw new Error(`Directory "${path}" not found`);
						}
					},
					async write(fileName) {
						let path = normalizePath(fileName);	
						if (files.has(path)) {
							const file = files.get(path);
							file.content = '';
							file.mtime = new Date();
							return { stream: new Writable({ write(chunk, encoding, callback) {
								file.content += chunk;
								file.size += file.content.length;
								callback();
							} }) };
						}
						else {
							let chunks = [];
							let totalSize = 0;
							let dataReceived = false;
							
							logFtp(`[${connection.ip}] Starting upload for file: ${fileName}`);
							console.log(`[${connection.ip}] FTP client initiated upload for file: ${fileName}`);
							
							let lastNoopTime = Date.now();
							const keepAlive = () => { /* ftp-srv would close connection after IDLE_TIMEOUT, even while data is sent over the data connection */
								const now = Date.now();
								if (now - lastNoopTime > NOOP_INTERVAL) {
									connection.commandSocket.write('200 NOOP ok\r\n');
									lastNoopTime = now;
								}
							};

							let writeStream = new Writable({
								write(chunk, encoding, callback) {
									if (!dataReceived) {
										dataReceived = true;
										logFtp(`[${connection.ip}] First data chunk received for ${fileName} (${chunk.length} bytes)`);
									}
									totalSize += chunk.length;
									logFtp(`[${connection.ip}] Data chunk received for ${fileName}: ${chunk.length} bytes (total: ${totalSize} bytes)`);
									
									keepAlive();

									if (totalSize > MAX_FILE_SIZE) {
										logFtp(`[${connection.ip}] File size limit exceeded for ${fileName}`);
										callback(new Error("File too large"));
										return;
									}
									chunks.push(chunk);
									callback();
								}
							});

							writeStream.on("finish", async () => {
								logFtp(`[${connection.ip}] Upload finished for ${fileName}, total size: ${totalSize} bytes`);
								const cleanPath = fileName.replace(/^\//, "");
								const buffer = Buffer.concat(chunks);
								
								try {
									await storeFile(db, cleanPath, buffer);
									logFtp(`[${connection.ip}] File ${fileName} successfully stored in database`);
									
									if (saveUploadsInFilesystem) {
										const filename = formatDate(new Date(), 'yyyymmdd-hhii') + '_' + cleanPath.replace(/[\/\\]/g, '');
										fs.writeFileSync(path.join(uploadDirPath, filename), buffer);
										logFtp(`[${connection.ip}] File ${fileName} saved to filesystem as ${filename}`);
									}
									console.log(`[${connection.ip}] FTP upload and processing successful for ${fileName}`);
								} catch (err) {
									logFtp(`[${connection.ip}] Error processing file ${fileName}: ${err.message}`);
									console.error(`Error processing file: ${err.message}`);
								}
							});

							writeStream.on("error", (err) => {
								logFtp(`[${connection.ip}] Write stream error for ${fileName}: ${err.message}`);
								console.error("Write stream error during ftp upload:", err);
							});

							// Add pipe error handling
							writeStream.on("pipe", (src) => {
								logFtp(`[${connection.ip}] Data connection established for ${fileName}`);
								src.on("error", (err) => {
									logFtp(`[${connection.ip}] Data connection error for ${fileName}: ${err.message}`);
								});
							});

							return { stream: writeStream };
						}
					},
					async read(fileName, { start, end }) {
						let path = normalizePath(fileName);
						if (files.has(path)) {
							const file = files.get(path);
							const content = file.content;
							const startIndex = start || 0;
							const endIndex = end || content.length;
							const chunk = content.slice(startIndex, endIndex);
							return { stream: new Readable({ read(size) { this.push(chunk); this.push(null); } }) };
						}
						throw new Error(`File "${path}" not found`);
					},
					async delete(path) { throw new Error("Not implemented (delete)"); },
					async mkdir(path) { throw new Error("Not implemented (mkdir)"); },
					async rename(path, newName) { throw new Error("Not implemented (rename)"); },
					async chmod(path, mode) {
						if (files.has(path)) {
							files.get(path).mode = mode;
							return true;
						}
						throw new Error(`File "${path}" not found`);
					},
					async getUniqueName(path) { throw new Error("Not implemented (getUniqueName)"); },
				},
				permissions: {
					list: true,
					download: true,
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

	ftpServer.listen()
	.then(() => {
		console.log(`FTP server running at ftp://${ftpconfig.host}:${ftpconfig.port}`);
		logFtp(`FTP server listening on ${ftpconfig.host}:${ftpconfig.port}`);
	})
	.catch(err => {
		console.error("Failed to start FTP server at ftp://${ftpconfig.host}:${ftpconfig.port}:", err);
		// process.exit(1);
	});


	return ftpServer;
} 