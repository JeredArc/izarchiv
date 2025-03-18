import { defaultLocale, multipliedColumns, columnFractionDigits, colPreDelta, colPreData, deltaColumns, columnFormatters, defaultUiDateFormat, defaultUiDateFormatList } from './settings.js';

/**
 * Format a date according to the specified format
 * @param {Date} date - The date to format
 * @param {string} format - Format string where:
 *   yyyy: full year, mm: month (01-12), dd: day (01-31)
 *   hh: hours (00-23), ii: minutes (00-59), ss: seconds (00-59)
 *   Any other characters are preserved as-is
 * @returns {string} Formatted date string
 */
export function formatDate(date, format = 'yyyy-mm-dd hh:ii') {
	if(/^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$/.test(date)) date = new Date(date + 'Z');
	if(typeof date === 'string' || typeof date === 'number') date = new Date(date);
	let isEmpty = !(date instanceof Date);
	if(isEmpty) date = new Date(0);

	const tokens = {
		yyyy: date.getFullYear(),
		mm: String(date.getMonth() + 1).padStart(2, '0'),
		dd: String(date.getDate()).padStart(2, '0'),
		hh: String(date.getHours()).padStart(2, '0'),
		ii: String(date.getMinutes()).padStart(2, '0'),
		ss: String(date.getSeconds()).padStart(2, '0')
	};
	if(isEmpty) Object.keys(tokens).forEach(key => tokens[key] = '0'.repeat(key.length));

	return Object.entries(tokens).reduce(
		(result, [token, value]) => result.replace(token, value),
		format
	).replaceAll(/rrr/g, isEmpty ? "" : () => formatDateRelative(date));
}

export function formatDateRelative(date) {
	let now = new Date().getTime();
	date = new Date(date).getTime();
	let diffTime = Math.abs(now - date);
	let diffYears = (diffTime / (1000 * 60 * 60 * 24 * 365));
	let diffWeeks = (diffTime / (1000 * 60 * 60 * 24 * 7));
	let diffDays = (diffTime / (1000 * 60 * 60 * 24));
	let diffHours = (diffTime / (1000 * 60 * 60));
	let diffMinutes = (diffTime / (1000 * 60));
	let diffSeconds = (diffTime / 1000);
	let result = now < date ? 'in ' : 'vor ';

	if(diffYears >= 1) {
		diffYears = Math.floor(diffYears);
		diffWeeks = Math.round(diffWeeks - diffYears * 52);
		result += `${diffYears} ${diffYears === 1 ? 'Jahr' : 'Jahren'} ${diffWeeks} ${diffWeeks === 1 ? 'Woche' : 'Wochen'}`;
	} else if(diffWeeks >= 1) {
		diffWeeks = Math.floor(diffWeeks);
		diffDays = Math.round(diffDays - diffWeeks * 7);
		result += `${diffWeeks} ${diffWeeks === 1 ? 'Woche' : 'Wochen'} ${diffDays} ${diffDays === 1 ? 'Tag' : 'Tagen'}`;
	} else if(diffDays >= 1) {
		diffDays = Math.floor(diffDays);
		diffHours = Math.round(diffHours - diffDays * 24);
		result += `${diffDays} ${diffDays === 1 ? 'Tag' : 'Tagen'} ${diffHours} ${diffHours === 1 ? 'Stunde' : 'Stunden'}`;
	} else if(diffHours >= 1) {
		diffHours = Math.floor(diffHours);
		diffMinutes = Math.round(diffMinutes - diffHours * 60);
		result += `${diffHours} ${diffHours === 1 ? 'Stunde' : 'Stunden'} ${diffMinutes} ${diffMinutes === 1 ? 'Minute' : 'Minuten'}`;
	} else if(diffMinutes >= 1) {
		diffMinutes = Math.floor(diffMinutes);
		diffSeconds = Math.round(diffSeconds - diffMinutes * 60);
		result += `${diffMinutes} ${diffMinutes === 1 ? 'Minute' : 'Minuten'} ${diffSeconds} ${diffSeconds === 1 ? 'Sekunde' : 'Sekunden'}`;
	} else {
		diffSeconds = Math.floor(diffSeconds);
		result += `${diffSeconds} ${diffSeconds === 1 ? 'Sekunde' : 'Sekunden'}`;
	}
	return result;
}

export function formatNumber(number, column=undefined, fractionDigits=undefined) {
	if(typeof number !== 'number') return number;
	if(fractionDigits === undefined) {
		if(column in columnFractionDigits) {
			fractionDigits = columnFractionDigits[column];
		} else if(column in multipliedColumns) {
			fractionDigits = Math.round(Math.log10(1/multipliedColumns[column][1]));
		}
	}
	let str = number.toLocaleString(defaultLocale, fractionDigits != null ? {minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits} : undefined);
	str = str.replaceAll(/[  ]/g, ' '); /* U+202F Narrow No-Break Space */
	return str;
}

export function tryParseJson(string) {
	try {
		return JSON.parse(string);
	} catch(e) {
		console.error(`Error parsing JSON: ${e.message}`);
		return null;
	}
}

export function checkSettings() {
	let errors = [];
	if(Object.keys(deltaColumns).some(column => !column.startsWith(colPreDelta))) {
		errors.push(`deltaColumns keys must start with "${colPreDelta}"`);
	}
	if(Object.values(deltaColumns).some(column => !column.startsWith(colPreData))) {
		errors.push(`deltaColumns values must start with "${colPreData}"`);
	}
	if(errors.length > 0) {
		console.error("SETTINGS ERRORS:\n" + errors.join("\n"));
		return false;
	}
	return true;
}

export function applyColumnFormatter(column, value, isList=false, classes=[]) {
	if(column in columnFormatters) {
		let formatter = columnFormatters[column];
		if(typeof formatter === 'function') value = formatter(value, this);
		else if(formatter === 'string') { /* prevent from number formatting */
			value = String(value);
		}
		else if(formatter === 'number') {
			classes.push('number');
			value = formatNumber(parseFloat(value), column);
		}
		else if(formatter === 'timestamp') {
			classes.push('timestamp');
			value = formatDate(value, isList ? defaultUiDateFormatList : defaultUiDateFormat);
		}
		else console.error(`Unknown formatter for column ${column}: ${JSON.stringify(formatter)}`);
	}
	return value;
}