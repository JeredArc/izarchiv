#!/usr/bin/env node

import { initDatabase } from './db.js';
import startFtpServer from './ftpserver.js';
import { startWebServer } from './webserver.js';
import { dbfile, ftpconfig, webserver } from './settings.js';
import { checkSettings } from './utils.js';

/* Start the application */
async function startApp() {
	/* Check settings */
	if(!checkSettings()) process.exit(1);

	/* create database and table */
	const db = await initDatabase(dbfile);

	/* Create and start the web server if enabled */
	if(webserver.enabled) await startWebServer(db);

	/* Create and start the FTP server if enabled */
	if(ftpconfig.enabled) startFtpServer(db);
}

startApp().catch(err => {
	console.error("Failed to start application:", err);
	process.exit(1);
});
