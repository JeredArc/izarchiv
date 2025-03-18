import { colPreRecord, colPreData, colPreDelta, colPreCustom, colPreDevice, colPreSource } from './settings.js';

const columnTranslations = {
	[colPreRecord + 'time']: 'Zeit',
	[colPreRecord + 'deviceName']: 'Gerät',
	[colPreRecord + 'sourceName']: 'Quelle',
	[colPreRecord + 'data']: 'Rohdaten',
	[colPreRecord + 'delta']: 'Delta',

	[colPreData + 'warnings']: 'Telegramm-Warnungen',

	[colPreDevice + 'address']: 'Geräteadresse',
	[colPreDevice + 'name']: 'Gerätename',
	[colPreDevice + 'description']: 'Beschreibung',
	[colPreDevice + 'recordCount']: 'Anzahl Messwerte',
	[colPreDevice + 'created_at']: 'Erstellt am',
	[colPreDevice + 'overview_columns']: 'Spalten für Messwert-Übersicht',
	
	[colPreSource + 'created_at']: 'Erstellt am',
	[colPreSource + 'type']: 'Typ',
	[colPreSource + 'filename']: 'Dateiname',
	[colPreSource + 'rdysent']: 'Als fertig (rdy) markiert',
	[colPreSource + 'recordCount']: 'Anzahl Messwerte',
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
