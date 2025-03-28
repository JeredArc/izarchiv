/* Application settings */

import { formatDate } from './utils.js';

export const dbfile = "./database.db3";

/* Security isn't a concern here, as files/data can only be added via FTP, not modified or deleted. */
export const ftpconfig = {
	port: 21,
	user: "izar",
	pass: "IZAR.Center",
	pasv_min: 50000,
	pasv_max: 51000
};

/* Web server configuration */
export const webserver = {
	enabled: true,
	webserverPort: 3000, /* queried by "IZARchiv starten.vbs" */
	// host: '127.0.0.1',
	host: '0.0.0.0'
};

export const defaultLocale = "de-AT";
export const defaultUiDateFormat = "dd.mm.yyyy hh:ii:ss (rrr)";
export const defaultUiDateFormatList = "dd.mm.yyyy hh:ii";

export const mbusTimezoneOffset = 60; /* UTC + minutes */
export const mbusTelTimeHeader = "04-6D"; /* the header of which the value should be used as the telegram's timestamp */

export const saveUploadsInFilesystem = true;
export const uploadDirPath = "./uploads";

export const alwaysShowPagination = true;

/* Column prefix definitions for different record data sources */
export const colPreRecord = ".";  /* For direct record properties */
export const colPreData = ":";    /* For properties in the data object */
export const colPreDelta = "^";   /* For properties in the delta object */
export const colPreCustom = "=";  /* For custom columns (currently only multipliedColumns) */

export const colPreDevice = ">";  /* For device properties */
export const colPreSource = "<";  /* For source properties */

export const recordColumns = [
	'time', 'deviceName', 'sourceName', 'data', 'delta'
];

export const defaultDeselectedColumns = [
	colPreRecord + 'data',
	colPreRecord + 'delta',
	colPreData + 'izarTimestamp',
	colPreData + 'mbusTel',
	colPreData + 'mbusTel',
	colPreData + 'mbusCField',
	colPreData + 'mbusAField',
	colPreData + 'mbusCIField',
	colPreData + 'mbusId',
	colPreData + 'mbusManufacturer',
	colPreData + 'mbusMedium',
	colPreData + 'mbusStatus',
];

export const deltaColumns = { /* deltas are always calculated per second, only access to colPreData columns is possible */
	[colPreDelta + '∆ Volumen [l/s]']: colPreData + 'Volumen [l]',
};

export const columnLinks = {
	[colPreRecord + 'deviceName']: (record) => {
		return `/device/${record.deviceId}`;
	},
	[colPreRecord + 'sourceName']: (record) => {
		return `/source/${record.sourceId}`;
	}
};

export const multipliedColumns = { /* custom column => [source column, multiplier] */
	[colPreCustom + 'Volumens-Durchfluss [l/s]']:  [colPreData + 'Volumens-Durchfluss [l/h]', 1/3600],
	[colPreCustom + 'Volumens-Durchfluss [m³/h]']: [colPreData + 'Volumens-Durchfluss [l/h]', 1/1000],
	[colPreCustom + 'Volumen [m³]']:               [colPreData + 'Volumen [l]', 1/1000],
	[colPreCustom + '∆ Volumen [m³/h]']:           [colPreDelta + '∆ Volumen [l/s]', 1*3600/1000],
};

export const columnFormatters = { /* column => formatter function (value, record) or "timestamp" */
	[colPreRecord + 'time']: 'timestamp',
	[colPreRecord + 'data']: value => JSON.stringify(value),
	[colPreRecord + 'delta']: value => JSON.stringify(value),

	[colPreDevice + 'recordCount']: 'number',
	[colPreDevice + 'created_at']: 'timestamp',
	[colPreDevice + 'favorite_at']: value => value ? '♥' : '-',

	[colPreSource + 'recordCount']: 'number',
	[colPreSource + 'created_at']: 'timestamp',
	[colPreSource + 'rdysent']: value => value === 1 ? '✓' : value === 0 ? '✗' : '-',
	[colPreSource + 'deviceIds']: value => value ? value.map(id => `#${id}`).join(', ') : '-',
}

export const columnFractionDigits = {
	[colPreCustom + 'Volumens-Durchfluss [l/s]']: 2,
	[colPreCustom + 'Volumens-Durchfluss [m³/h]']: 2,
	[colPreCustom + 'Volumen [m³]']: 3,
	[colPreCustom + '∆ Volumen [m³/h]']: 2,
};

export const filterOperators = [
	'eq',
	'ne',
	'contains',
	'not contains',
	'lt',
	'lte',
	'gt',
	'gte',
];

export const idColumns = [
	colPreRecord + 'id',
	colPreRecord + 'device',
	colPreRecord + 'source',
	colPreDevice + 'id',
	colPreSource + 'id',
];

export const slimColumns = [
	colPreRecord + 'id',
	colPreDevice + 'id',
	colPreDevice + 'favorite_at',
	colPreSource + 'id',
];