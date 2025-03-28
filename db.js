import sqlite3 from 'sqlite3';
import { parseIzarXml } from './mbus.js';
import { formatDate, tryParseJson } from './utils.js';
import { colPreRecord, colPreData, colPreDelta, deltaColumns, colPreCustom } from './settings.js';
import { Record } from './record.js';
import { Device } from './device.js';
import { Source } from './source.js';
const Sqlite3 = sqlite3.verbose();

const RDY_ORIGINAL_EXTENSION = ".xml";
const SOURCE_TYPE_FTP_IZARXML = "FTP: IZAR-XML";

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

function escapeJsonPath(...parts) {
	/* escaping within quotes is not implemented in sqlite, which doesn't allow keys with both dot/opening-bracket AND doube-quote in it */
	return "'$." + parts.map(p => p.includes(".") || p.includes("[") ? '"' + p.replace(/["']/g, '') + '"' : p.replace(/'/g, '')).join(".") + "'";
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
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			overview_columns JSON,
			favorite_at DATETIME DEFAULT NULL
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
			rdysent BOOLEAN DEFAULT NULL,
			filename TEXT,
			data BLOB,
			devices JSON,
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

	/* temporary defaults (TODO: remove when implemented) */
	await db.runAsync(`
		UPDATE devices
		SET overview_columns='[":Volumen [l]","^∆ Volumen [l/s]","=Volumens-Durchfluss [l/s]"]'
		WHERE address='75454808';
	`);

	await db.runAsync(`
		UPDATE devices
		SET favorite_at=CURRENT_TIMESTAMP
		WHERE address='75454808' AND favorite_at IS NULL;
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
				SELECT id FROM sources
				WHERE filename = ?
				AND type = ?
				AND created_at > datetime('now', '-1 hour')
				ORDER BY created_at DESC
				LIMIT 1
			`, [origFilename, SOURCE_TYPE_FTP_IZARXML]);
			
			if (source) {
				// Update the existing source
				const result = await db.runAsync(`
					UPDATE sources
					SET rdysent = 1
					WHERE id = ?
				`, [source.id]);
				
				console.log(`Marked source #${source.id} (${origFilename}) as ready`);
				
				return result;
			} else {
				console.log(`No recent file found to mark as ready: ${origFilename}`);
				return { changes: 0 };
			}
		} else {
			// Always insert a new source for non-rdy files
			const result = await db.runAsync(
				"INSERT INTO sources (type, filename, data, rdysent) VALUES (?, ?, ?, ?)", 
				[SOURCE_TYPE_FTP_IZARXML, filename, buffer, 0]
			);
			console.log(`Stored new file ${filename} in database as #${result.lastID} (${buffer.length} bytes)`);

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
		const recordIds = [];
		const deviceIds = new Set();
		
		if (parsedData?.records?.length > 0) {
			// Store each record in the database
			for (const record of parsedData.records) {
				const recordJson = JSON.stringify(record);
				let { recordId, deviceId } = await insertRecord(db, sourceId, recordJson);
				recordIds.push(recordId);
				deviceIds.add(deviceId);
			}

			console.log(`Successfully processed ${parsedData.records.length} records from source #${sourceId}`);
		}
		else {
			console.warn(`No records found in source ID ${sourceId}`);
		}
		if (parsedData?.errors?.length > 0) {
			console.warn(`Errors found in source ID ${sourceId}:\n${parsedData.errors.map(e => e.error).join("\n")}`);
		}

		if(deviceIds.size > 0) {
			await db.runAsync(`
				UPDATE sources SET devices = ? WHERE id = 	?
			`, [JSON.stringify(Array.from(deviceIds)), sourceId]);
		}
	} catch (err) {
		console.error(`Error processing file: ${err.message}`);
		throw err;
	}
}

// Insert a single record into the database
async function insertRecord(db, sourceId, recordJson) {
	// Extract device address from the record data
	const recordData = JSON.parse(recordJson);
	const deviceAddress = recordData.device || recordData.mbusId || '';  // Use empty string for unknown device
	
	// Check if the device exists in the devices table
	let device = await db.getAsync('SELECT id FROM devices WHERE address = ?', [deviceAddress]);
	if (!device) {
		// Insert the device if it doesn't exist
		const deviceResult = await db.runAsync('INSERT INTO devices (address, name, description) VALUES (?, ?, ?)', 
			[deviceAddress, recordData.deviceName || deviceAddress, 'Automatisch erstellt am ' + formatDate(new Date(), 'dd.mm.yyyy hh:ii')]
		);
		device = { id: deviceResult.lastID };
		console.log(`Created device #${device.id} for address ${deviceAddress}`);
	}

	let time = recordData.izarTimestamp || recordData.telTimestamp || recordData.time || Date.now();
	if(time < 10000000000) time *= 1000;

	let delta = {};
	for (let [deltaColumn, sourceColumn] of Object.entries(deltaColumns)) {
		let deltaKey = deltaColumn.substring(1);
		let sourceKey = sourceColumn.substring(1);
		if(sourceKey in recordData && typeof recordData[sourceKey] === 'number') {
			/* Find the last record's value for this column and device before current time */
			const lastRecord = await db.getAsync(`
				SELECT 
					id,
					time, 
					json_extract(data, ${escapeJsonPath(sourceKey)}) as value
				FROM records 
				WHERE device = ? 
					AND json_extract(data, ${escapeJsonPath(sourceKey)}) IS NOT NULL
					AND time < datetime(?/1000, 'unixepoch')
				ORDER BY time DESC, id DESC 
				LIMIT 1
			`, [device.id, time]);

			if (lastRecord) {
				const lastTime = new Date(lastRecord.time + 'Z').getTime();
				const timeDiffSeconds = (time - lastTime) / 1000;

				if (timeDiffSeconds > 0) {
					const valueDiff = recordData[sourceKey] - lastRecord.value;
					// Calculate the rate of change per second
					const ratePerSecond = valueDiff / timeDiffSeconds;
					
					// Store the rate per second directly without any additional calculations
					delta[deltaKey] = {
						value: ratePerSecond,
						prevId: lastRecord.id,
						timeDiff: timeDiffSeconds,
						valueDiff: valueDiff
					};
				}
			}
		}
	}

	const result = await db.runAsync(
		"INSERT INTO records (device, source, time, data, delta) VALUES (?, ?, datetime(?/1000, 'unixepoch'), ?, ?)",
		[device.id, sourceId, time, recordJson, JSON.stringify(delta)]
	);

	/* Check for future records that need their delta updated */
	for(let [deltaColumn, sourceColumn] of Object.entries(deltaColumns)) {
		let deltaKey = deltaColumn.substring(1);
		let sourceKey = sourceColumn.substring(1);
		if(sourceKey in recordData && typeof recordData[sourceKey] === 'number') {
			/* Find the next record after this one for the same device and column */
			const nextRecord = await db.getAsync(`
				SELECT 
					id,
					time,
					json_extract(data, ${escapeJsonPath(sourceKey)}) as value,
					delta
				FROM records 
				WHERE device = ? 
					AND json_extract(data, ${escapeJsonPath(sourceKey)}) IS NOT NULL
					AND time > datetime(?/1000, 'unixepoch')
				ORDER BY time ASC, id ASC
				LIMIT 1
			`, [device.id, time]);

			if (nextRecord) {
				const nextTime = new Date(nextRecord.time + 'Z').getTime();
				const timeDiffSeconds = (nextTime - time) / 1000;

				if (timeDiffSeconds > 0) {
					const valueDiff = nextRecord.value - recordData[sourceKey];
					const ratePerSecond = valueDiff / timeDiffSeconds;
					
					// Parse the existing delta JSON
					let nextDelta = {};
					try {
						nextDelta = JSON.parse(nextRecord.delta);
					} catch (e) {}
					
					// Update the delta value for this key
					nextDelta[deltaKey] = {
						value: ratePerSecond,
						prevId: result.lastID,
						timeDiff: timeDiffSeconds,
						valueDiff: valueDiff
					};
					
					// Update the record with the new delta
					await db.runAsync(
						"UPDATE records SET delta = ? WHERE id = ?",
						[JSON.stringify(nextDelta), nextRecord.id]
					);
					
					console.log(`Updated next record #${nextRecord.id} delta for ${deltaKey}: ${valueDiff} / ${timeDiffSeconds} = ${ratePerSecond}`);
				}
			}
		}
	}
	
	console.log(`Created record #${result.lastID} from source #${sourceId} for device ${deviceAddress}`);
	return { recordId: result.lastID, deviceId: device.id };
}


const SQL_OP_MAP = {
	'eq': '=',
	'ne': '!=',
	'contains': 'LIKE',
	'not contains': 'NOT LIKE',
	'lt': '<',
	'lte': '<=',
	'gt': '>',
	'gte': '>=',
};
const SQL_COLUMNS_MAP = {
	[colPreRecord + 'id']: 'r.id',
	[colPreRecord + 'device']: 'r.device',
	[colPreRecord + 'source']: 'r.source',
	[colPreRecord + 'time']: 'r.time',
	[colPreRecord + 'deviceName']: 'd.name',
	[colPreRecord + 'sourceName']: "COALESCE(s.filename, s.type, 'Unbekannt')",
	[colPreRecord + 'sourceFilename']: 's.filename',
	[colPreRecord + 'sourceType']: 's.type',
};

// Get processed records
export async function getRecords(db, limit = 100, offset = 0, filters = [], useRecentInsteadOfNewest = false) {
	try {
		let whereClause = '';
		let whereParams = [];
		
		// Build WHERE clause from filters
		if (filters && filters.length > 0) {
			const conditions = [];
			
			const removeFilters = [];
			for(let filter of filters) {
				const { column, operator, value } = filter;

				const sqlOp = SQL_OP_MAP[operator] || '=';
				
				const prefix = column.charAt(0);
				const fieldName = column.substring(1);

				let fieldQuery =
					(column in SQL_COLUMNS_MAP) ? SQL_COLUMNS_MAP[column] :
					(prefix === colPreData) ? `JSON_EXTRACT(r.data, ${escapeJsonPath(fieldName)})` : /* JSON fields in data */
					(prefix === colPreDelta) ? `JSON_EXTRACT(r.delta, ${escapeJsonPath(fieldName)})` : /* JSON fields in delta */
					null;

				if(fieldQuery) {
					if(operator === 'eq' && value === '' || operator === 'ne' && value !== '') {
						conditions.push(`(${fieldQuery} ${sqlOp} ? OR ${fieldQuery} IS NULL)`);
						whereParams.push(value);
					} else if(operator === 'ne' && value === '' || operator === 'eq' && value !== '') {
						conditions.push(`(${fieldQuery} ${sqlOp} ? AND ${fieldQuery} IS NOT NULL)`);
						whereParams.push(value);
					} else {
						conditions.push(`${fieldQuery} ${sqlOp} ?`);
						whereParams.push(sqlOp.includes('LIKE') ? `%${value.replaceAll(/\*/g, '%')}%` : value);
					}
				}
				else {
					removeFilters.push(filter);
				}
			}
			filters.splice(0, filters.length, ...filters.filter(f => !removeFilters.includes(f)));
			
			if (conditions.length > 0) {
				whereClause = `WHERE ${conditions.join(' AND ')}`;
			}
		}
		
		// Get total counts first
		const countResult = await db.getAsync(`
			SELECT COUNT(*) as total
			FROM records r
			JOIN sources s ON r.source = s.id
			JOIN devices d ON r.device = d.id
			${whereClause}
		`, whereParams);
		const fullCountResult = !whereClause ? countResult : await db.getAsync(`
			SELECT COUNT(*) as total
			FROM records r
		`);
		
		// Get paginated records
		const records = await db.allAsync(`
			SELECT r.id, r.device, r.source, r.time, r.data, r.delta, d.name as deviceName, d.overview_columns as deviceOverviewColumns, (COALESCE(s.filename, s.type, 'Unbekannt')) as sourceName
			FROM records r
			JOIN devices d ON r.device = d.id
			JOIN sources s ON r.source = s.id
			${whereClause}
			ORDER BY ${useRecentInsteadOfNewest ? 's.created_at DESC, ' : ''}r.time DESC, r.id DESC
			LIMIT ? OFFSET ?
		`, [...whereParams, limit, offset]);
		
		return {
			records: records.map(record => new Record(record)),
			total: countResult.total,
			fullTotal: fullCountResult.total,
		};
	} catch (err) {
		console.error(`Database error: ${err.message}`);
		throw err;
	}
}

export async function getRecord(db, id) {
	try {
		const record = await db.getAsync(`
			SELECT r.id, r.device, r.source, r.time, r.data, r.delta, d.name as deviceName, d.overview_columns as deviceOverviewColumns, (COALESCE(s.filename, s.type, 'Unbekannt')) as sourceName
			FROM records r
			JOIN devices d ON r.device = d.id
			JOIN sources s ON r.source = s.id
			WHERE r.id = ?
		`, [id]);

		if (!record) return null;

		let result = new Record(record);
		for(let [deltaKey, deltaInfo] of Object.entries(result.delta)) {
			if(deltaInfo.prevId) {
				const sourceKey = deltaColumns[colPreDelta + deltaKey].substring(1);
				const prevRecord = await db.getAsync(`
					SELECT
						id,
						time,
						json_extract(data, ${escapeJsonPath(sourceKey)}) as value
					FROM records r
					WHERE r.id = ?
				`, [deltaInfo.prevId]);
				if(!prevRecord) continue;
				deltaInfo.prevValue = prevRecord.value;
				deltaInfo.thisValue = result.data[sourceKey];
				deltaInfo.valueDiff = deltaInfo.thisValue - deltaInfo.prevValue;
				deltaInfo.prevTime = new Date(prevRecord.time + 'Z');
				deltaInfo.thisTime = result.time;
				deltaInfo.timeDiff = deltaInfo.thisTime.getTime() - deltaInfo.prevTime.getTime();
				deltaInfo.ratePerSec = deltaInfo.valueDiff / (deltaInfo.timeDiff / 1000);
			}
		}
		// Create and return a Record instance
		return result;
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
			devices: devices.map(device => new Device(device)),
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

		let result = new Device(device);
		
		// Get the newest and most recent records for this device
		const newestRecords = await db.allAsync(`
			SELECT r.id, r.device, r.source, r.time, r.data, r.delta, d.name as deviceName, d.overview_columns as deviceOverviewColumns, (COALESCE(s.filename, s.type, 'Unbekannt')) as sourceName
			FROM records r
			JOIN sources s ON r.source = s.id
			JOIN devices d ON r.device = d.id
			WHERE r.device = ?
			ORDER BY r.time DESC, r.id DESC
			LIMIT 10
		`, [id]);
		const recentRecord = await db.getAsync(`
			SELECT r.id, r.device, r.source, r.time, r.data, r.delta, d.name as deviceName, d.overview_columns as deviceOverviewColumns, (COALESCE(s.filename, s.type, 'Unbekannt')) as sourceName
			FROM records r
			JOIN sources s ON r.source = s.id
			JOIN devices d ON r.device = d.id
			WHERE r.device = ?
			ORDER BY s.created_at DESC, r.time DESC, r.id DESC
			LIMIT 1
		`, [id]);

		
		result.newestRecords = newestRecords.map(record => new Record(record));
		result.newestRecord = result.newestRecords[0] ?? null;
		result.recentRecord = recentRecord ? new Record(recentRecord) : null;
		return result;
	} catch (err) {
		console.error(`Database error: ${err.message}`);
		throw err;
	}
}

// Get all favorite devices with their newest record
export async function getFavoriteDevices(db) {
	try {
		const devices = await db.allAsync(`
			SELECT d.*, COUNT(r.id) as recordCount
			FROM devices d
			LEFT JOIN records r ON d.id = r.device
			WHERE d.favorite_at IS NOT NULL
			GROUP BY d.id
			ORDER BY d.favorite_at DESC
		`);
		
		// Create Device objects with the data
		const favoriteDevices = [];
		for (const device of devices) {
			const deviceObj = new Device(device);
			
			// Get the newest record for this device
			const newestRecord = await db.getAsync(`
				SELECT r.id, r.device, r.source, r.time, r.data, r.delta, d.name as deviceName, d.overview_columns as deviceOverviewColumns, (COALESCE(s.filename, s.type, 'Unbekannt')) as sourceName
				FROM records r
				JOIN sources s ON r.source = s.id
				JOIN devices d ON r.device = d.id
				WHERE r.device = ?
				ORDER BY r.time DESC, r.id DESC
				LIMIT 1
			`, [device.id]);
			
			if (newestRecord) {
				deviceObj.newestRecord = new Record(newestRecord);
			}
			
			favoriteDevices.push(deviceObj);
		}
		
		return favoriteDevices;
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
			SELECT s.id, s.type, s.rdysent, s.filename, s.created_at, s.devices, COUNT(r.id) as recordCount
			FROM sources s
			LEFT JOIN records r ON s.id = r.source
			GROUP BY s.id
			ORDER BY s.created_at DESC, s.id DESC
			LIMIT ? OFFSET ?
		`, [limit, offset]);
		
		return {
			sources: sources.map(source => new Source(source)),
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
		
		let result = new Source(source);
		
		// Get the most recent records for this source
		const newestRecords = await db.allAsync(`
			SELECT r.id, r.device, r.source, r.time, r.data, r.delta, d.name as deviceName, d.overview_columns as deviceOverviewColumns, (COALESCE(s.filename, s.type, 'Unbekannt')) as sourceName
			FROM records r
			JOIN sources s ON r.source = s.id
			JOIN devices d ON r.device = d.id
			WHERE r.source = ?
			ORDER BY r.time DESC, r.id DESC
			LIMIT 100
		`, [id]);
		
		result.newestRecords = newestRecords.map(record => new Record(record));
		return result;
	} catch (err) {
		console.error(`Database error: ${err.message}`);
		throw err;
	}
}
