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

export const defaultLocale = "de-AT";
export const defaultUiDateFormat = "dd.mm.yyyy hh:ii:ss";

export const mbusTimezoneOffset = 60; /* UTC + minutes */
export const mbusTelTimeHeader = "04-6D"; /* the value of which header should be used as the timestamp */

export const saveUploadsInFilesystem = true;
export const uploadDirPath = "./uploads";


export const defaultDeselectedColumns = ['data'];
export const customColumnAdders = [
	(columns) => {
		if(columns.includes('Volumens-Durchfluss [l/h]')) columns.push('Volumens-Durchfluss [m³/h]');
		if(columns.includes('Volumen [l]')) columns.push('Volumen [m³]');
		return columns;
	}
];
export const columnLinks = {
	'device': (record) => {
		return `/device/${record.device}`;
	},
	'source': (record) => {
		return `/source/${record.source}`;
	}
};
export const columnGetters = {
	'time': (record) => {
		return formatDate(record.time, defaultUiDateFormat);
	},
	'device': (record) => {
		return record.deviceName;
	},
	'source': (record) => {
		return record.sourceFilename || record.sourceType || 'Unbekannt';
	},
	'data': (record) => {
		return JSON.stringify(record.data);
	},
	'delta': (record) => {
		return JSON.stringify(record.delta);
	},
	'Volumens-Durchfluss [m³/h]': (record) => {
		return record.data['Volumens-Durchfluss [l/h]'] / 1000 / 3600;
	},
	'Volumen [m³]': (record) => {
		return record.data['Volumen [l]'] / 1000;
	}
}
export const deltaColumns = {
	'Volumen [l]': '∆ Volumen [l]',
};

/* Web server configuration */
export const webserver = {
	enabled: true,
	port: 3000,
	host: '127.0.0.1'
};

