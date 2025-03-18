// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
	console.log('IZARchiv frontend loaded');
	
	// Add event listeners for interactive elements
	setupEventListeners();
	
	// Initialize collapsible sections
	initCollapsibleSections();
	
	// Initialize scrollable table cells
	initScrollableCells();
	
	// Make tables horizontally scrollable
	makeTablesScrollable();
});

// Set up event listeners
function setupEventListeners() {
	// Example: Add click event for table rows to navigate to detail page
	const tableRows = document.querySelectorAll('tbody tr');
	tableRows.forEach(row => {
		if(row.querySelector('tr>td:first-child>a')) {
			let mouseDownPos = null;
			row.addEventListener('mousedown', (e) => {
				mouseDownPos = { x: e.clientX, y: e.clientY };
			});
			row.addEventListener('mousemove', (e) => {
				if (mouseDownPos) {
					const moveX = Math.abs(e.clientX - mouseDownPos.x);
					const moveY = Math.abs(e.clientY - mouseDownPos.y);
					if (moveX > 5 || moveY > 5) {
						mouseDownPos = null;
					}
				}
			});
			row.addEventListener('mouseup', (e) => {
				if (mouseDownPos && e.target.tagName !== 'A') {
					const link = row.querySelector('a');
					if (link) {
						window.location.href = link.href;
					}
				}
				mouseDownPos = null;
			});
			row.style.cursor = 'pointer';
		}
	});
}

// Initialize collapsible sections
function initCollapsibleSections() {
	const collapsibles = document.querySelectorAll('.collapsible h3');
	
	collapsibles.forEach(header => {
		header.addEventListener('click', function() {
			const section = this.parentElement;
			section.classList.toggle('collapsed');
			
			// Toggle content visibility
			const content = section.querySelector('.collapsible-content');
			if (content) {
				if (section.classList.contains('collapsed')) {
					// Ensure collapsed content is completely hidden
					content.style.maxHeight = '0';
					content.style.overflow = 'hidden';
					content.style.paddingTop = '0';
					content.style.paddingBottom = '0';
				} else {
					// First set a temporary height for the animation
					content.style.maxHeight = 'none';
					const scrollHeight = content.scrollHeight;
					content.style.maxHeight = '0';
					
					// Force a reflow to ensure the animation works
					void content.offsetWidth;
					
					// Now set the height for animation
					content.style.maxHeight = scrollHeight + 'px';
					content.style.paddingTop = '0.8rem';
					content.style.paddingBottom = '0.8rem';
					
					// After animation completes, allow full content display
					setTimeout(() => {
						content.style.maxHeight = 'none';
						content.style.overflow = 'visible';
					}, 300);
				}
			}
		});
	});
	
	// Initialize collapsed sections
	document.querySelectorAll('.collapsible.collapsed').forEach(section => {
		const content = section.querySelector('.collapsible-content');
		if (content) {
			content.style.maxHeight = '0';
			content.style.overflow = 'hidden';
			content.style.paddingTop = '0';
			content.style.paddingBottom = '0';
		}
	});
}

// Initialize scrollable table cells
function initScrollableCells() {
	// Add visual indicator for cells that are scrollable
	const scrollableCells = document.querySelectorAll('td.long-text');
	
	scrollableCells.forEach(cell => {
		// Check if content is wider than the cell
		if (cell.scrollWidth > cell.clientWidth) {
			cell.classList.add('is-scrollable');
			
			// Add hover effect to show scrollability
			cell.addEventListener('mouseenter', function() {
				this.classList.add('hover');
			});
			
			cell.addEventListener('mouseleave', function() {
				this.classList.remove('hover');
			});
		}
	});
}

// Make tables horizontally scrollable
function makeTablesScrollable() {
	// Find all tables that aren't already in a .table-container
	// and aren't inside a .record-section (those are handled differently)
	const tables = document.querySelectorAll('table:not(.table-container table):not(.record-section table)');
	
	tables.forEach(table => {
		// Skip tables that are already wrapped
		if (table.parentElement.classList.contains('table-container')) {
			return;
		}
		
		// Create a wrapper div
		const wrapper = document.createElement('div');
		wrapper.className = 'table-container';
		
		// Replace the table with the wrapper
		table.parentNode.insertBefore(wrapper, table);
		wrapper.appendChild(table);
	});
} 