import Fastify from 'fastify';
import FastifyStatic from '@fastify/static';
import FastifyView from '@fastify/view';
import FastifyFormbody from '@fastify/formbody';
import path from 'path';
import { fileURLToPath } from 'url';
import { getRecord, getRecords, getDevices, getDevice, getSources, getSource } from './db.js';
import { 
	webserver, 
	defaultLocale, 
	defaultUiDateFormat, 
	defaultUiDateFormatList,
	colPreRecord,
	colPreData,
	colPreDelta,
	colPreCustom,
	colPreDevice,
	colPreSource,
	recordColumns,
	defaultDeselectedColumns, 
	deltaColumns,
	multipliedColumns,
	filterOperators,
} from './settings.js';
import { columnCaption, operatorCaption } from './translations-german.js';
import { formatDate, formatDateRelative, formatNumber } from './utils.js';
import ejs from 'ejs';

// Convert ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Fastify instance
const fastify = Fastify({
	logger: true
});

// Register plugins
fastify.register(FastifyFormbody);
fastify.register(FastifyStatic, {
	root: path.join(__dirname, 'public'),
	prefix: '/public/'
});

fastify.register(FastifyView, {
	engine: {
		ejs
	},
	root: path.join(__dirname, 'views'),
	defaultContext: {
		// Global template variables
		title: 'IZARchiv',
		path: '/',
		bodyclass: '',
		formatDate,
		formatDateRelative,
		formatNumber,
		defaultUiDateFormat,
		defaultUiDateFormatList,
		defaultLocale,
		colPreRecord,
		colPreData,
		colPreDelta,
		colPreCustom,
		colPreDevice,
		colPreSource,
		deltaColumns,
		multipliedColumns,
		filterOperators,
		columnCaption,
		operatorCaption,
	},
	layout: './layout',
	viewExt: 'ejs'
});

let db;

/* dashboard routes */
fastify.get('/', async (request, reply) => {
	const { records, total } = await getRecords(db, 10);
	return reply.view('dashboard', {
		records,
		total,
		path: '/',
		bodyclass: 'detail'
	});
});

/* devices routes */
fastify.get('/devices', async (request, reply) => {
	const page = parseInt(request.query.page) || 1;
	const limit = parseInt(request.query.limit) || 100;
	const offset = (page - 1) * limit;
	
	const { devices, total } = await getDevices(db, limit, offset);
	const totalPages = Math.ceil(total / limit);
	
	return reply.view('devices-listpage', { 
		devices,
		pagination: {
			currentPage: page,
			totalPages,
			limit,
			total
		},
		path: '/devices',
		bodyclass: 'list',
	});
});

fastify.get('/device/:id', async (request, reply) => {
	const { id } = request.params;
	const device = await getDevice(db, id);
	if (!device) {
		return reply.code(404).send({ error: 'Device not found' });
	}
	return reply.view('device-detailpage', {
		device,
		path: '/devices',
		backlink: request.headers.referer?.includes('/devices') ? request.headers.referer : '/devices',
		bodyclass: 'detail',
	});
});

/* sources routes */
fastify.get('/sources', async (request, reply) => {
	const page = parseInt(request.query.page) || 1;
	const limit = parseInt(request.query.limit) || 100;
	const offset = (page - 1) * limit;
	
	const { sources, total } = await getSources(db, limit, offset);
	const totalPages = Math.ceil(total / limit);
	
	return reply.view('sources-listpage', { 
		sources,
		pagination: {
			currentPage: page,
			totalPages,
			limit,
			total
		},
		path: '/sources',
		bodyclass: 'list',
	});
});

fastify.get('/source/:id', async (request, reply) => {
	const { id } = request.params;
	const source = await getSource(db, id);
	if (!source) {
		return reply.code(404).send({ error: 'Source not found' });
	}
	return reply.view('source-detailpage', {
		source,
		path: '/sources',
		backlink: request.headers.referer?.includes('/sources') ? request.headers.referer : '/sources',
		bodyclass: 'detail',
	});
});


/* records routes */
fastify.get('/records', async (request, reply) => {
	const page = parseInt(request.query.page) || 1;
	const limit = parseInt(request.query.limit) || 100;
	const offset = (page - 1) * limit;
	
	/* Process filter parameters */
	const filters = [];
	if (request.query.filter_column && Array.isArray(request.query.filter_column)) {
		const columns = request.query.filter_column;
		const operators = request.query.filter_operator || [];
		const values = request.query.filter_value || [];
		
		for (let i = 0; i < columns.length; i++) {
			const column = columns[i];
			const operator = operators[i] || 'eq';
			const value = values[i];
			
			/* Only add filter if column and value are provided */
			if (column && value !== undefined && value !== '') {
				filters.push({
					column,
					operator,
					value
				});
			}
		}
	}
	
	/* Get records first to determine available columns */
	const { records, total } = await getRecords(db, limit, offset, filters);
	
	/* Collect all unique keys from data and delta fields with appropriate prefixes */
	const availDataColumns = new Set();
	const availDeltaColumns = new Set();
	const availCustomColumns = new Set();
	records.forEach(record => {
		record.dataColumnNames.forEach(key => availDataColumns.add(key));
		record.deltaColumnNames.forEach(key => availDeltaColumns.add(key));
		record.customColumnNames.forEach(key => availCustomColumns.add(key));
	});
	
	/* Base columns with record prefix plus data and delta field columns */
	let allColumns = [
		...recordColumns.map(col => colPreRecord + col),
		...Array.from(availDataColumns),
		...Array.from(availDeltaColumns)
	];
	for(let customColumn of availCustomColumns) { /* Insert custom columns after their source columns */
		allColumns.splice(allColumns.indexOf(multipliedColumns[customColumn][0]) + 1, 0, customColumn);
	}
	
	let selectedColumns = allColumns.filter(col => !defaultDeselectedColumns.includes(col));
	
	if (request.query.columns) {
		const columnsParam = request.query.columns;
		
		/* If starts with '-', remove specified columns from defaults */
		if (columnsParam.startsWith('-')) {
			const columnsToRemove = columnsParam.substring(1).split(',');
			selectedColumns = selectedColumns.filter(col => !columnsToRemove.includes(col));
		} else { /* Otherwise, use only the specified columns */
			selectedColumns = columnsParam.split(',').filter(col => allColumns.includes(col));
		}
	}
	
	const totalPages = Math.ceil(total / limit);
	
	return reply.view('records-listpage', { 
		records,
		pagination: {
			currentPage: page,
			totalPages,
			limit,
			total
		},
		columns: {
			all: allColumns,
			selected: selectedColumns,
			defaultDeselected: defaultDeselectedColumns,
		},
		filters,
		path: '/records',
		bodyclass: 'list',
	});
});

fastify.get('/record/:id', async (request, reply) => {
	const { id } = request.params;
	const record = await getRecord(db, id);
	if (!record) {
		return reply.code(404).send({ error: 'Record not found' });
	}
	
	return reply.view('record-detailpage', { 
		record, 
		path: '/records',
		backlink: request.headers.referer?.includes('/records') ? request.headers.referer : '/records',
		bodyclass: 'detail',
	});
});


/* Start the server */
export async function startWebServer(database) {
	/* Store database connection */
	db = database;
	
	/* Set server address and port from settings */
	await fastify.listen({ 
		port: webserver.port, 
		host: webserver.host 
	});
	
	console.log(`Web server running at ${fastify.server.address().address}:${fastify.server.address().port}`);
	return fastify;
} 