/**
 * Format a date according to the specified format
 * @param {Date} date - The date to format
 * @param {string} format - Format string where:
 *   YYYY: full year, MM: month (01-12), DD: day (01-31)
 *   HH: hours (00-23), mm: minutes (00-59), ss: seconds (00-59)
 *   Any other characters are preserved as-is
 * @returns {string} Formatted date string
 */
export function formatDate(date, format = 'YYYY-MM-DD_HH-mm') {
	const tokens = {
		YYYY: date.getFullYear(),
		MM: String(date.getMonth() + 1).padStart(2, '0'),
		DD: String(date.getDate()).padStart(2, '0'),
		HH: String(date.getHours()).padStart(2, '0'),
		mm: String(date.getMinutes()).padStart(2, '0'),
		ss: String(date.getSeconds()).padStart(2, '0')
	};
	
	return Object.entries(tokens).reduce(
		(result, [token, value]) => result.replace(token, value),
		format
	);
} 