import { colPreDevice, colPreSource, colPreRecord, defaultUiDateFormat, defaultUiDateFormatList, columnFormatters } from './settings.js';
import { formatDate, formatDateRelative, formatNumber, applyColumnFormatter } from './utils.js';

export class Device {
	id = null;
	address = null;
	name = null;
	description = null;
	created_at = null;
	overview_columns = null;
	recordCount = 0;
	newestRecord = null;
	recentRecord = null;
	newestRecords = [];
	favorite_at = null;

	constructor(device) {
		this.id = device.id;
		this.address = device.address;
		this.name = device.name;
		this.description = device.description;
		this.created_at = new Date(typeof device.created_at === 'string' ? device.created_at + 'Z' : device.created_at);
		try {
			this.overview_columns = typeof device.overview_columns === 'string' ? JSON.parse(device.overview_columns) : device.overview_columns;
		} catch(e) { }
		this.recordCount = device.recordCount || 0;
		this.newestRecord = device.newestRecord;
		this.recentRecord = device.recentRecord;
		this.newestRecords = device.newestRecords || [];
		this.favorite_at = device.favorite_at;
		if(!this.overview_columns || !Array.isArray(this.overview_columns)) this.overview_columns = [];
	}

	columnValue(column) {
		const prefix = column.charAt(0);
		const fieldName = column.substring(1);
		if (prefix === colPreDevice) { /* Direct device property */
			if(fieldName === 'newestRecord') return this.newestRecord?.id;
			if(fieldName === 'recentRecord') return this.recentRecord?.id;
			return this[fieldName];
		}
	}

	columnLink(column) {
		const prefix = column.charAt(0);
		const fieldName = column.substring(1);
		if (prefix === colPreDevice) { /* Direct device property */
			if(fieldName === 'id') return `/device/${this.id}`;
			if(fieldName === 'recordCount') return `/records?filter_column=${colPreRecord}device&filter_operator=eq&filter_value=${this.id}`;
			if(fieldName === 'newestRecord') return `/record/${this.newestRecord.id}`;
			if(fieldName === 'recentRecord') return `/record/${this.recentRecord.id}`;
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
