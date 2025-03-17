import { colPreRecord, colPreData, colPreDelta, colPreCustom, columnFormatters, columnLinks, multipliedColumns } from './settings.js';
import { formatNumber } from './utils.js';

export class Record {
	id = null;
	deviceId = null;
	sourceId = null;
	time = null;
	data = null;
	delta = null;
	deviceName = null;
	deviceOverviewColumns = null;
	sourceName = null;

	get hasDataColumns() {
		return Object.keys(this.data).length > 0;
	}
	get hasDeltaColumns() {
		return Object.keys(this.delta).length > 0;
	}
	get hasCustomColumns() {
		return Object.keys(this.customColumns).length > 0;
	}
	get dataColumnNames() {
		return Object.keys(this.data).map(key => colPreData + key);
	}
	get deltaColumnNames() {
		return Object.keys(this.delta).map(key => colPreDelta + key);
	}
	get customColumnNames() {
		return Object.keys(this.customColumns).map(key => key);
	}


	customColumns = {};

	constructor(record) {
		this.id = record.id;
		this.deviceId = record.device;
		this.sourceId = record.source;
		this.time = new Date(typeof record.time === 'string' ? record.time + 'Z' : record.time);
		try {
			this.data = typeof record.data === 'string' ? JSON.parse(record.data) : record.data;
		} catch(e) { }
		try {
			this.delta = typeof record.delta === 'string' ? JSON.parse(record.delta) : record.delta;
		} catch(e) { }
		this.deviceName = record.deviceName;
		try {
			this.deviceOverviewColumns = typeof record.deviceOverviewColumns === 'string' ? JSON.parse(record.deviceOverviewColumns) : record.deviceOverviewColumns;
		} catch(e) { }
		this.sourceName = record.sourceName;
		if(!this.data || typeof this.data !== 'object') this.data = {};
		if(!this.delta || typeof this.delta !== 'object') this.delta = {};
		if(!this.deviceOverviewColumns || !Array.isArray(this.deviceOverviewColumns)) this.deviceOverviewColumns = [];

		for(const [customColumn, [sourceColumn, multiplier]] of Object.entries(multipliedColumns).reverse()) {
			let value = this.columnValue(sourceColumn);
			if(value !== undefined) this.customColumns[customColumn] = !isNaN(value) ? value * multiplier : undefined;
		}
	}
	
	columnValue(column) {
		/* Use the prefix to determine where to get the value from */
		const prefix = column.charAt(0);
		const fieldName = column.substring(1);
		if (prefix === colPreRecord) { /* Direct record property */
			return this[fieldName];
		} else if (prefix === colPreData && this.data[fieldName]) { /* Data object property */
			return this.data[fieldName];
		} else if (prefix === colPreDelta && this.delta[fieldName]) { /* Delta object property */
			return this.delta[fieldName].value;
		} else if (prefix === colPreCustom && this.customColumns[column]) { /* Custom column */
			return this.customColumns[column];
		} else {
			return undefined;
		}
	}
	columnLink(column) {
		const prefix = column.charAt(0);
		const fieldName = column.substring(1);
		if(columnLinks[column]) return columnLinks[column](this);
		if(prefix === colPreDelta && this.delta[fieldName]?.prevId) return `/record/${this.delta[fieldName].prevId}`;
		return undefined;
	}
	columnOutput(column) {
		let raw = this.columnValue(column);
		let value = raw;
		if(column in columnFormatters) value = columnFormatters[column](value, this);
		let link = this.columnLink(column);
		let classes = [];
		if(typeof value === 'number') {
			classes.push('number');
			value = formatNumber(value, column);
		} else if(typeof value === 'string' && value.length > 50) {
			classes.push('long-text');
		} else if(typeof value === 'object' && value !== null) {
			classes.push('long-text');
			value = JSON.stringify(value);
		} else if(value === undefined) {
			classes.push('unknown');
			value = '-';
		}
		return { value, link, classes, raw };
	}
}