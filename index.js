#!/usr/bin/env node

import { initDatabase } from './db.js';
import createFtpServer from './ftpserver.js';
import { startWebServer } from './webserver.js';
import { dbfile, ftpconfig } from './settings.js';
import { checkSettings } from './utils.js';

/* Start the application */
async function startApp() {
	/* Check settings */
	if(!checkSettings()) process.exit(1);

	/* create database and table */
	const db = await initDatabase(dbfile);

	/* Create and start the FTP server */
	const ftpServer = createFtpServer(db);

	ftpServer.listen().then(() => {
		console.log(`FTP server running on port ${ftpconfig.port}`);
	});
	
	/* Create and start the web server if enabled */
	await startWebServer(db);
}

startApp().catch(err => {
	console.error("Failed to start application:", err);
	process.exit(1);
});
