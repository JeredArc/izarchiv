import { colPreSource, colPreDevice, colPreRecord, defaultUiDateFormat, defaultUiDateFormatList, columnFormatters } from './settings.js';
import { formatDate, formatDateRelative, formatNumber, applyColumnFormatter } from './utils.js';

export class Source {
	id = null;
	type = null;
	rdysent = null;
	filename = null;
	created_at = null;
	recordCount = 0;
	newestRecords = [];
	data = null;
	deviceIds = [];

	constructor(source) {
		this.id = source.id;
		this.type = source.type;
		this.rdysent = source.rdysent;
		this.filename = source.filename;
		this.created_at = new Date(typeof source.created_at === 'string' ? source.created_at + 'Z' : source.created_at);
		this.recordCount = source.recordCount || 0;
		this.newestRecords = source.newestRecords || [];
		this.data = source.data;
		try {
			this.deviceIds = typeof source.devices === 'string' ? JSON.parse(source.devices) : source.devices;
		} catch(e) { }
		if(!Array.isArray(this.deviceIds)) this.deviceIds = [];
	}

	columnValue(column) {
		const prefix = column.charAt(0);
		const fieldName = column.substring(1);
		if (prefix === colPreSource) { /* Direct source property */
			return this[fieldName];
		}
	}

	columnLink(column) {
		const prefix = column.charAt(0);
		const fieldName = column.substring(1);
		if (prefix === colPreSource) { /* Direct source property */
			if(fieldName === 'id') return `/source/${this.id}`;
			if(fieldName === 'recordCount') return `/records?filter_column=${colPreRecord}source&filter_operator=eq&filter_value=${this.id}`;
		}
	}

	columnOutput(column, isList=false) {
		let raw = this.columnValue(column);
		let value = raw;
		let classes = ['value'];
		let link = this.columnLink(column);
		value = applyColumnFormatter(column, value, isList, classes);
		return { value, link, classes, raw };
	}
} 