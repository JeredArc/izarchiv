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
	if(typeof date === 'string' || typeof date === 'number') date = new Date(date);
	if(!(date instanceof Date)) date = new Date();

	const tokens = {
		yyyy: date.getFullYear(),
		mm: String(date.getMonth() + 1).padStart(2, '0'),
		dd: String(date.getDate()).padStart(2, '0'),
		hh: String(date.getHours()).padStart(2, '0'),
		ii: String(date.getMinutes()).padStart(2, '0'),
		ss: String(date.getSeconds()).padStart(2, '0')
	};
	
	return Object.entries(tokens).reduce(
		(result, [token, value]) => result.replace(token, value),
		format
	);
}
