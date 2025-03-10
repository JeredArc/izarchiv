// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
	console.log('IZARchiv frontend loaded');
	
	// Format dates
	formatDates();
	
	// Add event listeners for interactive elements
	setupEventListeners();
});

// Format dates to local format
function formatDates() {
	const timestamps = document.querySelectorAll('.timestamp');
	timestamps.forEach(timestamp => {
		const date = new Date(timestamp.textContent);
		if (!isNaN(date)) {
			timestamp.textContent = date.toLocaleString();
		}
	});
}

// Set up event listeners
function setupEventListeners() {
	// Example: Add click event for table rows to navigate to detail page
	const tableRows = document.querySelectorAll('tbody tr');
	tableRows.forEach(row => {
		row.addEventListener('click', (e) => {
			// Only navigate if the click wasn't on a link
			if (e.target.tagName !== 'A') {
				const link = row.querySelector('a');
				if (link) {
					window.location.href = link.href;
				}
			}
		});
		
		// Add pointer cursor to show it's clickable
		row.style.cursor = 'pointer';
	});
} 