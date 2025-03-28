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
	});

	ftpServer.on("login", ({ username, password, connection }, resolve, reject) => {
		if (username === ftpconfig.user && password === ftpconfig.pass) {
			console.log(`FTP login successful to ${connection.ip}`);
			let connectionIP = connection.ip.replace("::ffff:", "");
			connection.server.options.pasv_url = connectionIP;

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

			resolve({
				fs: {
					cwd: '/',
					currentDirectory: () => this.cwd,
					get: async (fileName) => {
						if (files.has(this.cwd + fileName)) {
							return files.get(this.cwd + fileName);
						}
						throw new Error(`File "${this.cwd + fileName}" not found`);
					},
					list: async (path) => {
						path ||= this.cwd;
						return Array.from(files.entries())
						.filter(([fileName, file]) => fileName.length > path.length && fileName.startsWith(path) && !fileName.slice(path.length).includes('/'))
						.map(([fileName, file]) => ({
							isDirectory: () => file.directory,
							name: fileName.slice(path.length),
							type: file.directory ? 'd' : 'f',
							size: file.directory ? 0 : file.size,
							mtime: file.mtime,
							mode: file.mode,
						}));
					},
					chdir: async (path) => {
						path ||= '/';
						if (files.has(path)) {
							this.cwd = path;
							return this.cwd;
						}
						else if (files.has(path + '/')) {
							this.cwd = path + '/';
							return this.cwd;
						}
						else {
							throw new Error(`Directory "${path}" not found`);
						}
					},
					write: async (fileName) => {
						if (files.has(this.cwd + fileName)) {
							const file = files.get(this.cwd + fileName);
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
					read: async (fileName, { start, end }) => {
						if (files.has(this.cwd + fileName)) {
							const file = files.get(this.cwd + fileName);
							const content = file.content;
							const startIndex = start || 0;
							const endIndex = end || content.length;
							const chunk = content.slice(startIndex, endIndex);
							return { stream: new Readable({ read(size) { this.push(chunk); this.push(null); } }) };
						}
						throw new Error(`File "${this.cwd + fileName}" not found`);
					},
					delete: async (path) => { throw new Error("Not implemented (delete)"); },
					mkdir:  async (path) => { throw new Error("Not implemented (mkdir)"); },
					rename: async (path, newName) => { throw new Error("Not implemented (rename)"); },
					chmod: async (path, mode) => {
						if (files.has(path)) {
							files.get(path).mode = mode;
							return true;
						}
						throw new Error(`File "${path}" not found`);
					},
					getUniqueName: async (path) => { throw new Error("Not implemented (getUniqueName)"); },
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