import sqlite3 from 'sqlite3';
import { parseIzarXml } from './mbus.js';

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
	
	// Initialize database tables with the new type column
	await db.runAsync(`
		CREATE TABLE IF NOT EXISTS sources (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			type TEXT NOT NULL,
			rdysent BOOLEAN DEFAULT 0,
			filename TEXT,
			data BLOB,
			uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`);

	await db.runAsync(`
		CREATE TABLE IF NOT EXISTS records (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			source INTEGER,
			time DATETIME DEFAULT CURRENT_TIMESTAMP,
			data JSON,
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
				AND uploaded_at > datetime('now', '-1 hour')
				ORDER BY uploaded_at DESC
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
				
				// Process the file directly - no need for a second query
				await processStoredFile(db, source);
				
				return result;
			} else {
				console.log(`No recent file found to mark as ready: ${origFilename}`);
				return { changes: 0 };
			}
		} else {
			// Check if a file with this name was uploaded in the last hour
			const existingSource = await db.getAsync(`
				SELECT id FROM sources
				WHERE filename = ?
				AND type = ?
				AND uploaded_at > datetime('now', '-1 hour')
				ORDER BY uploaded_at DESC
				LIMIT 1
			`, [filename, SOURCE_TYPE_IZAR_FTP]);
			
			let result;
			
			if (existingSource) {
				// Update the existing source
				result = await db.runAsync(
					"UPDATE sources SET data = ?, uploaded_at = CURRENT_TIMESTAMP WHERE id = ?", 
					[buffer, existingSource.id]
				);
				console.log(`Updated file: ${filename} in database (ID: ${existingSource.id}, ${buffer.length} bytes)`);
			} else {
				// Insert a new source with type
				result = await db.runAsync(
					"INSERT INTO sources (type, filename, data) VALUES (?, ?, ?)", 
					[SOURCE_TYPE_IZAR_FTP, filename, buffer]
				);
				console.log(`Stored new file: ${filename} in database (ID: ${result.lastID}, ${buffer.length} bytes)`);
			}
			
			return result;
		}
	} catch (err) {
		console.error(`Database error: ${err.message}`);
		throw err;
	}
}

// Process a file that has been marked as ready
async function processStoredFile(db, source) {
	try {
		// Convert the BLOB to a string
		const xmlContent = source.data.toString('utf8');
		
		// Parse the XML using the function from mbus.js
		const parsedData = parseIzarXml(xmlContent);
		
		if (parsedData && parsedData.records && parsedData.records.length > 0) {
			console.log(`Parsed ${parsedData.records.length} records from source ID ${source.id}`);
			
			// Store each record in the database
			for (const record of parsedData.records) {
				const recordJson = JSON.stringify(record);
				
				const result = await db.runAsync(
					"INSERT INTO records (source, data) VALUES (?, ?)",
					[source.id, recordJson]
				);
				
				console.log(`Created record ID ${result.lastID} from source ID ${source.id}`);
			}
			
			return { recordCount: parsedData.records.length };
		} else {
			console.warn(`No records found in source ID ${source.id}`);
			return { recordCount: 0 };
		}
	} catch (err) {
		console.error(`Error processing file: ${err.message}`);
		throw err;
	}
}

// Get files that are ready to be processed
export async function getReadyFiles(db) {
	try {
		const readyFiles = await db.allAsync(`
			SELECT id, type, filename, data 
			FROM sources 
			WHERE rdysent = 1
			AND type = ?
			ORDER BY uploaded_at DESC
		`, [SOURCE_TYPE_IZAR_FTP]);
		
		return readyFiles;
	} catch (err) {
		console.error(`Database error: ${err.message}`);
		throw err;
	}
}

// Get processed records
export async function getRecords(db, limit = 100) {
	try {
		const records = await db.allAsync(`
			SELECT r.id, r.source, r.time, r.data, s.filename, s.type
			FROM records r
			JOIN sources s ON r.source = s.id
			WHERE s.type = ?
			ORDER BY r.time DESC
			LIMIT ?
		`, [SOURCE_TYPE_IZAR_FTP, limit]);
		
		return records.map(record => ({
			...record,
			data: JSON.parse(record.data)
		}));
	} catch (err) {
		console.error(`Database error: ${err.message}`);
		throw err;
	}
}

// Get records with specific JSON field values
export async function getRecordsByField(db, fieldPath, value, limit = 100) {
	try {
		const records = await db.allAsync(`
			SELECT r.id, r.source, r.time, r.data, s.filename, s.type
			FROM records r
			JOIN sources s ON r.source = s.id
			WHERE s.type = ?
			AND json_extract(r.data, ?) = ?
			ORDER BY r.time DESC
			LIMIT ?
		`, [SOURCE_TYPE_IZAR_FTP, fieldPath, value, limit]);
		
		return records.map(record => ({
			...record,
			data: JSON.parse(record.data)
		}));
	} catch (err) {
		console.error(`Database error: ${err.message}`);
		throw err;
	}
} 