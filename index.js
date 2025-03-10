#!/usr/bin/env node

import { initDatabase } from './db.js';
import createFtpServer from './ftpserver.js';
import { startWebServer } from './webserver.js';
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
	
	/* Create and start the web server if enabled */
	if (settings.webserver?.enabled) {
		const webConfig = {
			dbFile: settings.dbfile,
			webPort: settings.webserver.port || 3000,
			webHost: settings.webserver.host || '0.0.0.0'
		};
		
		// Start web server and let any errors propagate to the main catch handler
		await startWebServer(webConfig);
	}
}

startApp().catch(err => {
	console.error("Failed to start application:", err);
	process.exit(1);
});
