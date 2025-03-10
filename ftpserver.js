import { storeFile } from './db.js';
import { formatDate } from './utils.js';
import settings from './settings.js';
import FtpSrv from 'ftp-srv';
import { Writable } from 'stream';
import fs from 'fs';
import path from 'path';

const MAX_FILE_SIZE = 50 * 1024 * 1024; /* 50MB limit */

export default function createFtpServer(db) {
	const ftpServer = new FtpSrv({
		url: `ftp://0.0.0.0:${settings.ftpconfig.port}`,
		anonymous: false,
		pasv_min: settings.ftpconfig.pasv_min,
		pasv_max: settings.ftpconfig.pasv_max,
	});

	ftpServer.on("login", ({ username, password, connection }, resolve, reject) => {
		if (username === settings.ftpconfig.user && password === settings.ftpconfig.pass) {
			let connectionIP = connection.ip.replace("::ffff:", "");
			connection.server.options.pasv_url = connectionIP;

			resolve({
				fs: {
					list: async () => [],
					chdir: async () => '/',
					cwd: async () => '/',
					currentDirectory: () => '/',
					get: async () => ({
						isDirectory: () => true,
						mode: 0o755,
						size: 0,
						mtime: new Date()
					}),
					write: async (filePath) => {
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
							const cleanPath = filePath.replace(/^\//, "");
							const buffer = Buffer.concat(chunks);
							
							try {
								await storeFile(db, cleanPath, buffer);
								
								if (settings.saveUploadsInFilesystem) {
									const filename = formatDate(new Date()) + '_' + cleanPath.replace(/[\/\\]/g, '');
									fs.writeFileSync(path.join(settings.uploadDirPath, filename), buffer);
								}
							} catch (err) {
								console.error(`Error processing file: ${err.message}`);
							}
						});

						return { stream: writeStream };
					},
					read:   async () => { throw new Error("Not implemented"); },
					mkdir:  async () => { throw new Error("Not implemented"); },
					rename: async () => { throw new Error("Not implemented"); },
					delete: async () => { throw new Error("Not implemented"); },
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

	return ftpServer;
} 