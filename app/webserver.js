import Fastify from 'fastify';
import FastifyStatic from '@fastify/static';
import FastifyView from '@fastify/view';
import FastifyFormbody from '@fastify/formbody';
import path from 'path';
import { fileURLToPath } from 'url';
import { getRecord, getRecords, getDevices, getDevice, getSources, getSource, getFavoriteDevices } from './db.js';
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
	alwaysShowPagination,
	idColumns,
} from './settings.js';
import { columnCaption, operatorCaption } from './translations-german.js';
import { formatDate, formatDateRelative, formatNumber } from './utils.js';
import { Filter } from './filter.js';
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
		alwaysShowPagination,
		idColumns,
		izarchivVersion: process.env.npm_package_version,
	},
	layout: './layout',
	viewExt: 'ejs'
});

/* version route */
fastify.get('/izarchiv-version', async (request, reply) => {
	return reply
		.header('Content-Type', 'text/plain')
		.send(`IZARchiv ${process.env.npm_package_version}`);
});


let db;

/* dashboard routes */
fastify.get('/', async (request, reply) => {
	const { records, total, fullTotal } = await getRecords(db, 10, 0, [], true);
	const favoriteDevices = await getFavoriteDevices(db);
	return reply.view('dashboard', {
		recentRecords: records,
		total,
		fullTotal,
		favoriteDevices,
		path: '/',
		bodyclass: 'detail',
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
		backlink: request.headers.referer?.startsWith?.(`http://${request.headers.host}/devices`) ? request.headers.referer : '/devices',
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
		backlink: request.headers.referer?.startsWith?.(`http://${request.headers.host}/sources`) ? request.headers.referer : '/sources',
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
	if ("filter_column" in request.query && "filter_operator" in request.query && "filter_value" in request.query) {
		const columns = [request.query["filter_column"]].flat();
		const operators = [request.query["filter_operator"]].flat();
		const values = [request.query["filter_value"]].flat();
		
		for (let i = 0; i < columns.length; i++) {
			const column = columns[i];
			const operator = operators[i];
			const value = values[i];

			/* Only add filter if column and value are provided */
			if (column && value !== undefined) {
				filters.push(new Filter(column, operator, value));
			}
		}
	}
	
	/* Get records first to determine available columns. filters might get modified, removing invalid filters */
	const { records, total, fullTotal } = await getRecords(db, limit, offset, filters);
	
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
	for(let f of filters) if(!allColumns.includes(f.column)) allColumns.push(f.column);

	let defaultSelectedColumns = allColumns.filter(col => !defaultDeselectedColumns.includes(col));
	let selectedColumns = [...defaultSelectedColumns];

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

	let columnQueryParam = '';
	let selCols = [];
	let deselCols = [];
	let includesDefaultDeselected = false;
	for(let col of allColumns) {
		let sel = selectedColumns.includes(col);
		let defDesel = defaultDeselectedColumns.includes(col);
		if(defDesel && !sel) continue;
		if(defDesel) includesDefaultDeselected = true;
		(sel ? selCols : deselCols).push(col);
	}
	if(!includesDefaultDeselected && deselCols.length === 0) {
		columnQueryParam = '';
	} else if(!includesDefaultDeselected && deselCols.length < selCols.length) {
		columnQueryParam = '&columns=-' + deselCols.map(col => encodeURIComponent(col)).join(',');
	} else {
		columnQueryParam = '&columns=' + selCols.map(col => encodeURIComponent(col)).join(',');
	}

	let filterQueryParam = filters.map(filter => filter.getQueryParam()).join('');

	const totalPages = Math.ceil(total / limit);
	
	return reply.view('records-listpage', { 
		records,
		pagination: {
			currentPage: page,
			totalPages,
			limit,
			total,
			fullTotal,
		},
		columns: {
			all: allColumns,
			selected: selectedColumns,
			defaultSelected: defaultSelectedColumns,
			defaultDeselected: defaultDeselectedColumns,
		},
		columnQueryParam,
		filterQueryParam,
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
		backlink: request.headers.referer?.startsWith?.(`http://${request.headers.host}/records`) ? request.headers.referer : '/records',
		bodyclass: 'detail',
		request,
	});
});


/* Start the server */
export async function startWebServer(database) {
	/* Store database connection */
	db = database;
	
	/* Set server address and port from settings */
	await fastify.listen({ 
		port: webserver.webserverPort, 
		host: webserver.host 
	});
	
	console.log(`Web server running at http://${fastify.server.address().address}:${fastify.server.address().port}`);
	return fastify;
} 