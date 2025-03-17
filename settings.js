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
	port: 3000,
	host: '127.0.0.1'
};

export const defaultLocale = "de-AT";
export const defaultUiDateFormat = "dd.mm.yyyy hh:ii:ss";

export const mbusTimezoneOffset = 60; /* UTC + minutes */
export const mbusTelTimeHeader = "04-6D"; /* the header of which the value should be used as the telegram's timestamp */

export const saveUploadsInFilesystem = true;
export const uploadDirPath = "./uploads";

/* Column prefix definitions for different data sources */
export const colPreRecord = ".";  /* For direct record properties */
export const colPreData = ":";    /* For properties in the data object */
export const colPreDelta = "^";   /* For properties in the delta object */
export const colPreCustom = "=";  /* For custom columns (currently only multipliedColumns) */

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

export const columnFormatters = { /* column => formatter function (value, record) */
	[colPreRecord + 'time']: value => formatDate(value, defaultUiDateFormat),
	[colPreRecord + 'data']: value => JSON.stringify(value),
	[colPreRecord + 'delta']: value => JSON.stringify(value),
}

export const columnFractionDigits = {
	[colPreCustom + 'Volumens-Durchfluss [l/s]']: 2,
	[colPreCustom + 'Volumens-Durchfluss [m³/h]']: 2,
	[colPreCustom + 'Volumen [m³]']: 3,
	[colPreCustom + '∆ Volumen [m³/h]']: 2,
};

export const filterOperators = [
	'eq',
	'lt',
	'lte',
	'gt',
	'gte'
];
