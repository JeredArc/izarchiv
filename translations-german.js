import { colPreRecord, colPreData, colPreDelta, colPreCustom } from './settings.js';

const columnTranslations = {
	[colPreRecord + 'time']: 'Zeit',
	[colPreRecord + 'deviceName']: 'Gerät',
	[colPreRecord + 'sourceName']: 'Quelle',
	[colPreRecord + 'data']: 'Werte',
	[colPreRecord + 'delta']: 'Delta'
};

export const columnCaption = (column) => {
	return columnTranslations[column] || column.substring(1).replace(/(?<=\[)l(?=\]|\/s\]|\/h\])/, 'ℓ');
}

// Translation dictionary for operators
const operatorTranslations = {
	'eq': 'Gleich',
	'lt': 'Kleiner als',
	'lte': 'Kleiner oder gleich',
	'gt': 'Größer als',
	'gte': 'Größer oder gleich'
};

export const operatorCaption = (operator) => {
	return operatorTranslations[operator] || operator;
}
