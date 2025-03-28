import { filterOperators, idColumns } from './settings.js';
import { columnCaption, operatorCaption } from './translations-german.js';

export class Filter {
	constructor(column, operator, value) {
		this.column = column;
		this.operator = filterOperators.includes(operator) ? operator : 'eq';
		this.value = value;
	}

	getCaption() {
		let columnResult = columnCaption(this.column);
		let operatorResult = operatorCaption(this.operator);
		let valueResult = idColumns.includes(this.column) && this.operator === 'eq' ? `#${this.value}` : this.value ? `„${this.value}“` : 'leer';

		return `${columnResult} ${operatorResult} ${valueResult}`;
	}

	getQueryParam() {
		return `&filter_column=${encodeURIComponent(this.column)}&filter_operator=${encodeURIComponent(this.operator)}&filter_value=${encodeURIComponent(this.value)}`;
	}
}