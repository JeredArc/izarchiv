#!/usr/bin/env node

import { initDatabase } from './db.js';
import createFtpServer from './ftpserver.js';
import settings from './settings.js';

/* Start the application */
async function startApp() {
	/* create database and table */
	const db = await initDatabase(settings.dbfile);

	/* Create and start the FTP server */
	const ftpServer = createFtpServer(db);

	ftpServer.listen().then(() => {
		console.log(`FTP server running on port ${settings.ftpconfig.port}`);
	});
}

startApp().catch(err => {
	console.error("Failed to start application:", err);
	process.exit(1);
});
