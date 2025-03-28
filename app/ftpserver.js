import { storeFile } from './db.js';
import { formatDate } from './utils.js';
import { ftpconfig, saveUploadsInFilesystem, uploadDirPath } from './settings.js';
import FtpSrv from 'ftp-srv';
import { Writable, Readable } from 'stream';
import fs from 'fs';
import path from 'path';
import { ftpAboutText } from './translations-german.js';


const MAX_FILE_SIZE = 50 * 1024 * 1024; /* 50MB limit */

export default function createFtpServer(db) {
	// Create uploads directory if it doesn't exist and if filesystem saving is enabled
	if (saveUploadsInFilesystem && !fs.existsSync(uploadDirPath)) {
		fs.mkdirSync(uploadDirPath, { recursive: true });
	}

	const ftpServer = new FtpSrv({
		url: `ftp://0.0.0.0:${ftpconfig.port}`,
		anonymous: false,
		pasv_min: ftpconfig.pasv_min,
		pasv_max: ftpconfig.pasv_max,
		pasv_url: '127.0.0.1',
	});

	ftpServer.on("login", ({ username, password, connection }, resolve, reject) => {
		if (username === ftpconfig.user && password === ftpconfig.pass) {
			console.log(`FTP login successful from ${connection.ip}`);
			console.log(connection);
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

							let writeStream = new Writable({
								write(chunk, encoding, callback) {
									totalSize += chunk.length;
									if (totalSize > MAX_FILE_SIZE) {
										callback(new Error("File too large"));
										return;
									}
									chunks.push(chunk);
									callback();
								}
							});

							writeStream.on("finish", async () => {
								const cleanPath = fileName.replace(/^\//, "");
								const buffer = Buffer.concat(chunks);
								
								try {
									await storeFile(db, cleanPath, buffer);
									
									if (saveUploadsInFilesystem) {
										const filename = formatDate(new Date(), 'yyyymmdd-hhii') + '_' + cleanPath.replace(/[\/\\]/g, '');
										fs.writeFileSync(path.join(uploadDirPath, filename), buffer);
									}
								} catch (err) {
									console.error(`Error processing file: ${err.message}`);
								}
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

	return ftpServer;
} 