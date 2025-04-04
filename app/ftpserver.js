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

export default function startFtpServer(db) {
	// Create a write stream for FTP logging
	const ftpLogStream = fs.createWriteStream('ftp.log', { flags: 'a' }); // 'a' for append mode
	
	function logFtp(message) {
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
		timeout: 120000,  // 2 minutes timeout
	});
	logFtp(`FTP server started at ${ftpconfig.host}:${ftpconfig.port}`);

	// Log all FTP commands
	ftpServer.on('connect', ({connection, id}) => {
		const ip = connection.ip;
		logFtp(`New connection from ${ip} (ID: ${id})`);

		// Log all raw commands
		connection.commandSocket.on('data', (data) => {
			logFtp(`[${ip}] Command: ${data.toString().trim()}`);
		});

		// Log all responses
		const originalWrite = connection.commandSocket.write;
		connection.commandSocket.write = function(data, ...args) {
			logFtp(`[${ip}] Response: ${data.toString().trim()}`);
			return originalWrite.call(this, data, ...args);
		};
	});

	// Log disconnections
	ftpServer.on('disconnect', ({connection, id}) => {
		logFtp(`Client disconnected ${connection.ip} (ID: ${id})`);
	});

	ftpServer.on('server-error', (err) => {
		logFtp(`FTP server error: ${JSON.stringify(err)}`);
	});

	ftpServer.on('client-error', (err) => {
		logFtp(`FTP client error: ${JSON.stringify(err)}`);
	});

	ftpServer.on('RNTO', (err, fileName) => {
		logFtp(`RNTO: ${err} ${fileName}`);
	});

	ftpServer.on('STOR', (err, fileName) => {
		logFtp(`STOR: ${err} ${fileName}`);
	});

	ftpServer.on('RETR', (err, filePath) => {
		logFtp(`RETR: ${err} ${filePath}`);
	});

	ftpServer.on("login", ({ username, password, connection }, resolve, reject) => {
		if (username === ftpconfig.user && password === ftpconfig.pass) {
			console.log(`FTP login successful from ${connection.ip}`);
			// console.log(connection);
			// let connectionIP = connection.ip.replace("::ffff:", "");
			// connection.server.options.pasv_url = connectionIP;

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

							logFtp(`Starting upload for file: ${fileName}`);

							let writeStream = new Writable({
								write(chunk, encoding, callback) {
									if (!dataReceived) {
										dataReceived = true;
										logFtp(`First data chunk received for ${fileName} (${chunk.length} bytes)`);
									}
									totalSize += chunk.length;
									logFtp(`Data chunk received for ${fileName}: ${chunk.length} bytes (total: ${totalSize} bytes)`);
									
									if (totalSize > MAX_FILE_SIZE) {
										logFtp(`File size limit exceeded for ${fileName}`);
										callback(new Error("File too large"));
										return;
									}
									chunks.push(chunk);
									callback();
								}
							});

							writeStream.on("finish", async () => {
								logFtp(`Upload finished for ${fileName}, total size: ${totalSize} bytes`);
								const cleanPath = fileName.replace(/^\//, "");
								const buffer = Buffer.concat(chunks);
								
								try {
									await storeFile(db, cleanPath, buffer);
									logFtp(`File ${fileName} successfully stored in database`);
									
									if (saveUploadsInFilesystem) {
										const filename = formatDate(new Date(), 'yyyymmdd-hhii') + '_' + cleanPath.replace(/[\/\\]/g, '');
										fs.writeFileSync(path.join(uploadDirPath, filename), buffer);
										logFtp(`File ${fileName} saved to filesystem as ${filename}`);
									}
								} catch (err) {
									logFtp(`Error processing file ${fileName}: ${err.message}`);
									console.error(`Error processing file: ${err.message}`);
								}
							});

							writeStream.on("error", (err) => {
								logFtp(`Write stream error for ${fileName}: ${err.message}`);
								console.error("Write stream error during ftp upload:", err);
							});

							// Add pipe error handling
							writeStream.on("pipe", (src) => {
								logFtp(`Data connection established for ${fileName}`);
								src.on("error", (err) => {
									logFtp(`Data connection error for ${fileName}: ${err.message}`);
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

	ftpServer.on('error', (error) => {
		logFtp(`FTP general error: ${JSON.stringify(error)}`);
		console.error('FTP general error:', error);
	});

	ftpServer.listen()
	.then(() => {
		console.log(`FTP server running at ftp://${ftpconfig.host}:${ftpconfig.port}`);
	})
	.catch(err => {
		console.error("Failed to start FTP server at ftp://${ftpconfig.host}:${ftpconfig.port}:", err);
		// process.exit(1);
	});


	return ftpServer;
} 