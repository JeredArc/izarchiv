import Fastify from 'fastify';
import FastifyStatic from '@fastify/static';
import FastifyView from '@fastify/view';
import FastifyFormbody from '@fastify/formbody';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, getRecords, getRecordsByField } from './db.js';

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
		ejs: await import('ejs')
	},
	root: path.join(__dirname, 'views'),
	viewExt: 'ejs'
});

// Initialize database connection
let db;

// Routes
fastify.get('/', async (request, reply) => {
	const records = await getRecords(db, 20);
	return reply.view('index', { records });
});

fastify.get('/records', async (request, reply) => {
	const limit = parseInt(request.query.limit) || 100;
	const records = await getRecords(db, limit);
	return reply.view('records', { records });
});

fastify.get('/records/:id', async (request, reply) => {
	const { id } = request.params;
	const records = await getRecordsByField(db, '$.id', id, 1);
	if (records.length === 0) {
		return reply.code(404).send({ error: 'Record not found' });
	}
	return reply.view('record-detail', { record: records[0] });
});

fastify.get('/api/records', async (request, reply) => {
	const limit = parseInt(request.query.limit) || 100;
	const records = await getRecords(db, limit);
	return { records };
});

fastify.get('/api/records/:id', async (request, reply) => {
	const { id } = request.params;
	const records = await getRecordsByField(db, '$.id', id, 1);
	if (records.length === 0) {
		return reply.code(404).send({ error: 'Record not found' });
	}
	return { record: records[0] };
});

// Start the server
export async function startWebServer(config) {
	// Initialize database
	db = await initDatabase(config.dbFile);
	
	// Set server address and port
	await fastify.listen({ 
		port: config.webPort || 3000, 
		host: config.webHost || '0.0.0.0' 
	});
	
	console.log(`Web server running at ${fastify.server.address().address}:${fastify.server.address().port}`);
	return fastify;
} 