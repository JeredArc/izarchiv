import sqlite3 from 'sqlite3';
import { parseIzarXml } from './mbus.js';
import { formatDate } from './utils.js';
import { deltaColumns } from './settings.js';

const Sqlite3 = sqlite3.verbose();

const RDY_ORIGINAL_EXTENSION = ".xml";
const SOURCE_TYPE_IZAR_FTP = "IZAR-FTP";

// Helper functions to create Promise-based versions of sqlite3 methods
function createAsyncMethods(db) {
	db.runAsync = function(sql, params = []) {
		return new Promise((resolve, reject) => {
			this.run(sql, params, function(err) {
				if (err) reject(err);
				else resolve({ lastID: this.lastID, changes: this.changes });
			});
		});
	};
	
	db.getAsync = function(sql, params = []) {
		return new Promise((resolve, reject) => {
			this.get(sql, params, (err, row) => {
				if (err) reject(err);
				else resolve(row);
			});
		});
	};
	
	db.allAsync = function(sql, params = []) {
		return new Promise((resolve, reject) => {
			this.all(sql, params, (err, rows) => {
				if (err) reject(err);
				else resolve(rows);
			});
		});
	};
	
	return db;
}

// Initialize the database
export async function initDatabase(dbfile) {
	const db = createAsyncMethods(new Sqlite3.Database(dbfile));

	/* table devices */
	await db.runAsync(`
		CREATE TABLE IF NOT EXISTS devices (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			address TEXT NOT NULL UNIQUE,
			name TEXT,
			description TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`);
	await db.runAsync(`
		INSERT OR IGNORE INTO devices (address, name, description)
		VALUES ('', 'Unbekanntes Gerät', 'Werte ohne Gerätezuweisung')
	`);

	/* table sources */
	await db.runAsync(`
		CREATE TABLE IF NOT EXISTS sources (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			type TEXT NOT NULL,
			rdysent BOOLEAN DEFAULT 0,
			filename TEXT,
			data BLOB,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`);

	/* table records */
	await db.runAsync(`
		CREATE TABLE IF NOT EXISTS records (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			device INTEGER,
			source INTEGER,
			time DATETIME DEFAULT CURRENT_TIMESTAMP,
			data JSON,
			delta JSON,
			FOREIGN KEY (device) REFERENCES devices(id),
			FOREIGN KEY (source) REFERENCES sources(id)
		)
	`);

	console.log(`Database initialized: ${dbfile}`);
	return db;
}

// Store a file in the database
export async function storeFile(db, filename, buffer) {
	try {
		if (filename.endsWith(".rdy")) {
			let origFilename = filename.replace(/\.rdy$/, RDY_ORIGINAL_EXTENSION);
			
			// Find the most recent source file with all data in one query
			const source = await db.getAsync(`
				SELECT id, data FROM sources
				WHERE filename = ?
				AND type = ?
				AND created_at > datetime('now', '-1 hour')
				ORDER BY created_at DESC
				LIMIT 1
			`, [origFilename, SOURCE_TYPE_IZAR_FTP]);
			
			if (source) {
				// Update the existing source
				const result = await db.runAsync(`
					UPDATE sources
					SET rdysent = 1
					WHERE id = ?
				`, [source.id]);
				
				console.log(`Marked source ID ${source.id} (${origFilename}) as ready`);
				
				return result;
			} else {
				console.log(`No recent file found to mark as ready: ${origFilename}`);
				return { changes: 0 };
			}
		} else {
			// Always insert a new source for non-rdy files
			const result = await db.runAsync(
				"INSERT INTO sources (type, filename, data) VALUES (?, ?, ?)", 
				[SOURCE_TYPE_IZAR_FTP, filename, buffer]
			);
			console.log(`Stored new file: ${filename} in database (ID: ${result.lastID}, ${buffer.length} bytes)`);

			await processFile(db, buffer, result.lastID);

			return result;
		}
	} catch (err) {
		console.error(`Database error: ${err.message}`);
		throw err;
	}
}

async function processFile(db, data, sourceId) {
	try {
		// Convert the BLOB to a string
		const xmlContent = data.toString('utf8');
		
		// Parse the XML using the function from mbus.js
		const parsedData = parseIzarXml(xmlContent);
		
		if (parsedData?.records?.length > 0) {
			console.log(`Parsed ${parsedData.records.length} records from source ID ${sourceId}`);
			
			// Store each record in the database
			for (const record of parsedData.records) {
				const recordJson = JSON.stringify(record);
				await insertRecord(db, sourceId, recordJson);
			}
			
			return { recordCount: parsedData.records.length };
		}
		else {
			console.warn(`No records found in source ID ${sourceId}`);
		}
		if (parsedData?.errors?.length > 0) {
			console.warn(`Errors found in source ID ${sourceId}:\n${parsedData.errors.map(e => e.error).join("\n")}`);
		}
	} catch (err) {
		console.error(`Error processing file: ${err.message}`);
		throw err;
	}
}

// Insert a single record into the database
async function insertRecord(db, sourceId, recordJson) {
	// Extract device address from the record data
	const record = JSON.parse(recordJson);
	const deviceAddress = record.device || record.mbusId || '';  // Use empty string for unknown device
	
	// Check if the device exists in the devices table
	let device = await db.getAsync('SELECT id FROM devices WHERE address = ?', [deviceAddress]);
	if (!device) {
		// Insert the device if it doesn't exist
		const deviceResult = await db.runAsync('INSERT INTO devices (address, name, description) VALUES (?, ?, ?)', 
			[deviceAddress, record.deviceName || deviceAddress, 'Automatisch erstellt am ' + formatDate(new Date(), 'dd.mm.yyyy hh:ii')]
		);
		device = { id: deviceResult.lastID };
		console.log(`Created device ID ${device.id} for address ${deviceAddress}`);
	}

	let time = record.izarTimestamp || record.telTimestamp || record.time || Date.now();
	if(time < 10000000000) time *= 1000;

	let delta = {};
	if(typeof record.data === 'object') {
		Object.entries(deltaColumns).forEach(async ([column, deltaColumn]) => {
			if(column in record.data && typeof record.data[column] === 'number') {
				// Find the last record's value for this column and device before current time
				const lastRecord = await db.getAsync(`
					SELECT 
						json_extract(data, '$.data.?') as value,
						time 
					FROM records 
					WHERE device = ? 
						AND json_extract(data, '$.data.?') IS NOT NULL
						AND time < datetime(?/1000, 'unixepoch')
					ORDER BY time DESC, id DESC 
					LIMIT 1
				`, [column, device.id, column, time]);

				if (lastRecord) {
					const lastTime = new Date(lastRecord.time).getTime();
					const timeDiffSeconds = (time - lastTime) / 1000;

					if (timeDiffSeconds > 0) {
						const valueDiff = record.data[column] - lastRecord.value;
						delta[deltaColumn] = valueDiff / timeDiffSeconds;
					}
				}
			}
		});
	}

	const result = await db.runAsync(
		"INSERT INTO records (device, source, time, data, delta) VALUES (?, ?, datetime(?/1000, 'unixepoch'), ?, ?)",
		[device.id, sourceId, time, recordJson, JSON.stringify(delta)]
	);

	// Check for future records that need their delta updated
	if(typeof record.data === 'object') {
		Object.entries(deltaColumns).forEach(async ([column, deltaColumn]) => {
			if(column in record.data && typeof record.data[column] === 'number') {
				// Find the next record after this one for the same device and column
				const nextRecord = await db.getAsync(`
					SELECT 
						id,
						json_extract(data, '$.data.?') as value,
						time,
						delta
					FROM records 
					WHERE device = ? 
						AND json_extract(data, '$.data.?') IS NOT NULL
						AND time > datetime(?/1000, 'unixepoch')
					ORDER BY time ASC, id ASC
					LIMIT 1
				`, [column, device.id, column, time]);

				if (nextRecord) {
					const nextTime = new Date(nextRecord.time).getTime();
					const timeDiffSeconds = (nextTime - time) / 1000;

					if (timeDiffSeconds > 0) {
						const valueDiff = nextRecord.value - record.data[column];
						
						// Parse existing delta JSON
						let deltaJson = {};
						try {
							deltaJson = JSON.parse(nextRecord.delta);
						} catch(e) { }
						
						// Update the delta value
						deltaJson[deltaColumns] = valueDiff / timeDiffSeconds;
						
						// Update the record
						await db.runAsync(
							"UPDATE records SET delta = ? WHERE id = ?",
							[JSON.stringify(deltaJson), nextRecord.id]
						);

						console.log(`Updated delta for record ID ${nextRecord.id} to ${deltaJson[column]}`);
					}
				}
			}
		});
	}
	
	console.log(`Created record ID ${result.lastID} from source ID ${sourceId} for device ${deviceAddress}`);
	return result;
}



// Get processed records
export async function getRecords(db, limit = 100, offset = 0) {
	try {
		// Get total count first
		const countResult = await db.getAsync(`
			SELECT COUNT(*) as total
			FROM records r
			JOIN sources s ON r.source = s.id
		`);
		
		// Get paginated records
		const records = await db.allAsync(`
			SELECT r.id, r.device, r.source, r.time, r.data, r.delta, d.name as deviceName, s.filename as sourceFilename, s.type as sourceType
			FROM records r
			JOIN devices d ON r.device = d.id
			JOIN sources s ON r.source = s.id
			ORDER BY r.time DESC, r.id DESC
			LIMIT ? OFFSET ?
		`, [limit, offset]);
		
		return {
			records: records.map(record => ({
				...record,
				data: JSON.parse(record.data),
				delta: JSON.parse(record.delta)
			})),
			total: countResult.total
		};
	} catch (err) {
		console.error(`Database error: ${err.message}`);
		throw err;
	}
}

export async function getRecord(db, id) {
	try {
		const record = await db.getAsync(`
			SELECT r.id, r.source, r.time, r.data, s.filename as sourceFilename, s.type as sourceType
			FROM records r
			JOIN sources s ON r.source = s.id
			WHERE r.id = ?
		`, [id]);

		if (!record) return null;

		return {
			...record,
			data: JSON.parse(record.data)
		};
	} catch (err) {
		console.error(`Database error: ${err.message}`);
		throw err;
	}
}


// Get all devices
export async function getDevices(db, limit = 100, offset = 0) {
	try {
		// Get total count first
		const countResult = await db.getAsync(`
			SELECT COUNT(*) as total
			FROM devices
		`);
		
		// Get paginated devices
		const devices = await db.allAsync(`
			SELECT d.*, COUNT(r.id) as recordCount
			FROM devices d
			LEFT JOIN records r ON d.id = r.device
			GROUP BY d.id
			ORDER BY d.id DESC
			LIMIT ? OFFSET ?
		`, [limit, offset]);
		
		return {
			devices,
			total: countResult.total
		};
	} catch (err) {
		console.error(`Database error: ${err.message}`);
		throw err;
	}
}

// Get a single device by ID
export async function getDevice(db, id) {
	try {
		const device = await db.getAsync(`
			SELECT d.*, COUNT(r.id) as recordCount
			FROM devices d
			LEFT JOIN records r ON d.id = r.device
			WHERE d.id = ?
			GROUP BY d.id
		`, [id]);
		
		if (!device) return null;
		
		// Get the most recent records for this device
		const records = await db.allAsync(`
			SELECT r.id, r.device, r.source, r.time, r.data, s.filename as sourceFilename, s.type as sourceType
			FROM records r
			JOIN sources s ON r.source = s.id
			WHERE r.device = ?
			ORDER BY r.time DESC, r.id DESC
			LIMIT 10
		`, [id]);
		
		device.recentRecords = records.map(record => ({
			...record,
			data: JSON.parse(record.data)
		}));
		
		return device;
	} catch (err) {
		console.error(`Database error: ${err.message}`);
		throw err;
	}
}

// Get all sources
export async function getSources(db, limit = 100, offset = 0) {
	try {
		// Get total count first
		const countResult = await db.getAsync(`
			SELECT COUNT(*) as total
			FROM sources
		`);
		
		// Get paginated sources
		const sources = await db.allAsync(`
			SELECT s.*, COUNT(r.id) as recordCount
			FROM sources s
			LEFT JOIN records r ON s.id = r.source
			GROUP BY s.id
			ORDER BY s.created_at DESC
			LIMIT ? OFFSET ?
		`, [limit, offset]);
		
		return {
			sources,
			total: countResult.total
		};
	} catch (err) {
		console.error(`Database error: ${err.message}`);
		throw err;
	}
}

// Get a single source by ID
export async function getSource(db, id) {
	try {
		const source = await db.getAsync(`
			SELECT s.*, COUNT(r.id) as recordCount
			FROM sources s
			LEFT JOIN records r ON s.id = r.source
			WHERE s.id = ?
			GROUP BY s.id
		`, [id]);
		
		if (!source) return null;
		
		// Get all records for this source
		const records = await db.allAsync(`
			SELECT r.id, r.device, r.source, r.time, r.data, d.name as deviceName
			FROM records r
			JOIN devices d ON r.device = d.id
			WHERE r.source = ?
			ORDER BY r.time DESC, r.id DESC
		`, [id]);
		
		source.records = records.map(record => ({
			...record,
			data: JSON.parse(record.data)
		}));
		
		return source;
	} catch (err) {
		console.error(`Database error: ${err.message}`);
		throw err;
	}
}
