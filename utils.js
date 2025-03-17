import { defaultLocale, multipliedColumns, columnFractionDigits, colPreDelta, colPreData, deltaColumns } from './settings.js';

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
	);
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
