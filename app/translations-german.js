import { colPreRecord, colPreData, colPreDelta, colPreCustom, colPreDevice, colPreSource } from './settings.js';

const tableColumnTranslations = {
	[colPreRecord + 'id']: '#',
	[colPreDevice + 'id']: '#',
	[colPreDevice + 'favorite_at']: '♥',
	[colPreSource + 'id']: '#',
}

const columnTranslations = {
	[colPreRecord + 'id']: 'Messwert-ID',
	[colPreRecord + 'time']: 'Zeit',
	[colPreRecord + 'device']: 'Gerät-ID',
	[colPreRecord + 'deviceName']: 'Gerät',
	[colPreRecord + 'source']: 'Quelle-ID',
	[colPreRecord + 'sourceName']: 'Quelle',
	[colPreRecord + 'data']: 'Rohdaten',
	[colPreRecord + 'delta']: 'Delta',

	[colPreData + 'warnings']: 'Telegramm-Warnungen',

	[colPreDevice + 'address']: 'Geräteadresse',
	[colPreDevice + 'name']: 'Gerätename',
	[colPreDevice + 'description']: 'Beschreibung',
	[colPreDevice + 'recordCount']: 'Anzahl Messwerte',
	[colPreDevice + 'created_at']: 'Erstellt am',
	[colPreDevice + 'favorite_at']: 'Favorit',
	[colPreDevice + 'overview_columns']: 'Spalten für Messwert-Übersicht',
	
	[colPreSource + 'created_at']: 'Erstellt am',
	[colPreSource + 'type']: 'Typ',
	[colPreSource + 'filename']: 'Dateiname',
	[colPreSource + 'rdysent']: 'Als fertig (rdy) markiert',
	[colPreSource + 'recordCount']: 'Anzahl Messwerte',
	[colPreSource + 'deviceIds']: 'Geräte-IDs',
};

export const columnCaption = (column, isTable = false) => {
	return isTable && tableColumnTranslations[column] || columnTranslations[column] || column.substring(1).replace(/(?<=\[)l(?=\]|\/s\]|\/h\])/, 'ℓ');
}

// Translation dictionary for operators
const operatorTranslations = {
	'eq': '=',
	'ne': '≠',
	'contains': 'enthält',
	'not contains': 'enthält nicht',
	'lt': '<',
	'lte': '≤',
	'gt': '>',
	'gte': '≥',
};

export const operatorCaption = (operator) => {
	return operatorTranslations[operator] || operator;
}
